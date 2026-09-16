const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict'),
  { execFileSync } = require('node:child_process'),
  yaml = require('js-yaml');
function audit() {
  const file = '.github/workflows/linux-ci.yml',
    text = fs.readFileSync(file, 'utf8'),
    workflow = yaml.load(text);
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  for (const trigger of [
    'workflow_dispatch',
    'pull_request',
    'push',
    'workflow_call',
  ])
    assert.ok(trigger in workflow.on);
  assert.ok(!('pull_request_target' in workflow.on));
  assert.ok(
    !/secrets\.|contents:\s*write|packages:\s*write|id-token:\s*write|ubuntu-latest|docker\/|gh release/.test(
      text,
    ),
  );
  for (const job of Object.values(workflow.jobs)) {
    assert.equal(job['runs-on'], 'ubuntu-24.04');
    assert.ok(job['timeout-minutes'] > 0);
    for (const step of job.steps || []) {
      if (step.uses)
        assert.match(
          step.uses,
          /^actions\/(checkout|setup-node|upload-artifact|download-artifact)@v\d+(?:\.\d+)*$/,
        );
      if (step.run) assert.ok(!/\$\{\{/.test(step.run));
    }
  }
  const scripts = fs.readdirSync('scripts/ci').filter((f) => f.endsWith('.sh'));
  for (const name of scripts) {
    const f = 'scripts/ci/' + name,
      s = fs.readFileSync(f, 'utf8');
    assert.ok(s.startsWith('#!/usr/bin/env bash\nset -Eeuo pipefail'));
    assert.ok(!/pkill|killall|set -x|curl.*\|.*(?:sh|bash)/.test(s));
    execFileSync('bash', ['-n', f]);
  }
  let shellcheck = 'UNAVAILABLE';
  try {
    execFileSync('shellcheck', ['--version'], { stdio: 'pipe' });
    execFileSync(
      'shellcheck',
      ['-x', '-e', 'SC1091', ...scripts.map((f) => 'scripts/ci/' + f)],
      { stdio: 'pipe' },
    );
    shellcheck = 'PASS';
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  if (process.platform === 'linux') assert.equal(shellcheck, 'PASS');
  return {
    status: 'PASS',
    workflow: file,
    shellcheck,
    bash_syntax: 'PASS',
    permissions: 'contents: read',
    custom_secrets: 0,
  };
}
if (require.main === module) {
  try {
    const report = audit();
    const out = process.env.CI_OUTPUT || 'diagnostics/ci';
    fs.mkdirSync(path.join(out, 'static'), { recursive: true });
    fs.writeFileSync(
      path.join(out, 'static/audit.json'),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report));
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
module.exports = { audit };
