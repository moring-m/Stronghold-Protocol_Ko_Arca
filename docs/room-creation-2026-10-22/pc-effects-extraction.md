# PC 클라이언트 공식 이펙트 추출 (Windows / PowerShell)

현재 프로젝트의 추출기는 Unity AssetBundle에서 이펙트 프리팹·텍스처·메시와 오퍼레이터/스킬 연결 정보를 함께 내보낸다. 동영상이나 PNG 캡처만으로는 공식 이펙트를 연결할 수 없다. 디아만테의 클라이언트 ID는 `char_499_kaitou`다.

## 1. 준비

PC 클라이언트를 최신으로 업데이트하고 게임 내 추가 리소스 다운로드를 완료한 뒤 종료한다. 이 저장소의 로컬 복사본과 Python 3.11 이상, Node.js가 필요하다. 아래 명령은 **저장소 폴더의 PowerShell**에서 실행한다.

```powershell
py -3 -m venv .venv-extract
& .\.venv-extract\Scripts\python.exe -m pip install --upgrade pip
& .\.venv-extract\Scripts\python.exe -m pip install -r .\tools\local-extract\requirements.txt
```

## 2. 클라이언트 AB 경로 지정

실제 설치 경로에 맞게 첫 줄을 변경한다. 런처 폴더가 아닌 `AB\Windows` 폴더가 대상이다. 경로에 공백이 있어도 아래와 같이 변수로 전달하면 된다.

```powershell
$clientAb = 'C:\Program Files\Hypergryph Launcher\games\Arknights\Arknights_Data\StreamingAssets\AB\Windows'
Test-Path -LiteralPath $clientAb
Get-ChildItem -LiteralPath $clientAb -Directory
```

`Test-Path`가 `True`여야 한다. 버전에 따라 `battle\prefabs\effects` 또는 `pkgrps` 아래에 이펙트 번들이 있다. 구버전 클라이언트에 없는 이펙트는 추출할 수 없다.

## 3. 현재 게임의 공식 이펙트 전체 추출

샘플 모드 대신 **`--fx-set used`**를 지정해야 디아만테를 포함한 현재 게임 목록의 오퍼레이터와 스킬을 조사한다. 첫 실행은 PC 성능과 클라이언트 크기에 따라 오래 걸릴 수 있다.

```powershell
& .\.venv-extract\Scripts\python.exe .\tools\local-extract\extract.py --game $clientAb --only fx --fx-set used --fx-jobs 4 2>&1 | Tee-Object -FilePath .\fx-extract.log
```

출력물:

- `public/assets/local/fx/` 전체: `index.json`, 프리팹, 텍스처, 메시, 연결 정보
- `data/local-fx.json`: 다운로드/패키징용 파일 목록
- `fx-extract.log`: 누락과 실패 원인 확인용 로그

기존 추출물에 덮어쓰므로, 필요하면 `public/assets/local/fx`와 `data/local-fx.json`을 먼저 다른 위치에 복사한다. `--fx-keys`는 프리팹 이름을 이미 아는 경우의 부분 갱신용이며, 최초 추출에는 사용하지 않는다. `--out`만 바꾸면 목록 경로가 따로 남으므로 출력 경로를 바꾸려면 `--manifest`도 함께 지정해야 한다.

## 4. 디아만테 포함 여부 및 연결 점검

```powershell
Select-String -Path .\public\assets\local\fx\index.json -Pattern 'char_499_kaitou'
node .\tools\vfx-skill-coverage.mjs --index .\public\assets\local\fx\index.json --list > .\fx-coverage.txt
```

이펙트 파일이 있어도 스킬 이벤트·방향·좌표 연결이 없으면 화면에 바로 표시되지는 않는다. `index.json`의 유닛/스킬 연결과 coverage 보고서를 바탕으로 프로젝트 렌더러에 연결하고 실제 전투에서 확인해야 한다. 일부 원본 셰이더는 웹 렌더러에서 별도 대응이 필요하다.

연결 작업을 이어가려면 `public/assets/local/fx/` **전체**, `data/local-fx.json`, `fx-extract.log`, `fx-coverage.txt`를 묶어 제공하면 된다. 게임 클라이언트 전체는 필요하지 않다. 대용량 파일은 Git 커밋 대신 파일 공유로 전달하면 된다.

이 환경에는 PC 클라이언트가 없어 실제 클라이언트 추출 자체는 실행하지 않았다. 명령과 출력 경로는 현재 저장소의 추출기 구현을 기준으로 확인했다.
