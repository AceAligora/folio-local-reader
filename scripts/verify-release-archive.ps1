param([Parameter(Mandatory=$true)][string]$Archive,[Parameter(Mandatory=$true)][string]$Payload)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$folder=(Resolve-Path -LiteralPath $Payload).Path
$prefix=(Split-Path -Leaf $folder)+'/'
$manifestPath=Join-Path $folder 'build-manifest.json'
$manifest=Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$expected=[Collections.Generic.Dictionary[string,object]]::new([StringComparer]::Ordinal)
$directories=[Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
[void]$directories.Add($prefix)
foreach($file in $manifest.files) { $expected.Add($prefix+$file.path,$file) }
$manifestStream=[IO.File]::OpenRead($manifestPath);$manifestHash=[Security.Cryptography.SHA256]::Create()
try { $digest=([BitConverter]::ToString($manifestHash.ComputeHash($manifestStream))).Replace('-','').ToLowerInvariant() } finally { $manifestStream.Dispose();$manifestHash.Dispose() }
$expected.Add($prefix+'build-manifest.json',@{size=(Get-Item -LiteralPath $manifestPath).Length;sha256=$digest})
foreach($name in $expected.Keys) {
  $at=$name.LastIndexOf('/')
  while($at -ge 0) { [void]$directories.Add($name.Substring(0,$at+1));$at=$name.LastIndexOf('/',$at-1) }
}
$seen=[Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
$zip=[IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $Archive).Path)
try {
  foreach($entry in $zip.Entries) {
    $name=$entry.FullName.Replace('\','/')
    if($name.EndsWith('/')) { if(-not $directories.Contains($name)) { throw 'Unexpected archive directory.' };continue }
    if(-not $expected.ContainsKey($name) -or -not $seen.Add($name)) { throw 'Unexpected or duplicate archive file.' }
    $file=$expected[$name]
    if($entry.Length -ne $file.size) { throw 'Archive file size differs from payload.' }
    $stream=$entry.Open();$hash=[Security.Cryptography.SHA256]::Create()
    try { $digest=([BitConverter]::ToString($hash.ComputeHash($stream))).Replace('-','').ToLowerInvariant() } finally { $stream.Dispose();$hash.Dispose() }
    if($digest -cne $file.sha256) { throw 'Archive file hash differs from payload.' }
  }
  if($seen.Count -ne $expected.Count) { throw 'Archive is missing payload files.' }
  @{archive=(Split-Path -Leaf $Archive);verifiedFiles=$seen.Count} | ConvertTo-Json -Compress
} finally { $zip.Dispose() }
