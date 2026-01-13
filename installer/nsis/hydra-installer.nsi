; HYDRA 10.0 Multi-System Installer
; For Windows 10/11 with PowerShell 5.1+
; ==========================================

!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "WordFunc.nsh"
!include "LogicLib.nsh"
!include "WinVer.nsh"
!include "nsDialogs.nsh"

; ==========================================
; INSTALLER CONFIGURATION
; ==========================================
!define PRODUCT_NAME "HYDRA"
!define PRODUCT_VERSION "10.0"
!define PRODUCT_PUBLISHER "ClaudeCLI"
!define PRODUCT_WEB_SITE "https://github.com/pawelserkowski-lang/claudecli"
!define PRODUCT_DIR_REGKEY "Software\Microsoft\Windows\CurrentVersion\App Paths\hydra.ps1"
!define PRODUCT_UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}"
!define PRODUCT_UNINST_ROOT_KEY "HKLM"

; Installer attributes
Name "${PRODUCT_NAME} ${PRODUCT_VERSION}"
OutFile "..\HYDRA-${PRODUCT_VERSION}-Setup.exe"
InstallDir "$LOCALAPPDATA\HYDRA"
InstallDirRegKey HKCU "Software\HYDRA" "InstallPath"
RequestExecutionLevel admin
ShowInstDetails show
ShowUnInstDetails show

; Compression
SetCompressor /SOLID lzma
SetCompressorDictSize 64

; ==========================================
; MODERN UI CONFIGURATION
; ==========================================
!define MUI_ABORTWARNING
!define MUI_ICON "..\assets\hydra.ico"
!define MUI_UNICON "..\assets\hydra.ico"
; Note: wizard.bmp removed - using default MUI graphics

; Welcome page
!insertmacro MUI_PAGE_WELCOME

; License page
!insertmacro MUI_PAGE_LICENSE "..\..\LICENSE"

; Components page
!insertmacro MUI_PAGE_COMPONENTS

; Directory page
!insertmacro MUI_PAGE_DIRECTORY

; Install files page
!insertmacro MUI_PAGE_INSTFILES

; Finish page
!define MUI_FINISHPAGE_RUN "$INSTDIR\scripts\Initialize-Hydra.ps1"
!define MUI_FINISHPAGE_RUN_PARAMETERS "-ExecutionPolicy Bypass -File"
!define MUI_FINISHPAGE_RUN_TEXT "Initialize HYDRA after installation"
!define MUI_FINISHPAGE_SHOWREADME "$INSTDIR\README.md"
!insertmacro MUI_PAGE_FINISH

; Uninstaller pages
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

; Language
!insertmacro MUI_LANGUAGE "English"
!insertmacro MUI_LANGUAGE "Polish"

; ==========================================
; INSTALLER SECTIONS
; ==========================================

Section "HYDRA Core (Required)" SEC_CORE
    SectionIn RO ; Read-only, always installed

    SetOutPath "$INSTDIR"

    ; Core files
    File "..\..\CLAUDE.md"
    File "..\..\LICENSE"
    File "..\..\README.md"
    File "..\..\mcp-health-check.ps1"
    File "..\..\_launcher.ps1"

    ; Create directories
    CreateDirectory "$INSTDIR\.claude"
    CreateDirectory "$INSTDIR\.claude\commands"
    CreateDirectory "$INSTDIR\.claude\hooks"
    CreateDirectory "$INSTDIR\.claude\skills"
    CreateDirectory "$INSTDIR\.serena"
    CreateDirectory "$INSTDIR\.serena\cache"
    CreateDirectory "$INSTDIR\.serena\memories"
    CreateDirectory "$INSTDIR\scripts"

    ; .claude config files
    SetOutPath "$INSTDIR\.claude"
    File "..\..\\.claude\settings.local.json"
    File /nonfatal "..\..\\.claude\statusline.js"

    ; Scripts
    SetOutPath "$INSTDIR\scripts"
    File "..\scripts\Initialize-Hydra.ps1"
    File "..\scripts\Test-Prerequisites.ps1"

    ; Create Start Menu shortcuts
    CreateDirectory "$SMPROGRAMS\HYDRA"
    CreateShortcut "$SMPROGRAMS\HYDRA\HYDRA Launcher.lnk" "powershell.exe" '-ExecutionPolicy Bypass -File "$INSTDIR\_launcher.ps1"'
    CreateShortcut "$SMPROGRAMS\HYDRA\MCP Health Check.lnk" "powershell.exe" '-ExecutionPolicy Bypass -File "$INSTDIR\mcp-health-check.ps1"'
    CreateShortcut "$SMPROGRAMS\HYDRA\Uninstall.lnk" "$INSTDIR\Uninstall.exe"

    ; Registry entries
    WriteRegStr HKCU "Software\HYDRA" "InstallPath" "$INSTDIR"
    WriteRegStr HKCU "Software\HYDRA" "Version" "${PRODUCT_VERSION}"

    ; Uninstaller
    WriteUninstaller "$INSTDIR\Uninstall.exe"
    WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "DisplayName" "${PRODUCT_NAME}"
    WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "DisplayVersion" "${PRODUCT_VERSION}"
    WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "Publisher" "${PRODUCT_PUBLISHER}"
    WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "URLInfoAbout" "${PRODUCT_WEB_SITE}"
    WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "UninstallString" "$INSTDIR\Uninstall.exe"
    WriteRegDWORD ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "NoModify" 1
    WriteRegDWORD ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "NoRepair" 1

    ; Calculate installed size
    ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
    IntFmt $0 "0x%08X" $0
    WriteRegDWORD ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "EstimatedSize" "$0"
SectionEnd

Section "AI Model Handler" SEC_AI
    SetOutPath "$INSTDIR\ai-handler"

    ; Main module
    File "..\..\ai-handler\AIModelHandler.psm1"
    File "..\..\ai-handler\ai-config.json"
    File "..\..\ai-handler\Invoke-AI.ps1"
    File "..\..\ai-handler\Initialize-AIHandler.ps1"
    File "..\..\ai-handler\Initialize-AdvancedAI.ps1"
    File /nonfatal "..\..\ai-handler\Demo-AdvancedAI.ps1"

    ; Advanced modules
    CreateDirectory "$INSTDIR\ai-handler\modules"
    SetOutPath "$INSTDIR\ai-handler\modules"
    File /nonfatal "..\..\ai-handler\modules\*.psm1"

    ; Cache directory
    CreateDirectory "$INSTDIR\ai-handler\cache"

    ; Shortcut
    CreateShortcut "$SMPROGRAMS\HYDRA\AI Handler Status.lnk" "powershell.exe" '-ExecutionPolicy Bypass -Command "Import-Module $INSTDIR\ai-handler\AIModelHandler.psm1; Get-AIStatus; pause"'
SectionEnd

Section "Parallel Execution System" SEC_PARALLEL
    SetOutPath "$INSTDIR\parallel"

    ; Main initializer
    File "..\..\parallel\Initialize-Parallel.ps1"

    ; Modules
    CreateDirectory "$INSTDIR\parallel\modules"
    SetOutPath "$INSTDIR\parallel\modules"
    File /nonfatal "..\..\parallel\modules\*.psm1"

    ; Build scripts
    CreateDirectory "$INSTDIR\parallel\build"
    SetOutPath "$INSTDIR\parallel\build"
    File /nonfatal "..\..\parallel\build\*.ps1"

    ; Utility scripts
    CreateDirectory "$INSTDIR\parallel\scripts"
    SetOutPath "$INSTDIR\parallel\scripts"
    File /nonfatal "..\..\parallel\scripts\*.ps1"
SectionEnd

Section "MCP Server Configs" SEC_MCP
    SetOutPath "$INSTDIR\mcp"

    ; Create MCP config template
    FileOpen $0 "$INSTDIR\mcp\mcp-servers.json" w
    FileWrite $0 '{"serena":{"command":"uvx","args":["--from","git+https://github.com/oraios/serena","serena","start-mcp-server","--context","cli","--project","$INSTDIR"]},'
    FileWrite $0 '"desktop-commander":{"command":"cmd","args":["/c","npx","-y","@wonderwhy-er/desktop-commander"]},'
    FileWrite $0 '"playwright":{"command":"cmd","args":["/c","npx","@playwright/mcp@latest"]}}'
    FileClose $0

    ; MCP health check shortcut
    CreateShortcut "$SMPROGRAMS\HYDRA\MCP Servers.lnk" "powershell.exe" '-ExecutionPolicy Bypass -File "$INSTDIR\mcp-health-check.ps1"'
SectionEnd

Section "Ollama (Local AI)" SEC_OLLAMA
    ; Check if Ollama is installed
    nsExec::ExecToStack 'where ollama'
    Pop $0
    Pop $1

    ${If} $0 != 0
        MessageBox MB_YESNO "Ollama is not installed. Download and install it now?" IDYES install_ollama IDNO skip_ollama

        install_ollama:
            ; Download Ollama installer
            DetailPrint "Downloading Ollama..."
            NSISdl::download "https://ollama.com/download/OllamaSetup.exe" "$TEMP\OllamaSetup.exe"
            Pop $0
            ${If} $0 == "success"
                DetailPrint "Installing Ollama..."
                ExecWait '"$TEMP\OllamaSetup.exe" /S' $0
                Delete "$TEMP\OllamaSetup.exe"
            ${Else}
                MessageBox MB_OK "Failed to download Ollama. Please install manually from https://ollama.com"
            ${EndIf}

        skip_ollama:
    ${Else}
        DetailPrint "Ollama is already installed"
    ${EndIf}

    ; Create script to pull recommended models
    SetOutPath "$INSTDIR\scripts"
    FileOpen $0 "$INSTDIR\scripts\Pull-OllamaModels.ps1" w
    FileWrite $0 '# Pull recommended Ollama models for HYDRA$\r$\n'
    FileWrite $0 '$$models = @("llama3.2:3b", "llama3.2:1b", "qwen2.5-coder:1.5b", "phi3:mini")$\r$\n'
    FileWrite $0 'foreach ($$m in $$models) {$\r$\n'
    FileWrite $0 '    Write-Host "Pulling $$m..." -ForegroundColor Cyan$\r$\n'
    FileWrite $0 '    ollama pull $$m$\r$\n'
    FileWrite $0 '}$\r$\n'
    FileWrite $0 'Write-Host "Done! All models ready." -ForegroundColor Green$\r$\n'
    FileClose $0

    CreateShortcut "$SMPROGRAMS\HYDRA\Pull Ollama Models.lnk" "powershell.exe" '-ExecutionPolicy Bypass -File "$INSTDIR\scripts\Pull-OllamaModels.ps1"'
SectionEnd

Section "Desktop Shortcut" SEC_DESKTOP
    CreateShortcut "$DESKTOP\HYDRA.lnk" "powershell.exe" '-ExecutionPolicy Bypass -File "$INSTDIR\_launcher.ps1"' "$INSTDIR\assets\hydra.ico"
SectionEnd

Section "Add to PATH" SEC_PATH
    ; Add HYDRA to user PATH
    ReadRegStr $0 HKCU "Environment" "PATH"
    ${If} $0 != ""
        StrCpy $0 "$0;$INSTDIR;$INSTDIR\scripts"
    ${Else}
        StrCpy $0 "$INSTDIR;$INSTDIR\scripts"
    ${EndIf}
    WriteRegStr HKCU "Environment" "PATH" "$0"

    ; Notify system of environment change
    SendMessage ${HWND_BROADCAST} ${WM_WININICHANGE} 0 "STR:Environment" /TIMEOUT=5000
SectionEnd

; ==========================================
; SECTION DESCRIPTIONS
; ==========================================
!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
    !insertmacro MUI_DESCRIPTION_TEXT ${SEC_CORE} "Core HYDRA files, configuration, and launcher scripts (required)"
    !insertmacro MUI_DESCRIPTION_TEXT ${SEC_AI} "AI Model Handler with multi-provider fallback (Ollama, OpenAI, Anthropic)"
    !insertmacro MUI_DESCRIPTION_TEXT ${SEC_PARALLEL} "Parallel execution system for concurrent operations"
    !insertmacro MUI_DESCRIPTION_TEXT ${SEC_MCP} "MCP server configurations (Serena, Desktop Commander, Playwright)"
    !insertmacro MUI_DESCRIPTION_TEXT ${SEC_OLLAMA} "Install Ollama for local AI (free, no API key needed)"
    !insertmacro MUI_DESCRIPTION_TEXT ${SEC_DESKTOP} "Create desktop shortcut"
    !insertmacro MUI_DESCRIPTION_TEXT ${SEC_PATH} "Add HYDRA to system PATH"
!insertmacro MUI_FUNCTION_DESCRIPTION_END

; ==========================================
; UNINSTALLER
; ==========================================
Section "Uninstall"
    ; Remove Start Menu
    RMDir /r "$SMPROGRAMS\HYDRA"

    ; Remove Desktop shortcut
    Delete "$DESKTOP\HYDRA.lnk"

    ; Remove from PATH
    ReadRegStr $0 HKCU "Environment" "PATH"
    ${WordReplace} $0 ";$INSTDIR" "" "+" $0
    ${WordReplace} $0 ";$INSTDIR\scripts" "" "+" $0
    WriteRegStr HKCU "Environment" "PATH" "$0"

    ; Remove registry entries
    DeleteRegKey HKCU "Software\HYDRA"
    DeleteRegKey ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}"

    ; Remove files
    RMDir /r "$INSTDIR\ai-handler"
    RMDir /r "$INSTDIR\parallel"
    RMDir /r "$INSTDIR\mcp"
    RMDir /r "$INSTDIR\.claude"
    RMDir /r "$INSTDIR\.serena"
    RMDir /r "$INSTDIR\scripts"
    RMDir /r "$INSTDIR\assets"

    Delete "$INSTDIR\CLAUDE.md"
    Delete "$INSTDIR\LICENSE"
    Delete "$INSTDIR\README.md"
    Delete "$INSTDIR\mcp-health-check.ps1"
    Delete "$INSTDIR\_launcher.ps1"
    Delete "$INSTDIR\Uninstall.exe"

    RMDir "$INSTDIR"

    ; Notify system
    SendMessage ${HWND_BROADCAST} ${WM_WININICHANGE} 0 "STR:Environment" /TIMEOUT=5000
SectionEnd

; ==========================================
; FUNCTIONS
; ==========================================
Function .onInit
    ; Check Windows version
    ${If} ${AtLeastWin10}
        ; OK
    ${Else}
        MessageBox MB_OK|MB_ICONSTOP "HYDRA requires Windows 10 or later."
        Abort
    ${EndIf}

    ; Check PowerShell
    nsExec::ExecToStack 'powershell -Command "$$PSVersionTable.PSVersion.Major"'
    Pop $0
    Pop $1
    ${If} $0 != 0
        MessageBox MB_OK|MB_ICONSTOP "PowerShell is required but not found."
        Abort
    ${EndIf}

    ; Language selection
    !insertmacro MUI_LANGDLL_DISPLAY
FunctionEnd

Function .onInstSuccess
    ; Run post-install script
    ExecWait 'powershell.exe -ExecutionPolicy Bypass -File "$INSTDIR\scripts\Initialize-Hydra.ps1"'
FunctionEnd
