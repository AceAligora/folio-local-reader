// Ignore small trackpad noise and throttle inertial bursts between page turns.
export function wheelDecision({delta,top,height,viewport,now},state){
  if(!Number.isFinite(delta)||delta===0)return 'ignore';
  const forward=delta>0;const boundary=forward?top+viewport>=height-3:top<=3;
  if(!boundary){state.accumulated=0;return 'scroll';}
  if(now-(state.lastEvent||0)>180||Math.sign(state.accumulated||0)!==Math.sign(delta))state.accumulated=0;
  state.lastEvent=now;
  state.accumulated=(state.accumulated||0)+delta;
  if(now-(state.lastTurn??-Infinity)<650||Math.abs(state.accumulated)<48)return 'hold';
  state.lastTurn=now;state.accumulated=0;return forward?'next':'previous';
}
