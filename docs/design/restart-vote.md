# Restart voting (Korean fork)

## Basis and scope

The owner's 2026-11-18 decision supersedes PR #28's pause requirement: games must continue during restart voting.
This is an intentional room-management extension, not an official combat rule. [ASSUMED]: no undocumented official
restart rule is asserted. No combat values, RNG order or golden digests change.

## Room policy

`shared/restartVote.js` derives policy from custom-extension values. Only custom rooms override it; ordinary and
augment rooms use defaults. Hosts edit settings before starting, never during play. Both seasons support them.

| Setting | Default | Allowed values |
| --- | --- | --- |
| Agreement | Unanimous | Unanimous or strictly more than half |
| Include eliminated players still in the room | Yes | Yes / no |
| Vote time limit | 45 seconds | 15–90 seconds |
| Room cooldown | 120 seconds | 0–3,600 seconds, from vote end |
| Requester's cooldown | 180 seconds | 0–3,600 seconds, from their request |
| Requests per person per game | 2 | 1–10; reset on the next game |

The requester automatically votes Yes. Bots and spectators are excluded. The threshold is N for unanimity or
floor(N / 2) + 1 for majority: 3 of 4 or 5 of 8. The denominator counts eligible humans, not submitted votes.
Departed eliminated players lose eligibility and their votes; recompute the threshold. A living voter leaving
cancels the vote. Disconnection is distinct from leaving. Never pass with an empty electorate. Publish aggregate
counts and the recipient's own answer, never other individual answers.

## Gameplay and lifecycle

`restartVoteRoster` obtains the eligible roster in either match engine, locally or across the host proxy. A pending
snapshot prevents concurrent starts. This call is read-only: no match pause, timer/deadline adjustment, gameplay
command rejection or delayed combat report. Prep, strategy waits, event/augment/bounty choices and combat continue.
Existing solo pause controls retain their own behaviour; restart voting neither starts nor ends a solo pause.

Vote deadlines/cooldowns use wall time independently of gameplay. Rejection, timeout or cancellation only ends the
vote. Passing disposes the match, returns participants to the same room, preserves seats/settings/chat and clears
ready state. Match completion cancels any outstanding vote. Reject stale match/vote messages.

## Presentation and input

A centered popup keeps the same anchor in ordinary gameplay and choice screens, expanded or collapsed.
It is 500px wide expanded and 400px collapsed, constrained to the viewport with 12px clearance and internal scrolling.
It uses the shared modal box, brackets, stripe, texture, frame and fonts of the selected UI
theme, with an opaque background beneath theme layers. There is no full-screen veil, autofocus or focus trap.
Pointer events outside the popup and normal keyboard navigation/gameplay remain available.

Each new vote opens expanded, including on full-screen choices. Opening a choice screen does not change the user's
fold preference. The popup stays above strategy/recruit, augment and bounty choices without moving or resizing
their UI. It intentionally overlaps the selection content; users can fold it to expose more of that content.
There is no reserved side/bottom lane. Standard modal dialogs retain their higher stacking/focus priority.

Collapsing preserves remaining seconds, aggregate counts, own vote state and an expand button. Folding does not
cast or reset a vote or selection. A new vote resets selection and expanded preference. No/Yes cards require a
second click after at least 150ms; repeated held keys cannot confirm. Submitted answers are immutable. Disconnected
or expired votes cannot submit. Unanswered timeout means failure.

New text uses t()/tc(), Chinese source IDs and every shipped UI catalog. Native localization boundaries prevent
legacy DOM translation from translating the same output twice. Rebuild Korean UI and language-pack hashes with
`tools/build-korean-ui.mjs` and `tools/build-language-packs.mjs`.

[Validation and known baseline failures](../reviews/restart-vote-2026-11-18.md).
