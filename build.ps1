# Build Orulab Studio menjadi folder dist\Orulab Studio (exe + folder web) dan file zip siap bagi.
# Tidak perlu Visual Studio: memakai compiler C# bawaan Windows (.NET Framework 4).
# Node.js hanya dibutuhkan bila library Claude (web\vendor\claude.js) perlu dibundel ulang.
param([switch]$BundelClaude)

$ErrorActionPreference = "Stop"
$akar = $PSScriptRoot
$keluar = Join-Path $akar "dist\Orulab Studio"
$csc = "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe"

if ($BundelClaude -or -not (Test-Path (Join-Path $akar "web\vendor\claude.js"))) {
    Push-Location (Join-Path $akar "web-src")
    npm install --no-audit --no-fund
    npm run build
    Pop-Location
}

if (Test-Path $keluar) { Remove-Item $keluar -Recurse -Force }
New-Item -ItemType Directory -Force $keluar | Out-Null

& $csc /nologo /target:winexe /optimize+ "/out:$keluar\Orulab Studio.exe" `
    "/win32icon:$akar\web\assets\brand\favicon.ico" `
    /r:System.Windows.Forms.dll /r:System.Security.dll /r:Microsoft.VisualBasic.dll `
    "$akar\src\*.cs"
if ($LASTEXITCODE -ne 0) { throw "Compile gagal" }

Copy-Item (Join-Path $akar "web") (Join-Path $keluar "web") -Recurse
Copy-Item (Join-Path $akar "README.md") $keluar -ErrorAction SilentlyContinue

$zip = Join-Path $akar "dist\Orulab-Studio.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path $keluar -DestinationPath $zip
Write-Host "Selesai: $keluar"
Write-Host "Zip:     $zip"
