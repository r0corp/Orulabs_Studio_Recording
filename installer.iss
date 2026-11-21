; Installer Orulabs Studio Recording (Inno Setup 6).
; Dipasang per user tanpa hak admin, di %LOCALAPPDATA%\Programs\Orulabs Studio Recording.
; Versi diambil dari build.ps1: ISCC /DVersi=1.2.3

#ifndef Versi
  #define Versi "0.0.0"
#endif

[Setup]
AppId={{6A3F2C1E-8B7D-4E5A-9C0F-0D7A51B2E1C4}
AppName=Orulabs Studio Recording
AppVersion={#Versi}
AppPublisher=Orulabs
AppPublisherURL=https://github.com/r0corp/Orulabs_Studio_Recording
DefaultDirName={localappdata}\Programs\Orulabs Studio Recording
DefaultGroupName=Orulabs Studio Recording
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=dist
OutputBaseFilename=Orulabs-Studio-Recording-Setup-{#Versi}
SetupIconFile=web\assets\brand\ikon-studio.ico
UninstallDisplayIcon={app}\Orulabs Studio Recording.exe
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes

[Languages]
Name: "en"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktop"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "dist\Orulabs Studio Recording\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Orulabs Studio Recording"; Filename: "{app}\Orulabs Studio Recording.exe"
Name: "{autodesktop}\Orulabs Studio Recording"; Filename: "{app}\Orulabs Studio Recording.exe"; Tasks: desktop

[Run]
Filename: "{app}\Orulabs Studio Recording.exe"; Description: "{cm:LaunchProgram,Orulabs Studio Recording}"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "taskkill.exe"; Parameters: "/IM ""Orulabs Studio Recording.exe"" /F"; Flags: runhidden; RunOnceId: "TutupAplikasi"
