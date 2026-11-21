# Build Orulabs Studio Recording.
# Hasil di folder dist:
#   - "Orulabs Studio Recording\"                 (exe + folder web)
#   - Orulabs-Studio-Recording.zip                 (dipakai update otomatis, lampirkan di rilis GitHub)
#   - Orulabs-Studio-Recording-Setup-<versi>.exe   (installer per user, perlu Inno Setup 6)
# Tidak perlu Visual Studio: memakai compiler C# bawaan Windows (.NET Framework 4).
#
#   .\build.ps1           build saja
#   .\build.ps1 -Pasang   build lalu pasang/perbarui aplikasi di laptop ini (lewat installer, tanpa jendela)
param([switch]$Pasang)

$ErrorActionPreference = "Stop"
$akar = $PSScriptRoot
$nama = "Orulabs Studio Recording"
$keluar = Join-Path $akar "dist\$nama"
$csc = "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
$versi = ([regex]::Match((Get-Content (Join-Path $akar "src\Server.cs") -Raw), 'Versi = "([^"]+)"')).Groups[1].Value
Write-Host "Versi $versi"

# Aplikasi yang sedang berjalan dari folder dist harus ditutup dulu
Get-Process $nama -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$akar*" } | Stop-Process -Force
Start-Sleep -Milliseconds 500

if (Test-Path $keluar) { Remove-Item $keluar -Recurse -Force }
New-Item -ItemType Directory -Force $keluar | Out-Null

& $csc /nologo /target:winexe /optimize+ "/out:$keluar\$nama.exe" `
    "/win32icon:$akar\web\assets\brand\ikon-studio.ico" `
    /r:System.Windows.Forms.dll /r:System.Web.dll /r:System.Security.dll /r:Microsoft.VisualBasic.dll `
    /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll `
    "$akar\src\*.cs"
if ($LASTEXITCODE -ne 0) { throw "Compile gagal" }

Copy-Item (Join-Path $akar "web") (Join-Path $keluar "web") -Recurse
Copy-Item (Join-Path $akar "README.md") $keluar -ErrorAction SilentlyContinue

$zip = Join-Path $akar "dist\Orulabs-Studio-Recording.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path $keluar -DestinationPath $zip
Write-Host "Folder:    $keluar"
Write-Host "Zip:       $zip"

# Installer (Inno Setup 6)
$iscc = @("$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe", "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe", "$env:ProgramFiles\Inno Setup 6\ISCC.exe") |
    Where-Object { Test-Path $_ } | Select-Object -First 1
$setup = $null
if ($iscc) {
    Push-Location $akar
    & $iscc /Q "/DVersi=$versi" installer.iss
    Pop-Location
    if ($LASTEXITCODE -ne 0) { throw "Installer gagal dibuat" }
    $setup = Join-Path $akar "dist\Orulabs-Studio-Recording-Setup-$versi.exe"
    Write-Host "Installer: $setup"
} else { Write-Host "Inno Setup 6 tidak ditemukan, installer dilewati." }

if ($Pasang) {
    if (-not $setup) { throw "Untuk -Pasang perlu Inno Setup 6" }
    Get-Process $nama -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Process $setup -ArgumentList "/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART", "/TASKS=desktop" -Wait
    Write-Host "Terpasang di: $env:LOCALAPPDATA\Programs\$nama"
}
