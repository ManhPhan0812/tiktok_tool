# Đóng gói extension thành ZIP để chia sẻ, đặt ở thư mục gốc dự án.
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $root 'extension\manifest.json'
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$zip = Join-Path $root ("tiktok-tools-v{0}.zip" -f $manifest.version)

if (Test-Path -LiteralPath $zip) {
    Remove-Item -LiteralPath $zip -Force
}

Compress-Archive -Path (Join-Path $root 'extension\*') -DestinationPath $zip -CompressionLevel Optimal

$size = [math]::Round((Get-Item -LiteralPath $zip).Length / 1KB, 1)
Write-Host ("Đã tạo {0} ({1} KB) cho phiên bản {2}" -f $zip, $size, $manifest.version)
