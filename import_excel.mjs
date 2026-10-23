import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {environment} from './backend.mjs';
import {aggregate} from './domain.js';

const apply=process.argv.includes('--apply');
const eventOnly=process.argv.includes('--event2569');
const dir=new URL(eventOnly?'./imports/event2569/':'./imports/excel-all-years/',import.meta.url);
const plan=JSON.parse(await readFile(new URL('plan.json',dir),'utf8'));
const summary=JSON.parse(await readFile(new URL('summary.json',dir),'utf8'));
const settings=await environment(),secret=settings.SUPABASE_SECRET_KEY;
if(!secret)throw Error('Server secret is missing');
const order=['locations','stock_items','periods','daily_records','stock_movements'];
const removeOrder=['daily_records','stock_movements','periods','stock_items','locations'];
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const canonical=value=>JSON.stringify(value,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
async function db(path,{method='GET',body}={}){
 const r=await fetch(settings.SUPABASE_URL+'/rest/v1/'+path,{method,headers:{apikey:secret,...(secret.startsWith('eyJ')?{Authorization:'Bearer '+secret}:{}),'Content-Type':'application/json',Prefer:'return=representation'},...(body?{body:JSON.stringify(body)}:{})});
 const text=await r.text();const value=text?JSON.parse(text):null;if(!r.ok)throw Error(`${method} ${path.split('?')[0]}: ${value?.message||r.status}`);return value;
}
const users=await db('app_users?username=eq.admin&select=id,username');
if(users.length!==1)throw Error('Expected one admin account');
const owner=users[0].id;
async function readAll(table){const rows=[];for(let offset=0;;offset+=500){const page=await db(`${table}?owner_id=eq.${owner}&select=*&order=id.asc&limit=500&offset=${offset}`);rows.push(...page);if(page.length<500)return rows;}}
async function snapshot(){const result={};for(const t of order)result[t]=await readAll(t);return result;}
async function clear(){for(const t of removeOrder)await db(t+'?owner_id=eq.'+owner,{method:'DELETE'});}
async function insert(dataset){for(const t of order){for(let i=0;i<dataset[t].length;i+=250){await db(t,{method:'POST',body:dataset[t].slice(i,i+250).map(r=>({...r,owner_id:owner}))});}console.log('Inserted',t,dataset[t].length);}}
function verify(dataset,actual){
 for(const t of order){
  if(actual[t].length!==dataset[t].length)throw Error('Count mismatch: '+t);
  const map=new Map(actual[t].map(row=>[row.id,row]));
  for(const expected of dataset[t]){
   const saved=map.get(expected.id);if(!saved||saved.owner_id!==owner)throw Error('Missing ID or owner mismatch: '+t);
   for(const [key,value] of Object.entries(expected)){
    if(key==='owner_id')continue;
    if(canonical(saved[key])!==canonical(value))throw Error(`Value mismatch ${t}.${key} id ${expected.id}`);
   }
  }
 }
 const expected=aggregate(dataset.daily_records),saved=aggregate(actual.daily_records);
 for(const key of Object.keys(expected))if(Math.abs(expected[key]-saved[key])>.01)throw Error('Financial reconciliation failed: '+key);
 return saved;
}
const sourceBytes=await readFile(new URL('./'+plan.source,import.meta.url));
if(createHash('sha256').update(sourceBytes).digest('hex')!==plan.source_sha256)throw Error('Workbook changed after preparation');
await db('stock_items?select=kind,cost,price&limit=0');
const previous=await snapshot();
console.log('Existing admin records:',Object.fromEntries(order.map(t=>[t,previous[t].length])));
console.log('Prepared records:',Object.fromEntries(order.map(t=>[t,plan[t].length])));
if(!apply){console.log('Preflight complete. No database changes made.');process.exit(0);}
const backupDir=new URL('./backups/',import.meta.url);await mkdir(backupDir,{recursive:true});
const backupFile=new URL(`before-excel-import-${stamp}.json`,backupDir);
const backup={exported_at:new Date().toISOString(),owner_id:owner,source:'before authorized Excel replacement',...previous};
await writeFile(backupFile,JSON.stringify(backup,null,2),{flag:'wx'});
const backupRead=JSON.parse(await readFile(backupFile,'utf8'));verify(previous,backupRead);
console.log('Backup saved and verified:',backupFile.pathname.split('/').at(-1));
let result;
try{
 await clear();await insert(plan);
 const saved=await snapshot();result=verify(plan,saved);
 const controls={};
 for(const [sheet,control] of Object.entries(summary.controls)){
  const pids=new Set(plan.periods.filter(p=>p.name.includes(sheet)).map(p=>p.id));
  const rows=saved.daily_records.filter(r=>pids.has(r.period_id));const totals=aggregate(rows);
  if(rows.length!==control.rows)throw Error('Source row count mismatch '+sheet);
  for(const key of ['revenue','cost','expense','profit'])if(Math.abs(totals[key]-control[key])>.01)throw Error('Source control mismatch '+sheet+' '+key);
  controls[sheet]={rows:rows.length,...totals};
 }
 await writeFile(new URL('verified.json',dir),JSON.stringify({completed_at:new Date().toISOString(),owner_id:owner,counts:summary.counts,controls,totals:result,backup_file:backupFile.pathname},null,2));
 console.log('Verified all rows and source controls:',Object.fromEntries(Object.entries(controls).map(([k,v])=>[k,v.rows])));
}catch(error){
 console.error('Import failed; restoring original backup:',error.message);
 try{await clear();await insert(previous);verify(previous,await snapshot());console.error('Original data restored and verified.');}catch(restore){console.error('RESTORE FAILED. Backup retained at',backupFile.pathname);throw restore;}
 throw error;
}
const fmt=n=>new Intl.NumberFormat('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
const report=eventOnly?`# ผลนำเข้าเฉพาะ Event2569

ล้างข้อมูลร้านของ admin หลังสำรอง และนำเข้าเฉพาะชีต Event2569 สำเร็จ

- ${plan.daily_records.length} บัญชีรายวัน
- ${plan.periods.length} รอบขาย
- ${plan.locations.length} สถานที่
- ${plan.stock_items.length} สินค้า ไม่มีอุปกรณ์หรือยอดจากชีต Stock

ตรวจจำนวนทุกตาราง ค่าแต่ละช่อง และยอดรวมกับชุดนำเข้าแล้ว รายการว่าง/ศูนย์ไม่ถูกนำเข้า ราคาขายต่อหน่วยที่ระบุไม่ได้ยังเป็น 0 และไม่สร้างจำนวนของเหลือย้อนหลัง

สำรองก่อนล้าง: ${backupFile.pathname.split('/').at(-1)}
`:`# ผลการนำเข้า Excel ทุกปี\n\nนำเข้าบัญชีร้านจาก Event2563–Event2569 และอุปกรณ์จาก Stock สำหรับบัญชี admin สำเร็จ ตรวจทุก ID ค่าแต่ละช่อง จำนวนแถว และยอดรวมรายชีตกับชุดข้อมูลเตรียมนำเข้าแล้ว\n\n| ชีต | บัญชีรายวัน | รายรับ | ต้นทุน | ค่าใช้จ่ายอื่น | กำไรคำนวณใหม่ |\n|---|---:|---:|---:|---:|---:|\n${Object.entries(summary.controls).map(([s,c])=>`| ${s} | ${c.rows} | ${fmt(c.revenue)} | ${fmt(c.cost)} | ${fmt(c.expense)} | ${fmt(c.profit)} |`).join('\n')}\n\n## ข้อมูลที่นำเข้า\n\n- ${plan.locations.length} สถานที่, ${plan.periods.length} รอบขาย, ${plan.daily_records.length} บัญชีรายวัน\n- ${plan.stock_items.length} สินค้า/อุปกรณ์ และ ${plan.stock_movements.length} ยอดอุปกรณ์แยกสถานที่\n- ราคาทุนสินค้าใช้สูตรล่าสุดที่พบ ราคาขายสินค้าตั้งเป็น 0 รอผู้ใช้กำหนด เพราะยอดรายรับรวมไม่สามารถระบุราคาขายปลีกต่อหน่วยได้\n- บัญชีเก่าไม่ทราบจำนวนของเหลือ จึงเก็บแบบประวัติเดิม ไม่สร้างยอดของเหลือขึ้นเอง\n- ไม่เปลี่ยนรหัสผ่านหรือผู้ใช้ และสำรองข้อมูลร้านก่อนล้างไว้ใน ${backupFile.pathname.split('/').at(-1)}\n\n## การแปลงและข้อสังเกต\n\n- แก้ปี พ.ศ./ปี 19xx ที่ตรงเลขปีบัญชีให้เป็น ค.ศ. ${summary.corrections.date_year_normalized} แถว (รายละเอียดวันที่ต้นฉบับเก็บในหมายเหตุ)\n- อ่านวันที่ข้อความไทย ${summary.corrections.thai_text_dates} แถว และรองรับคอลัมน์ที่เลื่อนใน Event2565\n- สลับอ่าน Revenue/Expense ${summary.corrections.reversed_revenue_expense_columns} แถวตามสูตร N−M ของต้นฉบับ\n- ${summary.issue_counts.aggregate_cost} แถวแยกราคาทุนต่อสินค้าไม่ได้ เก็บต้นทุนรวมจาก Excel แยกเป็นรายการ เพื่อรักษายอดต้นทุน\n- ${summary.issue_counts.expense_total_mismatch} แถวยอด Expense ไม่ตรงผลรวมหมวด และ ${summary.issue_counts.profit_formula_mismatch} แถวกำไรไม่ตรงรายรับ−ต้นทุน−ค่าใช้จ่าย ระบบคำนวณจากรายการจริงและเก็บกำไรต้นฉบับในหมายเหตุ จึงไม่รับรองว่ากำไรตรงสูตรเดิมทุกแถว\n- ค่าใช้จ่าย 2 เซลล์ถูกตั้งรูปแบบวันที่ใน Excel อ่านค่าตัวเลข serial เดิมเป็น 250 และ 600\n- อุปกรณ์ 2 แถวจำนวนแยกสถานที่เกิน Total: คงจำนวนที่แต่ละสถานที่ระบุ และแจ้งใน issues.json ไม่ปรับเดา\n- ข้ามแถวว่าง/ศูนย์ ${summary.skipped_counts['empty / zero template row']} แถว และแถวอ่านวันที่ไม่ได้ ${summary.skipped_counts['unparseable date']} แถว (ดู skipped.json)\n- ไม่รวม Expense64–Expense2569 ที่ปนรายจ่ายส่วนตัว/หนี้สิน/ครอบครัวและอาจซ้ำบัญชีร้าน, ชีตชาบูที่ใช้โครงสร้างอื่น, ยอดสรุป และ Sheet1\n\nรายละเอียดตรวจสอบอยู่ใน issues.json, skipped.json, summary.json และ verified.json ในโฟลเดอร์เดียวกัน ไฟล์ต้นฉบับไม่ได้ถูกแก้ไข\n`;
await writeFile(new URL('IMPORT_REPORT.md',dir),report);
console.log('Import completed; report saved.');
