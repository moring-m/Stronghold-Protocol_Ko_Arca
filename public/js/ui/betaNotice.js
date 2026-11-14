// 규정 베타 안내: 닉네임 입력 화면에서 접속(enterSession)한 직후 한 번만. 새로고침으로 바로 로비가 열리거나
// 방에서 로비로 돌아올 때는 띄우지 않는다.
let pending = false;
/** 닉네임 입력 화면에서 접속했다 (screens/title.js enterSession). */
export function markEntered() { pending = true; }
/** 접속 후 처음 연 로비가 안내를 띄울 차례인가. */
export function betaNoticePending() { return pending; }
/** 안내를 닫았다(또는 규정이 아닌 시즌으로 들어갔다). */
export function clearBetaNotice() { pending = false; }
