const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {fixture}=require('./helpers.cjs');
test('BEFORE JSON set/unset/secret produces derived snapshot only and retains historical secrets',async t=>{
 const h=await fixture(t),{applyHookOutput}=h.load('back/services/hookOutput.ts'),file=path.join(h.root,'output');const current={variables:{OLD:'old',KEEP:'yes',SECRET:'old-secret'},secretNames:['SECRET'],secretValues:['old-secret']};const original=JSON.stringify(current),host=process.env.TOKEN;
 await fs.writeFile(file,JSON.stringify({environment:{set:{TOKEN:'new-secret',SECRET:'rotated'},unset:['OLD'],secret:['TOKEN']}}));const next=await applyHookOutput(file,'BEFORE',current);assert.equal(next.variables.OLD,undefined);assert.equal(next.variables.TOKEN,'new-secret');assert.deepEqual(new Set(next.secretValues),new Set(['old-secret','new-secret','rotated']));assert.equal(JSON.stringify(current),original);assert.equal(process.env.TOKEN,host);
 await assert.rejects(applyHookOutput(file,'FINALLY',current),{code:'HOOK_ENV_PHASE_FORBIDDEN'});
});
test('invalid output, reserved/invalid names, oversized values, unknown operations and symlink reject without secret errors',async t=>{
 const h=await fixture(t),{applyHookOutput}=h.load('back/services/hookOutput.ts'),file=path.join(h.root,'output'),current={variables:{},secretNames:[],secretValues:[]};
 for(const value of ['invalid SECRET_SENTINEL',JSON.stringify({environment:{set:{'BAD-NAME':'SECRET_SENTINEL'}}}),JSON.stringify({environment:{set:{PLATFORM_TASK_ID:'SECRET_SENTINEL'}}}),JSON.stringify({environment:{set:{QL_TASK_ENV_SNAPSHOT:'SECRET_SENTINEL'}}}),JSON.stringify({environment:{set:{BIG:'x'.repeat(65536)}}}),JSON.stringify({environment:{export:'SECRET_SENTINEL'}}),JSON.stringify({environment:{set:{A:'x'},unset:['A']}}),JSON.stringify({environment:{secret:['ABSENT']}}),JSON.stringify({environment:{set:Object.fromEntries(Array.from({length:129},(_,i)=>['K'+i,'v']))}})]){
 await fs.writeFile(file,value);await assert.rejects(applyHookOutput(file,'BEFORE',current),error=>!String(error).includes('SECRET_SENTINEL'));
 }
 await fs.unlink(file);await fs.writeFile(file+'.other','{}');await fs.symlink(file+'.other',file);await assert.rejects(applyHookOutput(file,'BEFORE',current),{code:'HOOK_OUTPUT_INVALID'});
});
test('UTF-8 streaming redactor covers chunk boundaries and newly tracked secrets',async t=>{
 const h=await fixture(t),Redactor=h.load('back/services/executionRedactor.ts').default;let output='';const r=new Redactor([],async text=>{output+=text});r.add(['private🌱token']);await r.write('ok pri');await r.write('vate🌱');await r.write('token end');await r.flush();assert.equal(output,'ok ******** end');r.add(['generated-secret']);await r.write(' generated-secret ');await r.flush();assert.ok(!output.includes('generated-secret'));
});
test('Secret names require own ENV entries and unset never reintroduces prototype properties',async t=>{
 const h=await fixture(t),{applyHookOutput}=h.load('back/services/hookOutput.ts'),file=path.join(h.root,'output'),empty={variables:{},secretNames:[],secretValues:[]};
 for(const name of ['constructor','toString','__proto__']){await fs.writeFile(file,JSON.stringify({environment:{secret:[name]}}));await assert.rejects(applyHookOutput(file,'BEFORE',empty),{code:'HOOK_ENV_INVALID'});}
 await fs.writeFile(file,JSON.stringify({environment:{set:{constructor:'PRIVATE_CONSTRUCTOR'},secret:['constructor']}}));const first=await applyHookOutput(file,'BEFORE',empty);await fs.writeFile(file,JSON.stringify({environment:{unset:['constructor']}}));const next=await applyHookOutput(file,'BEFORE',first);assert.equal(Object.hasOwn(next.variables,'constructor'),false);assert.deepEqual(next.secretValues,['PRIVATE_CONSTRUCTOR']);
});
