# v0.3.1h1 UI verification

Actual Chromium screenshots at 1440×900 desktop and 844×390 touch/mobile viewports. A local server supplies the normal application, not a recreated mockup. Optional resource downloads are not part of this layout test; unavailable optional portraits show the application's fallback icons. The resource progress overlay is hidden in setup screenshots so it does not cover the tested controls.

- Accessibility remains the last tab. UI scale is visible on both device types.
- Laboratory: boss and strategy lists remain selectable; descriptions are limited to 44px in short landscape windows (72px otherwise).
- Practice uses the same description limit and scrolls when its additional options exceed available height.
- `results.json` records measured list and description heights.

Language download browser checks passed for English, Japanese, Chinese and the default Korean path. Separate unit checks cover current file hashes, temporary HTTP failures, interrupted response bodies and reuse of verified cached files.
