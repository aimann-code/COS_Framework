function Get-LanIPv4 {
    $all =
        Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object {
            $_.IPAddress -notlike '127.*' -and
            $_.IPAddress -notlike '169.254.*' -and
            $_.PrefixOrigin -ne 'WellKnown'
        }
    $wifi =
        $all |
        Where-Object {
            $_.InterfaceAlias -match 'Wi-?Fi|WLAN|Wireless' -and
            $_.InterfaceAlias -notmatch 'Virtual|Hyper-V|WSL|vEthernet'
        } |
        Sort-Object InterfaceMetric |
        Select-Object -First 1
    if ($wifi) { return $wifi.IPAddress }
    $wired =
        $all |
        Where-Object {
            $_.InterfaceAlias -match 'Ethernet' -and
            $_.InterfaceAlias -notmatch 'Virtual|Hyper-V|WSL|vEthernet'
        } |
        Sort-Object InterfaceMetric |
        Select-Object -First 1
    if ($wired) { return $wired.IPAddress }
    $fallback =
        $all |
        Where-Object { $_.InterfaceAlias -notmatch 'Virtual|Hyper-V|WSL|vEthernet|Loopback' } |
        Sort-Object InterfaceMetric |
        Select-Object -First 1
    if ($fallback) { return $fallback.IPAddress }
    return $null
}

function Set-LanEnvironment {
    $lanIp = Get-LanIPv4
    $env:COS_BIND_ADDRESS = '0.0.0.0'
    $env:COS_LAN_CORS = 'true'
    if ($lanIp) {
        $env:COS_LAN_HOST = $lanIp
        $env:COS_ALLOWED_ORIGINS =
            "http://127.0.0.1:3000,http://localhost:3000,http://${lanIp}:3000"
    } else {
        Remove-Item Env:COS_LAN_HOST -ErrorAction SilentlyContinue
        $env:COS_ALLOWED_ORIGINS = 'http://127.0.0.1:3000,http://localhost:3000'
    }
    return $lanIp
}

function Ensure-LanFirewallRule {
    param(
        [int]$Port,
        [string]$Label
    )
    $ruleName = "COS_Framework $Label (TCP $Port)"
    if (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue) {
        return
    }
    try {
        New-NetFirewallRule `
            -DisplayName $ruleName `
            -Direction Inbound `
            -LocalPort $Port `
            -Protocol TCP `
            -Action Allow `
            -Profile Private `
            -ErrorAction Stop | Out-Null
        Write-Output "Firewall: allowed inbound TCP $Port on private networks ($Label)."
    } catch {
        Write-Warning @"
Could not add firewall rule '$ruleName'. Other devices may be blocked.
Run PowerShell as Administrator once, then:
  New-NetFirewallRule -DisplayName '$ruleName' -Direction Inbound -LocalPort $Port -Protocol TCP -Action Allow -Profile Private
"@
    }
}

function Write-LanAccessBanner {
    param([string]$LanIp)
    Write-Output ''
    Write-Output '=== COS_Framework — same Wi‑Fi / LAN access ==='
    Write-Output 'This PC:     http://127.0.0.1:3000/sign-in'
    if ($LanIp) {
        Write-Output "Other devices: http://${LanIp}:3000/sign-in"
        Write-Output "               http://${LanIp}:3000/people"
        Write-Output ''
        Write-Output 'Share the Wi‑Fi URL with phones or laptops on the same network.'
        Write-Output 'Each device signs in separately (use registrar credentials locally).'
    } else {
        Write-Output 'Other devices: (no LAN IP detected — run ipconfig and use your Wi‑Fi IPv4)'
    }
    Write-Output ''
}
