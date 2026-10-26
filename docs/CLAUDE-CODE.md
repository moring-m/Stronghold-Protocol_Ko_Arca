# Claude Code에서 시작하기

이 저장소는 일반 Node.js 프로젝트다. 소스나 게임 데이터를 Claude 전용 형식으로 변환할 필요는 없다.
루트 `CLAUDE.md`를 Claude Code가 읽고, `.claude/settings.json`과 `/project-check` 개발 스킬을 사용한다.
Claude의 API 키·로그인 정보나 이 Codex 세션의 인증 정보는 프로젝트에 포함하지 않는다.

## 현재 폴더에서 사용

Claude Code를 설치하고 로그인한 PC에서 저장소 루트로 이동한다.

```powershell
cd C:\MyFolder\Stronghold-Protocol_Ko_Arca
npm ci
claude
```

Claude Code 설치는 [공식 안내](https://code.claude.com/docs/en/setup)를 따른다.
Node.js 24와 Git이 필요하다. Python·Docker는 기본 실행에는 필요하지 않고 일부 리소스 추출/재생성에만 사용한다.

Claude Code에서 아래처럼 시작하면 된다.

```text
CLAUDE.md와 docs/CLAUDE-HANDOFF.md를 읽고 현재 git diff를 확인해.
기존 미커밋 수정은 보존하고, 현재 작업 상태부터 확인해줘.
커밋/푸시는 내가 요청할 때만 해.
```

다른 PowerShell 창에서 실행한다.

```powershell
cd C:\MyFolder\Stronghold-Protocol_Ko_Arca
npm run dev:local
```

접속: `http://localhost:3000`. 다른 포트가 필요하면 실행 전에 `$env:PORT='3045'`를 설정한다.
`.cache/local-production/`가 없는 새 PC에서는 공식 리소스 캐시가 비어 있다는 안내가 나올 수 있다.
운영용 리소스 목록을 줄이거나 다른 카탈로그로 바꾸지 말고, 기존 리소스 다운로드 절차를 사용한다.

## 다른 PC로 현재 작업 옮기기

**현재 미커밋 수정은 GitHub에서 clone만 하면 포함되지 않는다.**
인계 묶음의 기준 커밋과 패치를 함께 적용해야 한다.

1. 인계 ZIP을 저장소 밖의 폴더에 압축 해제한다.
2. 이 한국어 포크를 clone한다. 원본 저장소 주소와 혼동하지 않는다.
3. 기준 커밋에서 개발 브랜치를 만들고 인계 스크립트를 실행한다.

```powershell
git clone https://github.com/moring-m/Stronghold-Protocol_Ko_Arca.git
cd Stronghold-Protocol_Ko_Arca
git switch -c claude-work 6dcd777619393a772e35a9f38da63fc62f6fa16b
powershell -ExecutionPolicy Bypass -File C:\MyFolder\claude-handoff\APPLY.ps1 -Repository (Get-Location).Path
npm ci
claude
```

`APPLY.ps1`은 로컬에서 패치와 새 파일만 적용한다. 기준 커밋·패치 충돌·새 파일 덮어쓰기를 먼저 검사하고, 커밋·푸시·배포는 하지 않는다.
이미 수정한 작업 폴더에서는 새 파일 충돌로 중단될 수 있으므로 별도 clone에서 시작하는 것이 편하다.

인계 묶음에는 `.git` 이력, `node_modules`, `.cache`, 개인 인증 정보, 추출 중간 산출물이 없다.
기본 소스·기존 리소스는 clone한 저장소에서 받고, **현재 미커밋 변경과 새 파일**은 인계 묶음에서 받는다.
이전 Codex 대화 전체가 Claude에게 자동으로 전달되는 것은 아니므로 `CLAUDE-HANDOFF.md`에 현재 상태와 주요 요청을 정리했다.

## 검증

Claude Code에서 `/project-check`를 실행해 변경 분야에 맞는 검증을 선택한다.
수동 기본 검사는 다음과 같다.

```powershell
git diff --check
node tools/check-imports.mjs --strict
node --test test/ui/stats.test.js test/ui/gameLogic.test.js test/sim/feedback-20261026.test.js
```

실제 브라우저 테스트는 Chromium과 테스트 내 실행 경로가 맞아야 한다.
`test/ui/stats-detail-storage.browser.test.js`의 현재 경로는 `/usr/bin/chromium`이므로 Windows에서는 PC의 Chromium/Chrome 경로에 맞춘 후 실행한다.

```powershell
$env:SP_E2E='1'
node --test test/ui/stats-detail-storage.browser.test.js
Remove-Item Env:SP_E2E
```

최근 검증 범위와 기존 실패는 [작업 인계](CLAUDE-HANDOFF.md)에 있다.

## 개인 설정과 배포

- 공유 설정: `.claude/settings.json`, `.claude/skills/`.
- 개인 설정: `.claude/settings.local.json`, `CLAUDE.local.md` — Git에서 제외한다.
- MCP나 게임 플러그인은 새로 추가하지 않았다. Claude 개인 인증은 해당 PC에서 설정한다.
- `master` 푸시는 운영 자동 배포로 이어질 수 있다. 개발을 시작했다는 이유로 푸시하지 않는다.
