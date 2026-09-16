// Select freshly provisioned artifacts without changing historical manifests.
const path=require('node:path');
for(const [historical,current] of [['../phase8/managed-node/result.json','./managed-node/result.json'],['../phase10/managed-node/result.json','./managed-node/result.json'],['../phase10/managed-runtime/result.json','./managed-runtime/result.json']]){
 const file=path.resolve(__dirname,historical);require.cache[file]={id:file,filename:file,loaded:true,exports:require(current)};
}
process.env.QL_PHASE7_MANAGED_ROOT=require('./managed-runtime/result.json').root;
