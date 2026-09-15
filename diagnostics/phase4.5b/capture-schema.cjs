const fs = require('node:fs');
const path = require('node:path');
const { Sequelize, QueryTypes } = require('sequelize');
const load = require('../../test/helpers/load-security-module.cjs');
(async () => {
  const sequelize = new Sequelize({dialect:'sqlite',storage:':memory:',logging:false});
  const mocks = {'.':{sequelize},'../data':{sequelize}}, cache = new Map();
  for (const name of ['cron','dependence','open','system','env','subscription','cronView','cronStats','runningInstance']) {
    const mod = load(path.resolve(`back/data/${name}.ts`),mocks,cache);
    for(const [key,model] of Object.entries(mod)) if(key.endsWith('Model')) await model.sync();
  }
  await load(path.resolve('back/shared/schemaMigrations.ts'),mocks,cache).migrateSchema(sequelize);
  const schema = await sequelize.query("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name",{type:QueryTypes.SELECT});
  fs.writeFileSync(path.join(__dirname,'baseline-schema.json'),JSON.stringify(schema,null,2)+'\n');
  await sequelize.close();
})().catch(error=>{console.error(error);process.exitCode=1});
