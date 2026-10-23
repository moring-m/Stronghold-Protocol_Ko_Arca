# 스킨 투사체 발사점 점검

## 원인과 수정

- 스킨 추출 결과는 Transform의 오브젝트 이름으로 포인트를 저장했지만 실제 CharacterAnimator의 specialPointN 슬롯은 그 이름과 다르게 연결될 수 있다. 예를 들어 위샤델 game#9의 투사체는 6번 마운트(SPECIAL_1)를 사용하지만 기존 points에는 SpecialPoint1이 없고 OriginMuzzle만 있었다. 좌표가 없으면 몸 근처의 임시 좌표에서 발사됐다.
- 기존 KR/CN 원본 내보내기의 CharacterAnimator 필드와 포인트를 대조해, 누락된 슬롯 하나와 OriginMuzzle 하나가 대응하는 95개 스킨에 호환 연결을 추가했다. 복수의 누락 슬롯이나 OriginMuzzle 후보가 있는 경우는 추측하지 않았다.
- 스킨의 graphic projectile이 지정한 발사점은 논리 공격의 기본 마운트보다 우선한다. 발사점은 실제 스킨의 뼈와 공격 타격 시점 포즈로 계산하며 방향·언덕 높이를 반영한다.
- 구형 추출 데이터로 정확한 슬롯을 복원할 수 없는 투사체는 임시 몸 좌표 대신 해당 스킨의 총구를 사용한다.
- 이후 추출은 CharacterAnimator가 참조한 Transform을 직접 따라가 canonical 슬롯 이름과 BoneFollower 뼈를 저장한다. Transform 이름도 원본 내보내기에 보존한다. 추측에 의한 복원을 더 이상 필요로 하지 않는다.

## 검증과 한계

- 스킨 투사체 교체 370개를 앞/뒤 방향으로 정적 검사했다. 찾을 수 없던 발사점은 방향 포함 704건에서 86건으로 줄었다.
- 남은 86건(투사체 43개)은 정확한 슬롯 참조가 기존 업로드에서 소실된 경우다. 스킨 총구로 대체되지만 원본 전용 발사점과 완전히 같음을 보장하지 않는다. 완전한 복원에는 수정된 추출기로 발사점 메타데이터를 다시 얻어야 한다. 목록은 audit.json에 있다.
- 인사이더 여름 스킨을 같은 전장·카메라에서 실제 렌더러로 수정 전후 촬영했다. 수정 전은 HEAD의 wiring.js, 수정 후는 작업 중 코드를 사용했다. before/shots와 after/shots 참조. 모든 스킨의 모든 투사체를 실제 화면에서 검증했다는 뜻은 아니다.
- 회귀 테스트: 앞/뒤·좌/우 방향, 언덕, 실제 발사 뼈, 논리 마운트와의 우선순위, 데이터 누락 시 총구 대체, 신규 추출기의 슬롯 참조 보존.

추출 데이터로 호환 연결을 재생성하는 명령:

```sh
node tools/recover-costume-mounts.mjs public/assets/local/fx/index.json public/js/render/vfx/costumeMountBindings.js KR_SKIN_EFFECTS_JSON CN_SKIN_EFFECTS_JSON
```
