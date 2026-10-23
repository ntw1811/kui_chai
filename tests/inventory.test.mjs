import test from 'node:test';
import assert from 'node:assert/strict';
import {inventoryCounts,carryForward,totals,aggregate,reportRecords} from '../domain.js';
import {snapshotItems} from '../pricing.mjs';
const catalog=[{id:'p1',kind:'product',name:'จิ๋ว',cost:3,price:5}];
const row=(fields={})=>({product_id:'p1',inventory_version:1,opening:0,received:100,closing:25,waste:5,returned:0,...fields});
test('leftover stock is retained; only sold cost and waste reduce profit',()=>{
 const [item]=snapshotItems([row()],catalog,[],{records:[],period_id:'a',sale_date:'2026-01-31'});
 assert.equal(item.quantity,70);assert.equal(item.closing*item.cost,75);
 assert.deepEqual(totals({revenue:350,items:[item],expenses:[{amount:20}]}),{revenue:350,cost:210,expense:35,profit:105});
});
test('carry crosses gaps/months within same period only, using latest product balance',()=>{
 const [first]=snapshotItems([row()],catalog,[],{records:[],period_id:'a',sale_date:'2026-01-31'});
 const records=[{period_id:'a',sale_date:'2026-01-31',items:[first]},{period_id:'a',sale_date:'2026-02-01',items:[]}];
 assert.equal(carryForward(records,'a','2026-02-03','p1').opening,25);
 assert.equal(carryForward(records,'other','2026-02-03','p1').opening,0);
 assert.equal(carryForward(records,'a','2026-01-31','p1').opening,0);
 const [next]=snapshotItems([row({opening:999,received:10,closing:5,waste:0})],[{...catalog[0],cost:5}],[],{records,period_id:'a',sale_date:'2026-02-03'});
 assert.equal(next.opening,25);assert.equal(next.quantity,30);assert.equal(next.cost,125/35);
 assert.equal(next.received_cost,5);
});
test('all remaining stock can be returned without treating it as sold or wasted',()=>{
 const [item]=snapshotItems([row({closing:0,waste:0,returned:100})],catalog,[],{records:[],period_id:'a',sale_date:'2026-01-01'});
 assert.equal(item.quantity,0);assert.deepEqual(totals({items:[item]}),{revenue:0,cost:0,expense:0,profit:0});
});
test('negative, non-finite and over-allocated quantities rejected',()=>{
 for(const change of [{received:-1},{closing:101},{waste:101},{returned:101},{received:'invalid'}])assert.throws(()=>inventoryCounts(row(change)));
 assert.equal(inventoryCounts(row({received:.3,closing:.1,waste:.2})).sold,0);
});
test('old records retain their meaning and do not create imaginary carry',()=>{
 const item={product_id:'p1',name:'จิ๋ว',quantity:100,cost:2,price:4};
 assert.equal(totals({items:[item]}).cost,200);
 assert.equal(carryForward([{period_id:'a',sale_date:'2026-01-01',items:[item]}],'a','2026-01-02','p1').opening,0);
});
test('editing a tracked day preserves received price after catalog repricing',()=>{
 const context={records:[],period_id:'a',sale_date:'2026-01-01'};
 const [old]=snapshotItems([row()],catalog,[],context);
 const [changed]=snapshotItems([{...old,closing:20}],[{...catalog[0],cost:50}], [old],context);
 assert.equal(changed.received_cost,3);assert.equal(changed.cost,3);assert.equal(changed.quantity,75);
 assert.throws(()=>snapshotItems([{product_id:'p1',quantity:70}],catalog,[old]));
});
test('monthly summaries deduct sold cost once as stock carries to next month',()=>{
 const [first]=snapshotItems([row({closing:25,waste:0})],catalog,[],{records:[],period_id:'a',sale_date:'2026-01-31'});
 const jan={period_id:'a',sale_date:'2026-01-31',items:[first],revenue:375};
 const [second]=snapshotItems([row({received:0,closing:0,waste:0})],catalog,[],{records:[jan],period_id:'a',sale_date:'2026-02-01'});
 const feb={period_id:'a',sale_date:'2026-02-01',items:[second],revenue:125};
 assert.equal(aggregate([jan,feb]).cost,300);assert.equal(aggregate([jan,feb]).profit,200);
 assert.equal(aggregate(reportRecords([jan,feb],[{id:'a'}],{year:'2026',month:'02'})).cost,75);
});
