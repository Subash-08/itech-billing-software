// Explicit integration check against itech_dev; removes only its own temporary accounts.
import {MongoClient} from 'mongodb';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
process.loadEnvFile('.env.local');
if(process.env.MONGODB_DB!=='itech_dev')throw new Error('This check requires itech_dev.');
const client=await new MongoClient(process.env.MONGODB_URI).connect();
const db=client.db('itech_dev'),base='http://127.0.0.1:3000';
const run=randomUUID(),email=`integration-${run}@example.invalid`,password=randomUUID()+'Aa1!',profitPassword=randomUUID()+'Pp2!';
async function request(route,body,cookie){const r=await fetch(base+'/api/auth/'+route,{method:body?'POST':'GET',headers:{origin:base,...(body?{'content-type':'application/json'}:{}),...(cookie?{cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json(),cookie:r.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ')};}
let tenantId;
try{
 const signup=await request('signup',{name:'Integration check',companyName:'Temporary integration company',email,password,profitPassword});
 assert.equal(signup.status,200,JSON.stringify(signup.body));
 const user=await db.collection('authUsers').findOne({email});assert.ok(user);tenantId=user.tenantId;
 assert.equal(user.verified,false);assert.notEqual(tenantId,'forged');assert.ok(user.profitPasswordHash);assert.ok(!user.profitPassword);
 assert.equal((await request('login',{email,password})).status,403);
 await db.collection('authUsers').updateOne({_id:user._id},{$set:{verified:true}});
 await db.collection('tenants').updateOne({_id:tenantId},{$set:{verified:true}});
 const login=await request('login',{email,password});assert.equal(login.status,200,JSON.stringify(login.body));assert.ok(login.cookie);
 assert.equal((await request('me',null,login.cookie)).status,200);
 assert.equal((await request('profit-unlock',{password:'incorrect'},login.cookie)).status,403);
 assert.equal((await request('profit-unlock',{password:profitPassword},login.cookie)).status,200);
 assert.equal((await request('me',null,login.cookie)).body.profitUnlocked,true);
 assert.equal((await request('logout',{},login.cookie)).status,200);
 assert.equal((await request('me',null,login.cookie)).status,401);
 console.log('PASS: Atlas signup, approval gate, protected fields, login, profit unlock and logout.');
}finally{
 const user=await db.collection('authUsers').findOne({email});
 if(user){tenantId=user.tenantId;await db.collection('authSessions').deleteMany({userId:user._id});await db.collection('authAccounts').deleteMany({userId:user._id});await db.collection('authUsers').deleteOne({_id:user._id,email});}
 if(tenantId)await db.collection('tenants').deleteOne({_id:tenantId,companyName:'Temporary integration company'});
 await client.close();
}
