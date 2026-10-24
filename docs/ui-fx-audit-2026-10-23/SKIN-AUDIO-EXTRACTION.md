# 스킨 SFX 추가 추출

기존 추출 도구 폴더(START.ps1, .venv, work가 있는 곳)에 이 ZIP을 풀어 주세요. 클라이언트 설치 폴더에 넣을 필요는 없습니다.

PowerShell에서 해당 폴더로 이동한 후:

```powershell
.\EXPORT-AUDIO.ps1
```

기존에 준비한 가장 최근 work\client-*에서 별도 음원만 읽습니다. 기존 FX 출력과 클라이언트 파일은 변경하지 않습니다. 준비된 폴더를 직접 지정하려면:

```powershell
.\EXPORT-AUDIO.ps1 -ClientView 'C:\MyFolder\Assets\arknights-cn-skin-fx-kit\work\client-실제폴더명'
```

Python 3.12로 이미 생성된 .venv를 사용합니다. 새 Python 3.15를 설치하거나 C++ Build Tools를 설치할 필요는 없습니다. .venv가 없다면 먼저 기존 추출 도구의 설치 절차를 완료해야 합니다.

현재 공식 audio_data에서 확인된 스카디 더 커럽팅 하트 iteration#2, 이그제큐터 디 엑스 포에데레 sanrio#2, 에이야퍄들라 sanrio#2, 골든글로우 sanrio#1의 음원 은행을 기준으로 찾습니다. 다른 최신 스킨은 해당 클라이언트의 audio_data와 연결 정보가 추가로 필요합니다.

결과 skin-audio-날짜-고유값 폴더의 audio, audio-report.json, audio_data.txt(추출된 경우)를 묶어 전달하면 됩니다. 디코딩에 성공한 음원만 found에 포함됩니다. 0개이거나 오류가 있으면 보고서를 함께 전달해 주세요. 클라이언트에서 AudioClip 번들이 빠졌거나 해당 스킨이 설치되지 않았을 수 있습니다. Windows 실클라이언트에서의 실행은 아직 검증하지 못했습니다.
