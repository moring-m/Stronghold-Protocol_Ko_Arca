> 이 배치는 겹침과 지형 절단 문제로 폐기되었습니다. [최종 원본 배치 복원 결과](../boss-original-layout/README.md)를 참고하세요.

# 보스전 후방 배경 보완

보스 전장은 0~6행을 사용하지만 연합방어 전장은 6~13행을 사용한다. 일반 전장 제거 후 먼 배경만 남아 보스전 뒤쪽이 과하게 비어 보였다.

맵별 연합방어 후방의 원본 장식/지형 메시를 보스 전장 뒤쪽으로 7행 옮겨 배치했다. 원본 UV와 조명 머티리얼은 유지한다. 전장 플랫폼과 적 확인 타일은 복제하지 않으며 전투 좌표, 이동 경로, 유닛 위치는 바꾸지 않았다. 일반/히든 보스전과 보스전 준비 화면이 같은 보스 영역 설정을 사용하므로 모두 적용된다. 원본 장면이 없는 대체 맵에는 기존 배경을 유지한다.

각 맵에서 같은 카메라로 비교했다. `수정 전`은 추가된 배경 메시만 숨겨 이전 구성을 재현한 화면이며, 테스트용 유닛 일부는 대체 초상화로 표시된다.

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

## 검증

- 보드 및 생명주기 테스트 47개 통과.
- 배경 이동 시 UV 보존, 전장 플랫폼 제외, 일반 전장 내부의 장식 제외 회귀 검사 포함.
- [11개 맵 브라우저 결과](results.json).
- EC2 배포는 수행하지 않았다.
