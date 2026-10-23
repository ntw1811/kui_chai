import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as domain from '../domain.js';
test('daily form renders inventory fields, carries previous balance, and submits derived sold quantity',async()=>{
 const listeners={},root={innerHTML:'',addEventListener:(name,fn)=>listeners[name]=fn},writes=[];
 const data={locations:[{id:'l1',name:'บางนา'}],periods:[{id:'r1',location_id:'l1',name:'รอบทดสอบ',starts_on:'2020-01-01',ends_on:'2099-12-31'}],stock_items:[{id:'p1',kind:'product',name:'จิ๋ว',cost:3,price:5}],stock_movements:[],daily_records:[{id:'old',period_id:'r1',sale_date:'2020-01-01',revenue:375,items:[{product_id:'p1',name:'จิ๋ว',inventory_version:1,opening:0,received:100,closing:25,waste:0,returned:0,quantity:75,cost:3,received_cost:3,price:5}],expenses:[]}]};
 const context=vm.createContext({...domain,Intl,Date,URL,Blob,console,structuredClone,setTimeout,FormData:class {constructor(){} *[Symbol.iterator](){}} ,document:{querySelector:s=>s==='#app'?root:s==='.status'?{}:null},fetch:async(url,opts)=>{
  if(url==='/api/session')return {ok:true,json:async()=>({user:{username:'admin'}})};
  const table=url.match(/\/rest\/v1\/(\w+)/)?.[1];
  if(opts.method==='POST'){writes.push(JSON.parse(opts.body));return {ok:true,json:async()=>[]};}
  return {ok:true,json:async()=>data[table]};
 }});
 const source=(await readFile(new URL('../app.js',import.meta.url),'utf8')).replace(/^import .*?;\r?\n/,'');
 vm.runInContext(source,context);await new Promise(resolve=>setImmediate(resolve));
 await listeners.click({target:{closest:()=>({dataset:{action:'new-day'}})}});
 for(const label of ['ยกมา','รับเพิ่ม','เหลือปลายวัน','เสีย/แจก','ส่งคืน','ขายได้'])assert.ok(root.innerHTML.includes(label));
 assert.match(root.innerHTML,/data-opening-index="0">25</);
 assert.match(root.innerHTML,/name="sale_date" type="date" value="2020-01-02"/);
 for(const [field,value] of [['received','100'],['closing','20'],['waste','5'],['returned','0']])listeners.input({target:{dataset:{list:'items',index:'0',field},value}});
 await listeners.submit({preventDefault(){},target:{id:'daily',querySelector:()=>({disabled:false}),classList:{contains:()=>false}}});
 assert.equal(writes[0].items[0].quantity,100);assert.equal(writes[0].items[0].opening,25);assert.equal(writes[0].items[0].closing,20);
});
