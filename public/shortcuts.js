export const shortcutDefaults={shortcutNext:'ArrowRight',shortcutPrevious:'ArrowLeft',shortcutFocus:'f',shortcutBookmark:'b',shortcutContents:'c'};
export const shortcutKeys=['ArrowRight','ArrowLeft','ArrowDown','ArrowUp','PageDown','PageUp',' ','n','p','j','k','f','b','c','d'];
export function readerShortcut(event,preferences){
  if(preferences.readerShortcuts===false||event.defaultPrevented||event.isComposing||event.repeat||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey)return null;
  const target=event.target;
  if(target?.isContentEditable||target?.closest?.('input,textarea,select,[contenteditable="true"],[role="textbox"]'))return null;
  if(event.key===' '&&target?.closest?.('button,a,summary'))return null;
  const key=event.key.length===1?event.key.toLowerCase():event.key;
  for(const [setting,action]of [['shortcutNext','next'],['shortcutPrevious','previous'],['shortcutFocus','focus'],['shortcutBookmark','bookmark'],['shortcutContents','contents']])if(key===(preferences[setting]??shortcutDefaults[setting]))return action;
  if(preferences.readingMode==='paged-vertical'){if(key==='ArrowDown')return 'next';if(key==='ArrowUp')return 'previous';}
  return null;
}
