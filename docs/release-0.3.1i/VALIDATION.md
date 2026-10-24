# v0.3.1i 검증

- 번역·버전·마코토 전투·전환·공격·배치 회귀 테스트: 79개 통과, 실패/생략 0개.
- import 경계 검사 통과, 번역 생성기·테스트 ESLint 오류 0개, setup --check --no-local 통과.
- 언어팩 파일 크기·SHA-256 재생성.
- 전체 npm test와 별도 v0.3.1h1 사본 비교 실행을 시도했으나 다수 실패와 장시간 전투 테스트로 완료하지 않고 중단했다. 전체 테스트 통과를 주장하지 않는다.
- 중단 시 관측된 최상위 실패: 현재 343개, 이전 버전 사본 863개. 두 실행은 진행 범위와 로컬 리소스가 달라 개수의 직접 비교는 유효하지 않다. 동일한 실패 이름 209개를 관측했으며 모든 실패가 기존 문제라고 판정하지 않았다.

두 실행에서 동일하게 관측한 예:

- --test-mode sets SP_TEST_MODE; off removes an inherited one; no flag keeps it
- 1_08 德克萨斯: 战术快递 +DP at start; 剑雨 +cost DP, 2×atk_scale arts on every enemy in the skill grid, stun
- 1_09 跃跃 回环射手: each attack is a boomerang (out 15, back 3.75 tiles/s); faster than its flight she waits for the catch; 乐趣加倍 hits land together
- 1_16 锡人: “大拉里” zone — ground enemies take atk_scale × ATK arts/s, allies inside get 生命回复速度 (PRTS 备注: no heal); elite 凋敝魂灵 + module SP
- 1_17 深靛: 光影迷宫 interval ×0.7, bound enemies take 12 % ATK every 0.5 s and are never targeted; 柔光缚目 binds
- 2_05 哈洛德 (user playtest \#5 \#3): 侵蚀 counts as element damage for 重症优先 and 我即军营
- 2_05 哈洛德 S1 治疗强化·γ型: ATK +atk; the 重症优先 target order is S2-only (lowest HP first)
- 2_05 哈洛德: 重症优先 heals the heaviest element load first with ×trait_scale recovery; 我即军营 element resistance
