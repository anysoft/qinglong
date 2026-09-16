require('reflect-metadata');
(async()=>{const h=await require('../phase10/attach.cjs').attach(process.argv[2]);const event=await h.TriggerEventModel.findByPk(Number(process.argv[3]));
 if(process.argv[4]==='before-link'){const create=h.TaskRunModel.create.bind(h.TaskRunModel);h.TaskRunModel.create=async(...args)=>{await create(...args);process.kill(process.pid,'SIGKILL');};}
 await h.execution.submit(event.task_id,event.trigger_type,event.id);process.kill(process.pid,'SIGKILL');
})().catch(e=>{console.error(e);process.exit(1)});
