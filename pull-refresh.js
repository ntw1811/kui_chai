export function installPullRefresh({target,indicator,canRefresh,onRefresh,scrollTop=()=>window.scrollY}){
 let start=null,distance=0,busy=false,vertical=false;
 const reset=()=>{start=null;distance=0;vertical=false;indicator.classList.remove('visible','loading');indicator.style.transform='';indicator.textContent='';};
 const paint=()=>{indicator.classList.add('visible');indicator.style.transform=`translate(-50%, ${Math.min(distance*.45,72)}px)`;indicator.textContent=distance>=100?'ปล่อยเพื่อรีเฟรช':'ดึงลงเพื่อรีเฟรช';};
 target.addEventListener('touchstart',event=>{
  if(busy||!canRefresh()||scrollTop()>0||event.touches.length!==1||event.target.closest('input,select,textarea,button,a,.table-wrap'))return;
  start={x:event.touches[0].clientX,y:event.touches[0].clientY};distance=0;vertical=false;
 },{passive:true});
 target.addEventListener('touchmove',event=>{
  if(!start||busy)return;
  if(event.touches.length!==1||scrollTop()>0){reset();return;}
  const dx=event.touches[0].clientX-start.x,dy=event.touches[0].clientY-start.y;
  if(!vertical&&Math.abs(dx)>10&&Math.abs(dx)>Math.abs(dy)){reset();return;}
  if(dy<=0){distance=0;indicator.classList.remove('visible');return;}
  if(dy>10)vertical=true;
  if(vertical){if(event.cancelable)event.preventDefault();distance=dy;paint();}
 },{passive:false});
 target.addEventListener('touchend',async()=>{
  if(!start||busy)return;
  const refresh=distance>=100;start=null;
  if(!refresh){reset();return;}
  busy=true;indicator.classList.add('loading');indicator.textContent='กำลังรีเฟรช…';
  try{await onRefresh();}finally{busy=false;reset();}
 },{passive:true});
 target.addEventListener('touchcancel',()=>{if(!busy)reset();},{passive:true});
}
