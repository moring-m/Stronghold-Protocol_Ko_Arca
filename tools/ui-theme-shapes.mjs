// tools/ui-theme-shapes.mjs — the shape layer of the event-guide UI themes (tools/ui-theme-guides.mjs): what each guide
// draws as *form*, not colour — its section headers (torn tags, tricolour slashes, glass pills, gilt plaques, meander
// banners…), its panel frames (photo bevels, pinned case files, circuit corners, octagonal double lines…), its button
// and card silhouettes and its bond markers (the HUD bond board's ring is replaced by the guide's own badge). Every shape
// is drawn here in CSS / inline SVG — no guide artwork is copied. tools/build-ui-themes.mjs appends shapeCss(id).

/** An inline SVG as a CSS url(). */
const svg = (w, h, body) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>${body}</svg>`).replace(/'/g, '%27').replace(/%2523/g, '%23')}")`;
/** A 9-slice frame from a 60×60 SVG (corners 20 px) as border-image, the panel's own fill kept inside. */
const frame = (body, width = '.12rem', slice = 20, repeat = 'stretch') =>
  `border-style: solid; border-width: ${width}; border-image: ${svg(60, 60, body)} ${slice} fill / ${width} / 0 ${repeat};`;
const NO_RING = (S) => `${S} .hbond__ring { opacity: 0; }
${S} .hbond__board { filter: none; }
${S} .hbond.is-disabled .hbond__board { filter: grayscale(1) brightness(.6); }
${S} .hbond__board::before { content: ''; position: absolute; pointer-events: none; }
${S} .hbond .hbond__num, ${S} .hbond .hbond__num.has-matte { background: none !important; border: 0; clip-path: none; filter: none; font-weight: 800;
  color: var(--hb-count-ink, #ffffff); text-shadow: 0 0 2px #000, 0 0 2px #000, 0 1px 2px #000, 0 0 4px rgba(0, 0, 0, .8); }`;

const SHAPES = {
  // ---- 우르수스 · 사람들, 우리들 -----------------------------------------------------------------------------------
  'f-ursus': (S) => `
${S} .section-label { width: fit-content; padding: .04rem .26rem; color: #fff; background: linear-gradient(180deg, #a3242b, #7d161c);
  clip-path: polygon(1% 8%, 6% 0, 18% 6%, 31% 1%, 47% 7%, 62% 0, 78% 5%, 92% 0, 100% 9%, 98% 32%, 100% 58%, 97% 82%, 100% 100%, 84% 94%, 68% 100%, 51% 93%, 36% 100%, 20% 94%, 6% 100%, 0 88%, 2% 62%, 0 36%);
  box-shadow: none; text-shadow: 0 1px 0 rgba(0, 0, 0, .5); }
${S} :is(.panel, .modal__box, .bpop, .dpanel) { ${frame(`<rect x='1' y='1' width='58' height='58' fill='none' stroke='%23111' stroke-width='2'/><rect x='3' y='3' width='54' height='54' fill='none' stroke='%23787070' stroke-width='5'/><rect x='6.5' y='6.5' width='47' height='47' fill='none' stroke='%23141417' stroke-width='2'/><path d='M3 3h54' stroke='%23a59c98' stroke-width='1.2'/>`, '.09rem')} }
${S} :is(.panel, .modal__box, .bpop, .dpanel)::after { content: ''; position: absolute; left: -.06rem; top: -.06rem; width: 1.6rem; height: .5rem; pointer-events: none; height: .5rem; top: -.1rem; background: ${svg(160, 50, `<path d='M4 40 L60 8 L118 30 L156 6' fill='none' stroke='%23b3242c' stroke-width='1.6'/><circle cx='4' cy='40' r='3.5' fill='%23d8d0cc'/><circle cx='60' cy='8' r='3.5' fill='%23d8d0cc'/><circle cx='118' cy='30' r='3.5' fill='%23d8d0cc'/>`)} left top / contain no-repeat; }
${NO_RING(S)}
${S} .hbond__board::before { inset: 14%; background: #2b292d; border: calc(3 * var(--u)) solid #847b78; transform: rotate(-4deg); box-shadow: 0 0 0 calc(1 * var(--u)) #111; }
${S} .hbond.is-full .hbond__board::before { background: #a3242b; border-color: #d2ccc7; }`,

  // ---- 카시미어 · 니어 라이트 ----------------------------------------------------------------------------------------
  'f-kazimierz': (S) => `
${S} .section-label { width: fit-content; padding: .04rem .3rem .04rem .26rem; color: #fff; font-style: italic; font-weight: 900;
  background: linear-gradient(115deg, #1b2f6e 0 .12rem, #fff .12rem .16rem, #3a63c8 .16rem .22rem, transparent .22rem), linear-gradient(90deg, #454b5c, #2b2f3a 70%, #d02b3a 70% 74%, #2b2f3a 74%);
  clip-path: polygon(.14rem 0, 100% 0, calc(100% - .14rem) 100%, 0 100%); }
${S} :is(.panel, .modal__box, .bpop, .dpanel) { border: 2px solid transparent; border-radius: .14rem;
  background: linear-gradient(180deg, rgba(20, 26, 48, .96), rgba(12, 15, 28, .97)) padding-box, linear-gradient(135deg, #3a63c8, #8a6fb0 50%, #d02b3a) border-box; }
${S} .panel__title { font-style: italic; }
${S} :is(.mode-card, .seat) { border-radius: .12rem; }
${NO_RING(S)}
${S} .hbond__board::before { inset: 16% 10%; border-radius: calc(10 * var(--u)); background: linear-gradient(180deg, #2b3550, #141a30); border: calc(3 * var(--u)) solid #3a63c8; box-shadow: inset 0 calc(-4 * var(--u)) 0 #d02b3a; }
${S} .hbond.is-full .hbond__board::before { background: linear-gradient(115deg, #3a63c8 0 55%, #d02b3a 55%); border-color: #fff; box-shadow: none; }`,

  // ---- 에기르 · 삶의 길 ----------------------------------------------------------------------------------------------
  'f-aegir': (S) => `
${S} .section-label { width: fit-content; padding: .04rem .24rem .04rem .2rem; border-radius: 99px; color: #e8f2f3;
  background: linear-gradient(180deg, rgba(95, 211, 208, .32), rgba(47, 111, 114, .5)); box-shadow: inset 0 0 0 1px rgba(143, 240, 236, .6), 0 0 .12rem rgba(95, 211, 208, .35); }
${S} .section-label::before { content: '○'; color: #8ff0ec; font-size: .8em; margin-right: .06rem; }
${S} :is(.panel, .modal__box, .bpop, .dpanel) { ${frame(`<rect x='8' y='8' width='44' height='44' fill='none' stroke='%232f6f72' stroke-width='1'/><path d='M1 8h14M8 1v14M45 8h14M52 1v14M1 52h14M8 45v14M45 52h14M52 45v14' stroke='%235fd3d0' stroke-width='1'/><circle cx='1.5' cy='8' r='1.5' fill='%238ff0ec'/><circle cx='58.5' cy='52' r='1.5' fill='%238ff0ec'/>`, '.1rem')} box-shadow: 0 0 .16rem rgba(95, 211, 208, .1); }
${S} :is(.panel__title, .modal__title)::before { content: '✦ '; color: #5fd3d0; }
${S} .btn { border-radius: .04rem; }
${S} .btn--primary { border-radius: 99px; }
${NO_RING(S)}
${S} .hbond__board::before { inset: 14%; border-radius: 50%; background: radial-gradient(circle, #1c252b 55%, #12181c); border: calc(2 * var(--u)) solid #4fa9ab; box-shadow: 0 0 0 calc(3 * var(--u)) rgba(95, 211, 208, .18), 0 0 calc(8 * var(--u)) rgba(95, 211, 208, .35); }
${S} .hbond.is-full .hbond__board::before { background: radial-gradient(circle, #8ff0ec, #3bb3b0); border-color: #e8f2f3; }`,

  // ---- 라테라노 · 공상의 정원 ----------------------------------------------------------------------------------------
  'f-laterano': (S) => `
${S} .section-label { padding: .04rem .5rem .04rem .26rem; color: #fff; letter-spacing: .12em;
  background: ${svg(40, 20, `<path d='M2 10 L9 3 L16 10 L9 17Z' fill='%233ec6e0'/>`)} right .08rem center / .3rem .16rem no-repeat,
    repeating-linear-gradient(135deg, rgba(255, 255, 255, .5) 0 1px, transparent 1px 4px) right .44rem center / .5rem .1rem no-repeat,
    linear-gradient(90deg, #3ec6e0 0 .06rem, #45535e .06rem .1rem, #566673 .1rem); }
${S} :is(.panel, .modal__box, .bpop, .dpanel) { ${frame(`<path d='M14 1 H46 L59 14 V46 L46 59 H14 L1 46 V14Z' fill='%23fbfcfc' stroke='%23b8c4cc' stroke-width='1'/><path d='M16 5 H44 L55 16 V44 L44 55 H16 L5 44 V16Z' fill='none' stroke='%23d5dde3' stroke-width='1'/>`, '.14rem', 20)} box-shadow: none; filter: drop-shadow(0 .03rem .08rem rgba(60, 80, 95, .12)); }
${NO_RING(S)}
${S} .hbond__board::before { inset: 12%; clip-path: polygon(30% 0, 70% 0, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0 70%, 0 30%); background: linear-gradient(180deg, #7a8c9a, #4f606d); }
${S} .hbond.is-full .hbond__board::before { background: linear-gradient(180deg, #57d5ea, #2c9ab4); }`,

  // ---- 빅토리아 · 위대한 서곡의 끝 -----------------------------------------------------------------------------------
  'f-victoria': (S) => `
${S} .section-label { width: fit-content; padding: .05rem .3rem; color: #2a1606; text-shadow: 0 1px 0 rgba(255, 240, 200, .5);
  background: linear-gradient(180deg, #f2d48a, #c99440 55%, #a8742c);
  clip-path: polygon(3% 12%, 9% 0, 30% 6%, 52% 0, 76% 5%, 93% 0, 98% 14%, 100% 50%, 97% 88%, 90% 100%, 66% 95%, 44% 100%, 20% 94%, 6% 100%, 1% 84%, 0 48%); }
${S} :is(.panel, .modal__box, .bpop, .dpanel) { ${frame(`<rect x='2' y='2' width='56' height='56' fill='none' stroke='%23d6a64a' stroke-width='2.5'/><rect x='6' y='6' width='48' height='48' fill='none' stroke='%237a5a30' stroke-width='1'/><path d='M2 2l7 7M58 2l-7 7M2 58l7-7M58 58l-7-7' stroke='%23f0c870' stroke-width='1'/>`, '.1rem')} box-shadow: 0 0 .22rem rgba(240, 200, 112, .18), 0 .08rem .3rem rgba(0, 0, 0, .6); }
${S} .panel__title::after { content: ''; display: block; height: .1rem; margin-top: .03rem; background: ${svg(200, 10, `<path d='M0 5H88M112 5H200' stroke='%23a07a48' stroke-width='1'/><path d='M100 0L103 5L100 10L97 5Z M92 5L100 3.5L108 5L100 6.5Z' fill='%23d6a64a'/>`)} center / 100% 100% no-repeat; }
${S} :is(.mode-card, .seat) { box-shadow: inset 0 0 0 1px #d6a64a, inset 0 0 0 3px rgba(0, 0, 0, .5), inset 0 0 0 4px rgba(214, 166, 74, .35); }
${NO_RING(S)}
${S} .hbond__board::before { inset: 16%; transform: rotate(45deg); background: linear-gradient(135deg, #3b291d, #1b0f0a); border: calc(3 * var(--u)) solid #d6a64a; box-shadow: 0 0 calc(6 * var(--u)) rgba(240, 200, 112, .4); }
${S} .hbond.is-full .hbond__board::before { background: linear-gradient(135deg, #f2d48a, #b8863a); }`,

  // ---- 라이타니엔 · 츠빌링슈튀르메의 가을 ------------------------------------------------------------------------------
  'f-leithanien': (S) => `
${S} .section-label { width: fit-content; padding: .08rem .3rem .08rem .38rem; color: #f3e9da; letter-spacing: .1em;
  background: ${svg(30, 40, `<text x='2' y='31' font-size='34' fill='%23c9a35a' font-family='serif'>𝄞</text>`)} .04rem center / .22rem .3rem no-repeat,
    repeating-linear-gradient(180deg, transparent 0 calc(20% - 1px), rgba(201, 163, 90, .45) calc(20% - 1px) 20%) 0 .03rem / 100% calc(100% - .06rem) no-repeat; }
${S} .section-label::after { content: '♪'; color: #c9a35a; margin-left: .1rem; }
${S} :is(.panel, .modal__box, .bpop, .dpanel) { ${frame(`<rect x='1' y='1' width='58' height='58' fill='none' stroke='%236a4a36'/><rect x='4' y='4' width='52' height='52' fill='none' stroke='%23c9a35a' stroke-opacity='.55'/><g fill='none' stroke='%23c9a35a' stroke-width='1.1'><path d='M4 12 Q4 4 12 4'/><path d='M48 4 Q56 4 56 12'/><path d='M4 48 Q4 56 12 56'/><path d='M56 48 Q56 56 48 56'/></g><g fill='%23c9a35a'><circle cx='4' cy='4' r='1.6'/><circle cx='56' cy='4' r='1.6'/><circle cx='4' cy='56' r='1.6'/><circle cx='56' cy='56' r='1.6'/></g>`, '.1rem')} }
${S} .mode-card__bg { background-position: center; }
${S} .panel__title::after { content: ''; display: block; height: .08rem; margin-top: .04rem; background: repeating-linear-gradient(180deg, rgba(201, 163, 90, .5) 0 1px, transparent 1px 2px) 0 0 / 1.2rem 100% no-repeat; }
${S} .btn--primary { box-shadow: inset 0 0 0 1px #c9a35a, inset 0 0 0 3px #7a1f2b, inset 0 0 0 4px rgba(201, 163, 90, .5); }
${NO_RING(S)}
${S} .hbond__board::before { inset: 12% 18%; clip-path: polygon(50% 0, 70% 8%, 86% 24%, 96% 44%, 100% 62%, 100% 100%, 0 100%, 0 62%, 4% 44%, 14% 24%, 30% 8%); background: #2e1d21; box-shadow: inset 0 0 0 calc(3 * var(--u)) #c9a35a; }
${S} .hbond.is-full .hbond__board::before { background: #7a1f2b; }
${S} { --hb-ring-on: #f0d27a; --hb-ring-off: rgba(150, 130, 110, .55); --hb-ring-full: #f0d27a; }`,

  // ---- 시라쿠사 · 시라쿠사인 -----------------------------------------------------------------------------------------
  'f-siracusa': (S) => `
${S} .section-label { width: fit-content; padding: .05rem .34rem; color: #efe8da; font-style: italic; letter-spacing: .06em;
  background: ${svg(20, 20, `<path d='M2 10L8 4M2 10L8 16M8 10L14 4M8 10L14 16' fill='none' stroke='%23c8a25a' stroke-width='1.4'/>`)} .06rem center / .14rem .14rem no-repeat,
    ${svg(20, 20, `<path d='M18 10L12 4M18 10L12 16M12 10L6 4M12 10L6 16' fill='none' stroke='%23c8a25a' stroke-width='1.4'/>`)} calc(100% - .06rem) center / .14rem .14rem no-repeat, #6e151b;
  box-shadow: inset 0 1px 0 #c8a25a, inset 0 -1px 0 #c8a25a; }
${S} :is(.panel, .modal__box, .bpop, .dpanel) { ${frame(`<rect x='1' y='1' width='58' height='58' fill='none' stroke='%235e5040'/><rect x='4' y='4' width='52' height='52' fill='none' stroke='%23c8a25a' stroke-opacity='.7'/><g fill='none' stroke='%23c8a25a' stroke-width='1'><path d='M4 16A12 12 0 0 1 16 4M4 11A7 7 0 0 1 11 4'/><path d='M56 16A12 12 0 0 0 44 4M56 11A7 7 0 0 0 49 4'/><path d='M4 44A12 12 0 0 0 16 56M4 49A7 7 0 0 0 11 56'/><path d='M56 44A12 12 0 0 1 44 56M56 49A7 7 0 0 1 49 56'/></g>`, '.12rem')} }
${S} .panel__title { font-style: italic; }
${S} .btn--primary { box-shadow: inset 0 0 0 1px #c8a25a; }
${NO_RING(S)}
${S} .hbond__board::before { inset: 13%; border-radius: 50%; background: radial-gradient(circle, #19191b 0 52%, #efe8da 53% 56%, transparent 57%), repeating-conic-gradient(#8e1b22 0 22.5deg, #efe8da 22.5deg 45deg); }
${S} .hbond.is-full .hbond__board::before { background: radial-gradient(circle, #8e1b22 0 52%, #efe8da 53% 56%, transparent 57%), repeating-conic-gradient(#c8a25a 0 22.5deg, #19191b 22.5deg 45deg); }
${S} { --hb-ring-on: #f0cf86; --hb-ring-off: rgba(150, 140, 130, .55); --hb-ring-full: #f0cf86; }`,

  // ---- 염국 · 화중인 ---------------------------------------------------------------------------------------------------
  'f-yan': (S) => `
${S} .section-label { width: fit-content; padding: .06rem .4rem .06rem .3rem; color: #f7f3ee; background: linear-gradient(90deg, rgba(29, 31, 30, .75), #1d1f1e 18% 80%, rgba(29, 31, 30, .55));
  clip-path: polygon(2% 30%, 8% 6%, 22% 12%, 40% 2%, 58% 9%, 76% 0, 92% 10%, 100% 34%, 97% 60%, 100% 88%, 84% 96%, 64% 90%, 44% 100%, 26% 92%, 10% 98%, 0 76%, 3% 52%); }
${S} .section-label::after { content: ''; display: inline-block; width: .14rem; height: .14rem; margin-left: .1rem; vertical-align: middle; background: #a92d2a; box-shadow: inset 0 0 0 2px #a92d2a, inset 0 0 0 3px #f7f3ee; }
${S} :is(.panel, .modal__box, .bpop, .dpanel) { border: 0; box-shadow: inset 0 0 .3rem rgba(29, 31, 30, .12), 0 0 .5rem rgba(29, 31, 30, .08); }
${S} .panel__title { writing-mode: horizontal-tb; letter-spacing: .3em; }
${S} .btn--primary { border-radius: 0; box-shadow: .03rem .03rem 0 #a92d2a; }
${NO_RING(S)}
${S} .hbond__board::before { inset: 12%; background: ${svg(80, 80, `<filter id='r'><feTurbulence baseFrequency='.09' numOctaves='2' seed='7'/><feDisplacementMap in='SourceGraphic' scale='8'/></filter><circle filter='url(%23r)' cx='40' cy='40' r='31' fill='none' stroke='%231d1f1e' stroke-width='9'/><circle cx='40' cy='40' r='24' fill='%23e4e7e3'/>`)} center / contain no-repeat; }
${S} .hbond.is-full .hbond__board::before { inset: 16%; background: #a92d2a; box-shadow: inset 0 0 0 calc(3 * var(--u)) #a92d2a, inset 0 0 0 calc(5 * var(--u)) #f7f3ee; }
${S} .hbond__icon:not(.hbond__glyph) { filter: brightness(0) invert(.12); }
${S} .hbond.is-full .hbond__icon:not(.hbond__glyph) { filter: brightness(0) invert(.97); }`,

  // ---- 사르곤 · 이상적인 도시: 엔드리스 카니발 -------------------------------------------------------------------------
  'f-sargon': (S) => `
${S} .section-label { width: fit-content; padding: .04rem .3rem; color: #fff; font-style: italic; font-weight: 900; -webkit-text-stroke: .5px #12345a; text-shadow: .02rem .02rem 0 #12345a;
  background: radial-gradient(circle, rgba(255, 255, 255, .22) 1px, transparent 1.6px) 0 0 / 5px 5px, linear-gradient(90deg, #1f5fa8, #2a70c0);
  clip-path: polygon(.1rem 0, 100% 0, calc(100% - .1rem) 100%, 0 100%); }
// (a light face in the yellow frame: a solid-yellow face hid the light theme's white / blue / gold ink on every panel and modal)
${S} :is(.panel, .modal__box, .bpop, .dpanel) { border: .03rem solid #fcce46; border-radius: 0; background: radial-gradient(circle, rgba(252, 206, 70, .22) 1px, transparent 1.6px) 0 0 / 6px 6px, linear-gradient(180deg, #fffdf5, #fff7dc); box-shadow: .05rem .05rem 0 #f19b48, 0 .06rem .2rem rgba(60, 50, 20, .18); }
${S} :is(.panel, .modal__box, .bpop, .dpanel) :is(.panel__body, .modal__body) { color: #24241f; }
${S} :is(.mode-card, .seat) { border: .03rem solid #fcce46; box-shadow: .04rem .04rem 0 #f19b48; }
${NO_RING(S)}
${S} .hbond__board::before { inset: 15%; transform: rotate(-8deg); border-radius: calc(6 * var(--u)); background: #fff; border: calc(4 * var(--u)) solid #fcce46; box-shadow: calc(3 * var(--u)) calc(3 * var(--u)) 0 #f19b48; }
${S} .hbond.is-full .hbond__board::before { background: #2f7fd0; border-color: #fcce46; }
${S} .hbond__icon:not(.hbond__glyph) { filter: brightness(0) invert(.15); }
${S} .hbond.is-full .hbond__icon:not(.hbond__glyph) { filter: brightness(0) invert(1); }`,

  // ---- 쉐라그 · RETRACING ---------------------------------------------------------------------------------------------
  'f-kjerag': (S) => `
${S} .section-label { width: fit-content; padding: .04rem .36rem; color: #16206a; background: linear-gradient(180deg, #ffffff, #dfe6fb);
  clip-path: polygon(0 0, 100% 0, calc(100% - .14rem) 50%, 100% 100%, 0 100%, .14rem 50%); }
${S} :is(.panel, .modal__box, .bpop, .dpanel) { ${frame(`<rect x='1' y='1' width='58' height='58' fill='none' stroke='%239aa8e6' stroke-width='1'/><path d='M1 12V1H12M48 1H59V12M59 48V59H48M12 59H1V48' fill='none' stroke='%23ffffff' stroke-width='3'/>`, '.08rem')} }
${NO_RING(S)}
${S} .hbond__board::before { inset: 12%; clip-path: polygon(50% 0, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%); background: linear-gradient(180deg, #2b3c9f, #16206a); box-shadow: inset 0 0 0 calc(3 * var(--u)) #e9eefc; }
${S} .hbond.is-full .hbond__board::before { background: linear-gradient(180deg, #ffffff, #c9d4f7); }
${S} .hbond.is-full .hbond__icon:not(.hbond__glyph) { filter: brightness(0) invert(.12) sepia(1) hue-rotate(190deg) saturate(4); }`,

  // ---- 화산의 꿈 여행 --------------------------------------------------------------------------------------------------
  'ss-adele': (S) => `
${S} .section-label { width: fit-content; padding: .06rem .34rem; color: #d34a62; border-radius: 99px;
  background: radial-gradient(circle at 12% 30%, #fff 0 .1rem, transparent .1rem), radial-gradient(circle at 88% 30%, #fff 0 .1rem, transparent .1rem), radial-gradient(circle at 30% 0%, #fff 0 .12rem, transparent .12rem), radial-gradient(circle at 70% 0%, #fff 0 .12rem, transparent .12rem), #ffffff;
  box-shadow: 0 .02rem .08rem rgba(176, 112, 126, .25); }
${S} .section-label::after { content: '✦'; color: #f2b53a; margin-left: .08rem; }
${S} :is(.panel, .modal__box, .bpop, .dpanel) { ${frame(`<g fill='%23ffffff' stroke='%23e8b9c2' stroke-width='1'><circle cx='10' cy='10' r='9'/><circle cx='30' cy='6' r='7'/><circle cx='50' cy='10' r='9'/><circle cx='6' cy='30' r='7'/><circle cx='54' cy='30' r='7'/><circle cx='10' cy='50' r='9'/><circle cx='30' cy='54' r='7'/><circle cx='50' cy='50' r='9'/></g><rect x='8' y='8' width='44' height='44' fill='%23fff8f8'/>`, '.12rem', 20, 'round')} box-shadow: 0 .04rem .2rem rgba(176, 112, 126, .2); }
${S} .modal__head .modal__title { color: #d34a62; }
${S} .btn { border-radius: 99px; }
${NO_RING(S)}
${S} .hbond__board::before { inset: 14%; border-radius: 50%; background: radial-gradient(circle at 30% 35%, #fff 0 22%, transparent 23%), radial-gradient(circle at 70% 35%, #fff 0 22%, transparent 23%), radial-gradient(circle at 50% 68%, #fff 0 26%, transparent 27%), radial-gradient(circle, #fff 0 40%, #f2d6da 41% 49%, transparent 50%); }
${S} .hbond.is-full .hbond__board::before { background: radial-gradient(circle at 30% 35%, #e66a80 0 22%, transparent 23%), radial-gradient(circle at 70% 35%, #e66a80 0 22%, transparent 23%), radial-gradient(circle at 50% 68%, #e66a80 0 26%, transparent 27%), radial-gradient(circle, #d34a62 0 49%, transparent 50%); }
${S} .hbond__icon:not(.hbond__glyph) { filter: brightness(0) invert(.18) sepia(.5) hue-rotate(-30deg); }
${S} .hbond.is-full .hbond__icon:not(.hbond__glyph) { filter: brightness(0) invert(1); }
${S} { --hb-ring-on: var(--mint-500); --hb-ring-off: rgba(140, 90, 100, .55); --hb-ring-full: var(--mint-500); }`,

  // ---- 부정축재 ---------------------------------------------------------------------------------------------------------
  'ss-vultures': (S) => `
${S} .section-label { padding: .05rem .2rem .08rem .7rem; color: #fff; justify-content: flex-end;
  background: linear-gradient(#d4d93a, #d4d93a) right bottom / 85% .05rem no-repeat, repeating-linear-gradient(-55deg, #2c3a3f 0 .06rem, transparent .06rem .14rem) .1rem center / .5rem 70% no-repeat, #182226; }
${S} .section-label::after { content: '#'; color: #d4d93a; font-style: italic; margin-left: .06rem; }
${S} :is(.panel, .modal__box, .bpop, .dpanel) { border: 1px solid #4a5a60; box-shadow: inset 0 0 0 .04rem #111a1d, inset 0 0 0 calc(.04rem + 1px) #2f3d42; }
${S} :is(.panel, .modal__box, .bpop, .dpanel)::after { content: ''; position: absolute; right: .06rem; top: .06rem; width: .14rem; height: .14rem; pointer-events: none; background: linear-gradient(225deg, #c0282e 50%, transparent 50%); }
${NO_RING(S)}
${S} .hbond__board::before { inset: 12%; clip-path: polygon(25% 3%, 75% 3%, 100% 50%, 75% 97%, 25% 97%, 0 50%); background: repeating-linear-gradient(-45deg, #2c3a3f 0 calc(5 * var(--u)), #1a2427 calc(5 * var(--u)) calc(10 * var(--u))); }
${S} .hbond.is-full .hbond__board::before { background: repeating-linear-gradient(-45deg, #d4d93a 0 calc(6 * var(--u)), #b9be22 calc(6 * var(--u)) calc(12 * var(--u))); }`,

  // ---- 론 트레일 --------------------------------------------------------------------------------------------------------
  'ss-lonetrail': (S) => `
${S} .section-label { width: fit-content; padding: .05rem .26rem .05rem .3rem; color: #fbf9f5; letter-spacing: .04em;
  background: linear-gradient(90deg, #a8402e 0 .04rem, #e3a23d .04rem .08rem, #6fb0a3 .08rem .12rem, transparent .12rem), linear-gradient(#e8602c, #e8602c) right top / .08rem .08rem no-repeat, #2b2a28; }
${S} .section-label .section-label__idx { color: #fff; background: #e8602c; border-color: #e8602c; opacity: 1; }
${S} :is(.panel, .modal__box, .bpop, .dpanel) { border-top: .04rem solid #2b2a28; }
${S} :is(.panel__title, .modal__title) { font-weight: 800; letter-spacing: -.01em; }
${S} :is(.panel__title, .modal__title)::before { content: ''; display: inline-block; width: .16rem; height: .16rem; margin-right: .08rem; vertical-align: -.02rem; border-radius: 50%; background: radial-gradient(circle, #fbf9f5 30%, #e8602c 32%); }
${S} :is(.mode-card, .seat) { box-shadow: inset 0 .04rem 0 #e8602c; }
${S} .btn--primary { box-shadow: inset -.14rem 0 0 rgba(0, 0, 0, .0); }
${NO_RING(S)}
${S} .hbond__board::before { inset: 13%; border-radius: 50%; background: radial-gradient(circle, #fbf9f5 62%, #e2dcd1 63%); }
${S} .hbond.is-full .hbond__board::before { background: radial-gradient(circle, #e8602c 62%, #c94d1e 63%); }
${S} .hbond__icon:not(.hbond__glyph) { filter: brightness(0) invert(.12); }
${S} .hbond.is-full .hbond__icon:not(.hbond__glyph) { filter: brightness(0) invert(1); }
${S} { --hb-ring-on: var(--mint-500); --hb-ring-off: #c9c2b6; --hb-ring-full: var(--mint-500); }`,
  'ss-mendacium': (S) => `
${S} .section-label { justify-content: center; padding: .06rem .3rem; color: #fff4ea;
  background: ${svg(40, 8, `<path d='M0 7H6V1H14V5H10V3H8V7H20V1H28V5H24V3H22V7H34V1H40' fill='none' stroke='%23e9b48a' stroke-width='1.2'/>`)} 0 .02rem / .4rem .08rem repeat-x, ${svg(40, 8, `<path d='M0 1H6V7H14V3H10V5H8V1H20V7H28V3H24V5H22V1H34V7H40' fill='none' stroke='%23e9b48a' stroke-width='1.2'/>`)} 0 calc(100% - .02rem) / .4rem .08rem repeat-x, linear-gradient(180deg, #b35424, #8c3c16); }
${S} :is(.panel, .modal__box, .bpop, .dpanel) { ${frame(`<rect x='1' y='1' width='58' height='58' fill='none' stroke='%2342372e' stroke-width='2'/><path d='M4 8H8V4H14V10H10V8 M4 52H8V56H14V50H10V52 M56 8H52V4H46V10H50V8 M56 52H52V56H46V50H50V52' fill='none' stroke='%23b4521f' stroke-width='1.4'/><rect x='4' y='4' width='52' height='52' fill='none' stroke='%23a77e5a' stroke-width='.8'/>`, '.12rem')} }
${S} .btn { border-radius: 99px .04rem .04rem 99px; }
${S} .btn--primary::before { content: '◀'; font-size: .7em; margin-right: .06rem; color: #fff4ea; }
${NO_RING(S)}
${S} .hbond__board::before { inset: 12%; border-radius: 50%; background: radial-gradient(circle, #f7e6d5 52%, #42372e 53% 60%, #f7e6d5 61% 66%, #b4521f 67%); }
${S} .hbond.is-full .hbond__board::before { background: radial-gradient(circle, #c8622a 52%, #42372e 53% 60%, #f7e6d5 61% 66%, #b4521f 67%); }
${S} .hbond__icon:not(.hbond__glyph) { filter: brightness(0) invert(.2) sepia(.5); }
${S} .hbond.is-full .hbond__icon:not(.hbond__glyph) { filter: brightness(0) invert(1); }`,

  // ---- 허락받지 못한 땅 ------------------------------------------------------------------------------------------------
  'ss-unrealized': (S) => `
${S} .section-label { justify-content: center; padding: .05rem .5rem; color: #fff; text-shadow: 0 1px 2px rgba(20, 40, 45, .6);
  background: radial-gradient(30% 90% at 50% 60%, rgba(255, 255, 255, .95), rgba(255, 255, 255, 0) 70%), radial-gradient(18% 70% at 35% 50%, rgba(255, 255, 255, .85), transparent 70%), radial-gradient(18% 70% at 65% 50%, rgba(255, 255, 255, .85), transparent 70%),
    ${svg(20, 20, `<path d='M10 1L13 7H7Z M3 16L8 10L11 15Z M17 16L12 10L9 15Z' fill='%23c4333a'/>`)} .1rem center / .18rem .18rem no-repeat, ${svg(20, 20, `<path d='M10 1L13 7H7Z M3 16L8 10L11 15Z M17 16L12 10L9 15Z' fill='%23c4333a'/>`)} calc(100% - .1rem) center / .18rem .18rem no-repeat,
    linear-gradient(90deg, transparent, #4f8590 .3rem calc(100% - .3rem), transparent); color: #15292d; text-shadow: none; }
${S} :is(.panel, .modal__box, .bpop, .dpanel) { border: 0; border-top: 2px solid #2b525a; border-bottom: 2px solid #2b525a; border-radius: 0; }
${NO_RING(S)}
${S} .hbond__board::before { inset: 14% 8%; border-radius: 50% 45% 48% 52% / 60% 55% 45% 40%; background: radial-gradient(60% 50% at 40% 40%, #ffffff, #dcf0f3); border: calc(3 * var(--u)) solid #2b525a; }
${S} .hbond.is-full .hbond__board::before { background: radial-gradient(60% 50% at 40% 40%, #e8585e, #c4333a); border-color: #15292d; }
${S} .hbond__icon:not(.hbond__glyph) { filter: brightness(0) invert(.15); }
${S} .hbond.is-full .hbond__icon:not(.hbond__glyph) { filter: brightness(0) invert(1); }`,

  // ---- 불타버린 엘레지여 ----------------------------------------------------------------------------------------------
  'ss-elegies': (S) => `
${S} .section-label { width: fit-content; padding: .05rem .4rem; color: #e8cf92;
  background: linear-gradient(180deg, #2a2638, #17142a) padding-box; border: 1px solid #a39274;
  clip-path: polygon(.16rem 0, calc(100% - .16rem) 0, 100% 50%, calc(100% - .16rem) 100%, .16rem 100%, 0 50%); box-shadow: inset 0 0 0 3px #17142a, inset 0 0 0 4px rgba(201, 174, 114, .5); }
${S} .section-label::after { content: ' ✦'; color: #c9ae72; font-size: .8em; }
${S} :is(.panel, .modal__box, .bpop, .dpanel) { ${frame(`<rect x='5' y='5' width='50' height='50' fill='none' stroke='%23a39274' stroke-width='1'/><path d='M1 18 C3 8 8 3 18 1 M42 1 C52 3 57 8 59 18 M59 42 C57 52 52 57 42 59 M18 59 C8 57 3 52 1 42' fill='none' stroke='%23c9ae72' stroke-width='1.3'/><circle cx='5' cy='5' r='2' fill='%23e8cf92'/><circle cx='55' cy='5' r='2' fill='%23e8cf92'/><circle cx='5' cy='55' r='2' fill='%23e8cf92'/><circle cx='55' cy='55' r='2' fill='%23e8cf92'/>`, '.12rem')} }
${NO_RING(S)}
${S} .hbond__board::before { inset: 12%; border-radius: 50%; background: radial-gradient(circle, #202852 58%, #c9ae72 59% 63%, #0d1023 64% 70%, #a39274 71% 74%, transparent 75%); }
${S} .hbond.is-full .hbond__board::before { background: radial-gradient(circle, #e8cf92 58%, #c9ae72 59% 63%, #0d1023 64% 70%, #a39274 71% 74%, transparent 75%); }`,

  // ---- 통합전략 (the IS themes: shapes from each topic's own UI — mushroom caps, theatre pills, bubbles, ice hexes,
  // candle shields, lattice windows, tide rings) --------------------------------------------------------------------
  'is-fungi': (S) => `
${S} .section-label { width: fit-content; padding: .04rem .26rem; color: #e7d49a; background: #2b302b; border: 1px solid #c9b27a; border-radius: 99px 99px .06rem .06rem; }
${S} .section-label::after { content: ''; width: .16rem; height: .1rem; margin-left: .08rem; background: radial-gradient(circle, #e7d49a 0 2px, transparent 2.5px) 0 50% / .06rem .06rem repeat-x; }
${S} :is(.panel, .modal__box, .bpop, .dpanel) { border-radius: .16rem; box-shadow: inset 0 0 0 1px #3d4439, inset 0 0 0 3px rgba(201, 178, 122, .18), 0 .06rem .3rem rgba(0, 0, 0, .5); }
${S} .btn { border-radius: 99px; }
${NO_RING(S)}
${S} .hbond__board::before { inset: 14% 10% 22%; border-radius: 50% 50% 22% 22% / 72% 72% 28% 28%; background: radial-gradient(circle at 35% 30%, rgba(231, 212, 154, .35) 0 8%, transparent 9%), radial-gradient(circle at 65% 45%, rgba(231, 212, 154, .3) 0 6%, transparent 7%), #343a33; border: calc(3 * var(--u)) solid #c9b27a; }
${S} .hbond.is-full .hbond__board::before { background: radial-gradient(circle at 35% 30%, rgba(255, 255, 255, .5) 0 8%, transparent 9%), linear-gradient(180deg, #d8c48d, #a48a52); }`,
  'is-phantom': (S) => `
${S} .section-label { width: fit-content; padding: .03rem .24rem; color: #f4f0ec; background: none; border: 1px solid rgba(244, 240, 236, .7); border-radius: 99px; }
${S} .section-label::before { content: '◆'; color: #e3a33b; font-size: .7em; margin-right: .08rem; }
${S} :is(.panel, .modal__box, .bpop, .dpanel) { border: 0; border-top: 1px solid rgba(244, 240, 236, .45); box-shadow: inset 0 .1rem 0 -.06rem rgba(179, 23, 31, .0), 0 .06rem .3rem rgba(0, 0, 0, .55); }
${S} :is(.panel, .modal__box, .bpop, .dpanel)::after { content: ''; position: absolute; left: 0; right: 0; top: 0; height: .12rem; pointer-events: none; background: radial-gradient(circle at 50% 0, #7a0f16 0 .1rem, transparent .1rem) 0 0 / .24rem .12rem repeat-x; opacity: .85; }
${S} .btn { border-radius: 99px; }
${NO_RING(S)}
${S} .hbond__board::before { inset: 18%; transform: rotate(45deg); background: #221c1c; border: calc(2 * var(--u)) solid #e3a33b; box-shadow: 0 0 0 calc(3 * var(--u)) rgba(244, 240, 236, .15); }
${S} .hbond.is-full .hbond__board::before { background: radial-gradient(circle, #d2303a, #7a0f16); border-color: #f2c46a; }`,
  'is-mizuki': (S) => `
${S} .section-label { width: fit-content; padding: .04rem .26rem; color: #dff6ff; border-radius: 99px; background: radial-gradient(60% 120% at 30% 0, rgba(127, 247, 255, .35), transparent 70%), rgba(20, 40, 110, .7); box-shadow: 0 0 .12rem rgba(95, 212, 255, .45), inset 0 0 0 1px rgba(127, 247, 255, .5); }
${S} :is(.panel, .modal__box, .bpop, .dpanel) { border-radius: .22rem; box-shadow: 0 0 .18rem rgba(75, 140, 255, .25), inset 0 0 0 1px rgba(95, 212, 255, .3); }
${S} .btn { border-radius: 99px; }
${NO_RING(S)}
${S} .hbond__board::before { inset: 12%; border-radius: 50%; background: radial-gradient(circle at 32% 28%, rgba(255, 255, 255, .6) 0 10%, transparent 12%), radial-gradient(circle, rgba(30, 60, 160, .85) 55%, rgba(95, 212, 255, .7) 70%, transparent 72%); box-shadow: 0 0 calc(8 * var(--u)) rgba(95, 212, 255, .5); }
${S} .hbond.is-full .hbond__board::before { background: radial-gradient(circle at 32% 28%, rgba(255, 255, 255, .7) 0 10%, transparent 12%), radial-gradient(circle, #7ff7ff 40%, #3a8bff 70%, transparent 72%); }`,
  'is-frost': (S) => `
${S} .section-label { width: fit-content; padding: .04rem .26rem .04rem .2rem; color: #e8fbff; background: linear-gradient(90deg, #1fc4d6 0 .05rem, rgba(14, 60, 70, .85) .05rem);
  clip-path: polygon(0 0, calc(100% - .12rem) 0, 100% .12rem, 100% 100%, 0 100%); }
${S} :is(.panel, .modal__box, .bpop, .dpanel) { ${frame(`<path d='M0 12V0H12M48 0H60V12M60 48V60H48M12 60H0V48' fill='none' stroke='%231fc4d6' stroke-width='2'/><rect x='3' y='3' width='54' height='54' fill='none' stroke='%23264a52' stroke-width='1'/>`, '.08rem')} }
${NO_RING(S)}
${S} .hbond__board::before { inset: 12%; clip-path: polygon(25% 3%, 75% 3%, 100% 50%, 75% 97%, 25% 97%, 0 50%); background: linear-gradient(180deg, #123a42, #071c20); box-shadow: inset 0 0 0 calc(3 * var(--u)) #1fc4d6; }
${S} .hbond.is-full .hbond__board::before { background: linear-gradient(180deg, #7af0d0, #1fc4d6); }`,
  'is-sarkaz': (S) => `
${S} .section-label { width: fit-content; padding: .04rem .26rem .05rem; color: #f0d28a; background: linear-gradient(#b3202a, #b3202a) bottom / 100% 2px no-repeat, #141416;
  clip-path: polygon(.1rem 0, 100% 0, 100% 100%, 0 100%, 0 .1rem); }
${S} .section-label::before { content: ''; width: .08rem; height: .14rem; margin-right: .08rem; background: radial-gradient(50% 60% at 50% 70%, #ffd36a, #d9a63a 50%, transparent 70%); }
${S} :is(.panel, .modal__box, .bpop, .dpanel) { box-shadow: inset 0 0 0 1px rgba(217, 166, 58, .35), 0 .06rem .3rem rgba(0, 0, 0, .55); }
${NO_RING(S)}
${S} .hbond__board::before { inset: 10% 16% 14%; clip-path: polygon(50% 0, 100% 30%, 86% 100%, 14% 100%, 0 30%); background: linear-gradient(180deg, #2a2a2e, #141416); box-shadow: inset 0 0 0 calc(3 * var(--u)) #d9a63a; }
${S} .hbond.is-full .hbond__board::before { background: radial-gradient(60% 50% at 50% 65%, #ffd36a, #d9a63a 60%, #b3202a); }`,
  'is-sui': (S) => `
${S} .section-label { width: fit-content; padding: .04rem .3rem; color: #f4f8f5; background: ${svg(20, 20, `<path d='M2 2h16v16H2z M2 10h16 M10 2v16' fill='none' stroke='%23dfe9e2' stroke-width='1.4'/>`)} .06rem center / .14rem .14rem no-repeat, ${svg(20, 20, `<path d='M2 2h16v16H2z M2 10h16 M10 2v16' fill='none' stroke='%23dfe9e2' stroke-width='1.4'/>`)} calc(100% - .06rem) center / .14rem .14rem no-repeat, #167f78; }
${S} .section-label::after { content: ''; width: .12rem; height: .12rem; margin-left: .08rem; background: #b8232b; }
${S} :is(.panel, .modal__box, .bpop, .dpanel) { ${frame(`<path d='M1 1H22V5H5V22H1Z M59 1H38V5H55V22H59Z M1 59H22V55H5V38H1Z M59 59H38V55H55V38H59Z' fill='%23167f78'/><path d='M9 9h8v8H9z M43 9h8v8h-8z M9 43h8v8H9z M43 43h8v8h-8z' fill='none' stroke='%23167f78' stroke-width='1.2'/>`, '.12rem')} }
${NO_RING(S)}
${S} .hbond__board::before { inset: 12%; border-radius: 50%; background: radial-gradient(circle, #f4f8f5 55%, #167f78 56% 63%, #f4f8f5 64% 68%, #167f78 69%); }
${S} .hbond.is-full .hbond__board::before { background: radial-gradient(circle, #1a9a91 55%, #0f5e58 56% 63%, #f4f8f5 64% 68%, #b8232b 69%); }
${S} .hbond__icon:not(.hbond__glyph) { filter: brightness(0) invert(.2) sepia(.3) hue-rotate(120deg); }
${S} .hbond.is-full .hbond__icon:not(.hbond__glyph) { filter: brightness(0) invert(1); }`,
  'is-blackflow': (S) => `
${S} .section-label { width: fit-content; padding: .03rem .2rem .08rem; color: #e6d48a; background: ${svg(40, 8, `<path d='M0 4 Q5 0 10 4 T20 4 T30 4 T40 4' fill='none' stroke='%23e6d48a' stroke-width='1.2'/>`)} bottom / .4rem .08rem repeat-x; }
${S} :is(.panel, .modal__box, .bpop, .dpanel) { border-radius: .02rem .02rem .14rem .14rem; box-shadow: inset 0 0 0 1px rgba(230, 212, 138, .3), 0 .06rem .3rem rgba(0, 0, 0, .55); }
${S} :is(.panel, .modal__box, .bpop, .dpanel)::after { content: ''; position: absolute; left: .1rem; right: .1rem; bottom: .04rem; height: .08rem; pointer-events: none; opacity: .5; background: ${svg(40, 8, `<path d='M0 4 Q5 0 10 4 T20 4 T30 4 T40 4' fill='none' stroke='%23e6d48a' stroke-width='1'/>`)} 0 0 / .4rem .08rem repeat-x; }
${NO_RING(S)}
${S} .hbond__board::before { inset: 12%; border-radius: 50%; background: radial-gradient(circle, #121210 56%, #e6d48a 57% 61%, transparent 62%), radial-gradient(circle at 50% 120%, rgba(230, 212, 138, .3), transparent 60%); }
${S} .hbond.is-full .hbond__board::before { background: radial-gradient(circle, #e6d48a 56%, #fff0b0 57% 61%, transparent 62%); }`,
  cyber: (S) => `
${S} .section-label { width: fit-content; padding: .03rem .24rem; color: #00f0ff; background: rgba(255, 46, 136, .14); box-shadow: inset 2px 0 0 #ff2e88; clip-path: polygon(0 0, calc(100% - .1rem) 0, 100% 100%, 0 100%); text-transform: uppercase; }
${NO_RING(S)}
${S} .hbond__board::before { inset: 14%; clip-path: polygon(0 0, 75% 0, 100% 25%, 100% 100%, 25% 100%, 0 75%); background: #1d1630; box-shadow: inset 0 0 0 calc(3 * var(--u)) #ff2e88; }
${S} .hbond.is-full .hbond__board::before { background: linear-gradient(135deg, #ff2e88, #00f0ff); }`,
};

/** The shape rules of one theme ('' when the theme has none). */
const ACCENT_INK = {'f-kjerag': '#c9d4ff', 'f-ursus': '#ec7a7e', 'f-siracusa': '#ea7a80', 'f-kazimierz': '#ff7a86'};
const BAND = {'is-fungi': '--hb-band-bg: #2b302b; --hb-band-ink: #e7d49a; --hb-band-line: #c9b27a; --hb-band-radius: 99px;', 'is-phantom': '--hb-band-bg: #121010; --hb-band-ink: #f4f0ec; --hb-band-line: #e3a33b; --hb-band-radius: 99px;', 'is-mizuki': '--hb-band-bg: rgba(10, 20, 60, .92); --hb-band-ink: #dff6ff; --hb-band-line: #5fd4ff; --hb-band-radius: 99px;', 'is-frost': '--hb-band-bg: #071c20; --hb-band-line: #1fc4d6;', 'is-sarkaz': '--hb-band-bg: #141416; --hb-band-ink: #f0d28a; --hb-band-line: #b3202a;', 'is-sui': '--hb-band-bg: #167f78; --hb-band-ink: #fff; --hb-band-line: #b8232b;', 'is-blackflow': '--hb-band-bg: #121210; --hb-band-ink: #e6d48a; --hb-band-line: #e6d48a; --hb-band-radius: 99px;', cyber: '--hb-band-bg: #0e0b17; --hb-band-ink: #00f0ff; --hb-band-line: #ff2e88;',
  'f-ursus': '--hb-band-bg: #8f1d22; --hb-band-ink: #fff; --hb-band-line: #d2ccc7; --hb-band-clip: polygon(0 10%, 30% 0, 70% 8%, 100% 0, 98% 100%, 60% 92%, 25% 100%, 2% 92%);',
  'f-kazimierz': '--hb-band-bg: #1b2f6e; --hb-band-line: #d02b3a; --hb-band-clip: polygon(15% 0, 100% 0, 85% 100%, 0 100%);',
  'f-aegir': '--hb-band-bg: rgba(16, 20, 24, .94); --hb-band-line: #5fd3d0; --hb-band-radius: 99px;',
  'f-laterano': '--hb-band-bg: #6f8291; --hb-band-ink: #fff; --hb-band-line: #3ec6e0; --hb-band-clip: polygon(12% 0, 88% 0, 100% 50%, 88% 100%, 12% 100%, 0 50%);',
  'f-victoria': '--hb-band-bg: #241610; --hb-band-ink: #f0c870; --hb-band-line: #d6a64a;',
  'f-leithanien': '--hb-band-bg: #2c1d16; --hb-band-ink: #ee9a5a; --hb-band-line: #d4743c; --hb-band-clip: polygon(10% 0, 90% 0, 100% 50%, 90% 100%, 10% 100%, 0 50%);',
  'f-siracusa': '--hb-band-bg: #d6d2c9; --hb-band-ink: #1c1c1c; --hb-band-line: #b3262e;',
  'f-yan': '--hb-band-bg: #1d1f1e; --hb-band-ink: #f7f3ee; --hb-band-line: #1d1f1e;',
  'f-sargon': '--hb-band-bg: #2f7fd0; --hb-band-ink: #fff; --hb-band-line: #fcce46; --hb-band-clip: polygon(12% 0, 100% 0, 88% 100%, 0 100%);',
  'f-kjerag': '--hb-band-bg: #ffffff; --hb-band-ink: #16206a; --hb-band-line: #9aa8e6; --hb-band-clip: polygon(0 0, 100% 0, 90% 50%, 100% 100%, 0 100%, 10% 50%);',
  'ss-adele': '--hb-band-bg: #3b2a26; --hb-band-ink: #fff; --hb-band-line: #b72f2b; --hb-band-radius: calc(4 * var(--u));',
  'ss-vultures': '--hb-band-bg: #182226; --hb-band-ink: #d4d93a; --hb-band-line: #d4d93a;',
  'ss-lonetrail': '--hb-band-bg: #2b2a28; --hb-band-ink: #fbf9f5; --hb-band-line: #e8602c; --hb-band-radius: calc(4 * var(--u));',
  'ss-mendacium': '--hb-band-bg: #42372e; --hb-band-ink: #fff4ea; --hb-band-line: #c8622a; --hb-band-radius: 99px;',
  'ss-unrealized': '--hb-band-bg: #2b525a; --hb-band-ink: #fff; --hb-band-line: #c4333a;',
  'ss-elegies': '--hb-band-bg: #17142a; --hb-band-ink: #e8cf92; --hb-band-line: #a39274; --hb-band-clip: polygon(12% 0, 88% 0, 100% 50%, 88% 100%, 12% 100%, 0 50%);'};
/** The HUD bond marker rules restated for the bond disc (briefing, dialogs: components.js BondDisc). */
function discRules(css) {
  return css.split('\n').filter((l) => /\.hbond__board::before|\.hbond__icon/.test(l)).map((l) => l
    .replace(/\.hbond\.is-full \.hbond__board::before/g, '.bond:not(.hbond).is-active .bond__core::before')
    .replace(/\.hbond__board::before/g, '.bond:not(.hbond) .bond__core::before')
    .replace(/\.hbond\.is-full \.hbond__icon/g, '.bond:not(.hbond).is-active .bond__icon')
    .replace(/\.hbond__icon:not\(\.hbond__glyph\)/g, '.bond:not(.hbond) .bond__icon')
    .replace(/\.hbond__icon/g, '.bond:not(.hbond) .bond__icon')).join('\n');
}
/** The bond's members toward its threshold as a segmented border on the theme's own marker, as the default theme's ring
 *  (bondStrip.js / components.js set --bn segments, --bt lit, --bgap): the marker's geometry (inset, clip-path, radius,
 *  rotation) is copied from its ::before rule, the ring cut out of that box by masks. */
function ringRules(S, body) {
  const line = body.split('\n').find((l) => l.startsWith(`${S} .hbond__board::before {`) && !/content:/.test(l)) || '';
  // a round ring just outside the marker, whatever its shape (a clipped ring was cut into slivers): read at a glance
  const geom = 'inset: 4%; border-radius: 50%;';
  const ring = `content: ''; position: absolute; ${geom || 'inset: 12%;'} box-sizing: border-box; pointer-events: none; z-index: 1;
  background: conic-gradient(var(--hb-ring-on, var(--mint-400)) 0 calc(var(--bt, 0) * 1turn / var(--bn, 1)), var(--hb-ring-off, rgba(140, 140, 140, .6)) 0);
  filter: drop-shadow(0 0 1px rgba(0, 0, 0, .9));
  -webkit-mask: repeating-conic-gradient(#000 0 calc(1turn / var(--bn, 1) - var(--bgap, 0deg)), transparent 0 calc(1turn / var(--bn, 1))), linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask: repeating-conic-gradient(#000 0 calc(1turn / var(--bn, 1) - var(--bgap, 0deg)), transparent 0 calc(1turn / var(--bn, 1))), linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: source-in, xor; mask-composite: intersect, exclude;`;
  return `${S} .hbond__board::after { ${ring} padding: var(--hb-ring-w, calc(6 * var(--u))); }
${S} .bond:not(.hbond) .bond__core::after { ${ring} padding: calc(var(--disc) * .08); }
${S} .hbond.is-full .hbond__board::after, ${S} .bond:not(.hbond).is-active .bond__core::after { --hb-ring-on: var(--hb-ring-full, var(--mint-400)); }
${S} .bond:not(.hbond) .bond__ring { display: none; }
${S} .bond:not(.hbond) .bond__core { position: relative; isolation: isolate; background: none; box-shadow: none; border-radius: 0; overflow: visible; }
${S} .bond:not(.hbond) .bond__core::before { content: ''; position: absolute; z-index: -1; pointer-events: none; }
${S} .bond:not(.hbond).is-disabled .bond__core { filter: grayscale(1) brightness(.6); }`;
}

// ---- bond marker geometry: one outline per theme (a circle, or a polygon in a 0–100 box), centred. The marker fills
// it at 76 % of the board (inset 12 %); the members ring (components.js BondRing) strokes the same outline at 92 %.
const SQ = (d) => { const r = d * Math.PI / 180, c = Math.cos(r), sn = Math.sin(r); return [[0, 0], [100, 0], [100, 100], [0, 100]].map(([x, y]) => [50 + (x - 50) * c * .86 - (y - 50) * sn * .86, 50 + (x - 50) * sn * .86 + (y - 50) * c * .86]); };
const GEOM = {
  cyber: [[0, 0], [75, 0], [100, 25], [100, 100], [25, 100], [0, 75]],
  'is-fungi': [[50.0, 0.0], [56.3, 1.9], [61.6, 6.5], [65.9, 11.7], [70.0, 15.4], [75.2, 17.1], [81.8, 18.2], [88.5, 20.5], [93.3, 25.0], [94.8, 31.4], [93.5, 38.4], [91.1, 44.6], [90.0, 50.0], [91.1, 55.4], [93.5, 61.6], [94.8, 68.6], [93.3, 75.0], [88.5, 79.5], [81.8, 81.8], [75.2, 82.9], [70.0, 84.6], [65.9, 88.3], [61.6, 93.5], [56.3, 98.1], [50.0, 100.0], [43.7, 98.1], [38.4, 93.5], [34.1, 88.3], [30.0, 84.6], [24.8, 82.9], [18.2, 81.8], [11.5, 79.5], [6.7, 75.0], [5.2, 68.6], [6.5, 61.6], [8.9, 55.4], [10.0, 50.0], [8.9, 44.6], [6.5, 38.4], [5.2, 31.4], [6.7, 25.0], [11.5, 20.5], [18.2, 18.2], [24.8, 17.1], [30.0, 15.4], [34.1, 11.7], [38.4, 6.5], [43.7, 1.9]],
  'is-phantom': [[50, 0], [100, 50], [50, 100], [0, 50]],
  'is-mizuki': 'circle', 'is-sui': [[82.0, 0.0], [86.7, 0.6], [91.0, 2.4], [94.7, 5.3], [97.6, 9.0], [99.4, 13.3], [100.0, 18.0], [100.0, 82.0], [99.4, 86.7], [97.6, 91.0], [94.7, 94.7], [91.0, 97.6], [86.7, 99.4], [82.0, 100.0], [18.0, 100.0], [13.3, 99.4], [9.0, 97.6], [5.3, 94.7], [2.4, 91.0], [0.6, 86.7], [0.0, 82.0], [0.0, 18.0], [0.6, 13.3], [2.4, 9.0], [5.3, 5.3], [9.0, 2.4], [13.3, 0.6], [18.0, 0.0]], 'is-blackflow': 'circle',
  'is-frost': [[25, 3], [75, 3], [100, 50], [75, 97], [25, 97], [0, 50]],
  'is-sarkaz': [[50, 0], [100, 28], [88, 100], [12, 100], [0, 28]],
  'f-yan': [[14.0, 0.0], [86.0, 0.0], [100.0, 14.0], [100.0, 86.0], [86.0, 100.0], [14.0, 100.0], [0.0, 86.0], [0.0, 14.0]], 'f-aegir': [[50.0, 0.0], [57.5, 0.7], [64.0, 2.7], [70.0, 5.9], [75.6, 10.3], [80.6, 15.5], [85.0, 21.3], [88.9, 27.4], [92.1, 33.5], [94.7, 39.2], [96.5, 44.2], [97.6, 48.1], [98.0, 50.0], [97.6, 51.9], [96.5, 55.8], [94.7, 60.8], [92.1, 66.5], [88.9, 72.6], [85.0, 78.7], [80.6, 84.5], [75.6, 89.7], [70.0, 94.1], [64.0, 97.3], [57.5, 99.3], [50.0, 100.0], [42.5, 99.3], [36.0, 97.3], [30.0, 94.1], [24.4, 89.7], [19.4, 84.5], [15.0, 78.7], [11.1, 72.6], [7.9, 66.5], [5.3, 60.8], [3.5, 55.8], [2.4, 51.9], [2.0, 50.0], [2.4, 48.1], [3.5, 44.2], [5.3, 39.2], [7.9, 33.5], [11.1, 27.4], [15.0, 21.3], [19.4, 15.5], [24.4, 10.3], [30.0, 5.9], [36.0, 2.7], [42.5, 0.7]], 'f-siracusa': 'circle',
  'f-sargon': [[50.0, 0.0], [66.5, 10.3], [85.4, 14.6], [89.7, 33.5], [100.0, 50.0], [89.7, 66.5], [85.4, 85.4], [66.5, 89.7], [50.0, 100.0], [33.5, 89.7], [14.6, 85.4], [10.3, 66.5], [0.0, 50.0], [10.3, 33.5], [14.6, 14.6], [33.5, 10.3]],
  'f-victoria': 'circle',
  'f-kjerag': [[50, 0], [93, 25], [93, 75], [50, 100], [7, 75], [7, 25]],
  'f-laterano': [[30, 0], [70, 0], [100, 30], [100, 70], [70, 100], [30, 100], [0, 70], [0, 30]],
  'f-kazimierz': [[12, 0], [88, 0], [100, 12], [100, 88], [88, 100], [12, 100], [0, 88], [0, 12]],
  'f-ursus': [[0, 0], [42, 0], [50, 6], [58, 0], [100, 0], [100, 42], [94, 50], [100, 58], [100, 100], [58, 100], [50, 94], [42, 100], [0, 100], [0, 58], [6, 50], [0, 42]],
  'f-leithanien': [[50.0, 0.0], [75.0, 6.7], [93.3, 25.0], [100.0, 50.0], [93.3, 75.0], [75.0, 93.3], [50.0, 100.0], [25.0, 93.3], [6.7, 75.0], [0.0, 50.0], [6.7, 25.0], [25.0, 6.7]],
  'ss-lonetrail': [[78.0, 0.0], [83.7, 0.7], [89.0, 2.9], [93.6, 6.4], [97.1, 11.0], [99.3, 16.3], [100.0, 22.0], [100.0, 78.0], [99.3, 83.7], [97.1, 89.0], [93.6, 93.6], [89.0, 97.1], [83.7, 99.3], [78.0, 100.0], [22.0, 100.0], [16.3, 99.3], [11.0, 97.1], [6.4, 93.6], [2.9, 89.0], [0.7, 83.7], [0.0, 78.0], [0.0, 22.0], [0.7, 16.3], [2.9, 11.0], [6.4, 6.4], [11.0, 2.9], [16.3, 0.7], [22.0, 0.0]], 'ss-mendacium': [[70.7, 0.0], [100.0, 29.3], [100.0, 70.7], [70.7, 100.0], [29.3, 100.0], [0.0, 70.7], [0.0, 29.3], [29.3, 0.0]], 'ss-unrealized': [[50.0, 0.0], [78.3, 21.7], [100.0, 50.0], [78.3, 78.3], [50.0, 100.0], [21.7, 78.3], [0.0, 50.0], [21.7, 21.7]], 'ss-elegies': [[100.0, 100.0], [0.0, 100.0], [0.0, 50.0], [0.8, 41.3], [3.0, 32.9], [6.7, 25.0], [11.7, 17.9], [17.9, 11.7], [25.0, 6.7], [32.9, 3.0], [41.3, 0.8], [50.0, 0.0], [58.7, 0.8], [67.1, 3.0], [75.0, 6.7], [82.1, 11.7], [88.3, 17.9], [93.3, 25.0], [97.0, 32.9], [99.2, 41.3], [100.0, 50.0]],
  'ss-adele': [[50.0, 0.0], [56.5, 0.6], [62.7, 2.5], [68.5, 5.4], [73.5, 9.3], [77.7, 13.9], [81.1, 18.9], [86.1, 22.3], [90.7, 26.5], [94.6, 31.5], [97.5, 37.3], [99.4, 43.5], [100.0, 50.0], [99.4, 56.5], [97.5, 62.7], [94.6, 68.5], [90.7, 73.5], [86.1, 77.7], [81.1, 81.1], [77.7, 86.1], [73.5, 90.7], [68.5, 94.6], [62.7, 97.5], [56.5, 99.4], [50.0, 100.0], [43.5, 99.4], [37.3, 97.5], [31.5, 94.6], [26.5, 90.7], [22.3, 86.1], [18.9, 81.1], [13.9, 77.7], [9.3, 73.5], [5.4, 68.5], [2.5, 62.7], [0.6, 56.5], [0.0, 50.0], [0.6, 43.5], [2.5, 37.3], [5.4, 31.5], [9.3, 26.5], [13.9, 22.3], [18.9, 18.9], [22.3, 13.9], [26.5, 9.3], [31.5, 5.4], [37.3, 2.5], [43.5, 0.6]],
  'ss-vultures': [[25, 3], [75, 3], [100, 50], [75, 97], [25, 97], [0, 50]],
};
const f1 = (v) => +v.toFixed(2);
function markerRules(id, S) {
  const g = GEOM[id];
  if (!g) return '';
  const at = (k, o) => (p) => [f1(o + p[0] * k), f1(o + p[1] * k)];
  // the ring path starts at the top of the outline (its first point / 12 o'clock) and runs clockwise
  // (the default board: ring centred 15.5 % in, 5.6 % thick, hugging the disc that starts 18 % in)
  // a polygon is drawn at 55 % of the board (22.5 % in) — unless its inner radius would cut into the icon disc
  // (radius 22.5 % + a 2 % margin): then just large enough to hold the whole icon
  let half = 27.5;
  if (g !== 'circle') {
    // (distance from the centre to each edge segment — not its infinite line, which a short notch edge brings close)
    const inr = Math.min(...g.map((a, i) => { const b = g[(i + 1) % g.length]; const dx = b[0] - a[0], dy = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((50 - a[0]) * dx + (50 - a[1]) * dy) / (dx * dx + dy * dy)));
      return Math.hypot(a[0] + t * dx - 50, a[1] + t * dy - 50); })) / 50;
    half = Math.min(34, Math.max(27.5, 24.5 / inr));
  }
  const pin = 50 - half, k = half / 50, rk = k + .14, rin = 50 - 50 * rk;
  const ring = g === 'circle' ? 'M50 14.7A35.3 35.3 0 1 1 49.99 14.7Z' : 'M' + g.map(at(rk, rin)).map((p) => p.join(' ')).join('L') + 'Z';
  const mk = g === 'circle' ? 'inset: 18.5%; border-radius: 50%; clip-path: none; transform: none;'
    : `inset: ${f1(pin)}%; border-radius: 0; transform: none; clip-path: polygon(${g.map((p) => `${f1(p[0])}% ${f1(p[1])}%`).join(', ')});`;
  // (the ring is the only outline: the marker's own inset borders made a doubled, thick edge)
  return `${S} .hbond__board::before, ${S} .bond:not(.hbond) .bond__core::before { ${mk} border: 0 !important; outline: 0 !important; box-shadow: inset 0 0 calc(6 * var(--u)) rgba(0, 0, 0, .45), inset 0 calc(-3 * var(--u)) calc(5 * var(--u)) rgba(0, 0, 0, .35) !important; }
${S} .bond-ring { display: block; position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; z-index: 1; }
${S} .bond:not(.hbond) .bond-ring { inset: calc(var(--disc) * -.04); width: calc(100% + var(--disc) * .08); height: calc(100% + var(--disc) * .08); }
${S} .bond-ring { transform: scaleX(-1); }
${S} .bond-ring path { d: path("${ring}"); fill: none; stroke-width: 5.6; stroke-linejoin: round; stroke: var(--hb-ring-off, rgba(140, 140, 140, .6)); filter: drop-shadow(0 0 1px rgba(0, 0, 0, .85)); }
${S} .bond-ring path.on { stroke: var(--hb-ring-on, var(--mint-400)); filter: drop-shadow(0 0 calc(2.5 * var(--u)) var(--hb-ring-on, var(--mint-400))) drop-shadow(0 0 1px rgba(0, 0, 0, .6)); }
${S} .hbond.is-full .bond-ring path.on, ${S} .bond:not(.hbond).is-active .bond-ring path.on { stroke: var(--hb-ring-full, var(--hb-ring-on, var(--mint-400))); }
${S} .hbond__icon { left: 27.5%; top: 27.5%; width: 45%; height: 45%; }
${S} .bslot__count { z-index: 4; text-shadow: 0 0 2px #000, 0 0 3px #000; }`;
}


// marker fills restated after the geometry (shape-specific looks)
const FILL = {
  'f-yan': `background: #e9ece8;`,
  'f-yan:full': `background: #a92d2a;`,
  'f-siracusa': `background: #2a292d;`,
  'f-siracusa:full': `background: #8e1b22;`,
  'is-sui': `background: #f4f8f5;`,
  'is-sui:full': `background: #167f78;`,
  'ss-mendacium': `background: #f7e6d5;`,
  'ss-mendacium:full': `background: #c8622a;`,
  'is-blackflow': `background: #121210;`,
  'is-blackflow:full': `background: #e6d48a;`,
  'ss-elegies': `background: #202852;`,
  'ss-elegies:full': `background: #e8cf92;`,
  'ss-lonetrail': `background: #fbf9f5;`,
  'ss-lonetrail:full': `background: #cf4f1c;`,
  'f-ursus': `border: 0; box-shadow: inset 0 0 0 calc(3 * var(--u)) #847b78; background: #2b292d;`,
  'f-ursus:full': `background: #a3242b; box-shadow: inset 0 0 0 calc(3 * var(--u)) #d2ccc7;`,
  'f-kazimierz': `border: 0; background: #1b2650; box-shadow: inset 0 calc(-7 * var(--u)) 0 #d02b3a, inset 0 0 0 calc(3 * var(--u)) #3a63c8;`,
  'f-kazimierz:full': `background: #2f5bd0; box-shadow: inset 0 calc(-7 * var(--u)) 0 #d02b3a, inset 0 0 0 calc(3 * var(--u)) #ffffff;`,
  'f-victoria': `border: 0; background: radial-gradient(circle at 40% 35%, #3b2a1d, #22150e 70%); box-shadow: inset 0 0 0 calc(3 * var(--u)) #d6a64a, inset 0 0 0 calc(5 * var(--u)) #2a1a12, inset 0 0 0 calc(6 * var(--u)) rgba(214, 166, 74, .5);`,
  'f-victoria:full': `background: radial-gradient(circle at 40% 35%, #f2d48a, #c99440 60%, #9a6e2a); box-shadow: inset 0 0 0 calc(3 * var(--u)) #f2d48a;`,
  'f-sargon': `border: 0; background: #ffffff; box-shadow: inset 0 0 0 calc(4 * var(--u)) #fcce46;`,
  'f-sargon:full': `background: #2f7fd0; box-shadow: inset 0 0 0 calc(4 * var(--u)) #fcce46;`,
  'ss-adele': `border: 0; background: #fff8f9; box-shadow: inset 0 0 0 calc(3 * var(--u)) #f2d6da;`,
  'ss-adele:full': `background: #d34a62; box-shadow: inset 0 0 0 calc(3 * var(--u)) #f6a8b6;`,
};
function fillRules(id, S) {
  if (!FILL[id]) return '';
  return `${S} .hbond__board::before, ${S} .bond:not(.hbond) .bond__core::before { ${FILL[id]} }
${S} .hbond.is-full .hbond__board::before, ${S} .bond:not(.hbond).is-active .bond__core::before { ${FILL[id + ':full']} }`;
}

export function shapeCss(id) {
  const f = SHAPES[id];
  const S = `:root[data-ui-theme="${id}"]`;
  if (!f) return '';
  const body = f(S);
  // the guide's frame (a border-image) also frames the simulation-select cards — the event's own card language
  const cards = body.split('\n').filter((l) => /border-image/.test(l) && /:is\(\.panel, \.modal__box/.test(l)).map((l) => l.replace(/:is\(\.panel, \.modal__box, \.bpop, \.dpanel\)/, '.mode-card')).join('\n');
  return `/* ---- shape layer (tools/ui-theme-shapes.mjs) */${body}
${cards}
${discRules(body)}
${ringRules(S, body).split('\n').filter((l) => !/::after|::after,|^\s+(background|-webkit-mask|mask|filter|-webkit-mask-composite)/.test(l)).join('\n')}
${markerRules(id, S)}
${fillRules(id, S)}
${BAND[id] ? `${S} { ${BAND[id]} }\n` : ''}${ACCENT_INK[id] ? `${S} :is(.micro--mint, .countdown__label, .gm__bond-toggle, .funds__collapse, .funds__collapse *, .hex__value, .btn--ghost .btn__label, .lp__icon) { color: ${ACCENT_INK[id]}; }\n` : ''}${S} .section-label :is(.section-label__idx, .micro) { color: inherit; border-color: currentColor; opacity: .85; }
`;
}

// ---- motifs: each theme's own surface pattern in place of plain colour fades (page and panel surfaces) -------------
// [tile svg, tile size, page opacity, panel opacity]
const T = (w, h, body) => [svg(w, h, body), `${w}px ${h}px`];
const MOTIFS = {
  cyber: T(48, 48, `<path d='M0 24H18L24 18H48M24 48V30L30 24' fill='none' stroke='%2300f0ff' stroke-opacity='.18'/><circle cx='18' cy='24' r='1.5' fill='%23ff2e88' fill-opacity='.4'/>`),
  'is-fungi': T(90, 90, `<g fill='%23e7d49a' fill-opacity='.12'><path d='M20 40a12 9 0 0 1 24 0z'/><rect x='30' y='40' width='4' height='10'/><path d='M60 72a8 6 0 0 1 16 0z'/><rect x='66.5' y='72' width='3' height='7'/></g><g fill='%23e7d49a' fill-opacity='.18'><circle cx='70' cy='20' r='1.5'/><circle cx='10' cy='75' r='1'/><circle cx='50' cy='60' r='1.2'/></g>`),
  'is-phantom': T(64, 64, `<path d='M0 0Q8 64 16 0M16 0Q24 64 32 0M32 0Q40 64 48 0M48 0Q56 64 64 0' fill='none' stroke='%23b3171f' stroke-opacity='.14' stroke-width='3'/>`),
  'is-mizuki': T(80, 80, `<g fill='none' stroke='%237ff7ff' stroke-opacity='.14'><circle cx='20' cy='22' r='6'/><circle cx='60' cy='52' r='9'/><circle cx='36' cy='66' r='3'/><path d='M0 40Q20 30 40 40T80 40' stroke-opacity='.08'/></g>`),
  'is-frost': T(70, 70, `<g fill='none' stroke='%237fd6ff' stroke-opacity='.16'><path d='M10 0L22 18L14 34L30 52L24 70'/><path d='M22 18L44 26L60 12M30 52L52 60'/></g>`),
  'is-sarkaz': T(80, 80, `<g fill='%23d9a63a' fill-opacity='.12'><path d='M40 30q-5 8 0 14q5-6 0-14z'/><rect x='38' y='44' width='4' height='16'/></g><circle cx='12' cy='12' r='1' fill='%23fff' fill-opacity='.2'/>`),
  'is-sui': T(60, 60, `<g fill='none' stroke='%23167f78' stroke-opacity='.12'><rect x='5' y='5' width='50' height='50'/><path d='M5 30H55M30 5V55M5 5L18 18M55 5L42 18M5 55L18 42M55 55L42 42'/></g>`),
  'is-blackflow': T(80, 30, `<path d='M0 15Q10 5 20 15T40 15T60 15T80 15' fill='none' stroke='%23e6d48a' stroke-opacity='.1'/>`),
  'f-yan': T(140, 140, `<filter id='b'><feTurbulence baseFrequency='.03' numOctaves='3' seed='4'/><feColorMatrix values='0 0 0 0 .1  0 0 0 0 .12  0 0 0 0 .11  0 0 0 -1.6 .9'/></filter><rect width='140' height='140' filter='url(%23b)' opacity='.25'/>`),
  'f-sargon': T(14, 14, `<circle cx='7' cy='7' r='2' fill='%23f19b48' fill-opacity='.16'/>`),
  'f-victoria': T(48, 48, `<g fill='none' stroke='%23d6a64a' stroke-opacity='.1'><path d='M24 0V48M0 24H48'/><circle cx='24' cy='24' r='10'/><path d='M24 14L27 24L24 34L21 24Z'/></g>`),
  'f-kjerag': T(60, 60, `<g stroke='%23ffffff' stroke-opacity='.16' stroke-width='1'><path d='M30 18V42M20 24L40 36M40 24L20 36M30 18l-3 3M30 18l3 3M30 42l-3-3M30 42l3-3'/></g><circle cx='8' cy='50' r='1' fill='%23fff' fill-opacity='.3'/>`),
  'f-laterano': T(80, 80, `<g fill='none' stroke='%233ec6e0' stroke-opacity='.12'><circle cx='40' cy='40' r='22'/><circle cx='40' cy='40' r='14'/><path d='M40 18V62M18 40H62M24 24L56 56M56 24L24 56'/></g>`),
  'f-aegir': T(90, 60, `<g fill='none' stroke='%238ff0ec' stroke-opacity='.1'><path d='M0 20Q22 8 45 20T90 20'/><path d='M0 42Q22 30 45 42T90 42'/></g>`),
  'f-siracusa': T(40, 20, `<path d='M0 0.5H40M0 10.5H40M20 0V10M0 10V20M40 10V20' stroke='%23c8a25a' stroke-opacity='.1'/>`),
  'f-kazimierz': T(4, 4, `<rect width='4' height='1' fill='%23ffffff' fill-opacity='.04'/>`),
  'f-ursus': T(120, 60, `<path d='M0 30H120' stroke='%23847b78' stroke-opacity='.18'/><g stroke='%23847b78' stroke-opacity='.25'><path d='M20 26l6 8M26 26l-6 8M70 26l6 8M76 26l-6 8'/></g>`),
  'f-leithanien': T(40, 60, `<path d='M6 60V28Q6 8 20 2Q34 8 34 28V60' fill='none' stroke='%23c9a35a' stroke-opacity='.12'/><circle cx='20' cy='20' r='4' fill='none' stroke='%23c9a35a' stroke-opacity='.12'/>`),
  'ss-adele': T(60, 40, `<g fill='%23ffffff' fill-opacity='.55'><circle cx='14' cy='22' r='8'/><circle cx='24' cy='16' r='10'/><circle cx='36' cy='22' r='8'/><rect x='14' y='22' width='22' height='8' rx='4'/></g>`),
  'ss-vultures': T(40, 40, `<path d='M0 40L40 0M-10 10L10 -10M30 50L50 30' stroke='%23d4d93a' stroke-opacity='.06' stroke-width='6'/>`),
  'ss-lonetrail': T(8, 8, `<circle cx='4' cy='4' r='1.3' fill='%231d1b19' fill-opacity='.12'/>`),
  'ss-mendacium': T(40, 40, `<path d='M0 36H8V28H16V32H12V30H10V36H24V28H32V32H28V30H26V36H40' fill='none' stroke='%2342372e' stroke-opacity='.1'/>`),
  'ss-unrealized': T(120, 60, `<g fill='%23ffffff' fill-opacity='.35'><circle cx='30' cy='34' r='10'/><circle cx='44' cy='28' r='13'/><circle cx='58' cy='34' r='9'/></g><path d='M90 12l4 2-4 2' fill='none' stroke='%232b525a' stroke-opacity='.3'/>`),
  'ss-elegies': T(80, 80, `<g fill='none' stroke='%23c9ae72' stroke-opacity='.1'><path d='M0 60Q20 40 40 50T80 30'/><path d='M30 46q4-8 10-6M54 42q4 6 0 10'/></g><circle cx='66' cy='14' r='1.2' fill='%23e8cf92' fill-opacity='.4'/>`),
};
export function motifCss(id) {
  const m = MOTIFS[id];
  if (!m || /width='1'/.test(m[0])) return '';
  const S = `:root[data-ui-theme="${id}"]`;
  return `${S} body::before { content: ''; position: fixed; inset: 0; z-index: -1; pointer-events: none; background: ${m[0]} 0 0 / ${m[1]} repeat; }
\n`;
}

// ---- card emblems: one large line drawing per theme in the corner of the simulation-select cards (its world, not a
// repeated tile) — c: stroke colour; drawn in a 200×200 box
const EMB = {
  cyber: ['#00f0ff', `<path d='M20 160H80L100 140H180M100 140V60L120 40H180M60 160V100L80 80'/><circle cx='120' cy='40' r='6'/><circle cx='80' cy='80' r='5'/><rect x='130' y='90' width='40' height='30'/>`],
  'is-fungi': ['#e7d49a', `<path d='M40 110Q40 50 100 45Q160 50 160 110Z'/><path d='M85 110V170Q100 178 115 170V110'/><circle cx='75' cy='80' r='7'/><circle cx='120' cy='70' r='9'/><circle cx='140' cy='95' r='5'/>`],
  'is-phantom': ['#e3a33b', `<path d='M30 30Q60 120 30 190M170 30Q140 120 170 190M30 30H170'/><path d='M70 100Q100 70 130 100Q100 150 70 100Z'/><circle cx='88' cy='98' r='5'/><circle cx='112' cy='98' r='5'/>`],
  'is-mizuki': ['#7ff7ff', `<circle cx='100' cy='90' r='40'/><circle cx='150' cy='50' r='14'/><circle cx='55' cy='150' r='10'/><path d='M70 130Q60 170 80 185M100 130Q100 175 110 190M130 130Q140 170 125 185'/>`],
  'is-frost': ['#7fd6ff', `<path d='M100 20V180M30 60L170 140M30 140L170 60'/><path d='M100 20l-12 14M100 20l12 14M100 180l-12-14M100 180l12-14'/><path d='M60 160L90 120L80 90L120 70'/>`],
  'is-sarkaz': ['#d9a63a', `<path d='M100 40Q85 65 100 80Q115 65 100 40Z'/><rect x='88' y='80' width='24' height='80'/><path d='M60 170H140M50 180H150'/><path d='M70 120Q55 100 70 80M130 120Q145 100 130 80'/>`],
  'is-sui': ['#167f78', `<rect x='30' y='30' width='140' height='140'/><path d='M30 100H170M100 30V170M30 30L65 65M170 30L135 65M30 170L65 135M170 170L135 135'/><circle cx='100' cy='100' r='22'/>`],
  'is-blackflow': ['#e6d48a', `<path d='M10 120Q40 100 70 120T130 120T190 120M10 145Q40 125 70 145T130 145T190 145'/><path d='M100 110V40M80 60L100 40L120 60'/><circle cx='100' cy='30' r='8'/>`],
  'f-yan': ['#1d1f1e', `<path d='M30 170Q60 60 100 40Q140 60 170 170' stroke-width='6'/><path d='M60 170Q90 110 120 100' stroke-width='3'/><rect x='140' y='30' width='26' height='26' fill='%23a92d2a' stroke='none'/>`],
  'f-sargon': ['#f19b48', `<path d='M20 160H180'/><path d='M40 160L70 110H130L160 160'/><circle cx='65' cy='160' r='14'/><circle cx='135' cy='160' r='14'/><path d='M150 40l8 16 18 2-13 12 4 18-17-9-16 9 4-18-13-12 18-2z'/>`],
  'f-victoria': ['#d6a64a', `<path d='M60 60L80 30L100 55L120 30L140 60V80H60Z'/><path d='M50 90H150V100H50Z'/><path d='M70 100V170M100 100V170M130 100V170M55 170H145'/>`],
  'f-kjerag': ['#ffffff', `<path d='M10 180L70 80L100 120L130 60L190 180Z'/><path d='M130 60L115 90L130 85L145 95Z'/><path d='M100 30V50M90 40H110'/>`],
  'f-laterano': ['#3ec6e0', `<circle cx='100' cy='60' r='26'/><path d='M100 90V180M70 120H130'/><path d='M60 60H40M160 60H140M100 20V10'/>`],
  'f-aegir': ['#8ff0ec', `<path d='M20 70Q60 50 100 70T180 70M20 110Q60 90 100 110T180 110'/><path d='M100 120V180M80 150L100 180L120 150'/><path d='M70 140Q100 120 130 140'/>`],
  'f-siracusa': ['#c8a25a', `<path d='M60 180V60Q60 40 80 40H95'/><path d='M85 40L110 40L105 60H90Z'/><path d='M140 110Q140 140 155 140Q170 140 170 110Z'/><path d='M155 140V170M142 170H168'/>`],
  'f-kazimierz': ['#d02b3a', `<rect x='30' y='50' width='140' height='90' rx='8'/><path d='M50 160H150M100 140V160'/><path d='M60 120L85 80L100 105L115 85L140 120'/>`],
  'f-ursus': ['#b3242c', `<path d='M50 50L80 160M85 40L110 165M120 45L140 160' stroke-width='7'/><path d='M20 180H180' stroke-width='2'/>`],
  'f-leithanien': ['#c9a35a', `<circle cx='100' cy='60' r='32'/><circle cx='100' cy='60' r='12'/><path d='M100 28V92M68 60H132M78 38L122 82M122 38L78 82'/><path d='M50 180V120M70 180V110M90 180V105M110 180V105M130 180V110M150 180V120'/>`],
  'ss-adele': ['#d34a62', `<path d='M30 120Q30 90 60 95Q65 70 95 78Q115 55 140 80Q170 78 170 108Q180 130 150 135H50Q25 135 30 120Z'/><path d='M120 150Q140 140 150 160'/><path d='M150 40l6 12 13 2-10 9 3 13-12-7-12 7 3-13-10-9 13-2z'/>`],
  'ss-vultures': ['#d4d93a', `<path d='M40 150L100 50L160 150Z'/><path d='M100 85V120M100 132V138'/><path d='M20 180L60 160M180 180L140 160'/>`],
  'ss-lonetrail': ['#cf4f1c', `<circle cx='100' cy='90' r='50'/><circle cx='100' cy='90' r='30'/><path d='M100 20V40M100 140V160M30 90H50M150 90H170'/><path d='M60 180H140'/>`],
  'ss-mendacium': ['#42372e', `<path d='M80 40H120M85 40Q70 70 75 100Q60 130 80 170H120Q140 130 125 100Q130 70 115 40'/><path d='M75 100H125M80 130H120'/>`],
  'ss-unrealized': ['#2b525a', `<path d='M30 130Q30 105 55 110Q60 85 90 92Q110 70 135 95Q165 92 165 120H30Z'/><path d='M140 40l20 10-20 10M150 50H120'/><path d='M60 60l8 4-8 4'/>`],
  'ss-elegies': ['#c9ae72', `<path d='M100 30V60M90 60H110L115 110H85Z'/><path d='M100 110V170M75 170H125'/><path d='M100 75Q92 88 100 95Q108 88 100 75Z'/><path d='M40 150Q60 120 50 90M160 150Q140 120 150 90'/>`],
};
export function emblemCss(id, light) {
  const e = EMB[id]; if (!e) return '';
  const S = `:root[data-ui-theme="${id}"]`;
  const u = svg(200, 200, `<g fill='none' stroke='${e[0].replace('#', '%23')}' stroke-width='3' stroke-opacity='.32' stroke-linecap='round' stroke-linejoin='round'>${e[1]}</g>`);
  return `${S} .mode-card__bg { background: ${u} right -4% top -6% / 46% auto no-repeat, var(--bg-2) !important; }\n`;
}
