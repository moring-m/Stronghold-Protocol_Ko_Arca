# Restart vote validation — 2026-11-18

## Central popup follow-up

The owner selected the central-popup mockup. Rebased `feat/restart-vote-master` onto the freshly fetched Arca
`origin/master` at `1127bf81` before implementation. The expanded popup is 500px wide, the folded summary 400px,
both viewport-constrained and centered above choice screens. No auto-folding or side/bottom layout reservation
remains; the selected theme's native modal surfaces and ordinary modal priority are retained.

Validation on Windows / Node 26.13.0 / installed Chrome:

- `node --test test/restart-vote.test.js test/lobby-restart-vote.test.js test/match/restart-progress.test.js`:
  `tests 17; pass 17; fail 0`.
- `SP_VOTE_ART_ROOT=D:/Myeongto-Replica/public node tools/capture-restart-vote.mjs`:
  `Completed 98 screenshots, 56 theme checks; no page errors`. Actual 4/8-human rooms; strategy draft, prep,
  item event, bounty selection, ally/enemy augment selection and combat; five viewports in both fold states.
  Checks cover central positioning, click priority above choices, hidden folded details, unchanged choice layout,
  continuing clocks/gameplay requests, card-selection preservation and double-click confirmation. All 28 UI themes
  retain shared native modal styling. Standard settings dialogs retain higher stacking priority.
- Changed JavaScript ESLint: zero errors and warnings. Import-boundary check and `git diff --check` pass.
- Docs checks: `tests 25; pass 16; fail 9`. An extracted `1127bf81` baseline with installed vendor dependencies
  reproduces the exact same nine failing test names. Strict UI catalogs still report 76 missing messages per
  shipped non-Chinese pack and zero format errors; this follow-up introduces no new text.

Current logs: ignored `.cache/restart-center-*.log`; screenshots/manifest: `.cache/restart-vote-center/`.
The temporary browser-test server closes at completion. No PR is opened and no golden results are changed.

The following sections record the earlier dock implementation and its historical validation, superseded for layout
by this central-popup follow-up.

## Change and basis

Rebase of `mine/codex/restart-vote-master` onto Arca `origin/master` at `5e78d2c4`, with the owner's current
requirements superseding PR #28's pause design: uninterrupted gameplay, a compact themed panel, collapse/expand,
and coexistence with full-screen choices. The same dock anchor is used during ordinary gameplay and choices.
The read-only eligible-roster API covers Alliance and Regulation, including process and worker hosts. Existing
room policy and anonymous per-recipient voting remain. No PR is opened; no release version is rolled back.

[ASSUMED]: this is a Korean-fork room-management product decision, not an assertion of an official restart rule.
No combat rules, generated game data, CI policy or golden files are changed. See [the contract](../design/restart-vote.md).

## Passing checks

Windows, Node 26.13.0 and installed Chrome. These are local browser viewports, not physical mobile/multi-device tests.

- Focused Node tests (restart-vote, lobby-restart-vote, match/restart-progress, ui/public-room-settings,
  season-extensions, lobby-season-settings, match/plugin-host, match/augments):
  `tests 98; pass 98; fail 0`. Includes actual process/worker roster RPC and continuing gameplay during a vote.
- `SP_E2E=1 node --test test/ui/restart-vote-i18n.browser.test.js`: `tests 1; pass 1; fail 0`.
- `node tools/capture-restart-settings.mjs`: default Regulation room saves/restores majority and eliminated-player
  settings; vote seconds remain bounded to 15–90; 91 is rejected; no browser errors.
- `node tools/capture-restart-vote.mjs`, with already installed art and theme roots: actual 4/8-human rooms,
  strategy draft, prep, item event, official bounty selection, ally/enemy augment selection and combat. Both
  collapsed/expanded states at 1600×1000, 1024×768, 390×844, 320×640 and 844×390. Assertions cover dock/choice
  separation, visible toggles, true hidden details, independent clocks, ordinary gameplay and choice/reroll requests,
  preservation of selection across folding, double-click confirmation and standard settings-modal priority.
- All 28 UI themes in both room sizes (56 checks), including 46 locally cached theme images decoded and size-checked.
  Background image, border image, corner shape, radius and font match a shared native modal; the panel stays opaque.
- Server smoke and import-boundary checks pass. Changed JavaScript files have zero ESLint errors.
- `git diff --check` passes. No golden scenario changes.

Screenshots and the JSON manifest are generated under ignored `.cache/restart-vote-final/`; game art is not committed.
Optional environment variables: `SP_VOTE_ART_ROOT`, `SP_VOTE_THEME_ROOT`, `SP_VOTE_CAPTURE_OUT`.

## Existing master failures and limits

A separate detached checkout of `5e78d2c4` was used to distinguish existing failures. Full-suite success is not claimed.

- `node tools/i18n.mjs check --all --strict`: each of en/ja/ko/zh-TW has 76 existing missing messages and zero format
  errors, matching master. The new messages are supplied in every shipped UI pack.
- Docs consistency/path tests: `tests 25; pass 16; fail 9`, with the identical failing-test names on master.
  Eight obsolete monolithic DESIGN section assertions and the missing `OFFICIAL_PACK_EXT` export are unchanged.
- CI guards: six existing failures around workflow/shard wiring and measurement coverage reproduce on master.
  The bare baseline checkout has one additional missing-local-dependency guard; it is not a product regression.
- Full lint: 235 errors on both master and this branch; changed files have no errors. Typecheck: 25 diagnostics on
  both checkouts. Existing shared custom-extension type diagnostics move line numbers because of new rule rows.
- `npm run golden` fails on both checkouts at `tools/golden.mjs:355`: `gd.standIn is not a function`.
  No expected digest is regenerated. The whole game test suite was not certified; focused checks are listed above.

The complete check logs remain in ignored `.cache/restart-final-*.log`; earlier pre-rebase PR #28 evidence is not
presented as validation of this change.
