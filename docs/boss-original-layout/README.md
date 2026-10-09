> 폐기된 검토안입니다. 위쪽에 일반 전장을 추가한 구성은 사용자 요구와 달라 적용하지 않습니다. 아래 내용과 화면은 비교 기록입니다.

# 보스전 배경: 원본 좌우 전장과 중앙 적 확인 구역

사용자 결정: 보스와 아군의 전투 위치는 그대로 유지하고, 위쪽에 원본의 좌우 전장과 중앙 적 확인 구역을 배경으로 표시한다.

## 최종 변경

- 보스전, 히든 보스전, 보스전 준비 화면과 적 확인 화면은 원본 맵의 전체 지형을 표시한다.
- 전투/배치 영역은 기존 0~6행을 유지한다. 위쪽 7~18행은 배경이며 보스/아군 위치, 이동 경로, 카메라 기준은 바꾸지 않았다.
- 배경을 잘라 이동/복제하던 코드는 제거했다. 메시, UV, 원본 조명과 물가 연결은 원래 배치를 사용한다.
- 간단한 대체 맵에서도 같은 배경 영역을 표시하고, 원본 맵에는 공통 회색 적 확인 바닥을 덧그리지 않는다.

## 비교

기존안은 장식 메시를 복제/절단해서 옮겨 겹침과 끊김이 발생했다. 그 방식은 폐기했다. 아래 수정 전 화면은 그 기존안이며, 수정 후는 원본 배치를 복원한 화면이다. 테스트용 유닛 일부는 대체 초상화로 표시된다.

| 맵 | 기존안 | 수정 후 | 준비 왼쪽 | 준비 오른쪽 |
| --- | --- | --- | --- | --- |
| act1autochess_m01 | [기존안](act1autochess_m01-before.jpg) | [수정 후](act1autochess_m01-after.jpg) | [왼쪽](act1autochess_m01-prep-L.jpg) | [오른쪽](act1autochess_m01-prep-R.jpg) |
| act1autochess_m02 | [기존안](act1autochess_m02-before.jpg) | [수정 후](act1autochess_m02-after.jpg) | [왼쪽](act1autochess_m02-prep-L.jpg) | [오른쪽](act1autochess_m02-prep-R.jpg) |
| act1autochess_m03 | [기존안](act1autochess_m03-before.jpg) | [수정 후](act1autochess_m03-after.jpg) | [왼쪽](act1autochess_m03-prep-L.jpg) | [오른쪽](act1autochess_m03-prep-R.jpg) |
| act1autochess_m04 | [기존안](act1autochess_m04-before.jpg) | [수정 후](act1autochess_m04-after.jpg) | [왼쪽](act1autochess_m04-prep-L.jpg) | [오른쪽](act1autochess_m04-prep-R.jpg) |
| act1autochess_m05 | [기존안](act1autochess_m05-before.jpg) | [수정 후](act1autochess_m05-after.jpg) | [왼쪽](act1autochess_m05-prep-L.jpg) | [오른쪽](act1autochess_m05-prep-R.jpg) |
| act1autochess_m06 | [기존안](act1autochess_m06-before.jpg) | [수정 후](act1autochess_m06-after.jpg) | [왼쪽](act1autochess_m06-prep-L.jpg) | [오른쪽](act1autochess_m06-prep-R.jpg) |
| act1autochess_m07 | [기존안](act1autochess_m07-before.jpg) | [수정 후](act1autochess_m07-after.jpg) | [왼쪽](act1autochess_m07-prep-L.jpg) | [오른쪽](act1autochess_m07-prep-R.jpg) |
| act2autochess_m01 | [기존안](act2autochess_m01-before.jpg) | [수정 후](act2autochess_m01-after.jpg) | [왼쪽](act2autochess_m01-prep-L.jpg) | [오른쪽](act2autochess_m01-prep-R.jpg) |
| act2autochess_m02 | [기존안](act2autochess_m02-before.jpg) | [수정 후](act2autochess_m02-after.jpg) | [왼쪽](act2autochess_m02-prep-L.jpg) | [오른쪽](act2autochess_m02-prep-R.jpg) |
| act2autochess_m03 | [기존안](act2autochess_m03-before.jpg) | [수정 후](act2autochess_m03-after.jpg) | [왼쪽](act2autochess_m03-prep-L.jpg) | [오른쪽](act2autochess_m03-prep-R.jpg) |
| act2autochess_m04 | [기존안](act2autochess_m04-before.jpg) | [수정 후](act2autochess_m04-after.jpg) | [왼쪽](act2autochess_m04-prep-L.jpg) | [오른쪽](act2autochess_m04-prep-R.jpg) |

## 검증

- 보드/생명주기/맵 테스트 54개 통과, 화면 영역 관련 UI 테스트 2개 통과.
- 11개 원본 맵의 좌우 배경 전장 및 중앙 적 확인 구역 존재 확인. 배경 복제 메시가 없음을 확인.
- [브라우저 점검 결과](results.json).
- EC2 배포는 수행하지 않았다.
