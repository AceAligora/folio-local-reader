import {randomBytes,scrypt as scryptCallback,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(scryptCallback);
export class AppLock{
  constructor(library){this.library=library;this.sessions=new Set();this.attempts=new Map();}
  record(){return JSON.parse(this.library.db.prepare('SELECT value FROM config WHERE key=?').get('app-lock')?.value||'null');}
  configured(){return Boolean(this.record());}
  authorized(token){return !this.configured()||this.sessions.has(token);}
  async check(password){const record=this.record();if(!record)return true;if(typeof password!=='string'||password.length>200)return false;const key=await scrypt(password,record.salt,32);return timingSafeEqual(key,Buffer.from(record.hash,'hex'));}
  async setup(password,previous){if(this.configured()&&!await this.check(previous))throw new Error('Current password is incorrect.');if(typeof password!=='string'||password.length<8||password.length>200)throw new Error('Use a password of 8–200 characters.');const salt=randomBytes(16).toString('hex'),hash=(await scrypt(password,salt,32)).toString('hex');this.library.db.prepare('INSERT OR REPLACE INTO config VALUES(?,?)').run('app-lock',JSON.stringify({salt,hash}));this.sessions.clear();return this.issue();}
  issue(){const token=randomBytes(32).toString('hex');this.sessions.add(token);return token;}
  async unlock(password,address='local'){const now=Date.now(),attempt=this.attempts.get(address)||{count:0,until:0};if(attempt.until>now)throw new Error('Too many attempts. Wait one minute.');if(!await this.check(password)){attempt.count++;if(attempt.count>=5){attempt.until=now+60000;attempt.count=0;}this.attempts.set(address,attempt);throw new Error('Incorrect password.');}this.attempts.delete(address);return this.issue();}
  lock(token){this.sessions.delete(token);}
  async remove(password){if(!await this.check(password))throw new Error('Current password is incorrect.');this.library.db.prepare('DELETE FROM config WHERE key=?').run('app-lock');this.sessions.clear();}
}
