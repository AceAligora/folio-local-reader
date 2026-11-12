import {verifyUpgradeBackup,recoverUpgradeBackup} from '../lib/upgrade-backup.mjs';

const args=process.argv.slice(2);
try{
  if(args.length===1){const data=verifyUpgradeBackup(args[0]);console.log(JSON.stringify({verified:true,schema:data.from,created:new Date(data.created).toISOString(),bytes:data.size,sha256:data.sha256},null,2));}
  else if(args.length===3&&args[1]==='--to'){
    const result=recoverUpgradeBackup(args[0],args[2]);
    console.log('Created recovered profile: '+result.profile+'\nDatabase schema: '+result.schema+'\nYour current profile and ebooks were preserved. Custom cover and downloaded extension files are not included in database backups. Use a compatible Folio version to open this separate profile.');
  }else throw new Error('Usage: node scripts/recover-upgrade.mjs snapshot.sqlite [--to NEW-profile-directory]\nWithout --to, only verify the backup. Recovery requires a directory that does not exist.');
}catch(error){console.error(error.message);process.exitCode=1;}
