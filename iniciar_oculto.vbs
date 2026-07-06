Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
strPath = fso.GetParentFolderName(WScript.ScriptFullName)

' Asegurar que el directorio de trabajo sea el de la aplicación
WshShell.CurrentDirectory = strPath

' 1. Buscar la ruta de Google Chrome
Dim chromePath
chromePath = ""

' Intentar leer la ruta desde el registro
On Error Resume Next
chromePath = WshShell.RegRead("HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe\")
On Error GoTo 0

' Si no está en el registro, buscar en rutas estándar
If chromePath = "" Then
    Dim standardPath1, standardPath2
    standardPath1 = "C:\Program Files\Google\Chrome\Application\chrome.exe"
    standardPath2 = "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
    If fso.FileExists(standardPath1) Then
        chromePath = standardPath1
    ElseIf fso.FileExists(standardPath2) Then
        chromePath = standardPath2
    End If
End If

' 2. Abrir Chrome específicamente con el puerto del proyecto
If chromePath <> "" Then
    WshShell.Run """" & chromePath & """ http://localhost:5001", 1, False
Else
    ' Fallback en caso de no encontrar Chrome de forma directa
    WshShell.Run "cmd /c start chrome http://localhost:5001", 0, False
End If

' 3. Ejecutar el servidor en segundo plano (Oculto)
WshShell.Run "pythonw server.py", 0, False

