Unicode true
RequestExecutionLevel user
SetCompressor /SOLID zlib
!include MUI2.nsh
!include LogicLib.nsh
!include FileFunc.nsh
!include x64.nsh
Name "Folio ${VERSION} (unsigned preview)"
OutFile "${OUTPUT}"
InstallDir "$LOCALAPPDATA\Programs\Folio"
InstallDirRegKey HKCU "Software\Folio" "InstallLocation"
BrandingText "Folio · local-first ebook reader"
VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=1033 "ProductName" "Folio"
VIAddVersionKey /LANG=1033 "FileDescription" "Folio per-user installer (unsigned preview)"
VIAddVersionKey /LANG=1033 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=1033 "LegalCopyright" "Folio contributors · Apache-2.0"
ShowInstDetails show
ShowUninstDetails show
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TEXT "Install the unsigned Folio desktop preview for your Windows account.$\r$\n$\r$\nBooks, progress and profile data stay on this device. Uninstall removes only application files and owned registrations.$\r$\n$\r$\nOpen-with registration is optional. Your current default ebook readers will not be changed."
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_COMPONENTS
!define MUI_PAGE_CUSTOMFUNCTION_LEAVE CheckDirectory
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE English
Var TestId
Var RegBase
Var Classes
Var UninstallKey
Var RegisteredApps
Var RegisteredName
Var ShortcutDir
Var Arguments

!macro RegistryContext PREFIX
Function ${PREFIX}RegistryContext
  StrCpy $RegBase "Software\Folio"
  StrCpy $Classes "Software\Classes"
  StrCpy $UninstallKey "Software\Microsoft\Windows\CurrentVersion\Uninstall\Folio"
  StrCpy $RegisteredApps "Software\RegisteredApplications"
  StrCpy $RegisteredName "Folio"
  StrCpy $ShortcutDir "$SMPROGRAMS\Folio"
  ${If} $TestId != ""
    StrLen $2 $TestId
    ${If} $2 > 64
      Abort "Invalid installer test identifier."
    ${EndIf}
    StrCpy $0 $TestId
    System::Call 'shlwapi::StrSpnW(w r0, w "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_") i.r1'
    ${If} $1 != $2
      Abort "Invalid installer test identifier."
    ${EndIf}
    StrCpy $RegBase "Software\Folio\InstallerTests\$TestId"
    StrCpy $Classes "$RegBase\Classes"
    StrCpy $UninstallKey "$RegBase\Uninstall"
    StrCpy $RegisteredApps "$RegBase\RegisteredApplications"
    StrCpy $RegisteredName "Folio-Installer-Test-$TestId"
    StrCpy $ShortcutDir "$INSTDIR\Installer test shortcuts"
  ${EndIf}
FunctionEnd
!macroend
!insertmacro RegistryContext ""
!insertmacro RegistryContext "un."

!macro GuardPaths PREFIX
Function ${PREFIX}CheckPath
  ; Check the selected path and every ancestor before reading/writing managed files.
  System::Call 'shlwapi::PathIsUNCW(w r0) i.r1'
  IntCmp $1 0 inspect unsafe unsafe
  inspect:
  System::Call 'kernel32::GetFileAttributesW(w r0) i.r1'
  IntCmp $1 -1 parent
  IntOp $1 $1 & 0x400
  IntCmp $1 0 parent unsafe unsafe
  parent:
  ${GetParent} $0 $1
  StrCmp $1 "" done
  StrCmp $1 $0 done
  StrCpy $0 $1
  Goto inspect
  unsafe:
  SetErrorLevel 3
  IfSilent +2
  MessageBox MB_OK|MB_ICONEXCLAMATION "Choose a local folder without linked application paths. No files were changed."
  Abort
  done:
FunctionEnd
Function ${PREFIX}GuardPaths
  !define GUARD_PREFIX "${PREFIX}"
  !include "${GUARD_FILES}"
  !undef GUARD_PREFIX
FunctionEnd
!macroend
!insertmacro GuardPaths ""
!insertmacro GuardPaths "un."

!macro CheckClosed PREFIX
Function ${PREFIX}CheckClosed
  Call ${PREFIX}GuardPaths
  IfFileExists "$INSTDIR\Folio.exe" 0 node
  ClearErrors
  FileOpen $0 "$INSTDIR\Folio.exe" a
  IfErrors busy
  FileClose $0
  node:
  IfFileExists "$INSTDIR\resources\folio\runtime\node.exe" 0 done
  ClearErrors
  FileOpen $0 "$INSTDIR\resources\folio\runtime\node.exe" a
  IfErrors busy
  FileClose $0
  Goto done
  busy:
  SetErrorLevel 2
  IfSilent +2
  MessageBox MB_OK|MB_ICONEXCLAMATION "Close this installed Folio window and its local server before continuing. Your books and profile will be preserved."
  Abort
  done:
FunctionEnd
!macroend
!insertmacro CheckClosed ""
!insertmacro CheckClosed "un."

Function .onInit
  SetShellVarContext current
  SetRegView 64
  ${IfNot} ${RunningX64}
    Abort "This Folio preview requires 64-bit Windows."
  ${EndIf}
  StrCpy $TestId ""
  ${GetParameters} $Arguments
  ${GetOptions} $Arguments "/TESTID=" $TestId
  Call RegistryContext
  ReadRegDWORD $0 HKCU "$RegBase" "OpenWithEnabled"
  ${If} $0 == 1
    SectionSetFlags 1 1
  ${EndIf}
  ${GetOptions} $Arguments "/REGISTER=" $0
  ${If} $0 == "1"
    SectionSetFlags 1 1 ; The optional Open-with component is the second section.
  ${ElseIf} $0 == "0"
    SectionSetFlags 1 0
  ${EndIf}
FunctionEnd

Function CheckDirectory
  ${If} $TestId != ""
    Call RegistryContext
  ${EndIf}
  Call CheckClosed
  ReadRegStr $0 HKCU "$RegBase" "InstallLocation"
  ${If} $0 != ""
  ${AndIf} $0 != $INSTDIR
    SetErrorLevel 3
    Abort "Uninstall the existing Folio application before choosing another installation folder. Your books and profile will be preserved."
  ${EndIf}
  IfFileExists "$INSTDIR\folio-install.ini" owned
  FindFirst $0 $1 "$INSTDIR\*"
  loop:
  StrCmp $1 "" empty
  StrCmp $1 "." next
  StrCmp $1 ".." next
  FindClose $0
  SetErrorLevel 3
  IfSilent +2
  MessageBox MB_OK|MB_ICONEXCLAMATION "Choose an empty folder or an existing Folio installation. Folio will not overwrite an unrelated folder."
  Abort
  next:
  FindNext $0 $1
  Goto loop
  empty:
  FindClose $0
  Goto done
  owned:
  ReadINIStr $0 "$INSTDIR\folio-install.ini" "Folio" "AppId"
  ReadINIStr $1 "$INSTDIR\folio-install.ini" "Folio" "TestId"
  ${If} $0 != "org.folio.localreader"
  ${OrIf} $1 != $TestId
    SetErrorLevel 3
    Abort "This folder belongs to a different installation."
  ${EndIf}
  done:
  ClearErrors
FunctionEnd

Section "Folio desktop application (required)" APPLICATION
  SectionIn RO
  Call CheckDirectory
  SetOverwrite on
  !include "${INSTALL_FILES}"
  WriteINIStr "$INSTDIR\folio-install.ini" "Folio" "AppId" "org.folio.localreader"
  WriteINIStr "$INSTDIR\folio-install.ini" "Folio" "Version" "${VERSION}"
  WriteINIStr "$INSTDIR\folio-install.ini" "Folio" "TestId" "$TestId"
  WriteUninstaller "$INSTDIR\Uninstall Folio.exe"
  WriteRegStr HKCU "$RegBase" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "$UninstallKey" "DisplayName" "Folio (unsigned preview)"
  WriteRegStr HKCU "$UninstallKey" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "$UninstallKey" "Publisher" "Folio contributors"
  WriteRegStr HKCU "$UninstallKey" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "$UninstallKey" "DisplayIcon" '"$INSTDIR\Folio.exe",0'
  WriteRegStr HKCU "$UninstallKey" "UninstallString" '"$INSTDIR\Uninstall Folio.exe"'
  WriteRegStr HKCU "$UninstallKey" "QuietUninstallString" '"$INSTDIR\Uninstall Folio.exe" /S'
  WriteRegDWORD HKCU "$UninstallKey" "NoModify" 1
  WriteRegDWORD HKCU "$UninstallKey" "NoRepair" 1
  CreateDirectory "$ShortcutDir"
  CreateShortcut "$ShortcutDir\Folio.lnk" "$INSTDIR\Folio.exe"
  CreateShortcut "$ShortcutDir\Uninstall Folio.lnk" "$INSTDIR\Uninstall Folio.exe"
SectionEnd

!macro Associate EXT TYPE
  WriteRegStr HKCU "$Classes\Folio.Ebook.${TYPE}" "" "Folio ${TYPE} ebook"
  WriteRegStr HKCU "$Classes\Folio.Ebook.${TYPE}\DefaultIcon" "" '"$INSTDIR\Folio.exe",0'
  WriteRegStr HKCU "$Classes\Folio.Ebook.${TYPE}\shell\open\command" "" '"$INSTDIR\Folio.exe" "%1"'
  WriteRegStr HKCU "$Classes\.${EXT}\OpenWithProgids" "Folio.Ebook.${TYPE}" ""
  WriteRegStr HKCU "$RegBase\Capabilities\FileAssociations" ".${EXT}" "Folio.Ebook.${TYPE}"
!macroend
Section /o "Offer Folio in Open with (PDF, EPUB, CBZ)" ASSOCIATIONS
  !insertmacro Associate pdf PDF
  !insertmacro Associate epub EPUB
  !insertmacro Associate cbz CBZ
  WriteRegStr HKCU "$RegBase\Capabilities" "ApplicationName" "Folio"
  WriteRegStr HKCU "$RegBase\Capabilities" "ApplicationDescription" "Local-first ebook reader"
  WriteRegStr HKCU "$RegisteredApps" "$RegisteredName" "$RegBase\Capabilities"
  WriteINIStr "$INSTDIR\folio-install.ini" "Folio" "Registered" "1"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
SectionEnd

Function un.onInit
  SetShellVarContext current
  SetRegView 64
  Call un.GuardPaths
  ReadINIStr $0 "$INSTDIR\folio-install.ini" "Folio" "AppId"
  ${If} $0 != "org.folio.localreader"
    SetErrorLevel 3
    Abort "This is not a recognized Folio installation. No files were removed."
  ${EndIf}
  ReadINIStr $TestId "$INSTDIR\folio-install.ini" "Folio" "TestId"
  Call un.RegistryContext
  Call un.CheckClosed
FunctionEnd

!macro Unassociate EXT TYPE
  ReadRegStr $0 HKCU "$Classes\Folio.Ebook.${TYPE}\shell\open\command" ""
  ${If} $0 == '"$INSTDIR\Folio.exe" "%1"'
    DeleteRegValue HKCU "$Classes\.${EXT}\OpenWithProgids" "Folio.Ebook.${TYPE}"
    DeleteRegKey /ifempty HKCU "$Classes\.${EXT}\OpenWithProgids"
    DeleteRegKey /ifempty HKCU "$Classes\.${EXT}"
    DeleteRegKey HKCU "$Classes\Folio.Ebook.${TYPE}"
  ${EndIf}
!macroend
Section "-Finalize Open-with choice"
  SectionGetFlags 1 $0
  IntOp $0 $0 & 1
  ${If} $0 == 0
    !insertmacro Unassociate pdf PDF
    !insertmacro Unassociate epub EPUB
    !insertmacro Unassociate cbz CBZ
    DeleteRegValue HKCU "$RegisteredApps" "$RegisteredName"
    DeleteRegKey HKCU "$RegBase\Capabilities"
    StrCpy $0 0
  ${EndIf}
  WriteRegDWORD HKCU "$RegBase" "OpenWithEnabled" $0
  WriteINIStr "$INSTDIR\folio-install.ini" "Folio" "Registered" "$0"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
SectionEnd
Section "Uninstall"
  !insertmacro Unassociate pdf PDF
  !insertmacro Unassociate epub EPUB
  !insertmacro Unassociate cbz CBZ
  ReadRegStr $0 HKCU "$RegBase" "InstallLocation"
  ${If} $0 == $INSTDIR
    DeleteRegValue HKCU "$RegisteredApps" "$RegisteredName"
    DeleteRegKey HKCU "$UninstallKey"
    DeleteRegKey HKCU "$RegBase\Capabilities"
    DeleteRegValue HKCU "$RegBase" "InstallLocation"
    DeleteRegValue HKCU "$RegBase" "OpenWithEnabled"
    DeleteRegKey /ifempty HKCU "$RegisteredApps"
    DeleteRegKey /ifempty HKCU "$Classes"
    DeleteRegKey /ifempty HKCU "$RegBase"
    Delete "$ShortcutDir\Folio.lnk"
    Delete "$ShortcutDir\Uninstall Folio.lnk"
    RMDir "$ShortcutDir"
  ${EndIf}
  !include "${UNINSTALL_FILES}"
  Delete "$INSTDIR\folio-install.ini"
  Delete "$INSTDIR\Uninstall Folio.exe"
  RMDir "$INSTDIR"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
SectionEnd
