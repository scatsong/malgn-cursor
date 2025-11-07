# start-server.ps1
# 로컬 개발용 간단한 스크립트: Python HTTP 서버를 실행합니다.
$python = Get-Command python -ErrorAction SilentlyContinue
if(-not $python){ Write-Host "python이 시스템에 설치되어 있지 않거나 PATH에 없습니다."; Write-Host "Python 3을 설치하거나 'python' 명령을 PATH에 추가하세요."; exit 1 }
Write-Host "서버를 시작합니다: http://127.0.0.1:8000";
cd $PSScriptRoot
python -m http.server 8000 --bind 127.0.0.1
