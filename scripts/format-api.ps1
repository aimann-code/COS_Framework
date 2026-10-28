$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
$formatterPath=Join-Path $projectRoot '.tools/google-java-format-1.24.0-all-deps.jar'
$formatterUrl='https://repo.maven.apache.org/maven2/com/google/googlejavaformat/google-java-format/1.24.0/google-java-format-1.24.0-all-deps.jar'
if (-not (Test-Path -LiteralPath $formatterPath)) {
    New-Item -ItemType Directory -Force (Split-Path $formatterPath -Parent) | Out-Null
    $formatterUrl='https://repo.maven.apache.org/maven2/com/google/googlejavaformat/google-java-format/1.24.0/google-java-format-1.24.0-all-deps.jar'
    Invoke-WebRequest -Uri $formatterUrl -OutFile $formatterPath
}
$expectedHash=((Invoke-WebRequest -Uri "$formatterUrl.sha1").Content).Trim().Split(' ')[0]
if ((Get-FileHash -LiteralPath $formatterPath -Algorithm SHA1).Hash -ne $expectedHash) { throw 'Java formatter checksum mismatch.' }
$sourcePaths=Get-ChildItem -LiteralPath (Join-Path $projectRoot 'apps/api/src') -Recurse -Filter '*.java' | Select-Object -ExpandProperty FullName
& java '-jar' $formatterPath '--replace' @sourcePaths
exit $LASTEXITCODE
