import {readFile} from 'node:fs/promises';
import {restoreProfile} from '../lib/profile-backup.mjs';
const [archive,profile,libraryRoot]=process.argv.slice(2);
if(!archive||!profile){console.error('Usage: node scripts/restore-profile.mjs backup.zip profile-directory [ebook-library-directory]\nStop Folio first. Existing profile data is retained in a before-restore folder. Ebook files are never restored or changed.');process.exit(1);}
const result=await restoreProfile(await readFile(archive),profile,{libraryRoot});console.log('Profile restored to '+result.destination);if(result.safety)console.log('Previous profile retained at '+result.safety);
