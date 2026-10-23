import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshotItems} from '../pricing.mjs';
const catalog=[{id:'product1',kind:'product',name:'จิ๋ว',cost:2.7,price:5},{id:'tray',kind:'equipment',cost:500,price:0}];
test('new daily items use stock prices, ignoring prices from client',()=>{
 assert.deepEqual(snapshotItems([{product_id:'product1',quantity:100,cost:0,price:999}],catalog),[{product_id:'product1',name:'จิ๋ว',quantity:100,cost:2.7,price:5}]);
});
test('editing old quantity preserves historical prices after stock repricing',()=>{
 const previous=[{product_id:'product1',name:'จิ๋ว',quantity:100,cost:2,price:4}];
 assert.deepEqual(snapshotItems([{product_id:'product1',quantity:200}],catalog,previous),[{...previous[0],quantity:200}]);
});
test('legacy daily items keep their stored prices',()=>{
 const previous=[{name:'จิ๋ว',quantity:100,cost:1.5,price:3}];
 assert.deepEqual(snapshotItems([{name:'จิ๋ว',quantity:120,cost:0}],catalog,previous),[{...previous[0],quantity:120}]);
});
test('invalid, foreign, equipment, and duplicate product entries rejected',()=>{
 for(const items of [[{product_id:'unknown',quantity:1}],[{product_id:'tray',quantity:1}],[{product_id:'product1',quantity:-1}],[{product_id:'product1',quantity:'no'}],[{name:'injected',quantity:1}],[{product_id:'product1',quantity:1},{product_id:'product1',quantity:2}]])assert.throws(()=>snapshotItems(items,catalog));
});
