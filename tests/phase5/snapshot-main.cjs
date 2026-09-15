// Integration adapter for the existing full-ENV transport tests: execute a frozen
// snapshot through the Phase 5 lifecycle and the unchanged MAIN source bridge.
const fs=require('node:fs'),path=require('node:path');
const directory=process.env.QL_TASK_ENV_SNAPSHOT;
const snapshot=JSON.parse(fs.readFileSync(path.join(directory,'snapshot.json'),'utf8'));
const root=process.env.QL_DIR,workspaceRoot=path.join(process.env.QL_DATA_DIR,'scripts');
const Lifecycle=require('../../static/build/services/taskHookLifecycle').default;
const variables={...snapshot.variables,QL_DIR:root,QL_DATA_DIR:process.env.QL_DATA_DIR,PATH:process.env.PATH};
const plan={version:1,task:null,args:process.argv.slice(2),directory,mainTimeout:0,hooks:[],configs:[],workspace:{workspaceRoot,taskDir:workspaceRoot,cwd:workspaceRoot,resourceKey:'fixture'},environment:{variables,secretNames:snapshot.secretNames,unsetVariables:snapshot.unset,metadata:snapshot.metadata},secretValues:snapshot.secretNames.map(name=>variables[name]).filter(Boolean)};
new Lifecycle().run(plan,async text=>{await new Promise(resolve=>process.stdout.write(text,resolve));}).then(result=>{process.exitCode=result.code;}).catch(error=>{console.error(error);process.exitCode=1;});
