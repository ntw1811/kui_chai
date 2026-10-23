import test from 'node:test';
import assert from 'node:assert/strict';
import {installPullRefresh} from '../pull-refresh.js';
function setup({onRefresh=async()=>{},top=0,allowed=true}={}){
 const listeners={},classes=new Set(),indicator={style:{},textContent:'',classList:{add:(...v)=>v.forEach(s=>classes.add(s)),remove:(...v)=>v.forEach(s=>classes.delete(s))}};
 installPullRefresh({target:{addEventListener:(name,fn)=>listeners[name]=fn},indicator,canRefresh:()=>allowed,onRefresh,scrollTop:()=>top});
 const event=(x,y,interactive=false)=>({touches:[{clientX:x,clientY:y}],target:{closest:()=>interactive},cancelable:true,preventDefault(){this.prevented=true;}});
 return {listeners,indicator,classes,event};
}
test('pull down requires threshold, shows loading, and prevents overlapping refreshes',async()=>{
 let calls=0,complete;const s=setup({onRefresh:()=>{calls++;return new Promise(resolve=>complete=resolve);}});
 s.listeners.touchstart(s.event(0,0));s.listeners.touchmove(s.event(0,50));await s.listeners.touchend();assert.equal(calls,0);
 s.listeners.touchstart(s.event(0,0));const move=s.event(0,120);s.listeners.touchmove(move);assert.ok(move.prevented);assert.equal(s.indicator.textContent,'ปล่อยเพื่อรีเฟรช');
 const pending=s.listeners.touchend();assert.equal(calls,1);assert.ok(s.classes.has('loading'));
 s.listeners.touchstart(s.event(0,0));s.listeners.touchmove(s.event(0,120));await s.listeners.touchend();assert.equal(calls,1);
 complete();await pending;assert.equal(s.classes.size,0);assert.equal(s.indicator.textContent,'');
});
test('horizontal gestures, inputs, scrolled pages and signed-out state never refresh',async()=>{
 for(const mode of ['horizontal','input','scroll','signed-out']){
  let calls=0;const s=setup({top:mode==='scroll'?10:0,allowed:mode!=='signed-out',onRefresh:async()=>calls++});
  s.listeners.touchstart(s.event(0,0,mode==='input'));
  s.listeners.touchmove(s.event(mode==='horizontal'?200:0,120));await s.listeners.touchend();assert.equal(calls,0,mode);
 }
});
test('cancelled gesture does not refresh and loading clears after failure',async()=>{
 const s=setup({onRefresh:async()=>{throw Error('offline');}});
 s.listeners.touchstart(s.event(0,0));s.listeners.touchmove(s.event(0,120));s.listeners.touchcancel();await s.listeners.touchend();assert.equal(s.classes.size,0);
 s.listeners.touchstart(s.event(0,0));s.listeners.touchmove(s.event(0,120));await assert.rejects(s.listeners.touchend(),/offline/);assert.equal(s.classes.size,0);
});
