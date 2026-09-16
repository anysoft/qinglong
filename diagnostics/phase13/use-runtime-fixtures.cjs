// Select this phase's verified artifacts without modifying historical fixture manifests.
const path=require('node:path');
const file=path.resolve(__dirname,'../phase8/managed-node/result.json');
require.cache[file]={id:file,filename:file,loaded:true,exports:require('./managed-node/result.json')};
process.env.QL_PHASE7_MANAGED_ROOT=require('./managed-runtime/result.json').root;
