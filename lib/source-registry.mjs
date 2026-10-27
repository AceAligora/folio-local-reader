export const nativeSources=[
  {id:'chapterfeed',name:'Chapter feeds',description:'Follow author-published RSS/Atom chapter feeds; explicitly save chapters as local EPUBs grouped by series.',formats:['epub'],version:1,capabilities:['chapters'],hosts:[],sorts:[['published','Publication date']]},
  {id:'gutenberg',name:'Project Gutenberg',description:'Gutendex discovery and explicit EPUB downloads.',formats:['epub'],version:2,capabilities:['search','download'],hosts:['gutendex.com','www.gutenberg.org','gutenberg.org'],sorts:[['popular','Most downloaded'],['descending','Highest Gutenberg IDs'],['ascending','Lowest Gutenberg IDs']]},
  {id:'openlibrary',name:'Open Library',description:'Discover works and apply metadata to a selected local book. Downloads are not provided by this adapter.',formats:[],version:1,capabilities:['search','metadata'],hosts:['openlibrary.org'],sorts:[['relevance','Relevance'],['new','Newest publication'],['old','Oldest publication']]},
];
export const sourceLanguages=[['','Any language'],['en','English'],['fr','French'],['de','German'],['es','Spanish'],['it','Italian'],['pt','Portuguese'],['ja','Japanese'],['zh','Chinese'],['tl','Tagalog']];
export function sourceDefinition(id){const source=nativeSources.find(s=>s.id===id);if(!source)throw new Error('Unknown Folio adapter.');return source;}
export function sourceSettings(id,patch={},previous={}){
  const definition=sourceDefinition(id),next={enabled:true,language:'',sort:definition.sorts[0][0],limit:32,...previous};
  if(!patch||typeof patch!=='object'||Array.isArray(patch)||Object.keys(patch).some(k=>!['enabled','language','sort','limit'].includes(k)))throw new Error('Invalid source preferences.');
  Object.assign(next,patch);
  if(typeof next.enabled!=='boolean'||!sourceLanguages.some(([code])=>code===next.language)||!definition.sorts.some(([key])=>key===next.sort)||![8,16,32].includes(next.limit))throw new Error('Invalid source preferences.');
  if(id==='gutenberg'&&next.limit!==32)throw new Error('Gutendex uses fixed pages of 32 results.');
  return next;
}
export class SourceRegistry{
  constructor(library){this.library=library;}
  records(){
    const saved=this.library.db.prepare('SELECT value FROM config WHERE key=?').get('native-adapters');
    // Preserve the existing Gutenberg adapter and its switch on upgrade.
    return saved?JSON.parse(saved.value):{gutenberg:{installedVersion:1,settings:sourceSettings('gutenberg',{enabled:this.library.preferences().sourceEnabled})}};
  }
  state(id){const definition=sourceDefinition(id),entry=this.records()[id];return {...definition,installedVersion:entry?.installedVersion||0,settings:sourceSettings(id,{},entry?.settings),updateAvailable:!!entry?.installedVersion&&entry.installedVersion<definition.version,supported:!entry?.installedVersion||entry.installedVersion<=definition.version};}
  list(){return {adapters:nativeSources.map(source=>this.state(source.id)),languages:sourceLanguages};}
  require(id){const state=this.state(id);if(!state.supported)throw new Error('Update Folio to use this newer adapter.');if(!state.installedVersion||!state.settings.enabled)throw new Error('Add and enable this adapter in Sources & extensions first.');return state;}
  manage(id,action,patch){
    const state=this.state(id),records=this.records();if(!state.supported)throw new Error('Update Folio before changing this adapter.');
    if(action==='add'){if(state.installedVersion)throw new Error('This adapter is already added.');records[id]={installedVersion:state.version,settings:state.settings};}
    else if(action==='remove')records[id]={installedVersion:0,settings:state.settings};
    else if(action==='update'){if(!state.installedVersion)throw new Error('Add this adapter first.');records[id]={installedVersion:state.version,settings:state.settings};}
    else if(action==='settings'){if(!state.installedVersion)throw new Error('Add this adapter first.');const settings=sourceSettings(id,patch,state.settings);if(state.updateAvailable&&(settings.language!==state.settings.language||settings.sort!==state.settings.sort||settings.limit!==state.settings.limit))throw new Error('Update to the bundled adapter version before changing search preferences.');records[id]={installedVersion:state.installedVersion,settings};}
    else throw new Error('Unknown adapter action.');
    this.library.db.prepare('INSERT OR REPLACE INTO config VALUES(?,?)').run('native-adapters',JSON.stringify(records));return this.list();
  }
}
