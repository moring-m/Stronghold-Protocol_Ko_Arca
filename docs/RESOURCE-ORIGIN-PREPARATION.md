# 리소스 저장소 연결 준비

리소스 저장소 `https://github.com/moring-m/Stronghold-Protocol_Ko_Arca_assets`에 업로드했다. 고정 커밋은 `98066f2fff77bb2476e8bc7a3e9483a3117f5cc8`이다. v0.3.1h 배포에서 이 커밋을 사용한다.

## 준비된 파일

- `content/custom/resource-origin.json`: 외부 출처 설정. `baseUrls: []`이면 동작 변경 없음.
- `tools/resource-origin.mjs`: 서버 제공 목록 추출·파일 SHA-256 검사·출처 전환.
- `.cache/resource-publish/public/`: 업로드용 디렉터리. 게임의 `/assets/...` 경로 보존.
- `.cache/resource-publish/inventory.json`: 파일별 크기·SHA-256·누락 목록.
- `.cache/costume-fx-pack/`: 스킨 FX 추가분. 원본 교체 없이 병합하는 입력 묶음.

현재 유효한 전체 리소스 목록에서 서버 제공 파일 25,326개, 674,317,275바이트를 추출했다. 해시 불일치와 누락은 0개다. 기존 외부 미러 제공 파일은 복사하거나 출처를 변경하지 않는다.

## 저장소가 정해지면

1. 업로드용 `public/` 내용을 리소스 저장소에 올린다. 대용량 파일은 GitHub 파일 제한을 확인한다.
2. 변경되지 않는 커밋 주소를 설정한다. 예: `https://raw.githubusercontent.com/OWNER/REPO/COMMIT/public` 또는 해당 커밋의 jsDelivr 주소.
3. `baseUrls`에 주소를 넣는다. `fallbackToServer` 기본값은 false다.
4. 전체 빌드의 마지막 단계에서 `node tools/resource-origin.mjs apply`가 리소스 목록의 출처만 바꾼다. 게임 경로와 캐시 키는 유지한다.
5. 새 스킨 추가분은 별도 입력 묶음이므로 배포 이미지에 포함·병합한 뒤 목록을 생성해야 한다. Docker는 `tools/install-hosted-resources.mjs`로 고정 커밋의 리소스 아카이브를 받고 전체 인벤토리를 검증한 뒤 추가분을 병합한다. 기본 9명과 스킨 260종의 파일은 리소스 저장소에서 가져온다. 게임 소스 Git에는 대용량 파일을 추가하지 않는다.

재생성:

```sh
node tools/resource-origin.mjs export .cache/local-production/public/vendor/browser-resources.json .cache/resource-publish .cache/local-production/public public content/production
```

언어팩과 `/data/`는 릴리즈에 종속되는 메타데이터로 현재 서버 갱신 경로를 유지한다. 외부 출처로 전환할 경우 별도의 버전 검증 연결이 필요하며 이 도구가 자동으로 전환하지 않는다. JS/CSS/HTML도 대상이 아니다.

언어팩도 업로드용 `public/i18n/`에 별도로 복사했으며 `language-inventory.json`에 검증값을 기록했다. 출처 전환은 위 설명대로 아직 서버 경로를 유지한다.

## 연결 검증

- 리소스 저장소: 25,354개 파일, 합계 720,573,644바이트(메타데이터·언어팩 포함). 개별 파일 최대 약 10.2MB. Git LFS 미사용.
- 원격 인덱스/텍스처 목록/프리팹/텍스처/증강 아이콘 5개를 실제 다운로드하여 SHA-256 일치 확인.
- 빌드 설치기를 로컬 아카이브로 실행해 25,326개 전체 페이로드 검증 및 스킨 추가분 병합 확인.
- 브라우저에서 서로 다른 스킨 3종의 교체 이펙트 렌더링 확인. `docs/fx-upload-2026-10-23/costume-browser-check.json` 및 스크린샷 참고. 모든 스킨의 전투 타이밍을 수동 검증한 것은 아니다.
- 원본 미러 출처는 유지하고 서버 제공 파일만 GitHub raw 및 jsDelivr의 고정 커밋 주소로 변경한다.
- 언어팩은 업로드했으나 서버의 릴리즈 메타데이터 갱신 경로를 계속 사용한다.
- FX 인덱스와 텍스처 목록은 해시가 바뀌면 이전 캐시를 재사용하지 않도록 수정했다. 일반 에셋은 기존 캐시 재사용 정책을 유지한다.

캐시 검증: 인덱스 변경 감지 및 일반 에셋 재사용을 포함한 관련 테스트 49개 통과. 다운로드와 개별 파일 복구에서 동일한 음성/이펙트 선택별 캐시를 사용하도록 맞췄다. 기존 브라우저 테스트의 캐시 이름도 현재 선택별 이름으로 갱신했다.
