# 유키 마코토 다국어 텍스트

2026-10-24 확인 기준, YoStar 영어·일본어 character_table에는 `char_4217_makoto`가 없다. 미출시 텍스트를 공식 번역이라고 표기하지 않는다.

| 언어 | 사용 근거 |
|---|---|
| 한국어 | 사용자가 지정한 [나무위키 커뮤니티 번역](https://namu.wiki/w/유키%20마코토(명일방주)), 기존 문구 유지 |
| 중국어 | 추출한 `content/custom/makoto/official.json`의 공식 특성·스킬·재능·모듈 텍스트. 스킨명은 [공식 클라이언트 데이터 미러](https://github.com/Kengxxiao/ArknightsGameData/blob/master/zh_CN/gamedata/excel/skin_table.json)의 **见证荣光** |
| 일본어 | [일본 커뮤니티 위키](https://arknights.wikiru.jp/?結城理)의 특성·재능·스킬 설명과 인형사 용어. 아직 중국어로 남아 있는 제목·스킨명은 원문을 번역하여 보완 |
| 영어 | 공식 중국어 원문을 번역하여 보완. Persona 고유명은 Makoto Yuki / Orpheus / Thanatos / S.E.E.S. 사용. 영어 커뮤니티 위키는 HTTP 403으로 본문 확인 불가하여 출처로 주장하지 않음 |

각 언어 JSON에 출처와 공식 여부를 기록했다. 영문·일문 공식판이 출시되면 해당 명칭과 문구로 교체할 수 있다.

## 적용 범위

5·6단계 × 기본·정예의 이름, 직군, 특성, 세 스킬, 두 재능, 모듈, 스킨, 잠재능력별 설명. 언어별 119개 문자열 경로를 생성하며 전투 수치와 리소스 ID는 바꾸지 않는다. 원본 설명에 있는 수동 재사용 문구는 유지하며, 게임의 자동 사용은 대역 중 재사용을 하지 않는 기존 정책을 유지한다.

`tools/build-makoto-i18n.mjs`가 전투와 동일한 blackboard로 수치를 채운다. 영어·일본어는 데이터 overlay와 표시용 사전 모두 갱신하고, 중국어는 중국어 모드의 기존 사전 경로에 연결한다. `tools/build-language-packs.mjs`로 다운로드 크기·SHA-256도 갱신했다.

재생성:

```sh
node tools/build-makoto-i18n.mjs
node tools/build-language-packs.mjs
node --test test/makoto-i18n.test.js test/version.test.js
```

번역·버전·마코토 전투·전환 관련 46개 테스트 통과. 별도 후속 렌더·배치·타격 테스트 70개 통과. 전체 테스트 성공을 의미하지 않는다.
