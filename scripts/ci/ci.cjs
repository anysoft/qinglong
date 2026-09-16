const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os'),
  assert = require('node:assert/strict'),
  { execFileSync } = require('node:child_process');
const {
    repository,
    context,
    owned,
    environment,
    atomic,
  } = require('./context.cjs'),
  { run } = require('./runner.cjs'),
  evidence = require('./evidence.cjs');
function command(args) {
  try {
    return execFileSync(args[0], args.slice(1), {
      encoding: 'utf8',
      timeout: 15000,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}
function tap(text) {
  const result = {};
  for (const key of ['tests', 'pass', 'fail', 'skipped']) {
    const matches = [
      ...text.matchAll(new RegExp('^# ' + key + ' (\\d+)$', 'gm')),
    ];
    if (!matches.length) throw Error('MISSING_TAP_SUMMARY');
    result[key] = Number(matches.at(-1)[1]);
  }
  result.skip_names = text
    .split('\n')
    .filter((l) => /^ok .*# SKIP/.test(l))
    .map((l) => l.replace(/^ok \d+ - /, '').replace(/ # SKIP.*$/, ''));
  return result;
}
async function preflight(s) {
  assert.ok(
    ['normal', 'full'].includes(process.env.CI_SCOPE || 'normal'),
    'INVALID_CI_SCOPE',
  );
  const release = fs.existsSync('/etc/os-release')
    ? fs.readFileSync('/etc/os-release', 'utf8')
    : '';
  const tools = {};
  for (const [name, args] of Object.entries({
    node: ['node', '--version'],
    npm: ['npm', '--version'],
    git: ['git', '--version'],
    python: ['python3', '--version'],
    bash: ['bash', '--version'],
    flock: ['flock', '--version'],
    timeout: ['timeout', '--version'],
    tar: ['tar', '--version'],
    gzip: ['gzip', '--version'],
    sqlite3: ['sqlite3', '--version'],
    shellcheck: ['shellcheck', '--version'],
  }))
    tools[name] = command(args)?.split('\n')[0] || null;
  const chrome = command([
    'sh',
    '-c',
    'command -v google-chrome || command -v chromium || command -v chromium-browser',
  ]);
  const result = {
    os: os.type(),
    osVersion: release.match(/^VERSION_ID="?([^"\n]+)/m)?.[1] || os.release(),
    arch: os.arch(),
    kernel: os.release(),
    runner: process.env.CI_RUNNER_LABEL || 'local',
    uname: command(['uname', '-a']),
    node: tools.node,
    git: tools.git,
    flock: !!tools.flock,
    tools,
    chrome: chrome ? command([chrome, '--version']) : null,
    filesystem: command(['df', '-h', s.root]),
    disk: fs.statfsSync(s.root),
    memory: { total: os.totalmem(), free: os.freemem() },
    status:
      process.platform === 'linux' &&
      /^ID=ubuntu$/m.test(release) &&
      /^VERSION_ID="24\.04"$/m.test(release) &&
      Object.values(tools).every(Boolean)
        ? 'PASS'
        : 'UNSUPPORTED_OR_MISSING_TOOLS',
  };
  atomic(path.join(s.output, 'preflight.json'), result);
  if (result.status !== 'PASS') throw Error('UBUNTU_24_04_PREFLIGHT_REQUIRED');
  return result;
}
async function install(s, mode) {
  if (mode === 'system') {
    await run(s, 'system-dependencies', [
      'bash',
      'scripts/ci/install-system.sh',
    ]);
    return;
  }
  assert.equal(
    process.versions.node.split('.')[0],
    '22',
    'Build host requires Node 22',
  );
  const tools = path.join(s.root, 'tools');
  for (const f of ['package.json', 'package-lock.json'])
    fs.copyFileSync(path.join(__dirname, 'tools', f), path.join(tools, f));
  await run(
    s,
    'ci-tools',
    ['npm', 'ci', '--prefix', tools, '--no-audit', '--no-fund'],
    {},
    1200,
  );
  const pnpm = path.join(tools, 'node_modules/pnpm/bin/pnpm.cjs');
  await run(
    s,
    'project-dependencies',
    [process.execPath, pnpm, 'install', '--frozen-lockfile'],
    {},
    1200,
  );
  await run(
    s,
    'frontend-setup',
    [
      process.execPath,
      path.join(repository, 'node_modules/@umijs/max/bin/max.js'),
      'setup',
    ],
    {},
    300,
  );
}
async function buildBackend(s) {
  await run(s, 'backend-build', [process.execPath, 'scripts/build-back.cjs']);
}
async function buildFrontend(s) {
  await run(s, 'frontend-build', [
    process.execPath,
    'node_modules/@umijs/max/bin/max.js',
    'build',
  ]);
}
async function build(s) {
  await buildBackend(s);
  await buildFrontend(s);
}
async function typecheck(s) {
  const baseline = require('./typecheck-baseline.json');
  let failed = false;
  try {
    await run(s, 'typecheck', [
      process.execPath,
      require.resolve('typescript/bin/tsc'),
      '--noEmit',
      '--skipLibCheck',
      '--pretty',
      'false',
    ]);
  } catch {
    failed = true;
  }
  const text = fs.readFileSync(
      path.join(s.output, 'logs/typecheck.log'),
      'utf8',
    ),
    current = {};
  for (const line of text.split('\n'))
    if (/^.+\(\d+,\d+\): error TS\d+:/.test(line)) {
      const key = line.replace(/\(\d+,\d+\):/, ':').trim();
      current[key] = (current[key] || 0) + 1;
    }
  const added = Object.entries(current).filter(
    ([k, n]) => n > (baseline.diagnostics[k] || 0),
  );
  const remaining = Object.values(current).reduce((a, b) => a + b, 0);
  const result = {
    historical: 22,
    remaining,
    new: added.reduce(
      (sum, [key, count]) => sum + count - (baseline.diagnostics[key] || 0),
      0,
    ),
    diagnostics: added,
    raw_failed: failed,
    status: added.length || (failed && !remaining) ? 'FAIL' : 'PASS',
  };
  atomic(path.join(s.output, 'tests/typecheck-budget.json'), result);
  if (result.status !== 'PASS') throw Error('TYPECHECK_BUDGET');
  return result;
}
async function staticCheck(s) {
  await run(s, 'ci-foundation-tests', [
    process.execPath,
    '--test',
    'tests/ci/foundation.test.cjs',
  ]);
  await run(
    s,
    'ci-static',
    [process.execPath, 'scripts/ci/static.cjs'],
    {},
    120,
  );
}
async function core(s) {
  let failure,
    tests = null,
    types = null,
    built = false;
  try {
    await build(s);
    built = true;
  } catch (e) {
    failure = e;
  }
  if (built) {
    try {
      await run(s, 'platform-tests', [
        process.execPath,
        'tests/platform/run.cjs',
      ]);
    } catch (e) {
      failure ||= e;
    }
    try {
      tests = tap(
        fs.readFileSync(path.join(s.output, 'logs/platform-tests.log'), 'utf8'),
      );
      const allowed = [
        'simultaneous cold and expired lookups share one successful refresh',
        'waiters with different configuration do not reuse another key',
        'lock timeout falls back while a holder is still alive',
      ];
      if (
        tests.fail ||
        (process.platform === 'linux' && tests.skipped) ||
        tests.skip_names.some((n) => !allowed.includes(n))
      )
        throw Error('TEST_FAILURE_OR_UNCLASSIFIED_SKIP');
    } catch (e) {
      failure ||= e;
    }
  }
  try {
    types = await typecheck(s);
  } catch (e) {
    failure ||= e;
    const file = path.join(s.output, 'tests/typecheck-budget.json');
    if (fs.existsSync(file)) types = JSON.parse(fs.readFileSync(file));
  }
  try {
    await staticCheck(s);
  } catch (e) {
    failure ||= e;
  }
  atomic(path.join(s.output, 'core-summary.json'), {
    status: failure ? 'FAIL' : 'PASS',
    tests,
    typecheck: types,
    preflight: fs.existsSync(path.join(s.output, 'preflight.json'))
      ? JSON.parse(fs.readFileSync(path.join(s.output, 'preflight.json')))
      : { arch: os.arch(), os: os.type() },
  });
  if (failure) throw failure;
}
async function provision(s) {
  fs.mkdirSync(path.join(s.output, 'runtime'), { recursive: true });
  for (const language of ['python', 'node'])
    await run(
      s,
      'provision-' + language,
      [
        process.execPath,
        '-r',
        'ts-node/register/transpile-only',
        'diagnostics/phase12/prepare-managed-' + language + '.cjs',
      ],
      {},
      4200,
    );
}
// Summaries read the runner's stage records; no parallel stage state machine.
function stageEvidence(s, name, withTests = false) {
  const file = path.join(s.output, 'tests', name + '.json');
  if (!fs.existsSync(file)) return { status: 'NOT_RUN' };
  const result = JSON.parse(fs.readFileSync(file));
  if (withTests) {
    try {
      result.tests = tap(
        fs.readFileSync(path.join(s.output, 'logs', name + '.log'), 'utf8'),
      );
    } catch {
      result.tests = null;
    }
  }
  return result;
}
async function managed(s) {
  let failure;
  try {
    await buildBackend(s);
    await provision(s);
    await run(
      s,
      'managed-environments',
      [process.execPath, 'scripts/ci/managed-tests.cjs', 'environment'],
      {},
      1800,
    );
    await run(
      s,
      'managed-execution',
      [process.execPath, 'scripts/ci/managed-tests.cjs', 'execution'],
      {},
      1800,
    );
    await run(
      s,
      'shell-execution',
      [process.execPath, '--test', 'tests/phase10/execution.test.cjs'],
      {},
      600,
    );
    // Preserve the original TAP completeness gate while retaining failure summaries.
    for (const name of [
      'managed-environments',
      'managed-execution',
      'shell-execution',
    ])
      if (!stageEvidence(s, name, true).tests)
        throw Object.assign(Error('TAP_SUMMARY_MISSING: ' + name), {
          stage: name,
        });
  } catch (e) {
    failure = e;
    throw e;
  } finally {
    atomic(path.join(s.output, 'managed-summary.json'), {
      status: failure ? 'FAIL' : 'PASS',
      failed_stage: failure ? failure.stage || 'managed' : null,
      backend_build: stageEvidence(s, 'backend-build'),
      environment: stageEvidence(s, 'managed-environments', true),
      execution: stageEvidence(s, 'managed-execution', true),
      shell: stageEvidence(s, 'shell-execution', true),
    });
  }
}
async function browser(s) {
  let failure;
  try {
    await build(s);
    await provision(s);
    const chrome = command([
      'sh',
      '-c',
      'command -v google-chrome || command -v chromium || command -v chromium-browser',
    ]);
    const extra = {};
    if (chrome) extra.QL_BROWSER_EXECUTABLE = chrome;
    else
      await run(
        s,
        'chromium-install',
        [
          process.execPath,
          path.join(s.root, 'tools/node_modules/playwright/cli.js'),
          'install',
          '--with-deps',
          'chromium',
        ],
        {},
        1200,
      );
    for (const [phase, file] of [
      ['phase12', 'browser-e2e.cjs'],
      ['phase14', 'platform-e2e.cjs'],
    ])
      await run(
        s,
        'browser-' + phase,
        [process.execPath, `diagnostics/${phase}/${file}`],
        { ...extra, QL_ACCEPTANCE_DIR: path.join(s.output, 'browser', phase) },
        2400,
      );
  } catch (e) {
    failure = e;
    throw e;
  } finally {
    atomic(path.join(s.output, 'browser-summary.json'), {
      status: failure ? 'FAIL' : 'PASS',
      failed_stage: failure ? failure.stage || 'browser' : null,
      backend_build: stageEvidence(s, 'backend-build'),
      frontend_build: stageEvidence(s, 'frontend-build'),
      scenarios: ['phase12', 'phase14'].map((phase) => ({
        phase,
        ...stageEvidence(s, 'browser-' + phase),
      })),
      real_managed_runtime: true,
    });
  }
}
async function runtimeCleanup(s) {
  if (!fs.existsSync(s.root)) return;
  require('./report-snapshots.cjs').recover(s);
  if (
    fs.existsSync(path.join(s.output, 'runtime/managed-node/result.json')) ||
    fs.existsSync(path.join(s.output, 'runtime/managed-runtime/result.json'))
  )
    await run(
      s,
      'managed-cleanup',
      [process.execPath, 'diagnostics/phase12/cleanup-managed-fixtures.cjs'],
      {},
      600,
    );
}
async function cleanup(s) {
  if (!fs.existsSync(s.root)) return;
  owned(s);
  const { startIdentity } = require('./acceptance.cjs');
  const files = fs
    .readdirSync(s.root)
    .filter(
      (name) =>
        name === 'owned-processes.json' ||
        /^stage-[a-z0-9-]+-processes\.json$/.test(name),
    );
  const rows = files.flatMap((name) =>
    JSON.parse(fs.readFileSync(path.join(s.root, name))),
  );
  let count = 0;
  for (const row of rows) {
    if (row.pid > 1 && row.start && startIdentity(row.pid) === row.start) {
      try {
        process.kill(row.groupLeader === false ? row.pid : -row.pid, 'SIGTERM');
        count++;
      } catch (e) {
        if (e.code !== 'ESRCH') throw e;
      }
      await new Promise((r) => setTimeout(r, 200));
      if (startIdentity(row.pid) === row.start)
        try {
          process.kill(
            row.groupLeader === false ? row.pid : -row.pid,
            'SIGKILL',
          );
        } catch (e) {
          if (e.code !== 'ESRCH') throw e;
        }
    }
  }
  fs.rmSync(s.root, { recursive: true, force: true, maxRetries: 3 });
  atomic(path.join(s.output, 'cleanup/result.json'), {
    status: 'PASS',
    owned_processes_signalled: count,
    owned_root_removed: true,
  });
  const dest = evidence.artifactDirectory(s);
  if (
    fs.existsSync(path.join(dest, '.owner')) &&
    fs.readFileSync(path.join(dest, '.owner'), 'utf8') === s.token
  )
    atomic(path.join(dest, 'cleanup/result.json'), {
      status: 'PASS',
      owned_processes_signalled: count,
      owned_root_removed: true,
    });
}
async function job(name) {
  assert.ok(['preflight', 'core', 'managed-runtime', 'browser'].includes(name));
  const s = context(name);
  let failure;
  try {
    await install(s, 'system');
    await preflight(s);
    if (name !== 'preflight') {
      await install(s);
      if (name === 'core') await core(s);
      if (name === 'managed-runtime') await managed(s);
      if (name === 'browser') await browser(s);
    }
  } catch (e) {
    failure = e;
    console.error(e.message);
  } finally {
    try {
      await runtimeCleanup(s);
    } catch (e) {
      failure ||= e;
    }
    s.status = failure ? 'FAIL' : 'PASS';
    atomic(path.join(s.output, '.state.json'), s);
    try {
      evidence.collect(s);
    } catch (e) {
      failure ||= e;
    }
    try {
      await cleanup(s);
    } catch (e) {
      failure ||= e;
      atomic(path.join(s.output, 'cleanup/result.json'), {
        status: 'FAIL',
        error_code: 'OWNED_CLEANUP_FAILED',
      });
    }
    const destination = evidence.artifactDirectory(s);
    const summaryFile = path.join(destination, 'ci-summary.json');
    const canUpdate =
      fs.existsSync(path.join(destination, '.owner')) &&
      fs.readFileSync(path.join(destination, '.owner'), 'utf8') === s.token;
    if (canUpdate && fs.existsSync(summaryFile)) {
      const summary = JSON.parse(fs.readFileSync(summaryFile));
      if (failure) summary.status = 'FAIL';
      atomic(summaryFile, summary);
    }
    try {
      evidence.pack(s);
    } catch (e) {
      failure ||= e;
      if (canUpdate && fs.existsSync(summaryFile)) {
        const summary = JSON.parse(fs.readFileSync(summaryFile));
        summary.status = 'FAIL';
        summary.packaging = 'FAIL';
        atomic(summaryFile, summary);
      }
    }
  }
  if (failure) throw failure;
}
async function finish(s) {
  if (!fs.existsSync(s.root)) return;
  let error;
  try {
    await runtimeCleanup(s);
  } catch (e) {
    error = e;
  }
  s.status = 'FAIL';
  try {
    evidence.collect(s);
  } catch (e) {
    error ||= e;
  }
  try {
    await cleanup(s);
  } catch (e) {
    error ||= e;
  }
  try {
    evidence.pack(s);
  } catch (e) {
    error ||= e;
  }
  if (error) throw error;
}
async function main() {
  const [action, arg] = process.argv.slice(2);
  if (action === 'job') return job(arg);
  const s = context(process.env.CI_JOB_NAME || 'local');
  const operations = {
    preflight,
    install,
    build,
    core,
    managed,
    browser,
    static: staticCheck,
    collect: evidence.collect,
    package: evidence.pack,
    cleanup: async (state) => {
      await runtimeCleanup(state);
      return cleanup(state);
    },
    typecheck,
    provision,
    finish,
  };
  if (!operations[action]) throw Error('UNKNOWN_CI_COMMAND');
  return operations[action](s, arg);
}
if (require.main === module)
  main().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
module.exports = { tap, preflight, typecheck, core, cleanup };
