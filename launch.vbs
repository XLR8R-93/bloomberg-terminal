' Launches Bloomberg Terminal silently (no visible terminal window)
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c """ & CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName) & "\launch.bat""", 0, False
