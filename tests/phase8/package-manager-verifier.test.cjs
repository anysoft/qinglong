const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const load = require('../../test/helpers/load-security-module.cjs');
const NodePackageManager = load(
  path.resolve('back/services/nodePackageManager.ts'),
  {
    '../config': { default: { dataPath: '/unused' }, __esModule: true },
    './nodeDistributionProvider': { default: class {}, __esModule: true },
  },
).default;

const dependency = (name) => ({ name, specifier: '1.0.0', type: 'DEPENDENCY' });

async function fixture(t, managerType, graph, direct = ['parent'], lockPackages = {}) {
  const root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'node-verifier-')),
  );
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const paths = {
    assertOwned: async () => root,
    text: async (base, relative) => fs.readFile(path.join(base, relative), 'utf8'),
    directory: async () => path.join(root, 'node_modules'),
    relative: () => '',
  };
  const manager = new NodePackageManager(paths, 'http://127.0.0.1:4873/');
  const runtime = { id: 1, version: '24.21.0' };
  const tool = {
    id: 1,
    runtime_id: 1,
    manager_type: managerType,
    version: managerType === 'PNPM' ? '10.34.5' : '11.6.0',
    state: 'READY',
    metadata: {},
  };
  const revision = {
    dependencies: direct.map(dependency),
    production_only: false,
    install_scripts_policy: 'IGNORE',
  };
  const build = { id: 1, environment_id: 1 };
  manager.verify = async () => ({});
  manager.cli = async () => ({ node: 'node', cli: 'manager', env: {} });
  const packageJson = manager.manifest(revision, tool);
  await fs.mkdir(path.join(root, 'node_modules'), { recursive: true });
  await fs.writeFile(path.join(root, 'package.json'), packageJson);
  await fs.writeFile(path.join(root, '.npmrc'), 'registry=fixture\n');
  if (managerType === 'PNPM') {
    await fs.writeFile(path.join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n');
    await fs.writeFile(path.join(root, 'pnpm-workspace.yaml'), 'packages: []\n');
  } else {
    await fs.writeFile(
      path.join(root, 'package-lock.json'),
      JSON.stringify({ lockfileVersion: 3, packages: lockPackages }),
    );
  }
  const ctx = {
    stage: async () => {},
    command: { run: async () => JSON.stringify([graph]) },
  };
  return {
    root,
    manager,
    runtime,
    tool,
    revision,
    build,
    ctx,
    package: async (relative, manifest) => {
      const directory = path.join(root, relative);
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(path.join(directory, 'package.json'), JSON.stringify(manifest));
      return directory;
    },
    snapshot: () => manager.snapshot(ctx, runtime, tool, revision, build),
  };
}

test('PNPM required dependency exists', async (t) => {
  const h = await fixture(t, 'PNPM', { dependencies: {} }, ['is-number']);
  const target = await h.package('node_modules/is-number', {
    name: 'is-number',
    version: '7.0.0',
  });
  h.ctx.command.run = async () => JSON.stringify([{ dependencies: {
    'is-number': { name: 'is-number', version: '7.0.0', path: target },
  } }]);
  assert.ok((await h.snapshot()).resolved.some((row) => row.name === 'is-number'));
});

test('PNPM optional dependency exists and is verified', async (t) => {
  const h = await fixture(t, 'PNPM', { dependencies: {} });
  const parent = await h.package('node_modules/parent', {
    name: 'parent', version: '1.0.0', optionalDependencies: { optional: '1.0.0' },
  });
  const optional = await h.package('node_modules/optional', {
    name: 'optional', version: '1.0.0',
  });
  h.ctx.command.run = async () => JSON.stringify([{ dependencies: {
    parent: { name: 'parent', version: '1.0.0', path: parent, dependencies: {
      optional: { name: 'optional', version: '1.0.0', path: optional },
    } },
  } }]);
  assert.ok((await h.snapshot()).resolved.some((row) => row.name === 'optional'));
});

test('PNPM omitted optional dependency is accepted from parent manifest metadata', async (t) => {
  const h = await fixture(t, 'PNPM', { dependencies: {} });
  const parent = await h.package('node_modules/parent', {
    name: 'parent', version: '1.0.0', optionalDependencies: { fsevents: '~2.3.3' },
  });
  const missing = path.join(h.root, 'node_modules/.pnpm/fsevents@2.3.3/node_modules/fsevents');
  h.ctx.command.run = async () => JSON.stringify([{ dependencies: {
    parent: { name: 'parent', version: '1.0.0', path: parent, dependencies: {
      fsevents: { name: 'fsevents', version: '2.3.3', path: missing },
    } },
  } }]);
  const result = await h.snapshot();
  assert.ok(!result.resolved.some((row) => row.name === 'fsevents'));
});

test('PNPM missing required dependency fails with a domain error', async (t) => {
  const h = await fixture(t, 'PNPM', { dependencies: {} });
  const parent = await h.package('node_modules/parent', {
    name: 'parent', version: '1.0.0', dependencies: { required: '1.0.0' },
  });
  h.ctx.command.run = async () => JSON.stringify([{ dependencies: {
    parent: { name: 'parent', version: '1.0.0', path: parent, dependencies: {
      required: { name: 'required', version: '1.0.0', path: path.join(h.root, 'missing') },
    } },
  } }]);
  await assert.rejects(h.snapshot(), (error) => error.error_code === 'NODE_DEPENDENCY_MISSING');
});

test('PNPM dependency path escaping the environment root fails', async (t) => {
  const h = await fixture(t, 'PNPM', { dependencies: {} });
  const outside = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'node-verifier-outside-')),
  );
  t.after(() => fs.rm(outside, { recursive: true, force: true }));
  await fs.writeFile(path.join(outside, 'package.json'), JSON.stringify({ name: 'parent', version: '1.0.0' }));
  h.ctx.command.run = async () => JSON.stringify([{ dependencies: {
    parent: { name: 'parent', version: '1.0.0', path: outside },
  } }]);
  await assert.rejects(h.snapshot(), (error) => error.error_code === 'NODE_PATH_INVALID');
});

test('PNPM malformed dependency graph fails', async (t) => {
  const h = await fixture(t, 'PNPM', { dependencies: {} });
  h.ctx.command.run = async () => JSON.stringify([{ dependencies: { parent: { name: 'parent' } } }]);
  await assert.rejects(h.snapshot(), (error) => error.error_code === 'NODE_DEPENDENCY_GRAPH_INVALID');
});

test('NPM omitted optional placeholder behavior remains supported', async (t) => {
  const h = await fixture(t, 'NPM', { dependencies: {} }, ['parent'], {
    'node_modules/parent': { version: '1.0.0', optionalDependencies: { optional: '1.0.0' } },
  });
  const parent = await h.package('node_modules/parent', { name: 'parent', version: '1.0.0' });
  h.ctx.command.run = async () => JSON.stringify([{ dependencies: {
    parent: { name: 'parent', version: '1.0.0', path: parent, dependencies: { optional: {} } },
  } }]);
  await h.snapshot();
});
