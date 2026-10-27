param([Parameter(Mandatory=$true)][string]$Installer,[string]$Fixture,[string]$OutputDirectory='.local/installer-tests')
$ErrorActionPreference='Stop'
$setup=(Resolve-Path -LiteralPath $Installer).Path
$testId=[Guid]::NewGuid().ToString('N')
$qaRoot=[IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $qaRoot -Force | Out-Null
$qa=[IO.Path]::GetFullPath((Join-Path $qaRoot $testId))
if(-not $qa.StartsWith($qaRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Installer test escaped its output directory.' }
New-Item -ItemType Directory -Path $qa | Out-Null
$install=Join-Path $qa 'Installed app with spaces\Folio'
$registryRoot='Software\Folio\InstallerTests\'+$testId
$expectedCommand='"'+$install+'\Folio.exe" "%1"'
function Read-TestValue([string]$Relative,[string]$Name='') {
  $key=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($registryRoot+'\'+$Relative)
  if($null -eq $key) { return $null }
  try { return $key.GetValue($Name,$null) } finally { $key.Dispose() }
}
function Assert-Equal($Actual,$Expected,[string]$Message) { if($Actual -cne $Expected) { throw $Message } }
function Run-Setup([string]$Register) {
  $arguments='/S /TESTID='+$testId+$(if($Register -ne '') {' /REGISTER='+$Register})+' /D='+$install
  $process=Start-Process -FilePath $setup -ArgumentList $arguments -WindowStyle Hidden -PassThru -Wait
  return $process.ExitCode
}
function Default-Snapshot {
  $values=[ordered]@{}
  foreach($extension in @('.pdf','.epub','.cbz')) {
    $key=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\'+$extension+'\UserChoice')
    if($null -ne $key) { try { $values[$extension]=@($key.GetValue('ProgId'),$key.GetValue('Hash')) } finally { $key.Dispose() } }
  }
  return ($values | ConvertTo-Json -Compress)
}
$defaultsBefore=Default-Snapshot
$fakeDefault=[Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($registryRoot+'\Classes\.pdf')
$fakeDefault.SetValue('','Other.Reader');$fakeDefault.Dispose()
$report=@{format='folio-installer-test-v1';testId=$testId;newInstall=$false;upgrade=$false;defaultReadersPreserved=$false;busyInstallRejected=$false;nativeReader=$false;uninstall=$false;personalFilesPreserved=$false}
Assert-Equal (Run-Setup '0') 0 'New installation failed.'
if(-not (Test-Path -LiteralPath (Join-Path $install 'Folio.exe'))) { throw 'Installed application is missing.' }
Assert-Equal (Read-TestValue 'Classes\Folio.Ebook.PDF\shell\open\command') $null 'Open-with registration must default off.'
$report.newInstall=$true
Assert-Equal (Run-Setup '1') 0 'Upgrade/reinstall failed.'
foreach($type in @('PDF','EPUB','CBZ')) { Assert-Equal (Read-TestValue ('Classes\Folio.Ebook.'+$type+'\shell\open\command')) $expectedCommand 'The file-opening command is not correctly quoted.' }
Assert-Equal (Read-TestValue 'Classes\.pdf') 'Other.Reader' 'The installer changed an existing extension default.'
Assert-Equal (Run-Setup '') 0 'Upgrade with the saved Open-with choice failed.'
Assert-Equal (Read-TestValue 'Classes\Folio.Ebook.PDF\shell\open\command') $expectedCommand 'Upgrade did not retain the Open-with choice.'
Assert-Equal (Run-Setup '0') 0 'Disabling Open-with on upgrade failed.'
Assert-Equal (Read-TestValue 'Classes\Folio.Ebook.PDF\shell\open\command') $null 'Unchecking Open-with must remove Folio registrations.'
Assert-Equal (Run-Setup '1') 0 'Restoring Open-with on upgrade failed.'
$report.upgrade=$true
$resources=Join-Path $install 'resources'
$heldResources=Join-Path $install 'resources held for test'
$outside=Join-Path $qa 'outside application'
if(-not $heldResources.StartsWith($qa+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Guard fixture escaped its QA directory.' }
New-Item -ItemType Directory -Path $outside | Out-Null
$guardSentinel=Join-Path $outside 'must survive.txt'
Set-Content -LiteralPath $guardSentinel -Value 'untouched'
Move-Item -LiteralPath $resources -Destination $heldResources
New-Item -ItemType Junction -Path $resources -Target $outside | Out-Null
try {
  Assert-Equal (Run-Setup '1') 3 'Installer must refuse linked application paths.'
  $guardUninstall=Start-Process -FilePath (Join-Path $install 'Uninstall Folio.exe') -ArgumentList ('/S _?='+$install) -WindowStyle Hidden -PassThru -Wait
  Assert-Equal $guardUninstall.ExitCode 3 'Uninstaller must refuse linked application paths.'
  Assert-Equal (Get-Content -LiteralPath $guardSentinel) 'untouched' 'A linked path changed outside the application.'
} finally {
  Remove-Item -LiteralPath $resources
  Move-Item -LiteralPath $heldResources -Destination $resources
}
$report.linkedPathsRejected=$true
if($Fixture) {
  $config=Get-Content -LiteralPath $Fixture | ConvertFrom-Json
  Assert-Equal $config.format 'folio-generated-release-fixture-v1' 'Use a generated release fixture, never a personal profile.'
  $sourceHash=(Get-FileHash -LiteralPath $config.original -Algorithm SHA256).Hash
  $env:EBOOK_PROFILE=$config.profile
  $env:FOLIO_DESKTOP_SMOKE_REPORT=Join-Path $qa 'native-report.json'
  $env:FOLIO_DESKTOP_SMOKE_SECOND_INSTANCE='1'
  $native=Start-Process -FilePath (Join-Path $install 'Folio.exe') -WorkingDirectory $install -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $qa 'native.stdout.log') -RedirectStandardError (Join-Path $qa 'native.stderr.log')
  Remove-Item Env:FOLIO_DESKTOP_SMOKE_REPORT
  Remove-Item Env:FOLIO_DESKTOP_SMOKE_SECOND_INSTANCE
  $deadline=[DateTime]::UtcNow.AddSeconds(10)
  while(-not (Test-Path -LiteralPath (Join-Path $config.profile 'server-runtime.json')) -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 50 }
  Assert-Equal (Run-Setup '1') 2 'The installer must reject replacing a running application.'
  $report.busyInstallRejected=$true
  $second=Start-Process -FilePath (Join-Path $install 'Folio.exe') -ArgumentList ('"'+$config.original+'"') -WorkingDirectory $install -WindowStyle Hidden -PassThru -Wait
  Remove-Item Env:EBOOK_PROFILE
  $deadline=[DateTime]::UtcNow.AddSeconds(25)
  $nativeReport=Join-Path $qa 'native-report.json'
  while(-not (Test-Path -LiteralPath $nativeReport) -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 100 }
  if(-not (Test-Path -LiteralPath $nativeReport)) { throw 'The installed desktop app did not finish its file-opening test.' }
  $result=Get-Content -LiteralPath $nativeReport | ConvertFrom-Json
  if($result.error -or -not $result.fileOpened -or -not $result.rendererReady -or -not $result.closeHandshake -or -not $result.serverReleased) { throw 'The installed native reader/close handshake failed.' }
  if(-not $native.WaitForExit(10000)) { throw 'The desktop app did not exit after saving.' }
  Assert-Equal (Get-FileHash -LiteralPath $config.original -Algorithm SHA256).Hash $sourceHash 'The original ebook changed.'
  $profileHash=(Get-FileHash -LiteralPath (Join-Path $config.profile 'library.sqlite') -Algorithm SHA256).Hash
  $report.nativeReader=$true
}
$keepFile=Join-Path $install 'Keep my ebook.epub'
Set-Content -LiteralPath $keepFile -Value 'personal sentinel; must survive uninstall' -NoNewline
$keepHash=(Get-FileHash -LiteralPath $keepFile -Algorithm SHA256).Hash
$uninstaller=Join-Path $install 'Uninstall Folio.exe'
$removed=Start-Process -FilePath $uninstaller -ArgumentList '/S' -WindowStyle Hidden -PassThru -Wait
$deadline=[DateTime]::UtcNow.AddSeconds(15)
while((Test-Path -LiteralPath (Join-Path $install 'folio-install.ini')) -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 100 }
if(Test-Path -LiteralPath (Join-Path $install 'Folio.exe')) { throw 'The uninstaller did not remove the application.' }
foreach($type in @('PDF','EPUB','CBZ')) { Assert-Equal (Read-TestValue ('Classes\Folio.Ebook.'+$type+'\shell\open\command')) $null 'Owned file association was retained after uninstall.' }
Assert-Equal (Read-TestValue 'Classes\.pdf') 'Other.Reader' 'The uninstaller removed an existing extension default.'
Assert-Equal (Get-FileHash -LiteralPath $keepFile -Algorithm SHA256).Hash $keepHash 'Uninstall changed a personal file in the application directory.'
if($Fixture) { Assert-Equal (Get-FileHash -LiteralPath (Join-Path $config.profile 'library.sqlite') -Algorithm SHA256).Hash $profileHash 'Uninstall changed the reading-data profile.' }
Assert-Equal (Default-Snapshot) $defaultsBefore 'The test changed a real default ebook reader.'
$report.uninstall=$true;$report.personalFilesPreserved=$true;$report.defaultReadersPreserved=$true
if(-not $registryRoot.StartsWith('Software\Folio\InstallerTests\') -or $testId -notmatch '^[a-f0-9]{32}$') { throw 'Registry cleanup escaped its test namespace.' }
[Microsoft.Win32.Registry]::CurrentUser.DeleteSubKeyTree($registryRoot,$false)
$report | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $qa 'report.json')
$report | ConvertTo-Json
