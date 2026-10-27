import {test} from 'node:test';
import assert from 'node:assert/strict';
import {wheelDecision} from '../public/wheel.js';
test('wheel scrolls inside enlarged pages and turns only at document edges',()=>{
  const state={};const view={top:100,height:1000,viewport:500};
  assert.equal(wheelDecision({...view,delta:100,now:1000},state),'scroll');
  assert.equal(wheelDecision({...view,top:500,delta:100,now:2000},state),'next');
  assert.equal(wheelDecision({...view,top:500,delta:100,now:2100},state),'hold');
  assert.equal(wheelDecision({...view,top:0,delta:-100,now:3000},state),'previous');
  assert.equal(wheelDecision({...view,delta:0,now:4000},state),'ignore');
});
test('small wheel deltas accumulate without skipping multiple pages in one burst',()=>{
  const state={};const event={top:0,height:500,viewport:500};
  assert.equal(wheelDecision({...event,delta:20,now:1000},state),'hold');
  assert.equal(wheelDecision({...event,delta:20,now:1050},state),'hold');
  assert.equal(wheelDecision({...event,delta:20,now:1100},state),'next');
  assert.equal(wheelDecision({...event,delta:120,now:1200},state),'hold');
});
