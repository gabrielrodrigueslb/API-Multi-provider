$projectRoot = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path (Join-Path $projectRoot "logs") "client-db-tunnel.pid"

if (-not (Test-Path $pidFile)) {
  Write-Output "Nenhum arquivo de PID do tunnel do cliente encontrado."
  exit 0
}

$tunnelPid = Get-Content -Path $pidFile -ErrorAction Stop

try {
  Stop-Process -Id $tunnelPid -Force -ErrorAction Stop
  Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
  Write-Output "Tunnel do cliente parado. PID: $tunnelPid"
} catch {
  Write-Output ("Nao foi possivel parar o processo {0}: {1}" -f $tunnelPid, $_.Exception.Message)
}
