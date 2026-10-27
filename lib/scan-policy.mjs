// Paths are relative to the selected library, never filesystem glob patterns.
export function folderPath(value){
  if(typeof value!=='string'||!value.trim()||value.length>500)throw new Error('Enter a relative folder path.');
  const parts=value.trim().replaceAll('\\','/').split('/');
  if(parts.some(part=>!part||part==='.'||part==='..'||/[\x00-\x1f:*?"<>|]/.test(part)))throw new Error('Use folder paths inside the library, without wildcards or ..');
  return parts.join('/');
}
export function excludedSource(source,folders,caseInsensitive=process.platform==='win32'){
  const normalize=value=>{const result=value.replaceAll('\\','/');return caseInsensitive?result.toLowerCase():result;};
  const candidate=normalize(source);
  return folders.some(folder=>{const prefix=normalize(folder);return candidate===prefix||candidate.startsWith(prefix+'/');});
}
