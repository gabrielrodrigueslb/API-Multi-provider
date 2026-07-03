$projectRoot = Split-Path -Parent $PSScriptRoot
$pythonScript = Join-Path $PSScriptRoot "start_db_tunnel.py"
$logsDir = Join-Path $projectRoot "logs"
$pidFile = Join-Path $logsDir "client-db-tunnel.pid"
$logFile = Join-Path $logsDir "client-db-tunnel.log"
$errFile = Join-Path $logsDir "client-db-tunnel.err.log"

New-Item -ItemType Directory -Force -Path $logsDir | Out-Null

if (-not $env:VPS_SSH_PASSWORD) {
  $securePassword = Read-Host "Informe a senha SSH da VPS" -AsSecureString
  $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
  $env:VPS_SSH_PASSWORD = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
}

$env:VPS_SSH_HOST = if ($env:VPS_SSH_HOST) { $env:VPS_SSH_HOST } else { "145.223.27.100" }
$env:VPS_SSH_USER = if ($env:VPS_SSH_USER) { $env:VPS_SSH_USER } else { "root" }
$env:TUNNEL_LOCAL_HOST = if ($env:TUNNEL_LOCAL_HOST) { $env:TUNNEL_LOCAL_HOST } else { "127.0.0.1" }
$env:TUNNEL_LOCAL_PORT = if ($env:TUNNEL_LOCAL_PORT) { $env:TUNNEL_LOCAL_PORT } else { "55433" }
$env:TUNNEL_REMOTE_HOST = if ($env:TUNNEL_REMOTE_HOST) { $env:TUNNEL_REMOTE_HOST } else { "loja06.complexopharma.com.br" }
$env:TUNNEL_REMOTE_PORT = if ($env:TUNNEL_REMOTE_PORT) { $env:TUNNEL_REMOTE_PORT } else { "5432" }

$process = Start-Process `
  -FilePath python `
  -ArgumentList $pythonScript `
  -WindowStyle Hidden `
  -RedirectStandardOutput $logFile `
  -RedirectStandardError $errFile `
  -PassThru

$process.Id | Set-Content -Path $pidFile

Write-Output "Tunnel do banco do cliente iniciado com PID $($process.Id). Endpoint local: $($env:TUNNEL_LOCAL_HOST):$($env:TUNNEL_LOCAL_PORT)"
