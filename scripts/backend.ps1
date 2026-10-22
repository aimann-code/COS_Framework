param([Parameter(ValueFromRemainingArguments=$true)][string[]]$MavenArgs)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$toolsPath = Join-Path $projectRoot '.tools'
$mavenVersion = '3.9.11'
$mavenPath = Join-Path $toolsPath "apache-maven-$mavenVersion/bin/mvn.cmd"
if (-not (Test-Path -LiteralPath $mavenPath)) {
    New-Item -ItemType Directory -Force -Path $toolsPath | Out-Null
    $archivePath = Join-Path $toolsPath "apache-maven-$mavenVersion-bin.zip"
    $downloadUrl = "https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/$mavenVersion/apache-maven-$mavenVersion-bin.zip"
    Invoke-WebRequest -Uri $downloadUrl -OutFile $archivePath
    $expectedHash = ((Invoke-WebRequest -Uri "$downloadUrl.sha512").Content).Trim().Split(' ')[0]
    $actualHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA512).Hash
    if ($actualHash -ne $expectedHash) { throw 'Maven archive checksum mismatch.' }
    Expand-Archive -LiteralPath $archivePath -DestinationPath $toolsPath -Force
}
$localPath = Join-Path $projectRoot '.local'
New-Item -ItemType Directory -Force -Path $localPath | Out-Null
$settingsPath = Join-Path $localPath 'backend-secrets.json'
if (-not (Test-Path -LiteralPath $settingsPath)) {
    function New-RandomSecret { [Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)) }
    $settings = @{
      COS_ENCRYPTION_KEY = (New-RandomSecret)
      COS_FINGERPRINT_KEY = (New-RandomSecret)
      COS_REGISTRAR_PASSWORD = (New-RandomSecret)
      COS_ADMIN_PASSWORD = (New-RandomSecret)
      COS_REVIEWER_PASSWORD = (New-RandomSecret)
      COS_VIEWER_PASSWORD = (New-RandomSecret)
    }
    $settings | ConvertTo-Json | Set-Content -LiteralPath $settingsPath
}
$settings = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json -AsHashtable
foreach ($entry in $settings.GetEnumerator()) {
    if (-not [Environment]::GetEnvironmentVariable($entry.Key)) { [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, 'Process') }
}
$env:DEBUG = 'false'
$env:COS_DATA_DIRECTORY = Join-Path $localPath 'postgres'
if (-not $MavenArgs.Count) { $MavenArgs = @('spring-boot:run', '-Dspring-boot.run.profiles=local') }
Write-Output "Local credentials and encryption keys: $settingsPath (ignored by Git)."
& $mavenPath '-B' '-ntp' '-f' (Join-Path $projectRoot 'apps/api/pom.xml') "-Dmaven.repo.local=$toolsPath/m2" @MavenArgs
exit $LASTEXITCODE
