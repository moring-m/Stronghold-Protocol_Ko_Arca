// Official terms must survive whole-sentence translations and later regeneration.
import {readFile,writeFile} from 'node:fs/promises';
import {customBondEffectTemplate} from '../../public/js/ui/bondDescriptions.js';
import {bondReportDescription} from '../../public/js/screens/sweep.js';
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const history=await read('tools/i18n/official-term-history.json');
const terms=await read('tools/i18n/official-terms.json');
const bonds=await read('content/production/data/bonds.json');
for(const lang of ['en','ja','zh']){
 const path=`public/i18n/${lang}/fork.json`,dict=await read(path);
 const pick=(en,ja,zh)=>({en,ja,zh})[lang],term=terms['속세의 음'][lang];
 for(const[k,v]of Object.entries(dict))dict[k]=v.replaceAll('Worldly Melody','Voice of Mundane').replaceAll('俗世の音','塵界の音');
 for(const[source,entry]of Object.entries(terms))for(const key of [source,entry.zh])dict[key]=entry[lang];
 // Use official character IDs, never phonetic/machine guesses for custom or recruit copies.
 const ko=await read('.cache/gamedata-ko/excel/character_table.json'),cn=await read('.cache/gamedata/excel/character_table.json');
 const target=await read(`.cache/gamedata${lang==='zh'?'':'-'+lang}/excel/character_table.json`);
 for(const[id,c]of Object.entries(cn))if(target[id]?.name)for(const source of [c.name,ko[id]?.name])if(source)dict[source]=target[id].name;
 const b=bonds.leithanienShip;
 for(const key of ['desc','descRaw','effectDesc','effectDescRaw']){
  const formatted=key.startsWith('effect'),ratio=formatted?'{0:0.00%}':pick('1% (+0.01% per stack)','1%（1スタックごとに+0.01%）','1%（每层+0.01%）');
  dict[b[key]]=pick(
   `[Leithanien] Operators apply ${term} to their target for 5 seconds whenever they deal damage (0.1-second cooldown per Operator/target pair).\n${term}: deals 80 + ${ratio} of the caster's ATK as Arts damage each second. Unlimited stacks; each expires independently.\n<Deploy 6 different [Leithanien] Operators> Affected enemies deal 25% less damage and move 25% slower. Duration ${formatted?'+{leithDurationBonus} seconds (base +5 seconds, stack bonus +{leithDurationStacks} seconds)':'increases by 5 seconds, plus 1 second per 25 stacks'}.`,
   `[リターニア]オペレーターがダメージを与えるたび、対象に5秒間「${term}」を付与（同じオペレーター・同じ対象には0.1秒のクールタイム）。\n「${term}」：毎秒80+術者の攻撃力の${ratio}の術ダメージ。スタック数の上限なし、持続時間は個別に計算。\n<異なる[リターニア]オペレーターを6名配置> 効果中の敵の与ダメージ-25%、移動速度-25%。持続時間${formatted?'+{leithDurationBonus}秒（基本+5秒、スタックボーナス+{leithDurationStacks}秒）':'+5秒、さらに25スタックごとに+1秒'}。`,
   `[莱塔尼亚]干员每次造成伤害时，对目标施加5秒「${term}」（同一干员对同一目标的冷却时间为0.1秒）。\n「${term}」：每秒造成80+施加者攻击力${ratio}的法术伤害。层数无上限，持续时间独立计算。\n<部署6名不同的[莱塔尼亚]干员> 受影响的敌人造成的伤害-25%、移动速度-25%。持续时间${formatted?'+{leithDurationBonus}秒（基础+5秒，层数加成+{leithDurationStacks}秒）':'+5秒，每25层额外+1秒'}。`
  );
 }
 dict[bondReportDescription(b)]=pick(
  `[Leithanien] Operators apply ${term} for 5 seconds whenever they deal damage (0.1-second cooldown per Operator/target pair).\n${term}: deals 80 + a portion of the caster's ATK as Arts damage each second (scales with stacks). Unlimited stacks; each expires independently.\n<Deploy 6 different [Leithanien] Operators> Affected enemies deal 25% less damage and move 25% slower. ${term} lasts longer (scales with stacks).`,
  `[リターニア]オペレーターがダメージを与えるたび、対象に5秒間「${term}」を付与（同じオペレーター・同じ対象には0.1秒のクールタイム）。\n「${term}」：毎秒80+術者の攻撃力の一定割合の術ダメージ（スタック数に応じて変化）。スタック数の上限なし、持続時間は個別に計算。\n<異なる[リターニア]オペレーターを6名配置> 効果中の敵の与ダメージ-25%、移動速度-25%。「${term}」の持続時間延長（スタック数に応じて変化）。`,
  `[莱塔尼亚]干员每次造成伤害时，对目标施加5秒「${term}」（同一干员对同一目标的冷却时间为0.1秒）。\n「${term}」：每秒造成80+施加者攻击力一定比例的法术伤害（随层数变化）。层数无上限，持续时间独立计算。\n<部署6名不同的[莱塔尼亚]干员> 受影响的敌人造成的伤害-25%、移动速度-25%，「${term}」持续时间延长（随层数变化）。`
 );
 dict[bondReportDescription(bonds.ursusShip)]=pick(
  'Summon an Imperial Artillery Targeteer at battle start. It and [Ursus] Operators gain ATK and Max HP (scales with stacks). Its Movement Speed increases by 50%.\n<Deploy 6 different [Ursus] Operators> The drone gains +50 ASPD and reveals Invisible enemies in its range. Add a portion of all deployed [Ursus] Operators’ total ATK to its base ATK (scales with stacks).',
  '戦闘開始時、帝国砲撃誘導機を召喚。誘導機と[ウルサス]オペレーターの攻撃力・最大HP上昇（スタック数に応じて変化）。誘導機の移動速度+50%。\n<異なる[ウルサス]オペレーターを6名配置> 誘導機の攻撃速度+50。攻撃範囲内の敵のステルスを無効化。配置中の全[ウルサス]オペレーターの合計攻撃力の一定割合を誘導機の基本攻撃力に加算（スタック数に応じて変化）。',
  '战斗开始时召唤帝国炮火先兆者。先兆者与[乌萨斯]干员的攻击力、生命上限提高（随层数变化）。先兆者移动速度+50%。\n<部署6名不同的[乌萨斯]干员> 先兆者攻击速度+50，使攻击范围内敌人的隐匿失效。将所有已部署[乌萨斯]干员总攻击力的一定比例加算至先兆者的基础攻击力（随层数变化）。'
 );
 dict['输入你的代号（最多 {max} 字）']=pick('Enter your codename (up to {max} characters)','コードネームを入力（最大{max}文字）','输入你的代号（最多 {max} 字）');
 let live=dict[b.effectDescRaw].replace('5 seconds','{leithApplyDuration} seconds').replace('5秒','{leithApplyDuration}秒');
 live=live.replace(/ \(base \+5 seconds, stack bonus \+\{leithDurationStacks\} seconds\)|（基本\+5秒、スタックボーナス\+\{leithDurationStacks\}秒）|（基础\+5秒，层数加成\+\{leithDurationStacks\}秒）/g,pick(' (scales with stacks)','（スタック数に応じて変化）','（随层数变化）'));
 dict[customBondEffectTemplate(b)]=live;
 dict[customBondEffectTemplate(bonds.ursusShip)]=pick(
 'Summon an Imperial Artillery Targeteer at battle start. It and [Ursus] Operators gain +{0:0%} ATK and +{1:0.00%} Max HP (scales with stacks). The drone gains +50% Movement Speed.\n<Deploy 6 different [Ursus] Operators> The drone gains +50 ASPD and reveals Invisible enemies in its range. Add {2:0.00%} of all deployed [Ursus] Operators’ total ATK to its base ATK (scales with stacks).',
 '戦闘開始時、帝国砲撃誘導機を召喚。誘導機と[ウルサス]オペレーターの攻撃力+{0:0%}、最大HP+{1:0.00%}（スタック数に応じて変化）。誘導機の移動速度+50%。\n<異なる[ウルサス]オペレーターを6名配置> 誘導機の攻撃速度+50。攻撃範囲内の敵のステルスを無効化。配置中の全[ウルサス]オペレーターの合計攻撃力の{2:0.00%}を誘導機の基本攻撃力に加算（スタック数に応じて変化）。',
 '战斗开始时召唤帝国炮火先兆者。先兆者与[乌萨斯]干员的攻击力+{0:0%}、生命上限+{1:0.00%}（随层数变化）。先兆者移动速度+50%。\n<部署6名不同的[乌萨斯]干员> 先兆者攻击速度+50，使攻击范围内敌人的隐匿失效。将所有已部署[乌萨斯]干员总攻击力的{2:0.00%}加算至先兆者的基础攻击力（随层数变化）。'
 );
 const items=await read('content/production/data/items.json');
 for(const item of Object.values(items))for(const key of ['desc','descRaw']){
  const src=item[key];if(!src?.includes('속세의 음'))continue;const n=src.match(/\+(40|60)%/)?.[1];if(!n)continue;
  dict[src]=pick(`Wearer deals +${n}% Arts damage.\nWhen equipped by a [Leithanien] Operator: activating a skill applies ${term} once to all enemies on the field.\nWhen equipped together with Leithanien Bell: all deployed [Leithanien] Operators gain this effect.`,`装備者が与える術ダメージ+${n}%。\n[リターニア]オペレーターが装備時：スキル発動時、戦場の全ての敵に「${term}」を1回付与。\n「リターニアの鐘」と同時装備時：配置中の全[リターニア]オペレーターが上記効果を獲得。`,`装备者造成的法术伤害+${n}%。\n[莱塔尼亚]干员装备时：开启技能时，对战场上所有敌人施加1次「${term}」。\n与「莱塔尼亚之钟」同时装备时：所有已部署的[莱塔尼亚]干员获得上述效果。`);
 }
 for(const[source,en,ja,zh]of history)dict[source]=pick(en,ja,zh);
 for(const[source,value]of Object.entries(dict))if(source.includes('<@')&&(source.includes('속세의 음')||source===bondReportDescription(bonds.ursusShip))&&!value.includes('<@')){
  dict[source]=value.replace(/\{(?:\d+:[^}]+|leithApplyDuration|leithDurationBonus|leithDurationStacks)\}|[+-]?\d+(?:\.\d+)?%?/g,'<@ba.vup>$&</>').replaceAll(term,`<@ba.vup>${term}</>`);
 }
 for(const b of [bonds.ursusShip,bonds.leithanienShip]){const src=customBondEffectTemplate(b);dict[src.replaceAll('\n','\\n')]=dict[src];}
 await writeFile(path,JSON.stringify(dict,null,2)+'\n');
}
