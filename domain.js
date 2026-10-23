export const money=n=>new Intl.NumberFormat('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
export function inventoryCounts(item){
 const values={};for(const key of ['opening','received','closing','waste','returned']){const n=Number(item[key]??0);if(!Number.isFinite(n)||n<0)throw Error('จำนวนต้องเป็นตัวเลขตั้งแต่ศูนย์ขึ้นไป');values[key]=n;}
 const sold=Math.round((values.opening+values.received-values.closing-values.waste-values.returned)*1000)/1000||0;
 if(sold<0)throw Error('ของเหลือ + เสีย/แจก + ส่งคืน ต้องไม่เกินยกมา + รับเพิ่ม');
 return {...values,sold};
}
export function carryForward(records,periodId,date,productId){
 const prior=records.filter(r=>r.period_id===periodId&&r.sale_date<date).sort((a,b)=>b.sale_date.localeCompare(a.sale_date));
 for(const record of prior){const item=record.items.find(i=>i.product_id===productId);if(item)return item.inventory_version===1?{opening:Number(item.closing),opening_cost:Number(item.cost),source_date:record.sale_date}:{opening:0,opening_cost:0};}
 return {opening:0,opening_cost:0};
}
export function totals(record){const cost=(record.items||[]).reduce((s,i)=>s+(i.inventory_version===1?inventoryCounts(i).sold:Number(i.quantity))*Number(i.cost),0);const losses=(record.items||[]).reduce((s,i)=>s+(i.inventory_version===1?Number(i.waste)*Number(i.cost):0),0);const expense=(record.expenses||[]).reduce((s,i)=>s+Number(i.amount),0)+losses;const revenue=Number(record.revenue||0);return {cost,expense,revenue,profit:revenue-cost-expense};}
export function aggregate(records){return records.reduce((s,r)=>{const t=totals(r);for(const k of Object.keys(s))s[k]+=t[k];return s;},{revenue:0,cost:0,expense:0,profit:0});}
export function validPeriod(start,end){return /^\d{4}-\d{2}-\d{2}$/.test(start)&&/^\d{4}-\d{2}-\d{2}$/.test(end)&&start<=end;}
export function inPeriod(date,p){return date>=p.starts_on&&date<=p.ends_on;}
export function reportRecords(records,periods,{month,year,location}){const ids=new Set(periods.filter(p=>!location||p.location_id===location).map(p=>p.id));return records.filter(r=>ids.has(r.period_id)&&(!year||r.sale_date.startsWith(year))&&(!month||r.sale_date.slice(5,7)===month));}
