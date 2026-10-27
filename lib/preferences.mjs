import {shortcutDefaults,shortcutKeys} from '../public/shortcuts.js';
export const defaults={resume:true,excludedUpdateCategories:[],refreshCovers:true,sourceEnabled:true,cropBorders:false,appIcon:'journal-bookmark',toolbarItems:['toggle-navigation','bookmark','back-page','next-page','autoscroll','rotate'],epubFont:'serif',epubSize:19,epubLineHeight:18,epubWidth:780,autoScrollSpeed:30,httpDump:false,receiveTimeout:35,userAgent:'FolioLocalReader/0.6',holdScroll:false,scrollIndicator:true,limitZoom:true,autoWebtoon:false,networkEnabled:false,wheelNavigation:true,pageLayout:'single',separateFirst:true,invertSpread:false,defaultTab:'last',lastTab:'library',tabs:['library','updates','history','settings'],theme:'light',glass:false,blend:25,columns:5,display:'grid',dateFormat:'yMMMd',badges:['unread','downloaded','completed'],showCounts:false,categories:['Default'],defaultCategory:'Default',keepTabState:true,keepScroll:true,incognito:false,secureScreen:false,readingMode:'paged-ltr',background:'system',padding:20,tapZones:true,invertZones:false,zoneStyle:'sides',toolbar:'classic',showProgress:true,keepAwake:false,doubleTap:true,animate:false,showNsfw:true,repositories:[],enableLog:false,autoRefresh:false,refreshMinutes:15};
const enums={appIcon:['journal-bookmark','collection','bookmark-fill'],epubFont:['serif','sans','mono'],pageLayout:['single','double','auto'],defaultTab:['last','library','updates','history','settings'],lastTab:['library','updates','history','settings'],theme:['system','light','dark','sepia'],display:['grid','list','descriptive'],dateFormat:['yMMMd','yMd','MM/dd/yy','dd/MM/yy','yyyy-MM-dd','dd MMM yyyy','MMM dd, yyyy'],readingMode:['paged-ltr','paged-rtl','paged-vertical','continuous-vertical','continuous-ltr','continuous-rtl','webtoon'],background:['system','black','white'],zoneStyle:['sides','l-shaped','kindle'],toolbar:['classic','compact','custom']};
import {folderPath} from './scan-policy.mjs';
defaults.excludedFolders=[];defaults.folderCollections=false;defaults.incrementalScan=true;
Object.assign(defaults,{remoteRefresh:false,remoteIntervalHours:24,remoteMetadata:'notify',remoteCovers:'notify',remoteKeepTitles:true,remoteExcludedCategories:[],remoteContentChecks:false});
Object.assign(defaults,{desktopCaptureProtection:false,desktopProgress:true,sourceSessions:false,serialRefresh:false});
Object.assign(defaults,{readerShortcuts:true,watchLibrary:true,automaticBackups:true,backupHours:24,backupKeep:7});
Object.assign(defaults,{speechRate:100,speechVolume:100,speechSleepMinutes:0,readingWordsPerMinute:200});
Object.assign(defaults,shortcutDefaults);for(const key of Object.keys(shortcutDefaults))enums[key]=shortcutKeys;
enums.remoteMetadata=['off','notify','apply'];enums.remoteCovers=['off','notify','missing'];
export function validatePreferences(patch,previous={}){
  if(!patch||typeof patch!=='object'||Array.isArray(patch))throw new Error('Invalid preferences.');
  const next={...defaults,...previous};
  for(const [key,value] of Object.entries(patch)){
    if(!(key in defaults))throw new Error('Unknown preference: '+key);
    if(enums[key]){if(!enums[key].includes(value))throw new Error('Invalid '+key);}
    else if(typeof defaults[key]==='boolean'){if(typeof value!=='boolean')throw new Error('Invalid '+key);}
    else if(typeof defaults[key]==='number'){const max={speechRate:200,speechVolume:100,speechSleepMinutes:120,readingWordsPerMinute:600,backupHours:168,backupKeep:30,columns:10,blend:100,padding:160,refreshMinutes:1440,epubSize:40,epubLineHeight:30,epubWidth:1200,autoScrollSpeed:300,receiveTimeout:180,remoteIntervalHours:168}[key];if(!Number.isInteger(value)||value<({speechRate:50,readingWordsPerMinute:80,backupHours:1,backupKeep:2,columns:1,refreshMinutes:1,epubSize:12,epubLineHeight:12,epubWidth:320,autoScrollSpeed:5,receiveTimeout:5,remoteIntervalHours:1}[key]||0)||value>max)throw new Error('Invalid '+key);}
    else if(Array.isArray(defaults[key])){
      if(!Array.isArray(value)||value.length>100||value.some(v=>typeof v!=='string'||v.length>500))throw new Error('Invalid '+key);
      if(key==='excludedUpdateCategories'&&value.some(v=>v.length>80))throw new Error('Invalid excluded category.');
      if(key==='remoteExcludedCategories'&&value.some(v=>v.length>80))throw new Error('Invalid excluded category.');
      if(key==='toolbarItems'&&value.some(v=>!['toggle-navigation','bookmark','back-page','next-page','autoscroll','rotate','fullscreen','share-book','book-details','open-original','highlight-selection'].includes(v)))throw new Error('Invalid toolbar control.');
      if(key==='tabs'&&(value.some(v=>!defaults.tabs.includes(v))||!value.includes('settings')))throw new Error('Settings must remain visible.');
      if(key==='badges'&&value.some(v=>!defaults.badges.includes(v)))throw new Error('Invalid badge.');
      if(key==='categories'&&(!value.length||value.some(v=>!v.trim()||v.length>80)))throw new Error('Invalid categories.');
      if(key==='repositories')for(const address of value){let url;try{url=new URL(address);}catch{throw new Error('Invalid repository URL.');}if(url.protocol!=='https:'||url.username||url.password||!url.pathname.endsWith('.pb'))throw new Error('Repositories require HTTPS .pb links.');}
    }else if(typeof value!=='string'||value.length>80)throw new Error('Invalid '+key);
    next[key]=key==='excludedFolders'?[...new Set(value.map(folderPath))]:value;
  }
  const assigned=Object.keys(shortcutDefaults).map(key=>next[key]);if(new Set(assigned).size!==assigned.length)throw new Error('Each reader shortcut must use a different key.');
  if(!next.categories.includes(next.defaultCategory)&&next.defaultCategory!=='ask')next.defaultCategory=next.categories[0];
  return next;
}
