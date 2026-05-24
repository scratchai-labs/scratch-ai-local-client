Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$appDir = [System.IO.Path]::GetFullPath((Join-Path $scriptDir ".."))
$sourceDir = Join-Path $appDir "src\assets"
$buildResourcesDir = Join-Path $appDir "buildResources"

[System.IO.Directory]::CreateDirectory($sourceDir) | Out-Null
[System.IO.Directory]::CreateDirectory($buildResourcesDir) | Out-Null

function New-Color([int] $r, [int] $g, [int] $b, [int] $a = 255) {
  return [System.Drawing.Color]::FromArgb($a, $r, $g, $b)
}

function Get-ScaledValue([double] $value, [double] $scale) {
  return [float]($value * $scale)
}

function New-PointF([double] $x, [double] $y) {
  return [System.Drawing.PointF]::new([float] $x, [float] $y)
}

function New-RectangleF([double] $x, [double] $y, [double] $width, [double] $height) {
  return [System.Drawing.RectangleF]::new([float] $x, [float] $y, [float] $width, [float] $height)
}

function New-RoundedRectanglePath([double] $x, [double] $y, [double] $width, [double] $height, [double] $radius) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = [float]($radius * 2)
  $rect = New-RectangleF $x $y $width $height

  $path.AddArc($rect.X, $rect.Y, $diameter, $diameter, 180, 90)
  $path.AddArc($rect.Right - $diameter, $rect.Y, $diameter, $diameter, 270, 90)
  $path.AddArc($rect.Right - $diameter, $rect.Bottom - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($rect.X, $rect.Bottom - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function New-AppBitmap([int] $size) {
  $scale = $size / 1024.0
  $bitmap = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.Clear([System.Drawing.Color]::Transparent)

  $bgPath = New-RoundedRectanglePath 0 0 $size $size (Get-ScaledValue 248 $scale)
  $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-PointF (156 * $scale) (112 * $scale)),
    (New-PointF (872 * $scale) (912 * $scale)),
    (New-Color 22 51 45),
    (New-Color 12 142 104)
  )
  $graphics.FillPath($bgBrush, $bgPath)

  $glowBrush = New-Object System.Drawing.SolidBrush((New-Color 244 168 107 78))
  $graphics.FillEllipse(
    $glowBrush,
    (Get-ScaledValue -84 $scale),
    (Get-ScaledValue -68 $scale),
    (Get-ScaledValue 776 $scale),
    (Get-ScaledValue 628 $scale)
  )

  $borderPath = New-RoundedRectanglePath (Get-ScaledValue 84 $scale) (Get-ScaledValue 84 $scale) (Get-ScaledValue 856 $scale) (Get-ScaledValue 856 $scale) (Get-ScaledValue 214 $scale)
  $borderPen = New-Object System.Drawing.Pen((New-Color 255 255 255 36), (Get-ScaledValue 18 $scale))
  $graphics.DrawPath($borderPen, $borderPath)

  $bubbleRect = New-RectangleF (Get-ScaledValue 206 $scale) (Get-ScaledValue 236 $scale) (Get-ScaledValue 612 $scale) (Get-ScaledValue 466 $scale)
  $bubblePath = New-RoundedRectanglePath $bubbleRect.X $bubbleRect.Y $bubbleRect.Width $bubbleRect.Height (Get-ScaledValue 110 $scale)
  $bubbleBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-PointF $bubbleRect.Left $bubbleRect.Top),
    (New-PointF $bubbleRect.Right $bubbleRect.Bottom),
    (New-Color 255 250 241),
    (New-Color 243 233 213)
  )
  $graphics.FillPath($bubbleBrush, $bubblePath)

  $tailPoints = [System.Drawing.PointF[]]@(
    (New-PointF (Get-ScaledValue 443 $scale) (Get-ScaledValue 702 $scale)),
    (New-PointF (Get-ScaledValue 317 $scale) (Get-ScaledValue 813 $scale)),
    (New-PointF (Get-ScaledValue 347 $scale) (Get-ScaledValue 702 $scale))
  )
  $graphics.FillPolygon($bubbleBrush, $tailPoints)

  $barBrushStrong = New-Object System.Drawing.SolidBrush((New-Color 22 51 45))
  $barBrushMid = New-Object System.Drawing.SolidBrush((New-Color 22 51 45 235))
  $barBrushSoft = New-Object System.Drawing.SolidBrush((New-Color 22 51 45 214))

  foreach ($bar in @(
      @{ X = 312; Y = 336; Width = 336; Height = 54; Brush = $barBrushStrong },
      @{ X = 312; Y = 437; Width = 264; Height = 54; Brush = $barBrushMid },
      @{ X = 312; Y = 538; Width = 364; Height = 54; Brush = $barBrushSoft }
    )) {
    $barPath = New-RoundedRectanglePath (Get-ScaledValue $bar.X $scale) (Get-ScaledValue $bar.Y $scale) (Get-ScaledValue $bar.Width $scale) (Get-ScaledValue $bar.Height $scale) (Get-ScaledValue 27 $scale)
    $graphics.FillPath($bar.Brush, $barPath)
    $barPath.Dispose()
  }

  $ringBrush = New-Object System.Drawing.SolidBrush((New-Color 12 142 104 56))
  $graphics.FillEllipse(
    $ringBrush,
    (Get-ScaledValue 578 $scale),
    (Get-ScaledValue 496 $scale),
    (Get-ScaledValue 236 $scale),
    (Get-ScaledValue 236 $scale)
  )

  $badgeBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-PointF (Get-ScaledValue 604 $scale) (Get-ScaledValue 552 $scale)),
    (New-PointF (Get-ScaledValue 802 $scale) (Get-ScaledValue 732 $scale)),
    (New-Color 23 199 155),
    (New-Color 11 142 105)
  )
  $graphics.FillEllipse(
    $badgeBrush,
    (Get-ScaledValue 568 $scale),
    (Get-ScaledValue 486 $scale),
    (Get-ScaledValue 216 $scale),
    (Get-ScaledValue 216 $scale)
  )

  $checkPen = New-Object System.Drawing.Pen((New-Color 255 255 255), (Get-ScaledValue 34 $scale))
  $checkPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $checkPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $checkPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $graphics.DrawLines(
    $checkPen,
    [System.Drawing.PointF[]]@(
      (New-PointF (Get-ScaledValue 626 $scale) (Get-ScaledValue 594 $scale)),
      (New-PointF (Get-ScaledValue 660 $scale) (Get-ScaledValue 628 $scale)),
      (New-PointF (Get-ScaledValue 727 $scale) (Get-ScaledValue 548 $scale))
    )
  )

  $starBrush = New-Object System.Drawing.SolidBrush((New-Color 244 168 107))
  $starPoints = [System.Drawing.PointF[]]@(
    (New-PointF (Get-ScaledValue 764 $scale) (Get-ScaledValue 214 $scale)),
    (New-PointF (Get-ScaledValue 782 $scale) (Get-ScaledValue 256 $scale)),
    (New-PointF (Get-ScaledValue 824 $scale) (Get-ScaledValue 274 $scale)),
    (New-PointF (Get-ScaledValue 782 $scale) (Get-ScaledValue 292 $scale)),
    (New-PointF (Get-ScaledValue 764 $scale) (Get-ScaledValue 334 $scale)),
    (New-PointF (Get-ScaledValue 746 $scale) (Get-ScaledValue 292 $scale)),
    (New-PointF (Get-ScaledValue 704 $scale) (Get-ScaledValue 274 $scale)),
    (New-PointF (Get-ScaledValue 746 $scale) (Get-ScaledValue 256 $scale))
  )
  $graphics.FillPolygon($starBrush, $starPoints)

  $bgBrush.Dispose()
  $glowBrush.Dispose()
  $borderPen.Dispose()
  $bubbleBrush.Dispose()
  $barBrushStrong.Dispose()
  $barBrushMid.Dispose()
  $barBrushSoft.Dispose()
  $ringBrush.Dispose()
  $badgeBrush.Dispose()
  $checkPen.Dispose()
  $starBrush.Dispose()
  $bgPath.Dispose()
  $borderPath.Dispose()
  $bubblePath.Dispose()
  $graphics.Dispose()

  return $bitmap
}

function New-TrayBitmap([int] $size) {
  $scale = $size / 64.0
  $bitmap = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.Clear([System.Drawing.Color]::Transparent)

  $bgPath = New-RoundedRectanglePath (Get-ScaledValue 6 $scale) (Get-ScaledValue 6 $scale) (Get-ScaledValue 52 $scale) (Get-ScaledValue 52 $scale) (Get-ScaledValue 16 $scale)
  $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-PointF (Get-ScaledValue 12 $scale) (Get-ScaledValue 10 $scale)),
    (New-PointF (Get-ScaledValue 52 $scale) (Get-ScaledValue 56 $scale)),
    (New-Color 22 51 45),
    (New-Color 12 142 104)
  )
  $graphics.FillPath($bgBrush, $bgPath)

  $borderPath = New-RoundedRectanglePath (Get-ScaledValue 7.5 $scale) (Get-ScaledValue 7.5 $scale) (Get-ScaledValue 49 $scale) (Get-ScaledValue 49 $scale) (Get-ScaledValue 14.5 $scale)
  $borderPen = New-Object System.Drawing.Pen((New-Color 255 255 255 36), (Get-ScaledValue 1.5 $scale))
  $graphics.DrawPath($borderPen, $borderPath)

  foreach ($bar in @(
      @{ X = 18; Y = 18; Width = 28; Height = 5; Alpha = 255 },
      @{ X = 18; Y = 29.5; Width = 22; Height = 5; Alpha = 240 },
      @{ X = 18; Y = 41; Width = 30; Height = 5; Alpha = 224 }
    )) {
    $brush = New-Object System.Drawing.SolidBrush((New-Color 247 240 225 $bar.Alpha))
    $barPath = New-RoundedRectanglePath (Get-ScaledValue $bar.X $scale) (Get-ScaledValue $bar.Y $scale) (Get-ScaledValue $bar.Width $scale) (Get-ScaledValue $bar.Height $scale) (Get-ScaledValue 2.5 $scale)
    $graphics.FillPath($brush, $barPath)
    $barPath.Dispose()
    $brush.Dispose()
  }

  $badgeBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-PointF (Get-ScaledValue 38 $scale) (Get-ScaledValue 28 $scale)),
    (New-PointF (Get-ScaledValue 53 $scale) (Get-ScaledValue 44 $scale)),
    (New-Color 23 199 155),
    (New-Color 11 142 105)
  )
  $graphics.FillEllipse(
    $badgeBrush,
    (Get-ScaledValue 39 $scale),
    (Get-ScaledValue 28 $scale),
    (Get-ScaledValue 16 $scale),
    (Get-ScaledValue 16 $scale)
  )

  $checkPen = New-Object System.Drawing.Pen((New-Color 255 255 255), (Get-ScaledValue 2.8 $scale))
  $checkPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $checkPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $checkPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $graphics.DrawLines(
    $checkPen,
    [System.Drawing.PointF[]]@(
      (New-PointF (Get-ScaledValue 43.5 $scale) (Get-ScaledValue 36.1 $scale)),
      (New-PointF (Get-ScaledValue 46.1 $scale) (Get-ScaledValue 39 $scale)),
      (New-PointF (Get-ScaledValue 51.5 $scale) (Get-ScaledValue 32.8 $scale))
    )
  )

  $bgBrush.Dispose()
  $borderPen.Dispose()
  $badgeBrush.Dispose()
  $checkPen.Dispose()
  $bgPath.Dispose()
  $borderPath.Dispose()
  $graphics.Dispose()

  return $bitmap
}

function Get-PngBytes([System.Drawing.Bitmap] $bitmap) {
  $memory = New-Object System.IO.MemoryStream
  $bitmap.Save($memory, [System.Drawing.Imaging.ImageFormat]::Png)
  $bytes = $memory.ToArray()
  $memory.Dispose()
  return $bytes
}

function Save-Png([System.Drawing.Bitmap] $bitmap, [string] $path) {
  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
}

function Write-Ico([object[]] $frames, [string] $path) {
  $file = [System.IO.File]::Open($path, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write)
  $writer = New-Object System.IO.BinaryWriter($file)

  $writer.Write([UInt16] 0)
  $writer.Write([UInt16] 1)
  $writer.Write([UInt16] $frames.Count)

  $offset = 6 + (16 * $frames.Count)
  foreach ($frame in $frames) {
    $dimension = if ($frame.Size -ge 256) { [byte] 0 } else { [byte] $frame.Size }
    $writer.Write($dimension)
    $writer.Write($dimension)
    $writer.Write([byte] 0)
    $writer.Write([byte] 0)
    $writer.Write([UInt16] 1)
    $writer.Write([UInt16] 32)
    $writer.Write([UInt32] $frame.Bytes.Length)
    $writer.Write([UInt32] $offset)
    $offset += $frame.Bytes.Length
  }

  $writer.Flush()
  foreach ($frame in $frames) {
    $bytes = [byte[]] $frame.Bytes
    $file.Write($bytes, 0, $bytes.Length)
  }

  $writer.Dispose()
  $file.Dispose()
}

$iconFrames = @()
foreach ($size in @(16, 20, 24, 32, 40, 48, 64, 128, 256)) {
  $bitmap = New-AppBitmap $size
  $iconFrames += [pscustomobject]@{
    Size = $size
    Bytes = [byte[]](Get-PngBytes $bitmap)
  }
  $bitmap.Dispose()
}

$appPng = New-AppBitmap 512
$previewPng = New-AppBitmap 1024
$trayPng = New-TrayBitmap 32
$trayPng2x = New-TrayBitmap 64

Save-Png $appPng (Join-Path $sourceDir "app-icon.png")
Save-Png $trayPng (Join-Path $sourceDir "tray-icon.png")
Save-Png $trayPng2x (Join-Path $sourceDir "tray-icon@2x.png")
Save-Png $previewPng (Join-Path $buildResourcesDir "ScratchDesktop.png")
Write-Ico $iconFrames (Join-Path $buildResourcesDir "ScratchDesktop.ico")

$appPng.Dispose()
$previewPng.Dispose()
$trayPng.Dispose()
$trayPng2x.Dispose()
