'use strict';
const {execFileSync}=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict'),fs=require('node:fs');
const project='platform-compose-'+crypto.randomBytes(5).toString('hex');
const env={...process.env,DOCKERHUB_IMAGE:'platform-candidate',PLATFORM_VERSION:process.env.TEST_ARCH,PLATFORM_PORT:'0'};
const compose=(...a)=>execFileSync('docker',['compose','-p',project,'-f','compose.yaml',...a],{env,encoding:'utf8',stdio:['pipe','pipe','pipe']});
let passed=false;
try{compose('up','-d','--wait','--wait-timeout','180','--pull','never');const id=compose('ps','-q','platform').trim();const state=JSON.parse(execFileSync('docker',['inspect',id],{encoding:'utf8'}))[0];assert.equal(state.State.Health.Status,'healthy');assert.equal(state.Config.User,'10001:10001');assert.equal(state.HostConfig.ReadonlyRootfs,true);compose('restart','--no-deps','platform');compose('up','-d','--wait','--wait-timeout','180','--pull','never');passed=true;}finally{compose('down','--volumes','--remove-orphans');fs.writeFileSync((process.env.RELEASE_OUTPUT||'release-output')+'/compose.json',JSON.stringify({status:passed?'PASS':'FAIL',cleanup:'PASS'})+'\n');}
