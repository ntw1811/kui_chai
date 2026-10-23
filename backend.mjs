import {readFile} from 'node:fs/promises';
import {randomBytes,createHash} from 'node:crypto';
import {snapshotItems} from './pricing.mjs';
export async function environment(){
 let text='';try{text=await readFile(new URL('./.env',import.meta.url),'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
 const file=Object.fromEntries(text.split(/\r?\n/).filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{const n=l.indexOf('=');return [l.slice(0,n),l.slice(n+1).trim()];}));
 return {...file,...process.env};
}
const digest=t=>createHash('sha256').update(t).digest('hex');
const canonical=value=>JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const fields={locations:['name'],periods:['location_id','name','starts_on','ends_on','daily_rent','daily_wage'],daily_records:['period_id','sale_date','revenue','items','expenses','note'],stock_items:['name','unit','kind','cost','price'],stock_movements:['stock_item_id','location_id','moved_on','quantity','reason']};
export function createApi({env=environment,transport=fetch,token=()=>randomBytes(32).toString('hex')}={}){
 return async function handler(req,res){
  const url=new URL(req.url,'http://localhost');if(!url.pathname.startsWith('/api/'))return false;
  const send=(status,body)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(body));return true;};
  try{
   if(!['GET','POST','PATCH'].includes(req.method))return send(405,{message:'Method not allowed'});
   if(req.method!=='GET'){
    const origin=req.headers.origin;
    const host=req.headers['x-forwarded-host']||req.headers.host;
    if(!origin||new URL(origin).host!==host||req.headers['content-type']?.split(';')[0]!=='application/json')return send(403,{message:'Invalid request origin'});
   }
   const settings=await env(),secret=settings.SUPABASE_SECRET_KEY;
   if(!secret)return send(503,{message:'ต้องตั้ง SUPABASE_SECRET_KEY ใน .env ฝั่งเซิร์ฟเวอร์ และรัน supabase/admin-auth.sql ก่อน'});
   const db=async(path,{method='GET',body}={})=>{
    const r=await transport(settings.SUPABASE_URL+'/rest/v1/'+path,{method,headers:{apikey:secret,...(secret.startsWith('eyJ')?{Authorization:'Bearer '+secret}:{}),'Content-Type':'application/json',Prefer:'return=representation'},...(body?{body:JSON.stringify(body)}:{})});
    const value=await r.json();if(!r.ok)throw Error('Database request failed: '+(value.message||r.status));return value;
   };
   let body={};if(req.method!=='GET'){
    if(req.body&&typeof req.body==='object')body=req.body;
    else {let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>262144)return send(413,{message:'Request too large'});}try{body=JSON.parse(text);}catch{return send(400,{message:'Invalid JSON'});}}
   }
   const secure=req.headers['x-forwarded-proto']==='https'||Boolean(req.socket?.encrypted);
   const cookie=(value,age)=>`muay_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${secure?'; Secure':''}`;
   if(url.pathname==='/api/login'&&req.method==='POST'){
    if(typeof body.username!=='string'||typeof body.password!=='string'||body.username.length>80||body.password.length>256)return send(400,{message:'Invalid login'});
    const users=await db('rpc/app_login',{method:'POST',body:{login_name:body.username,login_password:body.password}});
    if(!users.length)return send(401,{message:'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง หรือบัญชีถูกพักชั่วคราว'});
    const user=users[0],value=token();
    await db('app_sessions',{method:'POST',body:{token_hash:digest(value),user_id:user.id,expires_at:new Date(Date.now()+86400000).toISOString()}});
    res.setHeader('Set-Cookie',cookie(value,86400));return send(200,{user:{id:user.id,username:user.username}});
   }
   const value=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('muay_session='))?.slice(13);
   if(!value||!/^[a-f0-9]{64}$/.test(value))return send(401,{message:'กรุณาเข้าสู่ระบบ'});
   const sessions=await db(`app_sessions?token_hash=eq.${digest(value)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=user_id`);
   if(!sessions.length)return send(401,{message:'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่'});
   const users=await db(`app_users?id=eq.${sessions[0].user_id}&enabled=eq.true&select=id,username`);
   if(!users.length)return send(401,{message:'บัญชีถูกปิดใช้งาน'});
   const user=users[0];
   if(url.pathname==='/api/session'&&req.method==='GET')return send(200,{user});
   if(url.pathname==='/api/logout'&&req.method==='POST'){
    await db('app_sessions?token_hash=eq.'+digest(value),{method:'DELETE'});res.setHeader('Set-Cookie',cookie('',0));return send(200,{ok:true});
   }
   const table=url.pathname.match(/^\/api\/rest\/v1\/([a-z_]+)$/)?.[1];
   if(!fields[table])return send(404,{message:'Not found'});
   if([...url.searchParams.keys()].some(k=>!['select','id','limit','offset'].includes(k)))return send(400,{message:'Unsupported query'});
   const query=new URLSearchParams({owner_id:'eq.'+user.id,select:'*'});
   if(req.method==='GET'){
    const limit=url.searchParams.get('limit')||'500',offset=url.searchParams.get('offset')||'0';
    if(!/^\d+$/.test(limit)||!/^\d+$/.test(offset)||Number(limit)<1||Number(limit)>500)return send(400,{message:'Invalid pagination'});
    query.set('limit',limit);query.set('offset',offset);query.set('order','id.asc');
   }
   if(req.method==='PATCH'){
    const id=url.searchParams.get('id');if(!['daily_records','stock_items'].includes(table)||!/^eq\.[a-f0-9-]{36}$/.test(id||''))return send(400,{message:'Invalid update'});query.set('id',id);
   }
   const payload=Object.fromEntries(fields[table].filter(k=>Object.hasOwn(body,k)).map(k=>[k,body[k]]));
   if(req.method==='POST')payload.owner_id=user.id;
   if(table==='daily_records'&&req.method!=='GET'){
    const catalog=await db('stock_items?owner_id=eq.'+user.id+'&select=*');
    const previous=req.method==='PATCH'?await db('daily_records?'+query):[];
    if(req.method==='PATCH'&&!previous.length)return send(404,{message:'ไม่พบรายการเดิม'});
    const history=await db('daily_records?owner_id=eq.'+user.id+'&period_id=eq.'+encodeURIComponent(payload.period_id)+'&select=*');
    try{
     if(!previous.length&&body.items.some(i=>i.inventory_version!==1))throw Error('กรุณาเปิดหน้าบันทึกใหม่เพื่อใช้ช่องของเหลือ');
     payload.items=snapshotItems(body.items,catalog,previous[0]?.items||[],{records:history,period_id:payload.period_id,sale_date:payload.sale_date});
     for(const record of history.filter(r=>r.sale_date<payload.sale_date))for(const item of record.items){
      if(item.inventory_version===1&&Number(item.closing)>0&&!payload.items.some(i=>i.product_id===item.product_id)){
       const latest=history.filter(r=>r.sale_date<payload.sale_date).sort((a,b)=>b.sale_date.localeCompare(a.sale_date)).flatMap(r=>r.items).find(i=>i.product_id===item.product_id);
       if(latest&&Number(latest.closing)>0)throw Error('ยังมีสินค้ายกมา กรุณาใส่สินค้านั้นและระบุของเหลือหรือส่งคืน');
      }
     }
     const future=history.some(r=>r.sale_date>payload.sale_date&&(!previous.length||r.id!==previous[0].id));
     if(future&&(!previous.length||canonical(payload.items)!==canonical(previous[0].items)))throw Error('มีวันถัดไปบันทึกแล้ว กรุณาแก้จำนวนสินค้าจากวันล่าสุดย้อนกลับ เพื่อไม่ให้ยอดยกมาคลาดเคลื่อน');
     if(previous.length&&(payload.period_id!==previous[0].period_id||payload.sale_date!==previous[0].sale_date))throw Error('ไม่สามารถย้ายวันที่หรือรอบของรายการเดิมได้');
    }catch(error){return send(400,{message:error.message});}
   }
   const rows=await db(table+'?'+query,{method:req.method,...(req.method!=='GET'?{body:payload}:{})});return send(200,rows);
  }catch(error){console.error('API:',error.message);return send(500,{message:'ฐานข้อมูลยังไม่พร้อม กรุณาตรวจการตั้งค่าและรัน admin-auth.sql'});}
 };
}
export const apiHandler=createApi();
