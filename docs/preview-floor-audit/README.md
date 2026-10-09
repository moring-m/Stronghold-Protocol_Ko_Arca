# 적 확인 바닥 및 리소스 다운로드 수정

원본 맵을 읽은 뒤에도 공통 회색 유리 바닥을 덧그려 맵별 바닥 텍스처와 조명을 가리고 있었다. 원본 장면에서는 이 덮개를 제거했다. 원본 장면이 없는 대체 맵의 공통 바닥은 유지한다.

현재 등록된 원본 맵 11개를 같은 적 확인 카메라에서 점검했다. 아래 `수정 전`은 동일 장면에 이전 코드의 `board.buckets.glass` 덮개를 다시 추가해 재현한 화면이며, `수정 후`는 수정된 렌더링이다. 테스트용 적 모델 일부는 대체 초상화로 표시되지만 바닥과 배경은 실제 맵 데이터로 렌더링했다.

| 맵 | 수정 전 | 수정 후 |
| --- | --- | --- |
| act1autochess_m01 | [수정 전](act1autochess_m01-before.jpg) | [수정 후](act1autochess_m01-after.jpg) |
| act1autochess_m02 | [수정 전](act1autochess_m02-before.jpg) | [수정 후](act1autochess_m02-after.jpg) |
| act1autochess_m03 | [수정 전](act1autochess_m03-before.jpg) | [수정 후](act1autochess_m03-after.jpg) |
| act1autochess_m04 | [수정 전](act1autochess_m04-before.jpg) | [수정 후](act1autochess_m04-after.jpg) |
| act1autochess_m05 | [수정 전](act1autochess_m05-before.jpg) | [수정 후](act1autochess_m05-after.jpg) |
| act1autochess_m06 | [수정 전](act1autochess_m06-before.jpg) | [수정 후](act1autochess_m06-after.jpg) |
| act1autochess_m07 | [수정 전](act1autochess_m07-before.jpg) | [수정 후](act1autochess_m07-after.jpg) |
| act2autochess_m01 | [수정 전](act2autochess_m01-before.jpg) | [수정 후](act2autochess_m01-after.jpg) |
| act2autochess_m02 | [수정 전](act2autochess_m02-before.jpg) | [수정 후](act2autochess_m02-after.jpg) |
| act2autochess_m03 | [수정 전](act2autochess_m03-before.jpg) | [수정 후](act2autochess_m03-after.jpg) |
| act2autochess_m04 | [수정 전](act2autochess_m04-before.jpg) | [수정 후](act2autochess_m04-after.jpg) |

## 리소스 실패

`/assets/skill/skcom_assist_cost_3_.png`는 로컬 저장 경로다. 원격 저장소의 실제 파일은 `skill_icon_skcom_assist_cost[3].png`다. 저장 경로에서 파일명을 역산하던 생성기를 원본 스킬 ID로 주소를 만들도록 수정했다. 동일한 문제의 22개 스킬 아이콘 모두 실제 다운로드 HTTP 200과 응답 본문 수신을 확인했다. 운영용 리소스 목록과 버전을 재생성했다.

## 검증

- 보드/적 확인/보드 생명주기 관련 테스트: 55개 통과.
- 원본 바닥 유지 및 보스 준비 화면에서도 덮개 미생성, 대체 맵 바닥 유지 회귀 검증 포함.
- 11개 맵 브라우저 결과: [results.json](results.json).
- EC2 배포는 수행하지 않았다.
