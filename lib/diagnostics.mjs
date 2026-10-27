export class Diagnostics{
  constructor(library){this.library=library;library.db.exec('CREATE TABLE IF NOT EXISTS diagnostics(id INTEGER PRIMARY KEY AUTOINCREMENT,created INTEGER NOT NULL,kind TEXT NOT NULL,method TEXT NOT NULL,route TEXT NOT NULL,status INTEGER NOT NULL,duration INTEGER NOT NULL)');}
  record({method,route,status,duration}){const prefs=this.library.preferences();if(prefs.incognito||!prefs.enableLog&&!prefs.httpDump)return;if(route.startsWith('/api/diagnostics')||route.startsWith('/api/lock'))return;
    // No headers, bodies, search terms, book IDs or filesystem paths.
    const safe=route.replace(/\/[a-f0-9-]{20,}/g,'/:id').slice(0,100),add=this.library.db.prepare('INSERT INTO diagnostics(created,kind,method,route,status,duration) VALUES(?,?,?,?,?,?)');
    for(const kind of [...(prefs.enableLog?['log']:[]),...(prefs.httpDump?['http']:[])])add.run(Date.now(),kind,String(method).slice(0,10),safe,status,Math.round(duration));
    this.library.db.exec('DELETE FROM diagnostics WHERE id NOT IN (SELECT id FROM diagnostics ORDER BY id DESC LIMIT 2000)');
  }
  list(kind='log'){if(!['log','http'].includes(kind))throw new Error('Invalid diagnostic type.');return this.library.db.prepare('SELECT created,method,route,status,duration FROM diagnostics WHERE kind=? ORDER BY id DESC LIMIT 500').all(kind);}
}
