const fs = require('node:fs'),
  path = require('node:path'),
  { summarize, safeName } = require('./evidence.cjs');
const needs = JSON.parse(process.env.CI_NEEDS || '{}'),
  root = path.resolve('ci-downloaded'),
  artifacts = {};
function visit(dir) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, e.name);
    if (e.isDirectory()) visit(file);
    else if (e.name === 'core-summary.json')
      artifacts.core = JSON.parse(fs.readFileSync(file));
  }
}
// Downloaded tarballs are not extracted: upload a small safe summary alongside each archive.
const coreArtifact = needs.core?.outputs?.artifact;
if (coreArtifact) visit(path.join(root, safeName(coreArtifact)));
const result = summarize(needs, artifacts);
if (process.env.CI_FINAL_UPLOAD === 'failure') {
  result.summary_artifact = 'ARTIFACT_UPLOAD_FAILED';
  result.status = 'FAIL';
}
if (process.env.CI_DOWNLOAD_OUTCOME === 'failure') {
  result.artifact_download = 'FAILED';
  result.status = 'FAIL';
}
fs.mkdirSync('diagnostics/ci', { recursive: true });
fs.writeFileSync(
  'diagnostics/ci/final-summary.json',
  JSON.stringify(result, null, 2) + '\n',
);
const lines = [
  '# Phase16A Linux CI Summary',
  '',
  `Commit: ${result.commit || 'unknown'}`,
  '',
  'Runner: ubuntu-24.04',
  '',
  '| Job | Result | Artifact |',
  '|---|---|---|',
];
for (const [name, row] of Object.entries(result.jobs))
  lines.push(
    `| ${name} | ${row.status} | ${row.artifact}: ${
      row.artifact_name || 'unavailable'
    } |`,
  );
lines.push(
  '',
  result.summary_artifact || '',
  `Typecheck: historical 22, remaining ${
    result.typecheck.remaining ?? 'unavailable'
  }, new ${result.typecheck.new ?? 'unavailable'}`,
  '',
  'This run establishes CI infrastructure; it is not Phase15 qualification.',
);
if (process.env.GITHUB_STEP_SUMMARY)
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
console.log(JSON.stringify(result));
if (result.status !== 'PASS') process.exitCode = 1;
