$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
. (Join-Path $PSScriptRoot 'lan-common.ps1')

$lanIp = Set-LanEnvironment
Ensure-LanFirewallRule -Port 3000 -Label 'Web'
Write-LanAccessBanner -LanIp $lanIp

function Stop-ListenPort {
    param([int]$Port)
    Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique |
        ForEach-Object {
            if ($_ -gt 0) {
                Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
            }
        }
}
Stop-ListenPort -Port 3000
Stop-ListenPort -Port 8080
Start-Sleep -Seconds 2

Set-Location $projectRoot
$backendScript = Join-Path $projectRoot 'scripts/backend.ps1'
$allowedOrigins = $env:COS_ALLOWED_ORIGINS.Replace("'", "''")
$lanHost = ($env:COS_LAN_HOST ?? '').Replace("'", "''")
Start-Process -WorkingDirectory $projectRoot -FilePath 'pwsh' -ArgumentList @(
    '-NoProfile',
    '-Command',
    "& { `$env:COS_BIND_ADDRESS='0.0.0.0'; `$env:COS_LAN_CORS='true'; `$env:COS_ALLOWED_ORIGINS='$allowedOrigins'; if ('$lanHost') { `$env:COS_LAN_HOST='$lanHost' }; & '$backendScript' }"
)
Start-Sleep -Seconds 8
npm run dev:lan --workspace apps/web
