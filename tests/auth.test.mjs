import test from 'node:test';
import assert from 'node:assert/strict';
import {createApi} from '../backend.mjs';
import {createHash} from 'node:crypto';
const user={id:'a0338aa6-728f-4ff5-9b71-8212adb12712',username:'admin'};
const raw='a'.repeat(64),hash=createHash('sha256').update(raw).digest('hex');
const env=async()=>({SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_test'});
function request(url,method='GET',body={},headers={}){return {url,method,body,headers:{host:'localhost:5000',origin:'http://localhost:5000','content-type':'application/json',...headers}};}
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v;},end(text){this.body=JSON.parse(text);}};}
const reply=value=>({ok:true,json:async()=>value});
test('login stores only hash and sets HttpOnly Secure cookie, not token JSON',async()=>{
 const calls=[];const handler=createApi({env,token:()=>raw,transport:async(url,opts)=>{calls.push({url,opts});return reply(url.includes('/rpc/')?[user]:[]);}});
 const res=response();await handler(request('/api/login','POST',{username:'admin',password:'12345678'},{'x-forwarded-proto':'https'}),res);
 assert.equal(res.statusCode,200);assert.deepEqual(res.body,{user});
 assert.match(res.headers['Set-Cookie'],/HttpOnly; SameSite=Strict/);assert.match(res.headers['Set-Cookie'],/; Secure/);
 assert.equal(JSON.parse(calls[1].opts.body).token_hash,hash);assert.ok(!calls[1].opts.body.includes(raw));
});
test('invalid password creates no session',async()=>{
 let calls=0;const handler=createApi({env,transport:async()=>{calls++;return reply([]);}});
 const res=response();await handler(request('/api/login','POST',{username:'admin',password:'wrong'}),res);
 assert.equal(res.statusCode,401);assert.equal(calls,1);assert.equal(res.headers['Set-Cookie'],undefined);
});
test('anonymous data access is rejected before database request',async()=>{
 const handler=createApi({env,transport:async()=>{throw Error('must not query');}});const res=response();
 await handler(request('/api/rest/v1/locations'),res);assert.equal(res.statusCode,401);
});
test('cross-origin mutation rejected',async()=>{
 const handler=createApi({env,transport:async()=>{throw Error('must not query');}});const res=response();
 await handler(request('/api/login','POST',{username:'admin',password:'12345678'},{origin:'https://evil.test'}),res);assert.equal(res.statusCode,403);
});
test('owner and allowed columns are enforced by server',async()=>{
 const calls=[];const handler=createApi({env,transport:async(url,opts)=>{calls.push({url,opts});if(url.includes('app_sessions?'))return reply([{user_id:user.id}]);if(url.includes('app_users?'))return reply([user]);return reply([]);}});
 const res=response();await handler(request('/api/rest/v1/locations','POST',{name:'ร้าน A',owner_id:'another-owner',password_hash:'injected'},{cookie:'muay_session='+raw}),res);
 assert.equal(res.statusCode,200);const call=calls.at(-1);assert.equal(new URL(call.url).searchParams.get('owner_id'),'eq.'+user.id);
 assert.deepEqual(JSON.parse(call.opts.body),{name:'ร้าน A',owner_id:user.id});
});
test('auth tables cannot be read through generic API; arbitrary filters are rejected',async()=>{
 const handler=createApi({env,transport:async url=>reply(url.includes('app_sessions?')?[{user_id:user.id}]:[user])});
 for(const path of ['/api/rest/v1/app_users','/api/rest/v1/app_sessions','/api/rest/v1/locations?owner_id=eq.other']){
  const res=response();await handler(request(path,'GET',{}, {cookie:'muay_session='+raw}),res);assert.ok([400,404].includes(res.statusCode));
 }
});
test('logout invalidates stored session and clears cookie',async()=>{
 const calls=[];const handler=createApi({env,transport:async(url,opts)=>{calls.push({url,opts});return reply(url.includes('app_users?')?[user]:[{user_id:user.id}]);}});
 const res=response();await handler(request('/api/logout','POST',{}, {cookie:'muay_session='+raw}),res);
 assert.equal(res.statusCode,200);assert.equal(calls.at(-1).opts.method,'DELETE');assert.match(res.headers['Set-Cookie'],/Max-Age=0/);
});
test('missing server secret fails closed without revealing config',async()=>{
 const handler=createApi({env:async()=>({})});const res=response();await handler(request('/api/session'),res);assert.equal(res.statusCode,503);
});
test('Vercel rewrite metadata is removed without relaxing owner restrictions',async()=>{
 const calls=[];const handler=createApi({env,transport:async(url,opts)=>{calls.push(url);return reply(url.includes('app_sessions?')?[{user_id:user.id}]:url.includes('app_users?')?[user]:[]);}});
 const res=response();await handler(request('/api/index?route=rest/v1/locations&path=rest%2Fv1%2Flocations&limit=500&offset=0','GET',{}, {cookie:'muay_session='+raw}),res);
 assert.equal(res.statusCode,200);const query=new URL(calls.at(-1)).searchParams;assert.equal(query.get('owner_id'),'eq.'+user.id);assert.equal(query.has('path'),false);assert.equal(query.has('route'),false);
});
test('daily API recalculates sales and opening quantity instead of trusting client',async()=>{
 const writes=[];
 const handler=createApi({env,transport:async(url,opts)=>{
  if(url.includes('app_sessions?'))return reply([{user_id:user.id}]);
  if(url.includes('app_users?'))return reply([user]);
  if(url.includes('stock_items?'))return reply([{id:'p1',kind:'product',name:'จิ๋ว',cost:3,price:5}]);
  if(opts.method==='POST'){writes.push(JSON.parse(opts.body));return reply([]);}
  return reply([]);
 }});
 const res=response();await handler(request('/api/rest/v1/daily_records','POST',{period_id:'period1',sale_date:'2026-01-01',items:[{product_id:'p1',inventory_version:1,opening:999,received:100,closing:25,waste:5,returned:0}]},{cookie:'muay_session='+raw}),res);
 assert.equal(res.statusCode,200);assert.equal(writes[0].items[0].opening,0);assert.equal(writes[0].items[0].quantity,70);
});
test('inserting an earlier inventory day with later saved records is rejected',async()=>{
 let wrote=false;const handler=createApi({env,transport:async(url,opts)=>{
  if(url.includes('app_sessions?'))return reply([{user_id:user.id}]);
  if(url.includes('app_users?'))return reply([user]);
  if(url.includes('stock_items?'))return reply([{id:'p1',kind:'product',name:'จิ๋ว',cost:3,price:5}]);
  if(opts.method==='POST'){wrote=true;return reply([]);}
  return reply([{period_id:'period1',sale_date:'2026-01-03',items:[]}]);
 }});
 const res=response();await handler(request('/api/rest/v1/daily_records','POST',{period_id:'period1',sale_date:'2026-01-01',items:[{product_id:'p1',inventory_version:1,received:100,closing:20,waste:0,returned:0}]},{cookie:'muay_session='+raw}),res);
 assert.equal(res.statusCode,400);assert.match(res.body.message,/วันถัดไป/);assert.equal(wrote,false);
});
