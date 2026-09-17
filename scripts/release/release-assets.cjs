'use strict';
const fs=require('node:fs'),crypto=require('node:crypto');
const meta=JSON.parse(fs.readFileSync('release-output/published-manifest.json'));
for(const arch of ['amd64','arm64'])for(const name of ['sbom','provenance','container-gates','image-audit'])fs.copyFileSync('release-input/'+arch+'/'+name+'.json','release-output/'+arch+'-'+name+'.json');
fs.copyFileSync('compose.yaml','release-output/compose.yaml');
fs.copyFileSync('docs/deploy/container.env.example','release-output/.env.example');
fs.writeFileSync('release-output/release-manifest.json',JSON.stringify({version:meta.version,git_sha:meta.sha,image:meta.image,manifest_digest:meta.digest,platforms:Object.keys(meta.platforms).map(a=>'linux/'+a)},null,2)+'\n');
fs.writeFileSync('release-output/release-notes.md',`# Platform ${meta.version}\n\nGit-native automation with managed Python/Node environments, Task/Trigger/Runner v2, Workspace and portable backup.\n\nSource: ${meta.sha}\nImage: ${meta.image}:${meta.version}\nManifest: ${meta.digest}\nPlatforms: linux/amd64, linux/arm64\n\nOne active instance per DATA_DIR. Schema v9. Use platform Backup/Export before upgrades. Physical managed runtimes must be explicitly rebuilt after portable restore. No arbitrary downgrade guarantee.\n\nSee docs/deploy/docker.md and attached compose.yaml, SBOM, provenance and qualification receipts.\n`);
const lines=fs.readdirSync('release-output').filter(n=>!n.endsWith('.tar')&&n!=='SHA256SUMS').sort().map(n=>crypto.createHash('sha256').update(fs.readFileSync('release-output/'+n)).digest('hex')+'  '+n);fs.writeFileSync('release-output/SHA256SUMS',lines.join('\n')+'\n');
