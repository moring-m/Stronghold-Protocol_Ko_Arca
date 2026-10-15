export const RELEASE_RETENTION_MS = 2 * 60 * 60 * 1000;
export const RELEASE_REMINDERS_MS = [60,30,10,5,1].map(minutes=>minutes*60*1000);
export function retirementText(remainingMs, initial=false){
 const minutes=Math.max(1,Math.ceil(remainingMs/60000));
 const remaining=minutes>=60&&minutes%60===0?`${minutes/60}시간`:`${minutes}분`;
 return initial?`새 버전이 적용되었습니다. 기존 버전은 최대 2시간 유지됩니다. 종료까지 ${remaining} 남았습니다. 시간이 끝나면 기존 버전의 방과 게임이 종료됩니다.`:`기존 버전 종료까지 ${remaining} 남았습니다. 시간이 끝나면 이 버전의 방과 게임이 종료됩니다.`;
}
