const fs=require('node:fs');
const Redactor=require('../../static/build/services/executionRedactor').default;
const snapshot=JSON.parse(fs.readFileSync(process.env.QL_TASK_ENV_SNAPSHOT+'/snapshot.json','utf8'));
const redactor=new Redactor([],text=>new Promise(resolve=>process.stdout.write(text,resolve)));
redactor.add(snapshot.secretNames.map(name=>snapshot.variables[name]).filter(Boolean));
process.stdin.setEncoding('utf8');
(async()=>{for await(const chunk of process.stdin)await redactor.write(chunk);await redactor.flush();})();
