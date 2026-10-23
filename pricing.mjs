import {inventoryCounts,carryForward} from './domain.js';
export function snapshotItems(items,catalog,previous=[],context=null){
 if(!Array.isArray(items))throw Error('Invalid items');
 const seen=new Set();
 return items.map(item=>{
  const quantity=item.inventory_version===1?inventoryCounts(item).sold:Number(item.quantity);
  if(!Number.isFinite(quantity)||quantity<0)throw Error('Invalid quantity');
  if(item.product_id){
   if(seen.has(item.product_id))throw Error('Duplicate product');seen.add(item.product_id);
   const old=previous.find(p=>p.product_id===item.product_id);
   const product=catalog.find(p=>p.id===item.product_id&&p.kind==='product');
   if(!product&&!old)throw Error('Product not found');
   const base={product_id:item.product_id,name:old?.name??product.name,quantity,cost:Number(old?.cost??product.cost),price:Number(old?.price??product.price)};
   if(item.inventory_version===1){
    const carry=context?carryForward(context.records,context.period_id,context.sale_date,item.product_id):{opening:Number(item.opening||0),opening_cost:0};
    const counts=inventoryCounts({...item,opening:carry.opening});
    const receivedCost=Number(old?.received_cost??old?.cost??product.cost);
    const available=counts.opening+counts.received;
    const cost=available?(counts.opening*carry.opening_cost+counts.received*receivedCost)/available:receivedCost;
    return {...base,inventory_version:1,...counts,quantity:counts.sold,cost,received_cost:receivedCost,opening_cost:carry.opening_cost};
   }
   if(old?.inventory_version===1)throw Error('Cannot remove inventory tracking');
   return base;
  }
  // Legacy rows may be edited in quantity, but their stored prices cannot be replaced.
  const old=previous.find(p=>!p.product_id&&p.name===item.name);
  if(!old)throw Error('Select a product from stock');
  return {...old,quantity};
 });
}
