'use strict';
const fs = require('node:fs'), crypto = require('node:crypto');
const version = require('../../package.json').version;
if (!/^[a-f0-9]{40}$/.test(process.env.SOURCE_COMMIT || '')) throw Error('SOURCE_COMMIT_REQUIRED');
if (!Number.isFinite(Date.parse(process.env.BUILD_CREATED || ''))) throw Error('BUILD_CREATED_REQUIRED');
const yaml = require('js-yaml');
const releaseVersion = yaml.load(fs.readFileSync('version.yaml','utf8'));
if (releaseVersion.version !== version) throw Error('VERSION_FILE_MISMATCH');
releaseVersion.publishTime = process.env.BUILD_CREATED;
fs.writeFileSync('version.yaml', yaml.dump(releaseVersion));
fs.writeFileSync('static/build-info.json', JSON.stringify({version, sourceCommit:process.env.SOURCE_COMMIT, created:process.env.BUILD_CREATED, source:'https://github.com/anysoft/qinglong',lockfileSha256:crypto.createHash('sha256').update(fs.readFileSync('pnpm-lock.yaml')).digest('hex')},null,2)+'\n');
// Source maps embed developer paths/source; production does not need them.
function clean(dir) { for(const e of fs.readdirSync(dir,{withFileTypes:true})) { const p=dir+'/'+e.name;if(e.isDirectory())clean(p);else if(e.name.endsWith('.map'))fs.unlinkSync(p); } }
clean('static');
