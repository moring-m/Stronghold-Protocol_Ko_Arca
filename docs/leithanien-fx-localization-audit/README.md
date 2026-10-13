# Isolated v0.2.5 Leithanien and Korean review

All ten faction members were checked, including Carnelian and Eyjafjalla the Hvit Aska. Their 20 front/back Spine models parsed in Chromium with the real PIXI/pixi-spine loader; no missing attack animation or model-load failures were observed. 26 selectable skill cases were simulated without content errors, with both-side skill clip validation. Earthspirit S2 stops attacking by design; charged Carnelian S1 also retains the non-attacking guard trait. Ebenholz S3 was tested against an elite target because normal targets are intentionally ignored.

The renderer regression exercises actual attack events and visible projectile/contact/sweep records with damage numbers disabled. Attack effects may use shared procedural visuals rather than character-specific original Unity particles. This check does not certify an original-particle reproduction for every operator or skin. 69 attack/render/sound tests and 17 faction content tests passed.

Runtime Korean dictionary checks cover visible UI source strings and display fields of the served operator data. Combat-only mechanicText is excluded and untouched. Added missing potential-dependent talent and module descriptions, pause and shop-lock shortcuts, cooperative HP tooltips, and corrected a mixed Korean/Chinese strategy-selection message. The rerun found no untranslated operator display fields. Remaining CJK candidates are deliberately native language labels or a source comment, not missing gameplay translations.

No commit, push, or operating-server deployment was performed.
