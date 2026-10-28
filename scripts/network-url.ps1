. (Join-Path $PSScriptRoot 'lan-common.ps1')
$lanIp = Get-LanIPv4
Write-LanAccessBanner -LanIp $lanIp
