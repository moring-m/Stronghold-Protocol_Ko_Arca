# v0.3.3a

2026-10-25. 원본 v0.3.2/v0.3.3 선별 병합 이후의 전투·공식 FX/SFX·프리셋 연동·UI 수정 묶음이다. 사용자 추가 규칙과 기존 배포/라우터 구성은 유지한다. 앱 표시는 0.3.3a, 패키지 기본 버전은 0.3.3이다.

[사용자용 패치노트](../../../CHANGELOG.md) · [원본 125항목 판단표](../../upstream-0.3.2-0.3.3-review/decisions.md) · [후속 FX/SFX 수정](../../fx-audio-feedback-2026-10-25/README.md) · [포기 정산](../../surrender-clock-fix-2026-10-25/README.md) · [마코토 방향](../../makoto-up-facing-2026-10-25/README.md) · [프리셋/배율](../../preset-links-ui-scale-2026-10-25/README.md) · [번역/목록 정리](../../preset-label-fix-2026-10-25/README.md).

마지막 UI 조정: 전략 초상화는 프리셋 버튼의 위아래 높이를 채우고, 진영 아이콘은 기존 크기를 유지한다. [실제 Chromium 화면](preset-portrait-height.png).

## 검증

- 기존 병합 집중 검사 699개: **697 통과, 2 조건부 생략, 실패 0**. [로그](focused-tests.log).
- 버전/패치노트/패키지/README 일관성 5개 통과. [로그](version-tests.log).
- 후속 프리셋/번역/수배/모바일 배율 검증은 위 연결된 문서에 별도 기록한다. headless 환경에서는 실제 휴대폰의 네이티브 전체화면을 검증하지 못했다.
- `node tools/setup.mjs --check --no-local`, strict import, `git diff --check` 통과.
- 전체 `npm test` 시도에서는 별도 실패가 발생했다. 이후 장시간 실행되는 전체 매치 검사가 남아 실행을 중단했으므로 전체 테스트 성공으로 집계하지 않는다. [시도 상태·실패 목록](full-suite-attempt.json).
- 대표 실패군 3파일을 수정 전 i2와 비교한 결과 **양쪽 123개 중 85 통과/38 실패, 새 실패 0**이었다. [전후 비교](baseline-comparison.json). 이는 전체 실패가 모두 기존 실패라는 입증은 아니다.

전체 CI 통과나 자동 배포 완료를 보장하지 않는다. 실패를 숨기기 위해 테스트를 제외하거나 CI 검사를 완화하지 않았다.
