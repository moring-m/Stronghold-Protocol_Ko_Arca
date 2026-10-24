# 로컬 개발 서버에 Cloudflare 고정 주소 연결

예: `dev.ming.party` → 로컬 개발 서버. 기존 운영 주소 `web.ming.party`와 별도의 서브도메인을 사용한다.

## 먼저 구분할 점

`cloudflared`는 **Node 개발 서버가 실행 중인 환경에** 설치한다.

| 공개할 서버 | 커넥터 실행 위치 | Cloudflare 서비스 URL |
|---|---|---|
| 현재 Codex 개발 서버 | 현재 Codex Linux 환경 | `http://127.0.0.1:3033` |
| Windows PC에서 직접 실행한 서버 | 같은 Windows PC | 그 서버 포트, 예: `http://127.0.0.1:3000` |

Windows에서 `cloudflared`를 실행하면서 `localhost:3033`을 지정하면 Codex가 아니라 Windows 자신의 3033 포트로 연결된다.

## 대시보드에서 고정 주소 만들기

1. 보유 도메인을 Cloudflare에 추가하고 DNS가 활성 상태인지 확인한다. 새 도메인을 구매할 필요는 없다. Cloudflare DNS를 아직 사용하지 않으면 도메인 등록업체에서 Cloudflare가 안내한 네임서버로 변경해 활성화한다.
2. Cloudflare 대시보드의 **Networking → Tunnels → Create a tunnel**에서 `stronghold-dev` 같은 이름으로 터널을 만든다. 계정에 따라 Cloudflare One/Zero Trust의 네트워크·커넥터 메뉴로 표시될 수도 있다.
3. 실제 서버가 실행 중인 운영체제를 선택하고, 화면의 설치 및 실행 명령을 **그 환경에서** 실행한다. 현재 Codex 서버를 연결한다면 Linux용 커넥터가 필요하다. 커넥터가 연결되면 Continue를 누른다.
4. 터널의 **Routes → Add route → Published application**을 선택한다.
5. Subdomain에 `dev`, Domain에 `ming.party`를 선택한다. Path는 비운다. Service URL에 현재 Codex 서버라면 **`http://127.0.0.1:3033`**을 입력한다. 프로토콜과 주소가 분리된 화면이면 HTTP와 `127.0.0.1:3033`을 각각 선택한다.
6. Add route로 저장한다. 터널 상태가 Healthy이면 **`https://dev.ming.party/`**로 접속한다. 이 주소는 터널을 재시작해도 동일하다.

실제 도메인이 다르면 예시 `ming.party`만 보유 도메인으로 바꾼다. 같은 호스트 이름으로 기존 DNS 레코드가 있으면 충돌 여부를 확인한다. 이 문서의 절차를 작성하면서 실제 DNS나 Cloudflare 계정은 변경하지 않았다.

## Windows PC의 서버를 연결하는 경우

PowerShell에서 설치:

```powershell
winget install --id Cloudflare.cloudflared --exact
```

설치 후 새 PowerShell을 열고, 대시보드가 제시한 토큰으로 실행한다:

```powershell
cloudflared tunnel run --token "대시보드에서_복사한_토큰"
```

부팅 시 자동 실행하려면 관리자 PowerShell에서 대시보드의 Windows 서비스 설치 명령을 사용한다. 일반적인 형식은 다음과 같다:

```powershell
cloudflared service install "대시보드에서_복사한_토큰"
```

개발 서버도 별도로 실행 중이어야 한다. 토큰은 해당 터널의 연결 권한이므로 공개 로그나 저장소에 넣지 않는다.

## 현재 Codex 환경에 연결하는 경우

대시보드에서 Linux를 선택해 안내된 `cloudflared` 설치 명령을 이 환경에서 실행한다. 이후 안내된 토큰 실행/서비스 명령으로 커넥터를 시작하고, 서비스 URL을 `http://127.0.0.1:3033`으로 등록한다. 현재 터널모울 URL을 Cloudflare 서비스 URL에 입력하는 방식이 아니다.

고정되는 것은 주소다. Codex 작업 환경·Node 서버·커넥터 중 하나가 종료되면 접속할 수 없다. 작업 환경이 교체되면 새 환경에서 동일 터널의 커넥터를 다시 실행해야 하며 주소는 유지할 수 있다. 상시 접속이 목적이면 개발 서버와 커넥터를 계속 실행할 별도 PC/VPS가 필요하다.

공식 절차: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel/
