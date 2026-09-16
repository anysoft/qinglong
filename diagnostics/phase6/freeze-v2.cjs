// Run only against platform-phase5; never regenerate v2 from changed v3 models.
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { fixture, QueryTypes } = require('../../tests/phase5/helpers.cjs');
(async () => {
 const source = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
 const checkpoint = execFileSync('git', ['rev-parse', 'platform-phase5'], { encoding: 'utf8' }).trim();
 if(source !== checkpoint) throw new Error('Freeze must run at Phase 5 checkpoint');
 let cleanup;
 const h = await fixture({after(fn) {cleanup = fn;}});
 try {
  const metadata = (await h.db.query('SELECT * FROM PlatformMetadata', {type:QueryTypes.SELECT}))[0];
  if(metadata.platform_schema_version !== 2) throw new Error('Expected frozen v2');
  const objects = await h.db.query("SELECT name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name", {type:QueryTypes.SELECT});
  const manifest = {source_commit:source,metadata,objects};
  fs.writeFileSync('back/schema/platform-v2.json',JSON.stringify(manifest,null,2)+'\n');
  fs.writeFileSync('back/schema/platformV2.ts','// Frozen Phase 5 schema; do not regenerate from later ORM models.\nexport default '+JSON.stringify(manifest,null,2)+';\n');
  console.log('Frozen platform v2', metadata);
 } finally {await cleanup();}
})().catch(e=>{console.error(e);process.exitCode=1;});
