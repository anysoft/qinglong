'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const needs = JSON.parse(process.env.NEEDS || '{}');
assert.deepEqual(Object.keys(needs).sort(), ['container', 'linux']);
assert.ok(Object.values(needs).every(job => job.result === 'success'), 'QUALIFICATION_JOB_FAILED');
const root = process.env.QUALIFICATION_INPUT || 'qualification-input';
const gates = [];
for (const arch of ['amd64', 'arm64']) {
  const directory = `container-gates-${arch}-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}-${process.env.GITHUB_SHA}`;
  const gate = JSON.parse(fs.readFileSync(path.join(root, directory, 'container-gates.json')));
  assert.equal(gate.status, 'PASS');
  assert.equal(gate.commit, process.env.GITHUB_SHA);
  assert.equal(gate.architecture, arch);
  assert.equal(gate.acceptance.cleanup, 'PASS');
  assert.equal(gate.compose.cleanup, 'PASS');
  assert.equal(gate.vulnerability_scan, 'PASS');
  assert.equal(gate.image.sbom, 'PASS');
  assert.equal(gate.image.provenance, 'PASS');
  gates.push({architecture: arch, manifest_digest: gate.image.manifest_digest});
}
fs.writeFileSync('container-qualification-summary.json', JSON.stringify({status:'PASS', commit:process.env.GITHUB_SHA, run_id:process.env.GITHUB_RUN_ID, run_attempt:process.env.GITHUB_RUN_ATTEMPT, platforms:gates}, null, 2) + '\n');
