$projectRoot = Split-Path -Parent $PSScriptRoot
$pythonScript = Join-Path $PSScriptRoot "start_db_tunnel.py"
$logsDir = Join-Path $projectRoot "logs"
$pidFile = Join-Path $logsDir "db-tunnel.pid"
$logFile = Join-Path $logsDir "db-tunnel.log"
$errFile = Join-Path $logsDir "db-tunnel.err.log"

New-Item -ItemType Directory -Force -Path $logsDir | Out-Null

if (-not $env:VPS_SSH_PASSWORD) {
  $securePassword = Read-Host "Informe a senha SSH da VPS" -AsSecureString
  $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
  $env:VPS_SSH_PASSWORD = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
}

$process = Start-Process `
  -FilePath python `
  -ArgumentList $pythonScript `
  -WindowStyle Hidden `
  -RedirectStandardOutput $logFile `
  -RedirectStandardError $errFile `
  -PassThru

$process.Id | Set-Content -Path $pidFile

Write-Output "Tunnel iniciado com PID $($process.Id). Logs em $logsDir"
