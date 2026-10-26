---
name: project-check
description: 이 프로젝트의 변경 범위에 맞는 검사와 테스트를 선택하고 결과를 한국어로 정리합니다.
disable-model-invocation: true
---

먼저 루트 CLAUDE.md와 git diff를 읽는다. 코드를 변경하거나 커밋·배포하는 명령은 이 검증 절차에 포함되지 않는다.

1. `git diff --check`와 `node tools/check-imports.mjs --strict`를 실행한다.
2. 변경 분야에 해당하는 테스트를 고른다. 전부 무조건 실행하지 않는다.

| 분야 | 우선 테스트 |
| --- | --- |
| 기록·통계 | `node --test test/ui/stats.test.js test/ui/match-records-stats.test.js` |
| 맹약 목록·선발 | `node --test test/ui/gameLogic.test.js test/ui/morph-bonds.test.js test/ui/feedback846-diy-granted.test.js` |
| 공격 모션 | `node --test test/render/attack-ready-pose.test.js test/render/attack-recovery-progress.test.js test/render/diver-attack-recovery.test.js` |
| SFX | `node --test test/skill-start-sfx.test.js test/ui/skill-mode-sfx-023.test.js test/ui/audio-pools.test.js test/ui/skin-sfx.test.js` |
| 전투 포기 | `node --test test/ui/end-battle-request.test.js test/match/end-battle.test.js test/match/runner.test.js` |
| 최근 전투 제보 | `node --test test/sim/feedback-20261026.test.js test/ui/player-health.test.js` |
| 릴리즈 라우팅 | `node --test test/release/*.test.js test/ui/buildGuard.test.js test/client-connect-timeout.test.js test/client-identity-handshake.test.js` |

3. 관련된 실제 브라우저 테스트가 있다면 Chromium 실행 경로를 먼저 확인하고 실행한다.
   - Bash: `SP_E2E=1 node --test test/ui/stats-detail-storage.browser.test.js`
   - PowerShell: `$env:SP_E2E='1'; node --test test/ui/stats-detail-storage.browser.test.js`
   - 이 테스트는 현재 `/usr/bin/chromium`을 사용하므로 Windows에서는 테스트의 경로 설정을 먼저 확인한다. 실행 불가를 통과로 보고하지 않는다.
4. 실패는 변경 전에도 발생했는지 비교한다. 테스트 기대값을 바꿀 때에는 사용자가 요청한 동작 변경 때문인지 확인한다.
5. 어떤 테스트를 실행했는지, 통과/실패/건너뜀 수, 실제로 검증하지 못한 환경을 정리한다. 전체 테스트를 실행하지 않았다면 전체 통과라고 표현하지 않는다.
