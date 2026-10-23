import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {environment} from './backend.mjs';

// Explicit operator action only. Never runs on server startup or during deployment.
if(!process.argv.includes('--apply'))throw Error('Pass --apply to back up and clear all shop records; login accounts are retained.');
const env=await environment(),key=env.SUPABASE_SECRET_KEY;
if(!key)throw Error('Missing SUPABASE_SECRET_KEY');
const insertOrder=['locations','stock_items','periods','daily_records','stock_movements'];
const deleteOrder=['daily_records','stock_movements','periods','stock_items','locations'];
async function db(path,{method='GET',body}={}){
 const r=await fetch(env.SUPABASE_URL+'/rest/v1/'+path,{method,headers:{apikey:key,...(key.startsWith('eyJ')?{Authorization:'Bearer '+key}:{}),'Content-Type':'application/json',Prefer:'return=representation'},...(body?{body:JSON.stringify(body)}:{})});
 const text=await r.text(),value=text?JSON.parse(text):null;if(!r.ok)throw Error(value?.message||'Database request failed');return value;
}
async function all(table){const rows=[];for(let offset=0;;offset+=500){const batch=await db(`${table}?select=*&order=id.asc&limit=500&offset=${offset}`);rows.push(...batch);if(batch.length<500)return rows;}}
const saved={};for(const t of insertOrder)saved[t]=await all(t);
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
await mkdir(new URL('./backups/',import.meta.url),{recursive:true});
const backup=new URL('./backups/before-clear-for-github-'+stamp+'.json',import.meta.url);
await writeFile(backup,JSON.stringify({exported_at:new Date().toISOString(),...saved},null,2),{flag:'wx'});
const check=JSON.parse(await readFile(backup,'utf8'));
for(const t of insertOrder)if(JSON.stringify(check[t])!==JSON.stringify(saved[t]))throw Error('Backup verification failed');
console.log('Verified backup:',backup.pathname.split('/').at(-1));
console.log('Before clear:',Object.fromEntries(insertOrder.map(t=>[t,saved[t].length])));
async function clear(){for(const t of deleteOrder)await db(t+'?id=not.is.null',{method:'DELETE'});}
try{
 await clear();for(const t of insertOrder)if((await all(t)).length)throw Error('Table not empty: '+t);
 console.log('Verified: all five shop tables empty. User accounts retained.');
}catch(error){
 console.error('Clear failed. Restoring backup.');await clear();
 for(const t of insertOrder)for(let n=0;n<saved[t].length;n+=250)await db(t,{method:'POST',body:saved[t].slice(n,n+250)});
 for(const t of insertOrder)if((await all(t)).length!==saved[t].length)throw Error('Restore failed; backup retained');
 throw error;
}
