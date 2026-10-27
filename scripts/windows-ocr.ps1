param([string]$ImagePath,[string]$Language,[switch]$Languages)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null=[Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]
$null=[Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime]
$null=[Windows.Graphics.Imaging.BitmapDecoder,Windows.Foundation,ContentType=WindowsRuntime]
$null=[Windows.Graphics.Imaging.SoftwareBitmap,Windows.Foundation,ContentType=WindowsRuntime]
$null=[Windows.Storage.Streams.IRandomAccessStream,Windows.Storage.Streams,ContentType=WindowsRuntime]
$available=@([Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages | ForEach-Object { @{tag=$_.LanguageTag;name=$_.DisplayName} })
if($Languages){ConvertTo-Json -Compress -InputObject $available;exit}
$asTask=[System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {$_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'} | Select-Object -First 1
function Await($operation,$type){$task=$asTask.MakeGenericMethod($type).Invoke($null,@($operation));$task.GetAwaiter().GetResult()}
$file=Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($ImagePath)) ([Windows.Storage.StorageFile])
$stream=Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
try{
  $decoder=Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bitmap=Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  try{
    if($Language){$null=[Windows.Globalization.Language,Windows.Globalization,ContentType=WindowsRuntime];$engine=[Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage((New-Object Windows.Globalization.Language($Language)))}else{$engine=[Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()}
    if(!$engine){throw 'Install an OCR language in Windows Language settings first.'}
    $result=Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
    @{text=($result.Lines | ForEach-Object {$_.Text}) -join "`n";language=$engine.RecognizerLanguage.LanguageTag} | ConvertTo-Json -Compress
  }finally{$bitmap.Dispose()}
}finally{$stream.Dispose()}
