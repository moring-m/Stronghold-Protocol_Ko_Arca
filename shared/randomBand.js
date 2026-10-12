export const RANDOM_BAND_ID='band_random';
export const RANDOM_BAND=Object.freeze({bandId:RANDOM_BAND_ID,name:'랜덤 전략',sortId:-1,modeTypeList:['SINGLE','MULTI','LOCAL'],totalHp:null,effectName:'무작위 배정',desc:'게임 시작 시 선택되지 않은 전략 중 하나를 무작위로 배정합니다. 전략 중복 선택이 허용된 게임에서는 같은 전략이 배정될 수 있습니다.',buffs:[],bondIds:[],randomChoice:true});
export const withRandomBands=bands=>({...bands,[RANDOM_BAND_ID]:RANDOM_BAND});
