const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=require('../../test/helpers/load-security-module.cjs');
const {cronNext,matchesGlob,relativeGlob}=load(path.resolve('back/shared/triggerDefinition.ts'));
test('Installed parser accepts five/six fields and aliases, validates zones, deterministic DST',()=>{
 for(const expression of ['0 8 * * *','*/5 * * * * *','@daily'])assert.ok(cronNext(expression,'Asia/Singapore',new Date('2026-01-01T00:00:00Z')) instanceof Date);
 assert.throws(()=>cronNext('bad','UTC',new Date()));assert.throws(()=>cronNext('* * * * *','Bad/Zone',new Date()));
 const spring=cronNext('30 2 * * *','America/New_York',new Date('2026-03-08T00:00:00Z'));
 assert.equal(spring.toISOString(),'2026-03-08T07:30:00.000Z');
 const fall=cronNext('30 1 * * *','America/New_York',new Date('2026-11-01T00:00:00Z'));
 assert.equal(fall.toISOString(),'2026-11-01T05:30:00.000Z');
 assert.equal(cronNext('30 1 * * *','America/New_York',fall).toISOString(),'2026-11-02T06:30:00.000Z');
});
test('Relative glob rejects escaping and matches nested paths without regex injection',()=>{
 for(const value of ['/absolute','../x','x/../y','C:/x','x\\y','x\0y'])assert.throws(()=>relativeGlob(value));
 assert.ok(matchesGlob('**/*.py','main.py'));assert.ok(matchesGlob('src/**/*.py','src/nested/a.py'));assert.equal(matchesGlob('*.py','src/a.py'),false);assert.equal(matchesGlob('a[0].py','a0.py'),false);
});
test('Long hostile wildcard sequences have bounded matching work',()=>{
 const start=Date.now();assert.equal(matchesGlob('a*'.repeat(200)+'b','a'.repeat(1000)),false);assert.ok(Date.now()-start<1000);
 assert.equal(matchesGlob('**/a','ba'),false);assert.equal(matchesGlob('**/a','b/a'),true);
});
