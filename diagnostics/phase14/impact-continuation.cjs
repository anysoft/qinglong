const fs=require('fs');
(async()=>{const {LocalBackend}=await import('/Users/jonhy/.npm/_npx/e18c207a63d109df/node_modules/gitnexus/dist/mcp/local/local-backend.js');const b=new LocalBackend();await b.init();const targets={
 'back/services/backup/barrier.ts':['mutation','PlatformBackupBarrier'],
 'back/app.ts':['start','startWorkerProcess'],
 'back/loaders/express.ts':['resolveTrustProxy'],
 'back/services/executionService.ts':['submit','tick','execute','recover'],
 'back/services/triggerScheduler.ts':['tick'],
 'back/services/triggerEvents.ts':['receive','recover'],
 'back/services/managedSubscription.ts':['exclusive'],
 'back/services/runtimeOperations.ts':['request','execute','recover'],
 'back/services/pythonEnvironment.ts':['withMutation'],
 'back/services/nodeEnvironment.ts':['definition','metadata'],
 'back/services/notificationDispatcher.ts':['deliver'],
 'back/services/system.ts':['exportData','importData','reloadSystem'],
 'back/token.ts':['getToken']};const out=[];for(const [file_path,names] of Object.entries(targets))for(const target of names){const result=await b.callTool('impact',{repo:'qinglong',target,file_path,direction:'upstream'});out.push({file_path,target,result});console.log(file_path,target,result.risk,result.impactedCount,result.summary?.processes_affected);}fs.writeFileSync('diagnostics/phase14/impact-continuation.json',JSON.stringify(out,null,2));await b.cleanup?.();})().catch(e=>{console.error(e);process.exit(1)});
