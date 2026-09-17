# AllBee Focus - build progress (resume notes)

Project root: /home/claude/abf (the older /home/claude/allbee-focus copy was retired; its src is in /home/claude/_retired)
Wine: WINEPREFIX=/home/claude/.abf-wine WINEDEBUG=-all (use xvfb-run -a). mingw-w64 installed.

Stack: Electron 44.4.1, esbuild (main+preload -> dist/main), Vite 7 multi-page renderer (src/renderer -> dist/renderer),
React 19, Tailwind 3.4, vitest 3, electron-builder 26.15.3 (NSIS setup + portable), native helper C++ (native/ -> resources/helper).

UI decisions told to the user: "Focus" = timer page, "Site limits" = website allowance page (subtitle from brief),
extra "Today" (home) + "Settings" pages; Patrol default Only complain; Ctrl+Shift shortcuts in-app always, system-wide opt-in;
monitoring helper is native (not PowerShell).

Design tokens: navy bg #0E1726, sidebar #0B1320, card #152238, raised #1B2B45, line #243652,
teal #2BC5B4, soft blue #7AA7F5, text #EEF2F8, muted #8C9BB4, honey #F2B544 (coins only), ok #3DD68C, danger #F2677A.
Fonts: Unbounded (display: page titles, timer digits, levels) + Figtree (body). Sentence case.
Signature element: hexagonal progress ring (timer) + hex level badges.

## Status
- [x] shared layer (types/constants/utilities) + 87 unit tests passing
- [x] native helper (builds; protocol verified under Wine; UIA not available in Wine -> "unreadable")
- [x] main process: engine, scheduler, storage, monitoring, companion, windows, tray, notifier, reactions, startup, shortcuts
- [x] ipc/ (router, commands, reset, broadcast) + main.ts; boots and shuts down cleanly
- [x] preload (all three roles)
- [x] scripts/build-main.mjs + scripts/smoke.mjs (end-to-end boot check)
- [ ] renderer (ui kit, art, pages, companion, onboarding, audio)
- [ ] icons
- [ ] dev.mjs
- [ ] build/typecheck/tests/smoke screenshots
- [~] package: electron-builder config written; portable .exe builds, NSIS needs wine
- [ ] docs
- [ ] outputs + present_files

See HANDOFF.md for the full status and next steps.
