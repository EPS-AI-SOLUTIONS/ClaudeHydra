# Claude Code Permission Alert - FAST VERSION
# Quick alert when confirmation is needed

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName PresentationFramework

# Play quick attention sound (2 short beeps)
[console]::beep(1500, 100)
[console]::beep(1800, 150)

# Show toast notification (Windows 10/11)
try {
    $app = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
    [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null

    $template = @"
<toast duration="short">
    <visual>
        <binding template="ToastGeneric">
            <text>CLAUDE CODE</text>
            <text>Wymaga potwierdzenia!</text>
        </binding>
    </visual>
    <audio src="ms-winsoundevent:Notification.Default"/>
</toast>
"@

    $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
    $xml.LoadXml($template)
    $toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($app).Show($toast)
} catch {
    # Fallback: Quick MessageBox if toast fails
    [System.Windows.Forms.MessageBox]::Show(
        "Claude Code wymaga potwierdzenia!",
        "POTWIERDZENIE",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Warning
    ) | Out-Null
}

# Quick taskbar flash (2 blinks instead of 5)
try {
    $signature = @"
    [DllImport("user32.dll")]
    public static extern bool FlashWindow(IntPtr hwnd, bool bInvert);
"@
    $type = Add-Type -MemberDefinition $signature -Name "WinAPI" -Namespace "FlashWindow" -PassThru
    $hwnd = (Get-Process -Id $PID).MainWindowHandle
    for ($i = 0; $i -lt 2; $i++) {
        $type::FlashWindow($hwnd, $true)
        Start-Sleep -Milliseconds 150
    }
} catch { }
