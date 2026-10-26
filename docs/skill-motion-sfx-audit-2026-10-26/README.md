# 스킬별 모션·효과음 점검 (2026-10-26)

공식 데이터와 게임 연결을 대조한 결과다. 도구: `node tools/audit-skill-motion-sfx.mjs --fx <운영 설치 fx/index.json> --audio <CN audio_data.json>`. 전체 목록: [audit.json](audit.json).

- 기준: 이펙트 목록 유닛의 스킬→공격 모드(charpack에서 추출), 그 모드의 `animKey`, CN `audio_data`의 `ON_ABILITY_START/ON/HIT.<charId>.attack.<모드>`·스킬 공격음 `ON_ABILITY_START.<skillId>`·발동음 `ON_SKILL_START.<skillId>`.
- 공용 버프음(`b_char_*`)과 모드 전용음이 없어 기본 공격음을 쓰는 경우는 정상으로 본다.
- 대상: 오퍼레이터 218명, 스킬 581개 / 차이 있는 스킬 120개.
- 이 문서는 데이터 대조 결과이며, 실제 재생을 귀로 확인한 것은 아니다.

## 공격·타격음: 공식과 다른 파일 (77)

| 오퍼레이터 | 스킬 | 공식 모드 | 내용 |
|---|---|---|---|
| 克莱门莎 (`char_4231_clemnt`) | S1 `skchr_clemnt_1` | 기본 | official p_atk_wtsdrvr_d, game p_atk_wtsdrvr_n |
| 瑰盐 (`char_4163_rosesa`) | S1 `skchr_rosesa_1` | 기본 | official p_atk_rsltdglk_d, game p_atk_rsltdglk_n |
| 벨로네 (`char_4037_demetr`) | S1 `skchr_demetr_1` | 기본 | official p_atk_rdbrkncls_d, game p_atk_rdbrkncls_n |
| 벨로네 (`char_4037_demetr`) | S3 `skchr_demetr_3` | S3 | official p_atk_rdbrkncls_n/p_atk_rdbrknclsflh, game p_atk_rdbrkncls_s |
| 벨로네 (`char_4037_demetr`) | S3 `skchr_demetr_3` | S3 | official p_imp_rdbrkncls_n, game p_imp_rdbrkncls_s1 |
| 锏 (`char_4116_blkkgt`) | S1 `skchr_blkkgt_1` | S1 | official p_atk_blkswrdphycrdy_d, game p_atk_blkswrdphyc_n_1 |
| 锏 (`char_4116_blkkgt`) | S3 `skchr_blkkgt_3` | 기본 | official p_atk_blkswrdphyclp_s/p_atk_blkswrdphycslrdy_s, game p_atk_blkswrdphyc_n_1 |
| 崖心 (`char_173_slchan`) | S1 `skchr_slchan_1` | 기본 | official p_atk_cowboy_h, game p_atk_chain_n |
| 만트라 (`char_4204_mantra`) | S1 `skchr_mantra_1` | 기본 | official p_atk_mtelrncpnt_d, game p_atk_mtelrncpnt_n |
| 夕 (`char_2015_dusk`) | S1 `skchr_dusk_1` | 기본 | official p_atk_ancientsword_d, game p_atk_ancientsword_n |
| 제시카 더 리버레이티드 (`char_1034_jesca2`) | S2 `skchr_jesca2_2` | S2 | official p_atk_carbine_n, game p_atk_pistolup_n |
| 歌蕾蒂娅 (`char_474_glady`) | S1 `skchr_glady_1` | 기본 | official p_atk_seasword_h, game p_atk_seasword_n |
| 歌蕾蒂娅 (`char_474_glady`) | S3 `skchr_glady_3` | S3 | official p_atk_seasword_h, game p_atk_seasword_n |
| Mon3tr (`char_4179_monstr`) | S1 `skchr_monstr_1` | 기본 | official p_atk_kxdtctm_d, game p_atk_kxdtctm_n |
| Mon3tr (`char_4179_monstr`) | S3 `skchr_monstr_3` | S3 | official p_atk_kxdtctmtl_s/p_atk_kxdtctmnd_s, game p_atk_kxdtctm_s |
| 伺夜 (`char_427_vigil`) | S3 `skchr_vigil_3` | S3 | official p_atk_vwgun_h_1, game p_atk_vwgun_n |
| 伊内丝 (`char_4087_ines`) | S2 `skchr_ines_2` | S2 | official p_atk_insasn_h_2, game p_atk_insasn_n_1 |
| 伊内丝 (`char_4087_ines`) | S3 `skchr_ines_3` | S3 | official p_atk_insasn_s_2/p_atk_insasntback, game p_atk_insasn_n_1 |
| 보타니 (`char_4223_botany`) | S1 `skchr_botany_1` | 기본 | official p_atk_mgcyrsn_d, game p_atk_mgcyrsn_n |
| 보타니 (`char_4223_botany`) | S2 `skchr_botany_2` | S2 | official p_atk_mgcyrsn_h/p_atk_mgcyrsnfr_h, game p_atk_mgcyrsn_n |
| 跃跃 (`char_4100_caper`) | S1 `skchr_caper_1` | 기본 | official p_atk_rbbtbmrng_d, game p_atk_rbbtbmrng_n |
| 네크라스 (`char_450_necras`) | S3 `skchr_necras_3` | S3 | official p_atk_prlfrhlrdrls/p_atk_prlfrhlrdcft, game p_atk_prlfrhlrd_n |
| 录武官 (`char_4196_reckpr`) | S1 `skchr_reckpr_1` | 기본 | official p_atk_rcdofc_d, game p_atk_rcdofc_n |
| 스테인리스 (`char_4072_ironmn`) | S2 `skchr_ironmn_2` | S1 | official p_imp_elecdrill_d, game p_atk_elecdrill_h |
| 宴 (`char_337_utage`) | S2 `skchr_utage_2` | S2 | official p_imp_darksword_n, game p_imp_sword_n |
| 见行者 (`char_4036_forcer`) | S1 `skchr_forcer_1` | 기본 | official p_atk_fgun_h, game p_imp_fgun_n |
| 팬텀 (`char_250_phatom`) | S2 `skchr_phatom_2` | S2 | official p_atk_machete_fire, game p_atk_knife_n |
| 팬텀 (`char_250_phatom`) | S2 `skchr_phatom_2` | S2 | official p_imp_machete_fire, game p_imp_knife_n |
| 雷蛇 (`char_107_liskam`) | S2 `skchr_liskam_2` | S2 | official p_atk_lightning_n, game p_atk_pistol_n |
| 锡人 (`char_4151_tinman`) | S1 `skchr_tinman_1` | 기본 | official p_atk_stmpnklch_d, game p_atk_stmpnklch_n |
| 锡人 (`char_4151_tinman`) | S2 `skchr_tinman_2` | 기본 | official p_atk_stmpnklch_h, game p_atk_stmpnklch_n |
| 雪猎 (`char_4211_snhunt`) | S1 `skchr_snhunt_1` | 기본 | official p_atk_sncrbw_d, game p_atk_sncrbw_n |
| 流明 (`char_4042_lumen`) | S2 `skchr_lumen_2` | 기본 | official p_atk_fishheal_h, game p_atk_fishheal_n |
| 拉普兰德 (`char_140_whitew`) | S2 `skchr_whitew_2` | S2 | official p_atk_katanawave_n, game p_atk_swordwave_n |
| 첸 더 던스트릭 (`char_1050_chen3`) | S2 `skchr_chen3_2` | 기본 | official p_atk_hljdswd_h, game p_atk_hljdswd_n |
| 刺玫 (`char_494_vendla`) | S2 `skchr_vendla_2` | 기본 | official p_atk_brmblhl_h, game p_atk_brmblhl_n |
| 레토 (`char_194_leto`) | S2 `skchr_leto_2` | S2 | official p_atk_axcpvbl_h/p_atk_axcpvblsht_h, game p_atk_axcpvbl_n |
| 佩佩 (`char_4058_pepe`) | S1 `skchr_pepe_1` | 기본 | official p_atk_ctmnyhmr_d, game p_atk_ctmnyhmr_n |
| 우쿠시크 (`char_4224_turdus`) | S1 `skchr_turdus_1` | S1 | official p_atk_crwkdhl_d/p_atk_crwkdhlfr_d, game p_atk_crwkdhl_n |
| 레싱 (`char_4011_lessng`) | S1 `skchr_lessng_1` | 기본 | official p_atk_shpbygrd_d, game p_atk_shpbygrd_n |
| 休谟斯 (`char_491_humus`) | S1 `skchr_humus_1` | 기본 | official p_atk_sicklemetalhu_d, game p_atk_sicklemetalhu_n |
| 유넥티스 (`char_416_zumama`) | S3 `skchr_zumama_3` | S3 | official p_atk_robotsaw_n, game p_imp_snakeknife_n |
| 트라고디아 (`char_1042_phatm2`) | S1 `skchr_phatm2_1` | 기본 | official p_atk_oprdmgrc_d, game p_atk_oprdmgrc_n |
| 烛煌 (`char_1040_blaze2`) | S1 `skchr_blaze2_1` | 기본 | official p_atk_hcnsrfr_d, game p_atk_hcnsrfr_n |
| 隐德来希 (`char_4010_etlchi`) | S1 `skchr_etlchi_1` | 기본 | official p_atk_vmprsckl_d, game p_atk_vmprsckl_n |
| 하루카 (`char_4202_haruka`) | S1 `skchr_haruka_1` | S1 | official p_atk_idgfshblh, game p_atk_idgfshbl_n |
| 하루카 (`char_4202_haruka`) | S2 `skchr_haruka_2` | S2 | official p_atk_idgfshblh, game p_atk_idgfshbl_n |
| 引星棘刺 (`char_1039_thorn2`) | S1 `skchr_thorn2_1` | 기본 | official p_atk_trshldacys_d, game p_atk_trshldacys_n |
| 체르니 (`char_4047_pianst`) | S1 `skchr_pianst_1` | S1 | official p_imp_pianohit_h, game p_imp_pianohit_n |
| 체르니 (`char_4047_pianst`) | S2 `skchr_pianst_2` | S2 | official p_imp_pianohit_s1/p_imp_pianohit_s2/p_imp_pianohit_s3, game p_imp_pianohit_h |
| 헬라그 (`char_188_helage`) | S3 `skchr_helage_3` | S3 | official p_skill_huirenzhan, game p_atk_falchion_n |
| 野鬃 (`char_496_wildmn`) | S1 `skchr_wildmn_1` | S1 | official p_imp_spearstab_n, game p_atk_spearstab_n |
| 莎草 (`char_4139_papyrs`) | S1 `skchr_papyrs_1` | 기본 | official p_atk_ctschlar_d, game p_atk_ctschlar_n |
| 위셔델 (`char_1035_wisdel`) | S1 `skchr_wisdel_1` | 기본 | official p_atk_dkmrcaygn_d, game p_atk_dkmrcaygn_n |
| 베이스라인 (`char_4109_baslin`) | S1 `skchr_baslin_1` | 기본 | official p_atk_euphnium_d, game p_atk_euphnium_n |
| 오올헤약 (`char_4027_heyak`) | S1 `skchr_heyak_1` | 기본 | official p_atk_quetzstaff_d, game p_atk_quetzstaff_n |
| 余 (`char_2026_yu`) | S1 `skchr_yu_1` | S1 | official p_atk_frbytrtn_p, game p_atk_frbytrtn_n |
| 余 (`char_2026_yu`) | S1 `skchr_yu_1` | S1 | official p_imp_frbytrtn_p, game p_imp_frbytrtn_n |
| 号角 (`char_4039_horn`) | S1 `skchr_horn_1` | 기본 | official p_atk_blackcannoncast_d, game p_skill_blackcannonfull_cast |
| 号角 (`char_4039_horn`) | S3 `skchr_horn_3` | S3 | official p_atk_heavygun_n, game p_skill_blackcannonfull_cast |
| 至简 (`char_4054_malist`) | S2 `skchr_malist_2` | 기본 | official p_atk_staffcannon_h, game p_atk_staffcannon_n |
| 사가 (`char_362_saga`) | S3 `skchr_saga_3` | S3 | official p_imp_ninjasword_h_1, game p_imp_ninjasword_n |
| 외드레르 (`char_4088_hodrer`) | S1 `skchr_hodrer_1` | 기본 | official p_atk_hdvysword_d, game p_atk_hdvysword_n |
| 送葬人 (`char_279_excu`) | S2 `skchr_excu_2` | S2 | official p_atk_shotgun_double, game p_atk_shotgun_n |
| 좌락 (`char_4121_zuole`) | S1 `skchr_zuole_1` | 기본 | official p_atk_wrrsrd_d, game p_atk_wrrsrd_n |
| 忍冬 (`char_4026_vulpis`) | S1 `skchr_vulpis_1` | 기본 | official p_atk_fxssnom_d, game p_atk_fxssnom_n |
| 溯光星源 (`char_1047_halo2`) | S2 `skchr_halo2_2` | 기본 | official p_atk_strbsvr_h, game p_atk_strbsvr_n |
| 信仰搅拌机 (`char_4194_rmixer`) | S3 `skchr_rmixer_3` | 기본 | official p_atk_ftmxbrtlm_skiiop, game p_atk_ftmxbrtlm_s |
| 协律 (`char_4051_akkord`) | S1 `skchr_akkord_1` | 기본 | official p_atk_mlysndv_d, game p_atk_mlysndv_n |
| 塑心 (`char_245_cello`) | S2 `skchr_cello_2` | S2 | official p_atk_shphrt_s_1/p_atk_shphrt_s_2/p_atk_shphrt_s_3, game p_atk_shphrt_n_1 |
| 妮芙 (`char_4146_nymph`) | S2 `skchr_nymph_2` | 기본 | official p_atk_scbslck_h, game p_atk_scbslck_n |
| 空弦 (`char_332_archet`) | S1 `skchr_archet_1` | 기본 | official p_atk_archet_h_cast, game p_atk_archet_n |
| 空弦 (`char_332_archet`) | S3 `skchr_archet_3` | S3 | official p_atk_archet_s_cast, game p_atk_archet_n |
| 海霓 (`char_4079_haini`) | S1 `skchr_haini_1` | 기본 | official p_atk_tchnlgywr_d, game p_atk_tchnlgywr_n |
| 凛御银灰 (`char_1045_svash2`) | S1 `skchr_svash2_1` | 기본 | official p_atk_snwlprdg_d, game p_atk_snwlprdg_n1 |
| 寒芒克洛丝 (`char_1021_kroos2`) | S1 `skchr_kroos2_1` | S1 | official p_atk_krossbow_n, game p_atk_crossbow_n |
| 乌尔比安 (`char_4145_ulpia`) | S1 `skchr_ulpia_1` | 기본 | official p_atk_wtrbatnchr_d, game p_atk_wtrbatnchr_n |

## 공격·타격음: 다른 모드 소리 차용 (27)

| 오퍼레이터 | 스킬 | 공식 모드 | 내용 |
|---|---|---|---|
| 파죰카 (`char_4055_bgsnow`) | S1 `skchr_bgsnow_1` | S1 | no official bank for this skill's mode, game borrows p_atk_penarrow_d |
| 荒芜拉普兰德 (`char_1038_whitw2`) | S1 `skchr_whitw2_1` | S1 | no official bank for this skill's mode, game borrows p_atk_whtolfdrksl_d |
| 레이 (`char_4117_ray`) | S3 `skchr_ray_3` | 기본 | no official bank for this skill's mode, game borrows p_atk_sndshotgun_s |
| Mon3tr (`char_4179_monstr`) | S3 `skchr_monstr_3` | S3 | no official bank for this skill's mode, game borrows p_imp_kxdtctm_s |
| 비비아나 (`char_4098_vvana`) | S3 `skchr_vvana_3` | 기본 | no official bank for this skill's mode, game borrows p_atk_shdswrd_s |
| 비비아나 (`char_4098_vvana`) | S3 `skchr_vvana_3` | 기본 | no official bank for this skill's mode, game borrows p_imp_lghtnswrd_s |
| 灰毫 (`char_431_ashlok`) | S2 `skchr_ashlok_2` | 기본 | no official bank for this skill's mode, game borrows p_atk_heavygun_h |
| 도로시 (`char_4048_doroth`) | S2 `skchr_doroth_2` | 기본 | no official bank for this skill's mode, game borrows p_atk_sandatk_h |
| 归溟幽灵鲨 (`char_1023_ghost2`) | S1 `skchr_ghost2_1` | Empty | no official bank for this skill's mode, game borrows p_atk_sharpsaw_d |
| 归溟幽灵鲨 (`char_1023_ghost2`) | S1 `skchr_ghost2_1` | Empty | no official bank for this skill's mode, game borrows p_imp_sharpsaw_d |
| 레이즈 더 썬더브링어 (`char_1043_leizi2`) | S1 `skchr_leizi2_1` | 기본 | no official bank for this skill's mode, game borrows p_atk_lzxqlkl_d1 |
| 谬因 (`char_4229_aphris`) | S1 `skchr_aphris_1` | 기본 | no official bank for this skill's mode, game borrows p_atk_mcdtlsrfr_d |
| 谬因 (`char_4229_aphris`) | S3 `skchr_aphris_3` | 기본 | no official bank for this skill's mode, game borrows p_atk_mcdtlsr_s |
| 谬因 (`char_4229_aphris`) | S3 `skchr_aphris_3` | 기본 | no official bank for this skill's mode, game borrows p_imp_mcdtlsr_s |
| 쏜즈 (`char_293_thorns`) | S3 `skchr_thorns_3` | S3 | no official bank for this skill's mode, game borrows p_imp_brandishsabre_s |
| 마젤란 (`char_248_mgllan`) | S1 `skchr_mgllan_1` | S1_Default | no official bank for this skill's mode, game borrows p_atk_icecamera_h |
| 마젤란 (`char_248_mgllan`) | S1 `skchr_mgllan_1` | S1_Default | no official bank for this skill's mode, game borrows p_imp_icecamera_h |
| 마젤란 (`char_248_mgllan`) | S2 `skchr_mgllan_2` | S1_Default | no official bank for this skill's mode, game borrows p_atk_icecamera_h |
| 마젤란 (`char_248_mgllan`) | S2 `skchr_mgllan_2` | S1_Default | no official bank for this skill's mode, game borrows p_imp_icecamera_h |
| 마젤란 (`char_248_mgllan`) | S3 `skchr_mgllan_3` | S1_Default | no official bank for this skill's mode, game borrows p_atk_icecamera_h |
| 마젤란 (`char_248_mgllan`) | S3 `skchr_mgllan_3` | S1_Default | no official bank for this skill's mode, game borrows p_imp_icecamera_h |
| 至简 (`char_4054_malist`) | S1 `skcom_quickattack[3]` | 기본 | no official bank for this skill's mode, game borrows p_atk_staffcannon_d |
| 至简 (`char_4054_malist`) | S1 `skcom_quickattack[3]` | 기본 | no official bank for this skill's mode, game borrows p_imp_staffcannon_d |
| 유키 마코토 (`char_4217_makoto`) | S1 `skchr_makoto_1` | 기본 | no official bank for this skill's mode, game borrows p_atk_pskptldrh_d |
| 유키 마코토 (`char_4217_makoto`) | S2 `skchr_makoto_2` | 기본 | no official bank for this skill's mode, game borrows p_atk_pskptldr_h |
| 유키 마코토 (`char_4217_makoto`) | S2 `skchr_makoto_2` | 기본 | no official bank for this skill's mode, game borrows p_imp_pskptldr_h |
| 유키 마코토 (`char_4217_makoto`) | S3 `skchr_makoto_3` | 기본 | no official bank for this skill's mode, game borrows p_atk_pskptldr_s1 |

## 공격·타격음: 공식 있음, 게임 없음 (3)

| 오퍼레이터 | 스킬 | 공식 모드 | 내용 |
|---|---|---|---|
| 파죰카 (`char_4055_bgsnow`) | S3 `skchr_bgsnow_3` | S3 | official p_atk_penarrow_s, game none |
| 토가와 사키코 (`char_4182_oblvns`) | S2 `skchr_oblvns_2` | S2_AttackSpeed | official p_atk_mjckyrdnt_h, game none |
| 토가와 사키코 (`char_4182_oblvns`) | S3 `skchr_oblvns_3` | S3 | official p_atk_mjckyrdslnt, game none |

## 모션: 공식과 다른 클립 (11)

| 오퍼레이터 | 스킬 | 공식 모드 | 내용 |
|---|---|---|---|
| 피아메타 (`char_300_phenxi`) | S3 `skchr_phenxi_3` | S3 | official Skill_2_Loop, game Skill_Begin/Skill_Loop/Skill_End |
| 블레이즈 (`char_017_huang`) | S2 `skchr_huang_2` | S2 | official Skill_1, game Skill_2_Begin/Skill_2_Loop |
| 스테인리스 (`char_4072_ironmn`) | S2 `skchr_ironmn_2` | S1 | official Skill_1, game Skill_2 |
| 水月 (`char_437_mizuki`) | S2 `skchr_mizuki_2` | S1 | official Skill_1, game Skill_2_Start/Skill_2_Loop/Skill_2_End |
| 水月 (`char_437_mizuki`) | S3 `skchr_mizuki_3` | S2 | official Skill_2_Loop, game Attack |
| 莫斯提马 (`char_213_mostma`) | S3 `skchr_mostma_3` | S2 | official Skill_2_Loop, game Skill_Begin/Skill_Loop/Skill_End |
| 유넥티스 (`char_416_zumama`) | S3 `skchr_zumama_3` | S3 | official Skill_2_Loop, game Skill |
| 焰影苇草 (`char_1020_reed2`) | S3 `skchr_reed2_3` | S3 | official Skill_3_Attack, game Skill_3_Begin/Skill_3_Loop/Skill_3_End |
| 卡涅利安 (`char_426_billro`) | S2 `skchr_billro_2` | S2 | official Skill_Loop, game Skill_2_Begin/Skill_2_Loop/Skill_2_End |
| 니엔 (`char_2014_nian`) | S3 `skchr_nian_3` | S3 | official Skill_2_Loop, game Attack_Begin/Attack_Loop/Attack_End |
| 风笛 (`char_222_bpipe`) | S3 `skchr_bpipe_3` | S3 | official Skill_2_Loop, game Skill |

## 모션: 모델에 공식 클립 없음 (6)

| 오퍼레이터 | 스킬 | 공식 모드 | 내용 |
|---|---|---|---|
| 薄绿 (`char_388_mint`) | S1 `skchr_mint_1` | S1 | model has no Skill_1_Attack clip |
| 远牙 (`char_430_fartth`) | S3 `skchr_fartth_3` | S3 | model has no Skill_Loop clip |
| 쏜즈 (`char_293_thorns`) | S3 `skchr_thorns_3` | S3 | model has no Skill_2 clip |
| 异客 (`char_472_pasngr`) | S2 `skchr_pasngr_2` | S2 | model has no Skill_2 clip |
| 史尔特尔 (`char_350_surtr`) | S3 `skchr_surtr_3` | S3 | model has no Skill_3_Attack clip |
| 사가 (`char_362_saga`) | S3 `skchr_saga_3` | S3 | model has no Skill_3_Loop clip |

## 발동음: 공식에 없는 소리 (12)

| 오퍼레이터 | 스킬 | 공식 모드 | 내용 |
|---|---|---|---|
| 德克萨斯 (`char_102_texas`) | S2 `skchr_texas_2` | 기본 | no official activation bank, game plays p_skill_swordrain |
| 小满 (`char_4122_grabds`) | S2 `skchr_grabds_2` | S2 | no official activation bank, game plays p_skill_ctefltpn |
| 토가와 사키코 (`char_4182_oblvns`) | S1 `skchr_oblvns_1` | 기본 | no official activation bank, game plays p_skill_mjckyrdglsnt_d1 |
| 토가와 사키코 (`char_4182_oblvns`) | S2 `skchr_oblvns_2` | S2_AttackSpeed | no official activation bank, game plays p_skill_mjckyrdslnt_h2 |
| 토가와 사키코 (`char_4182_oblvns`) | S3 `skchr_oblvns_3` | S3 | no official activation bank, game plays p_skill_mjckyrdslnt_s1 |
| 蒂比 (`char_4191_tippi`) | S1 `skchr_tippi_1` | S1 | no official activation bank, game plays p_skill_pmtjtckp |
| 蒂比 (`char_4191_tippi`) | S2 `skchr_tippi_2` | S2 | no official activation bank, game plays p_skill_pmtjtckp |
| 켈시 (`char_003_kalts`) | S3 `skchr_kalts_3` | S3 | no official activation bank, game plays p_skill_mon3trburst |
| 忍冬 (`char_4026_vulpis`) | S2 `skchr_vulpis_2` | 기본 | no official activation bank, game plays p_skill_fxssnomswdrn |
| 슈 (`char_2025_shu`) | S2 `skchr_shu_2` | S2 | no official activation bank, game plays p_skill_drgndfmrt |
| 纯烬艾雅法拉 (`char_1016_agoat2`) | S2 `skchr_agoat2_2` | 기본 | no official activation bank, game plays p_skill_gtshpbrnch_h |
| 凛御银灰 (`char_1045_svash2`) | S2 `skchr_svash2_2` | 기본 | no official activation bank, game plays p_skill_snwlprdg_h |

## 발동음: 공식 있음, 게임 없음 (2)

| 오퍼레이터 | 스킬 | 공식 모드 | 내용 |
|---|---|---|---|
| 나이팅게일 (`char_179_cgbird`) | S3 `skchr_cgbird_3` | S3 | official p_field_elefield_loop, game none |
| 이스티나 (`char_195_glassb`) | S2 `skchr_glassb_2` | S2 | official p_field_elefield_loop, game none |


## 결정 (2026-10-26)

남은 항목은 모두 현재 상태로 유지한다.

- 공식 클립이 모델에 없는 모션 6건: mint S1, fartth S3, thorns S3, pasngr S2, surtr S3, saga S3.
- 공식 공격음·타격음 묶음이 없는 25곳: 같은 오퍼레이터의 자기 음원을 유지한다.
- 공식 발동음 묶음이 없는 13곳: 오퍼레이터 전용 `p_skill_*` 음원을 유지한다.
- 다른 스킬의 모드를 가리키는 공식 연결 4건(ironmn S2, mostma S3, mizuki S2·S3): 추출 오류로 보고 기존 모션을 유지한다.
