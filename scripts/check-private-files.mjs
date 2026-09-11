import {MongoClient,ObjectId} from 'mongodb';
import {hashPassword} from 'better-auth/crypto';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import path from 'node:path';
import {unlink,rmdir} from 'node:fs/promises';
process.loadEnvFile('.env.local');
if(process.env.MONGODB_DB!=='itech_dev')throw new Error('Requires isolated itech_dev database.');
const client=await new MongoClient(process.env.MONGODB_URI).connect(),db=client.db('itech_dev'),base='http://127.0.0.1:3000';
const users=[],files=[];
try{
 for(let i=0;i<2;i++){
  const user={_id:new ObjectId(),email:`file-test-${randomUUID()}@example.invalid`,name:'Temporary file test',emailVerified:false,tenantId:randomUUID(),companyName:'Temporary file test',verified:true,disabled:false,createdAt:new Date(),updatedAt:new Date()};users.push(user);
  const password=randomUUID()+'Aa1!';
  await db.collection('tenants').insertOne({_id:user.tenantId,companyName:user.companyName,verified:true,disabled:false});
  await db.collection('authUsers').insertOne(user);
  await db.collection('authAccounts').insertOne({userId:user._id,accountId:user._id.toString(),providerId:'credential',password:await hashPassword(password),createdAt:new Date(),updatedAt:new Date()});
  const r=await fetch(base+'/api/auth/login',{method:'POST',headers:{origin:base,'content-type':'application/json'},body:JSON.stringify({email:user.email,password})});assert.equal(r.status,200,await r.text());user.cookie=r.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
 }
 const form=new FormData();form.set('file',new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jm1sAAAAASUVORK5CYII=','base64')],{type:'image/png'}),'sample.png');
 const uploaded=await fetch(base+'/api/files',{method:'POST',headers:{origin:base,cookie:users[0].cookie},body:form});const result=await uploaded.json();assert.equal(uploaded.status,200,JSON.stringify(result));files.push(result.id);
 assert.equal((await fetch(base+result.url,{headers:{cookie:users[0].cookie}})).status,200);
 assert.equal((await fetch(base+result.url,{headers:{cookie:users[1].cookie}})).status,404);
 assert.equal((await fetch(base+result.url)).status,401);
 const rejected=await fetch(base+'/api/files',{method:'POST',headers:{origin:'https://untrusted.example',cookie:users[0].cookie},body:new FormData()});assert.equal(rejected.status,403);
 console.log('PASS: private upload, owner download, cross-company denial, anonymous denial and origin protection.');
}finally{
 for(const user of users){
  const records=await db.collection('files').find({tenantId:user.tenantId}).toArray();
  const root=path.resolve(process.env.PRIVATE_STORAGE_ROOT),dir=path.resolve(root,user.tenantId);
  if(!dir.startsWith(root+path.sep))throw new Error('Unsafe cleanup path');
  for(const record of records){const file=path.resolve(dir,record.key);if(!file.startsWith(dir+path.sep))throw new Error('Unsafe file path');await unlink(file);await db.collection('files').deleteOne({_id:record._id,tenantId:user.tenantId});}
  await rmdir(dir).catch(e=>{if(e.code!=='ENOENT')throw e;});
  await db.collection('authSessions').deleteMany({userId:user._id});await db.collection('authAccounts').deleteMany({userId:user._id});await db.collection('authUsers').deleteOne({_id:user._id,email:user.email});await db.collection('tenants').deleteOne({_id:user.tenantId,companyName:'Temporary file test'});
 }
 await client.close();
}
