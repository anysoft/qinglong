// GitNexus 1.6.12 hard-caps only its returned symbol LIST at 1000 (not analysis).
// Use an ephemeral sibling module with a larger output cap; never change the installed tool or its analysis.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const original=process.argv[2],source=fs.readFileSync(original,'utf8'),needle='const DETECT_CHANGES_MAX_LISTED_SYMBOLS = 1000;';
if(source.split(needle).length!==2)throw Error('Unexpected GitNexus source; no patch applied');
const temporary=path.join(path.dirname(original),'local-backend-phase7-'+crypto.randomUUID()+'.js');
try{fs.writeFileSync(temporary,source.replace(needle,'const DETECT_CHANGES_MAX_LISTED_SYMBOLS = 10000;'),{flag:'wx',mode:0o600});execFileSync(process.execPath,[path.join(__dirname,'graph-review.cjs'),temporary],{stdio:'inherit'});fs.writeFileSync(path.join(__dirname,'graph-output-cap.json'),JSON.stringify({tool:'GitNexus 1.6.12',original_sha256:crypto.createHash('sha256').update(source).digest('hex'),output_listing_cap_from:1000,output_listing_cap_to:10000,analysis_changes:false,installed_tool_changes:false,temporary_module_removed:true},null,2)+'\n');}finally{fs.rmSync(temporary,{force:true});}
