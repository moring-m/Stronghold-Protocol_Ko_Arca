// Curated arithmetic/stat phrasing. Only display dictionaries change; original effects are untouched.
import {readFile,writeFile} from 'node:fs/promises';
import {AUGMENT_SOURCES} from '../../shared/augmentSources.js';
const reuse=JSON.parse(await readFile('.cache/translation-reuse.json','utf8'));
const stats={'공격력':['ATK','攻撃力','攻击力'],'방어력':['DEF','防御力','防御力'],'마법 저항':['RES','術耐性','法术抗性'],'공격속도':['ASPD','攻撃速度','攻击速度'],'최대 HP':['Max HP','最大HP','生命上限'],'최대 SP':['Max SP','最大SP','技力上限'],'이동속도':['Movement Speed','移動速度','移动速度']};
const choose=(code,en,ja,zh)=>({en,ja,zh})[code];
function translate(s,code){
 const c=(en,ja,zh)=>choose(code,en,ja,zh);
 let x=s.match(/^무작위 (\d+)등급 (?:\[맹약\] )?오퍼레이터(?: (\d+)명)? 획득$/);
 if(x){const n=x[2]||'1',bond=s.includes('[맹약]');return c(`Gain ${n} random Tier ${x[1]} ${bond?'[Bond] ':''}Operator(s)`,`ランダムな${bond?'[盟約]':''}ランク${x[1]}オペレーターを${n}名獲得`,`获得${n}名随机${x[1]}阶${bond?'[盟约]':''}干员`);}
 x=s.match(/^무료 새로고침 (\d+)개 획득$/);if(x)return c(`Gain ${x[1]} free rerolls`,`無料リロールを${x[1]}回獲得`,`获得${x[1]}次免费刷新`);
 x=s.match(/^모든 적 유닛의 (이동속도|공격력) -(\d+)% \(자신의 전투에만 적용, 연합방어와 보스전에는 적용되지 않음\)$/);if(x){const stat=x[1]==='공격력';return c(`All enemies: ${stat?'ATK':'Movement Speed'} -${x[2]}% (your own battles only; excludes Unite Phase and boss battles)`,`全敵ユニットの${stat?'攻撃力':'移動速度'}-${x[2]}%（自身の通常戦闘のみ。共同防衛・ボス戦には適用しない）`,`所有敌方单位${stat?'攻击力':'移动速度'}-${x[2]}%（仅限自己的普通战斗，不适用于联合防御和首领战）`);}
 x=s.match(/^활성화된 모든 핵심 맹약 중첩 \+(\d+), 보조 맹약 중첩 \+(\d+)$/);if(x)return c(`All active primary Bonds: +${x[1]} stacks; secondary Bonds: +${x[2]} stacks`,`発動中の全ての主盟約スタック+${x[1]}、補助盟約スタック+${x[2]}`,`所有已激活的核心盟约层数+${x[1]}，辅助盟约层数+${x[2]}`);
 x=s.match(/^오퍼레이터가 공격할 때마다 HP (\d+) 회복$/);if(x)return c(`Operators recover ${x[1]} HP each time they attack`,`オペレーターが攻撃するたびHP${x[1]}回復`,`干员每次攻击回复${x[1]}点生命`);
 x=s.match(/^라운드마다 추가로 자금 (\d+) 획득$/);if(x)return c(`Gain ${x[1]} extra funds each round`,`毎ラウンド資金を追加で${x[1]}獲得`,`每回合额外获得${x[1]}资金`);
 x=s.match(/^오퍼레이터가 스킬 사용 시 (\d+)초간 공격력 \+(\d+)%$/);if(x)return c(`When an Operator uses a skill, gain +${x[2]}% ATK for ${x[1]} seconds`,`オペレーターがスキル使用時、${x[1]}秒間攻撃力+${x[2]}%`,`干员使用技能时，攻击力+${x[2]}%，持续${x[1]}秒`);
 x=s.match(/^무작위 효과의 빅토리아 해머 (\d+)개 획득$/);if(x)return c(`Gain ${x[1]} Victorian Hammers with random effects`,`ランダムな効果のヴィクトリアハンマーを${x[1]}個獲得`,`获得${x[1]}个随机效果的维多利亚战锤`);
 x=s.match(/^목표 HP \+(\d+)$/);if(x)return c(`Objective HP +${x[1]}`,`目標HP+${x[1]}`,`目标HP+${x[1]}`);
 x=s.match(/^무작위 맹약의 무작위 (.+)단계 오퍼레이터 획득$/);if(x)return c(`Gain a random Tier ${x[1]} Operator from a random Bond`,`ランダムな盟約のランク${x[1]}からランダムにオペレーターを獲得`,`获得随机盟约的随机${x[1]}阶干员`);
 const exact={
 '(맹약 기본 장비) 2개 획득':['Gain 2 basic Bond items','盟約の基本装備を2個獲得','获得2件盟约基础装备'],
 '(맹약 상위 장비) 1개 획득':['Gain 1 advanced Bond item','盟約の上級装備を1個獲得','获得1件盟约高级装备'],
 '(맹약 상위 장비) 1개와 (맹약 기본 장비) 2개 획득':['Gain 1 advanced and 2 basic Bond items','盟約の上級装備を1個、基本装備を2個獲得','获得1件盟约高级装备和2件盟约基础装备'],
 '모든 아군 유닛의 공격력 +15%, 모든 아군 유닛의 대미지 유형이 약점 대미지로 변경':['All allied units: ATK +15%; damage type becomes Weakness damage','全味方ユニットの攻撃力+15%、ダメージタイプが弱点ダメージに変化','所有友方单位攻击力+15%，伤害类型变为弱点伤害'],
 '페가수스의 투구, 페가수스의 랜스 2개 획득':['Gain a Pegasus Helm and 2 Pegasus Lances','ペガサスの兜とペガサスのランスを2個獲得','获得飞马头盔和2个飞马长枪'],
 '인사부 파일, 의태 물질 1개 획득':['Gain a Personnel File and 1 Mimicry Material','人事部ファイルと擬態物質を1個獲得','获得人事部档案和1个拟态物质'],
 '상점에 등장하는 3등급 이하 오퍼레이터의 가격 -1':['Shop Operators of Tier 3 or below cost 1 less','ショップのランク3以下のオペレーター価格-1','商店中3阶及以下干员价格-1'],
 '오퍼레이터가 스킬 발동 시 모든 오퍼레이터의 공격 속도 +12 (최대 +300), 15초간 지속 (각 중첩별 지속 시간은 독립 계산)':['When an Operator activates a skill, all Operators gain +12 ASPD (up to +300) for 15 seconds; each stack expires independently','オペレーターがスキル発動時、全オペレーターの攻撃速度+12（最大+300）、15秒間持続（各スタックの持続時間は独立）','干员开启技能时，所有干员攻击速度+12（最多+300），持续15秒（各层持续时间独立计算）'],
 '전장에 배치된 모든 오퍼레이터를 한 단계 높은 무작위 오퍼레이터로 교체':['Replace every deployed Operator with a random Operator one tier higher','配置中の全オペレーターを1ランク上のランダムなオペレーターに置き換える','将所有已部署干员替换为高一阶的随机干员'],
 '오퍼레이터가 장비를 1개 장착할 때마다 공격력 +35%':['Operators gain +35% ATK per 1 equipped item','オペレーターが装備を1個装着するごとに攻撃力+35%','干员每装备1件装备，攻击力+35%'],
 '오퍼레이터가 냉각/빙결 상태의 적에게 입히는 대미지가 180%로 증가, 오퍼레이터가 공격 시 대상 적에게 15% 확률로 3초간 냉각 적용':['Operators deal 180% damage to Cold/Frozen enemies; attacks have a 15% chance to inflict Cold for 3 seconds','オペレーターが寒冷・凍結状態の敵に与えるダメージが180%に上昇。攻撃時15%の確率で対象を3秒間寒冷にする','干员对寒冷／冻结敌人造成的伤害提高至180%，攻击时有15%概率对目标施加3秒寒冷'],
 '전장과 대기석의 모든 오퍼레이터를 판매하고 모든 장비 파기. 무작위 정예화 오퍼레이터 12명 획득':['Sell all Operators on the field and bench and destroy all equipment. Gain 12 random promoted Operators','戦場・待機席の全オペレーターを売却し全装備を破棄。ランダムな昇進済みオペレーターを12名獲得','出售战场和备战席上的所有干员并销毁所有装备，获得12名随机精英化干员'],
 '라운드가 시작할 때마다 전장 내 오퍼레이터 1명의 <획득 시> 특질이 1회 발동 (가장 오른쪽 및 가장 하단 우선 선택)':['At each round start, trigger the <On acquisition> trait of 1 deployed Operator 1 time (prioritize the rightmost, then bottommost)','毎ラウンド開始時、配置中のオペレーター1名の<獲得時>特性を1回発動（最も右、次に最も下を優先）','每回合开始时，触发战场上1名干员的<获得时>特性1次（优先最右，其次最下）'],
 '자금 3 획득, 이번 상점 승급 비용 0':['Gain 3 funds; the current shop upgrade costs 0','資金を3獲得。今回のショップ昇格費用は0','获得3资金，本次商店升级费用为0']
 };
 if(exact[s])return exact[s][['en','ja','zh'].indexOf(code)];

 let m=s.match(/^모든 (아군|적) 유닛의 (.+) ([+-][\d.]+)(%?)$/);
 if(m&&stats[m[2]]){const stat=stats[m[2]][['en','ja','zh'].indexOf(code)],n=m[3]+m[4],ally=m[1]==='아군';return choose(code,`All ${ally?'allied':'enemy'} units: ${stat} ${n}`,`全${ally?'味方':'敵'}ユニットの${stat}${n}`,`所有${ally?'友方':'敌方'}单位${stat}${n}`);}
 m=s.match(/^모든 (아군|적) 유닛이 초당 ([\d.]+)의 HP (감소|재생)$/);
 if(m){const ally=m[1]==='아군',lose=m[3]==='감소',n=m[2];return choose(code,`All ${ally?'allied':'enemy'} units ${lose?'lose':'regenerate'} ${n} HP per second`,`全${ally?'味方':'敵'}ユニットが毎秒HP${n}${lose?'減少':'回復'}`,`所有${ally?'友方':'敌方'}单位每秒${lose?'损失':'回复'}${n}点生命`);}
 m=s.match(/^모든 적이 초당 ([\d.]+)의 HP 재생$/);if(m)return choose(code,`All enemies regenerate ${m[1]} HP per second`,`全ての敵が毎秒HP${m[1]}回復`,`所有敌人每秒回复${m[1]}点生命`);
 m=s.match(/^모든 적 유닛이 입히는 마법 대미지가 ([\d.]+)%로 증가$/);if(m)return choose(code,`All enemy units deal ${m[1]}% Arts damage`,`全敵ユニットが与える術ダメージが${m[1]}%に上昇`,`所有敌方单位造成的法术伤害提高至${m[1]}%`);
 m=s.match(/^모든 적이 가하는 원소 피해 \+([\d.]+)%$/);if(m)return choose(code,`All enemies: Elemental damage +${m[1]}%`,`全ての敵が与える元素ダメージ+${m[1]}%`,`所有敌人造成的元素损伤+${m[1]}%`);
 m=s.match(/^모든 적이 부여하는 상태이상의 지속시간 \+([\d.]+)%$/);if(m)return choose(code,`Status effects inflicted by enemies last ${m[1]}% longer`,`全ての敵が付与する状態異常の持続時間+${m[1]}%`,`所有敌人施加的异常状态持续时间+${m[1]}%`);
 m=s.match(/^모든 아군 유닛의 초당 SP 회복 \+([\d.]+)$/);if(m)return choose(code,`All allied units: SP recovery +${m[1]} per second`,`全味方ユニットのSP自然回復速度+${m[1]}/秒`,`所有友方单位每秒技力回复+${m[1]}`);
 m=s.match(/^모든 아군 유닛의 물리\/마법 회피 \+([\d.]+)%$/);if(m)return choose(code,`All allied units: Physical/Arts Dodge +${m[1]}%`,`全味方ユニットの物理・術回避率+${m[1]}%`,`所有友方单位物理／法术闪避+${m[1]}%`);
 m=s.match(/^모든 아군 오퍼레이터가 적의 방어력\/마법 저항 ([\d.]+)% 무시$/);if(m)return choose(code,`All allied Operators ignore ${m[1]}% of enemy DEF and RES`,`全味方オペレーターが敵の防御力・術耐性を${m[1]}%無視`,`所有友方干员无视敌人${m[1]}%的防御力和法术抗性`);
 m=s.match(/^모든 아군 오퍼레이터가 배치 후 ([\d.]+)초 동안 공격 속도 \+([\d.]+)$/);if(m)return choose(code,`All allied Operators gain +${m[2]} ASPD for ${m[1]} seconds after deployment`,`全味方オペレーターが配置後${m[1]}秒間、攻撃速度+${m[2]}`,`所有友方干员部署后${m[1]}秒内攻击速度+${m[2]}`);
 m=s.match(/^모든 아군 오퍼레이터가 스킬 사용 후 SP ([\d.]+) 회복$/);if(m)return choose(code,`All allied Operators recover ${m[1]} SP after using a skill`,`全味方オペレーターがスキル使用後にSP${m[1]}回復`,`所有友方干员使用技能后回复${m[1]}点技力`);
 m=s.match(/^모든 아군 유닛이 입히는 대미지가 ([\d.]+)%로 증가$/);if(m)return choose(code,`All allied units deal ${m[1]}% damage`,`全味方ユニットが与えるダメージが${m[1]}%に上昇`,`所有友方单位造成的伤害提高至${m[1]}%`);
 m=s.match(/^모든 아군 유닛이 입히는 트루 대미지 \+([\d.]+)%$/);if(m)return choose(code,`All allied units: True damage +${m[1]}%`,`全味方ユニットが与える確定ダメージ+${m[1]}%`,`所有友方单位造成的真实伤害+${m[1]}%`);
 m=s.match(/^모든 아군 유닛이 공격 시 ([\d.]+)% 확률로 추가 공격$/);if(m)return choose(code,`All allied units have a ${m[1]}% chance to make an extra attack when attacking`,`全味方ユニットが攻撃時に${m[1]}%の確率で追加攻撃`,`所有友方单位攻击时有${m[1]}%概率进行一次追加攻击`);
 m=s.match(/^일반 전투·협력방어에서 적이 방어 포인트에 진입할 때마다 HP ([\d.]+) 즉시 감소$/);if(m)return choose(code,`In normal battles and Unite Phase, immediately lose ${m[1]} HP each time an enemy enters a Defense Point`,`通常戦闘・共同防衛で敵が防衛地点に侵入するたび、HPが即座に${m[1]}減少`,`普通战斗和联合防御中，每有一名敌人进入防守点，立即扣除${m[1]}点HP`);
 m=s.match(/^오퍼레이터가 피해를 입히면 대상 적에게 ([\d.]+)초간 '속세의 음'을 적용하여, 매 초마다 ([\d.]+) \+ 공격력의 ([\d.]+)%에 해당하는 마법 대미지를 입힘 \(무한 중첩 가능\)$/);if(m)return choose(code,`When an Operator deals damage, inflict Voice of Mundane on the target for ${m[1]} seconds, dealing ${m[2]} + ${m[3]}% ATK as Arts damage per second (stacks without limit)`,`オペレーターがダメージを与えると、対象に${m[1]}秒間「塵界の音」を付与。毎秒${m[2]}+攻撃力の${m[3]}%の術ダメージを与える（スタック数の上限なし）`,`干员造成伤害时，对目标施加${m[1]}秒「尘世之音」，每秒造成${m[2]}+攻击力${m[3]}%的法术伤害（层数无上限）`);
 m=s.match(/^오퍼레이터가 피해를 입힐 때마다 대상 적의 방어력 및 마법 저항 -([\d.]+)% \(최대 -([\d.]+)%\)$/);if(m)return choose(code,`Each time an Operator deals damage, reduce the target's DEF and RES by ${m[1]}% (up to -${m[2]}%)`,`オペレーターがダメージを与えるたび、対象の防御力・術耐性-${m[1]}%（最大-${m[2]}%）`,`干员每次造成伤害使目标防御力与法术抗性-${m[1]}%（最多-${m[2]}%）`);
 m=s.match(/^모든 적의 실드 \+([\d.]+)$/);if(m)return choose(code,`All enemies gain ${m[1]} shield`,`全ての敵のシールド+${m[1]}`,`所有敌人护盾+${m[1]}`);
 if(s==='모든 적의 은신 무효화')return choose(code,'Reveal all Invisible enemies','全ての敵のステルスを無効化','所有敌人隐匿失效');
 if(s==='모든 적이 침묵 면역')return choose(code,'All enemies are immune to Silence','全ての敵が沈黙無効','所有敌人免疫沉默');
 if(s==='모든 오퍼레이터가 은신 획득')return choose(code,'All Operators gain Invisible','全オペレーターがステルスを獲得','所有干员获得隐匿');
 if(s==='조화 활성화')return choose(code,'Activate Harmony','調和を有効化','激活调和');
 m=s.match(/^(.+) ([\d.]+)개 획득$/);if(m){const item=reuse[code]?.[m[1]];if(item)return choose(code,`Gain ${m[2]} × ${item}`,`${item}を${m[2]}個獲得`,`获得${m[2]}个${item}`);}
 return null;
}
for(const code of ['en','ja','zh']){
 const p=`public/i18n/${code}/fork.json`,dict=JSON.parse(await readFile(p,'utf8'));let count=0;
 dict['속세의 음']=choose(code,'Voice of Mundane','塵界の音','尘世之音');
 for(const row of AUGMENT_SOURCES){const value=translate(row.description,code);if(value){dict[row.description]=value;count++;}}
 await writeFile(p,JSON.stringify(dict,null,2)+'\n');console.log(code,count,'curated augment descriptions');
}
