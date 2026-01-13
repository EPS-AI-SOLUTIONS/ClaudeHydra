' Gemini CLI Launcher (HYDRA Ollama Extension)
' Enhanced with Windows Terminal support
Option Explicit
On Error Resume Next

Dim objShell, objWMI, objFSO
Dim colProcesses, objProcess
Dim ports, port, killCount
Dim userProfile, strScriptPath

Set objShell = CreateObject("WScript.Shell")
Set objWMI = GetObject("winmgmts:\\.\root\cimv2")
Set objFSO = CreateObject("Scripting.FileSystemObject")

killCount = 0
userProfile = objShell.ExpandEnvironmentStrings("%USERPROFILE%")
strScriptPath = objFSO.GetParentFolderName(WScript.ScriptFullName)

' Ollama default port
ports = Array(11434)

' 1. CLEANUP - Kill stale processes on Ollama port if needed
For Each port In ports
    CheckAndKillPort port
Next

CleanStaleLocks()

' 2. OLLAMA HEALTH CHECK - ensure Ollama is running
Dim ollamaRunning
ollamaRunning = IsOllamaRunning()
If Not ollamaRunning Then
    ' Start Ollama in background
    objShell.Run "ollama serve", 0, False
    WScript.Sleep 2000
End If

' 3. LAUNCH - prefer Windows Terminal, fallback to PowerShell
Dim launcherPS1, wtExe, useWT
launcherPS1 = strScriptPath & "\_launcher.ps1"

' Check if Windows Terminal is installed
wtExe = userProfile & "\AppData\Local\Microsoft\WindowsApps\wt.exe"
useWT = objFSO.FileExists(wtExe)

If useWT Then
    ' Launch with Windows Terminal using custom profile
    objShell.Run "wt.exe -p ""Gemini CLI (HYDRA)"" --title ""Gemini CLI"" powershell.exe -NoExit -ExecutionPolicy Bypass -File """ & launcherPS1 & """", 1, False
Else
    ' Fallback to standard PowerShell
    objShell.Run "powershell.exe -NoExit -ExecutionPolicy Bypass -File """ & launcherPS1 & """", 1, False
End If

' === FUNCTIONS ===
Function IsOllamaRunning()
    Dim colProcs
    Set colProcs = objWMI.ExecQuery("SELECT * FROM Win32_Process WHERE Name = 'ollama.exe'")
    IsOllamaRunning = (colProcs.Count > 0)
End Function

Sub CheckAndKillPort(portNum)
    Dim objExec, strOutput, arrLines, strLine, arrParts, pid
    Set objExec = objShell.Exec("cmd /c netstat -ano | findstr :" & portNum)
    If Not objExec.StdOut.AtEndOfStream Then
        strOutput = objExec.StdOut.ReadAll()
    Else
        strOutput = ""
    End If

    If Len(Trim(strOutput)) > 0 Then
        arrLines = Split(strOutput, vbCrLf)
        For Each strLine In arrLines
            If InStr(strLine, "LISTENING") > 0 Then
                strLine = Trim(strLine)
                arrParts = Split(strLine, " ")
                pid = arrParts(UBound(arrParts))
                If IsNumeric(pid) And CInt(pid) > 0 Then
                    ' Don't kill Ollama itself, just stale connections
                    ' KillProcessByPID CInt(pid)
                End If
            End If
        Next
    End If
End Sub

Sub KillProcessByPID(pid)
    Dim colProcs, objProc
    On Error Resume Next
    Set colProcs = objWMI.ExecQuery("SELECT * FROM Win32_Process WHERE ProcessId = " & pid)
    For Each objProc In colProcs
        objProc.Terminate()
    Next
End Sub

Sub CleanStaleLocks()
    Dim lockPaths, lockPath, folder
    lockPaths = Array( _
        userProfile & "\.gemini\locks", _
        userProfile & "\.gemini\.locks", _
        userProfile & "\AppData\Local\Temp\gemini-locks" _
    )
    For Each lockPath In lockPaths
        If objFSO.FolderExists(lockPath) Then
            Set folder = objFSO.GetFolder(lockPath)
            DeleteFilesInFolder folder
        End If
    Next
End Sub

Sub DeleteFilesInFolder(folder)
    Dim file, subfolder
    On Error Resume Next
    For Each file In folder.Files
        file.Delete True
    Next
    For Each subfolder In folder.SubFolders
        DeleteFilesInFolder subfolder
    Next
End Sub
