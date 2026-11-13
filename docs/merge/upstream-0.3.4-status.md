# 상류 0.3.4(规程·序列Ⅰ) 병합 진행 상황

브랜치: `merge-upstream-0.3.4` (원본 `sganggs/stronghold-protocol` dev `44431217bb`, 포크 기준 `bc926470c`).

## 방향 (사용자 결정)

- 원본 UI 변경은 들여오지 않는다. 기존(포크) UI에 맞춰 **새 시즌(规程·序列Ⅰ)만** 들여온다.
- 시즌은 방에서 고른다(로비 시즌 탭, 방 화면 시즌 선택). 기본 시즌은 맹약 2기 후반.
- 「선택자편」 같은 시즌 개선점은 맹약 시즌에도 반영한다 — 포크의 선발 선택(RECRUIT_PICK)이 같은 역할이다.
- 시즌 아트(원본의 UI 테마/공식 스킨 팩)는 맹약 시즌과 바꿔 쓸 수 있게 한다 → **남은 작업**(아래).

## 구조

| 영역 | 기본(맹약) 시즌 | 규정 시즌 |
|---|---|---|
| 매치 진행 | `server/match/` = 포크 그대로 | `server/match-upstream/` = 원본 `server/match/` 그대로. 포크 `Match` 생성자가 규정 시즌(opts.version 또는 data.config.version.family)이면 원본 `Match`를 만든다 |
| 봇 | 포크 `server/match/bot.js` | 원본 봇(`match-upstream/bot.js`, 전략 선택기 포함) |
| 전투 시뮬레이션 | `server/sim/` = 포크 그대로 | `server/sim-upstream/` = 원본 `server/sim` 그대로(브라우저는 `/sim-upstream/`, `public/js/battle/simLoader.js`가 시즌으로 고름) |
| 데이터 | `data/*.json` = 포크 그대로 | `data/versions/<slug>/` (원본) |
| 로비 | 포크 로비 + 시즌 이식(room.version·modeId, room.create {version, modeId}, room.proposeVersion = 즉시 전환, 규정 등급 room.setMode) | 다른 시즌 방의 매치는 시즌 매치 호스트(별도 프로세스)에서 실행 |
| 클라이언트 | 포크 UI | 같은 포크 UI + 시즌 데이터 로딩(`public/js/content.js`·`versions.js`는 원본), 핵심 맹약 그룹 선택(브리핑), 선택자편 화면(`screens/diyCheck.js`), 전략 명령 패널(`ui/commandPanel.js`) |

## 검증

- 기본 시즌: 포크 기준과 같은 테스트 묶음(test/match, test/content, test/lobby*) 비교. 결과는 아래 「최근 결과」.
- 규정 시즌: 원본 테스트를 `server/match-upstream/` 기준으로 돌린다(원본 테스트는 `server/match/`를 가리키므로 경로를 바꿔 실행).
- 실제 브라우저: 로비 시즌 탭 → 규정 방 생성 → 브리핑(핵심 맹약 그룹 A/B) → 전략 선택 → 1라운드 준비(상점·배치)까지 확인.

## 남은 작업

1. 시즌 아트 교체: 원본의 공식 스킨 팩은 사용자 PC의 게임 클라이언트에서 `tools/local-extract/autochess_themes.py`로 추출해야 한다. 이 환경에는 원본 클라이언트가 없어 추출·리소스 저장소 업로드를 못 했다. 포크 UI 테마(`public/js/ui/uiThemes.js`)에 규정/맹약 시즌 아트 테마로 넣는 작업이 남음.
2. (해결) 규정 시즌 전투는 원본 코드 그대로 실행 — 원본 규정 테스트(경로만 바꿔 실행) 228개 중 227개 통과.
3. (해결) 규정 데이터 한국어 `public/i18n/ko/regulation.json`: 공식 KR 테이블(오퍼레이터·스킬·재능·모듈·적, CN 문장이 데이터와 정확히 일치할 때만) → arknights1234.github.io(전략·맹약·장비 이름과 효과) → 기존 번역 패턴 → 미출시 항목 직접 번역(비공식). 데이터 문자열 13,008개 중 12,804개. 나무위키는 자동 접근이 차단(403)되어 참조하지 못함.
4. 규정 장비 줄(8번째 줄 5칸) 표시 확인, 브라우저 전투 단계 확인.
5. 패치노트·버전(0.3.4a), 원본 테스트 정리, 리소스 저장소.
