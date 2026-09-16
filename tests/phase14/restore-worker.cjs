process.env.TS_NODE_PROJECT=require('node:path').resolve('back/tsconfig.json');require('ts-node/register/transpile-only');
const {RestoreService}=require('../../back/services/backup/restore.ts'),{BackupPaths}=require('../../back/services/backup/paths.ts');
new RestoreService(new BackupPaths(process.argv[2]),async point=>{if(point===process.argv[3])process.kill(process.pid,'SIGKILL');}).apply().then(()=>process.exit(0)).catch(e=>{process.stderr.write(e.code||e.message);process.exit(1);});
