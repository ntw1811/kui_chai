import test from 'node:test';
import assert from 'node:assert/strict';
import {totals,aggregate,validPeriod,inPeriod,reportRecords,nextSaleDate} from '../domain.js';
test('cost and operating expenses are deducted once; selling price is not actual revenue',()=>{
 const r={revenue:1500,items:[{quantity:100,cost:2.7,price:5}],expenses:[{amount:300},{amount:100}]};
 assert.deepEqual(totals(r),{revenue:1500,cost:270,expense:400,profit:830});
 assert.deepEqual(aggregate([r,r]),{revenue:3000,cost:540,expense:800,profit:1660});
});
test('cross-month periods report by actual sale date and location',()=>{
 const periods=[{id:'a',location_id:'shop1',starts_on:'2026-01-28',ends_on:'2026-02-05'},{id:'b',location_id:'shop2'}];
 const records=[{period_id:'a',sale_date:'2026-01-31'},{period_id:'a',sale_date:'2026-02-01'},{period_id:'b',sale_date:'2026-02-01'}];
 assert.deepEqual(reportRecords(records,periods,{year:'2026',month:'02',location:'shop1'}),[records[1]]);
 assert.equal(reportRecords(records,periods,{year:'2026',month:'',location:''}).length,3);
 assert.ok(inPeriod('2026-01-28',periods[0]));assert.ok(inPeriod('2026-02-05',periods[0]));assert.ok(!inPeriod('2026-02-06',periods[0]));
 assert.ok(!validPeriod('2026-02-02','2026-02-01'));
});
test('empty days and loss days retain correct totals',()=>{
 assert.deepEqual(aggregate([]),{revenue:0,cost:0,expense:0,profit:0});
 assert.equal(totals({revenue:0,items:[],expenses:[{amount:500}]}).profit,-500);
});
test('default date starts at period beginning, skips saved days in that period only',()=>{
 const p={id:'a',starts_on:'2026-01-31',ends_on:'2026-02-02'};
 assert.equal(nextSaleDate(p,[]),'2026-01-31');
 assert.equal(nextSaleDate(p,[{period_id:'other',sale_date:'2026-01-31'}]),'2026-01-31');
 const rows=[{period_id:'a',sale_date:'2026-01-31'},{period_id:'a',sale_date:'2026-02-01'}];
 assert.equal(nextSaleDate(p,rows),'2026-02-02');
 assert.equal(nextSaleDate(p,[...rows,{period_id:'a',sale_date:'2026-02-02'}]),null);
 assert.equal(nextSaleDate(p,[{period_id:'a',sale_date:'2026-02-01'}]),'2026-01-31');
});
