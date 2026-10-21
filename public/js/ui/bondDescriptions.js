// Presentation-only templates. Combat blackboards and stacking rules remain in game data.
export function customBondEffectTemplate(bond){
 const id=bond?.bondId||bond?.id;
 if(id==='leithanienShip')return `[라이타니엔] 오퍼레이터가 피해를 입힐 때마다 대상에게 <@ba.vup>{leithApplyDuration}초</>간 '<@ba.vup>속세의 음</>' 부여 <@autochess.gray>(동일 시전자·대상 재발동 대기 시간 0.1초)</>\n'<@ba.vup>속세의 음</>': 매초 <@ba.vup>80</> + 시전자 공격력의 <@ba.vup>{0:0.00%}</>에 해당하는 마법 대미지 <@ba.acrem>(중첩 수에 따라 변경)</>. 무한 중첩 가능, 지속시간 개별 적용\n<전장에 서로 다른 [라이타니엔] 오퍼레이터 <@autochess.dgreen>6</>명> 대상 적이 입히는 대미지 <@ba.vup>-25%</>, 이동 속도 <@ba.vup>-25%</>. '속세의 음' 지속시간 <@ba.vup>+{leithDurationBonus}초</> <@ba.acrem>(중첩 수에 따라 변경)</>`;
 if(id==='ursusShip')return `전투 시작 시 <@ba.vup>제국 드론</> 소환. 제국 드론과 [우르수스] 오퍼레이터의 공격력 <@ba.vup>+{0:0%}</>, 최대 HP <@ba.vup>+{1:0.00%}</> <@ba.acrem>(중첩 수에 따라 변경)</>. 제국 드론의 이동 속도 <@ba.vup>+50%</>\n<전장에 서로 다른 [우르수스] 오퍼레이터 <@autochess.dgreen>6</>명> 제국 드론의 공격 속도 <@ba.vup>+50</>. 공격 범위 내 적의 <@ba.vup>은신 무효화</>. 배치된 [우르수스] 오퍼레이터의 총 공격력의 <@ba.vup>{2:0.00%}</>를 제국 드론의 기본 공격력에 가산 <@ba.acrem>(중첩 수에 따라 변경)</>`;
 return null;
}
