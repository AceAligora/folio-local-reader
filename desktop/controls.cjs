const {readerState}=require('./policy.cjs');
function createControls({window,powerSaveBlocker,platform}){
  let blocker=null,lastState;
  const stopAwake=()=>{if(blocker!==null){powerSaveBlocker.stop(blocker);blocker=null;}};
  function apply(input){const state=readerState(input);lastState=state;window.setContentProtection(platform==='win32'&&state.protectCapture);window.setProgressBar(state.reading&&state.showProgress?state.progress:-1);const awake=state.reading&&state.keepAwake&&window.isFocused()&&!window.isMinimized();if(awake&&blocker===null)blocker=powerSaveBlocker.start('prevent-display-sleep');if(!awake)stopAwake();return {captureProtected:platform==='win32'&&window.isContentProtected(),keepAwake:blocker!==null};}
  return {apply,stopAwake,resume:()=>lastState&&apply(lastState)};
}
module.exports={createControls};
