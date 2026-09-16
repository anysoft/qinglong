const {attach}=require('./attach.cjs');
(async()=>{const h=await attach(process.argv[2]);h.execution.start();process.send?.({ready:true});process.on('message',async message=>{if(message==='stop'){await h.close();process.exit(0);}});})().catch(error=>{process.stderr.write(String(error));process.exit(1);});
