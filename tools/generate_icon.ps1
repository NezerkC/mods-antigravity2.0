# Generates a distinct 32x32 System Tray icon for Antigravity Mod Daemon
Add-Type -AssemblyName System.Drawing

$projectDir = Split-Path -Parent $PSScriptRoot
$assetsDir = Join-Path $projectDir 'framework\assets'
if (-not (Test-Path $assetsDir)) {
  New-Item -ItemType Directory -Force -Path $assetsDir | Out-Null
}

$icoPath = Join-Path $assetsDir 'mod-daemon.ico'

$bmp = New-Object System.Drawing.Bitmap(32, 32)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

# Background: Dark navy circle
$bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(15, 23, 42))
$g.FillEllipse($bgBrush, 1, 1, 29, 29)

# Outer Border: Violet/Purple glowing ring
$pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(168, 85, 247), 2)
$g.DrawEllipse($pen, 2, 2, 27, 27)

# Inner Ring: Cyan accent
$innerPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(6, 182, 212), 1)
$g.DrawEllipse($innerPen, 5, 5, 21, 21)

# Center Glyph: Bold 'M' (for Mod Framework)
$font = New-Object System.Drawing.Font('Segoe UI', 11, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(248, 250, 252))
$format = New-Object System.Drawing.StringFormat
$format.Alignment = [System.Drawing.StringAlignment]::Center
$format.LineAlignment = [System.Drawing.StringAlignment]::Center
$g.DrawString('M', $font, $textBrush, [System.Drawing.RectangleF]::new(0, 0, 32, 32), $format)

$hIcon = $bmp.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($hIcon)

$stream = [System.IO.File]::OpenWrite($icoPath)
$icon.Save($stream)
$stream.Close()

Write-Output "Successfully generated distinct mod daemon icon at: $icoPath"
