# Thunder's Diary

A personal diary that writes back — type or draw a question, it fades into
the page like ink being absorbed, then the diary replies. Remembers past
pages, tracks streaks, adapts ink color to mood, and works offline.

## File map (edit whichever part you need)

- `index.html` — structure: cover, onboarding, diary page, toolbar, banners
- `css/style.css` — all visual styling, colors, page-flip, wax seal, insights panel, dark mode
- `js/canvas.js` — pen/finger drawing (smoothed strokes, undo) + ink-drawn reply animation + image compression
- `js/audio.js` — synthesized ambient sound (quill scratch, page rustle)
- `js/app.js` — main behavior: onboarding, idle detection, memory, mood, streaks, offline queue, exports, backup reminder
- `js/sync.js` — optional Cloud Sync client (talks to the Cloudflare Worker below)
- `api/chat.js` — Vercel serverless function that talks to Groq (keeps your key secret)
- `cloudflare/` — optional Cloudflare Worker + D1 database for off-device backup/sync (see `cloudflare/README.md`)

## Setup

1. Get a free Groq API key: https://console.groq.com/keys
2. In Vercel project settings → Environment Variables, add `GROQ_API_KEY`.
3. Deploy the whole `thunders-diary` folder — no build step needed.

## Bug fixes in this pass

| Bug | Fix |
|---|---|
| UTC vs local date mismatch | `todayStr()` now builds the date from local `getFullYear/getMonth/getDate` instead of `toISOString()`. Entries also store a `localDate` field going forward (`entryLocalDate()` falls back to converting old entries), and `computeStreak()`/insights/recap all bucket by that instead of a UTC slice. |
| Crisis guard didn't cover drawn/touch entries | `sendToOracle()` now runs `containsCrisisLanguage()` on the transcription that comes back from the vision call, before anything is rendered or saved — not just on typed input in `handlePause()`. |
| Narrow crisis keyword list | Expanded phrase list, plus `normalizeForCrisisCheck()` strips punctuation/apostrophes and collapses whitespace so "can't go on", "cant go on", and casual punctuation variants all match. |

## Cloud Sync (optional, off by default)

Everything still lives in `localStorage` by default — nothing changes unless
you turn this on. Settings > Cloud Sync lets you optionally back up to your
own small Cloudflare Worker + D1 database: turning it on gives you a sync
ID; entering that same ID on another device's Cloud Sync panel pulls your
profile + entries down there. See `cloudflare/README.md` for the one-time
Worker/D1 setup. There's also a one-line note during onboarding, and a
banner that appears after `BACKUP_REMINDER_DAYS` (30 by default) since your
last **Export** if you haven't set up sync.

## What's new in this version

| Feature | How it works | Where to edit |
|---|---|---|
| Ink-drawn replies (touch) | Reply is drawn on canvas letter-by-letter with a moving pen-nib and jitter — real ink motion, not a font | `drawReplyAsInk()` in `js/canvas.js` |
| Page-turn navigation | Prev/next arrows flip through past entries with a 3D page-turn | `flipTo()` in `js/app.js` |
| Ambient sound | Procedurally synthesized noise (no audio files needed), off by default | `js/audio.js` |
| Mood ink | Keyword-based mood detection shifts ink color automatically unless you've picked one manually | `MOOD_COLORS` in `js/app.js`, `MOOD_WORDS` in `api/chat.js` |
| Wax seal close | Animated seal stamp plays before the diary closes | `closeBook()` in `js/app.js` |
| "Show me what I wrote about ___" | Local keyword-overlap search across saved entries (typed input only) | `showLocalMemorySearch()` in `js/app.js` |
| Weekly recap | Scans the last 7 days of entries for a repeated keyword, shows a banner once/day | `maybeShowRecap()` in `js/app.js` |
| Streaks & Insights | Consecutive days written, total pages, pages today | `computeStreak()`, Insights button |
| Export/backup | Downloads all entries + profile as a JSON file | Export button in toolbar |
| Rate-limit countdown | Shows real time remaining until the daily limit resets | `refreshLimitNote()` in `js/app.js` |
| Crisis-safe guard | Typed input is checked locally for crisis language before it ever reaches the API; the AI persona also always prioritizes care over character/tone | `CRISIS_KEYWORDS` / `CRISIS_MESSAGE` in `js/app.js`, `safetyLine` in `api/chat.js` |
| Offline queueing | Failed/offline sends are queued in localStorage and retried automatically when back online | `queueForLater()` / `flushQueue()` in `js/app.js` |
| Diary name, cover color, tone | Set during onboarding (step 4) | `index.html` onboarding step 4 |
| Daily nudge | In-page banner if you've missed a day; optional browser notification while the tab is open | `maybeShowNudge()`, `scheduleSameSessionNudge()` in `js/app.js` |
| Compressed uploads | Drawn pages are downscaled to a 1400px cap and sent as lossless PNG (not JPEG) — flat ink-on-white content compresses well as PNG, and it avoids the ringing/blockiness JPEG introduces right at thin stroke edges, which is exactly where handwriting legibility to a vision model suffers most | `toCompressedDataURL()` in `js/canvas.js` |
| Fullscreen canvas | A real fullscreen writing mode (native Fullscreen API, with a CSS-overlay fallback for platforms like iOS Safari that block it) — more room to write bigger is the single biggest lever on handwriting legibility. Has its own floating mini-toolbar (colors/eraser/undo/exit) since the page's normal toolbar is hidden in fullscreen | `enterFullscreenCanvas()`/`exitFullscreenCanvas()` in `js/app.js`, `#canvasWrap`/`#canvasFsToolbar` in `index.html` |
| Ruled guide lines | Faint horizontal guide lines are baked onto the canvas itself (not just the paper background) so handwriting stays straight/evenly-spaced even in fullscreen mode, off the paper texture | `drawGuideLines()` in `js/canvas.js` |
| Smoothed handwriting capture | Pointer events are read via `getCoalescedEvents()` where supported, and strokes are drawn through a quadratic midpoint curve instead of straight segments — meaningfully less jagged on fast mobile/tablet strokes | `moveStroke()`/`drawSegmentTo()` in `js/canvas.js` |
| Undo (touch/pen) | One-level-per-tap undo of the last stroke, replaying stroke history instead of a raw pixel snapshot | `undo()` in `js/canvas.js`, Undo button in the toolbar |
| Retry logic | Failed Groq calls retry twice with backoff before falling back to an offline queue or error message | `sendToOracle()` in `js/app.js` |
| Older-entry recall | Typed questions are matched against entries beyond the recent-5 API window (same keyword-overlap scoring as memory search); a strong match is passed to the model as extra context | `findRelevantOlderEntry()` in `js/app.js`, `olderEntry`/`olderLine` in `api/chat.js` |
| Model-reported mood | The model is asked to end its reply with a `MOOD: <word>` line; that's parsed and stripped before display, and only falls back to server-side keyword scanning if it's missing | `extractMood()` in `api/chat.js` |
| Backup reminder | A dismissible banner appears if it's been `BACKUP_REMINDER_DAYS` (30) since your last Export | `maybeShowBackupReminder()` in `js/app.js` |
| Cloud Sync (optional) | Off by default; see the section above | `js/sync.js`, `cloudflare/` |
| Blank-page prompts | A rotating gentle prompt shows as the typed placeholder / a faint canvas hint when the live page is empty | `IDLE_PROMPTS`, `startIdlePromptRotation()` in `js/app.js` |
| Monthly/yearly recap | The weekly recap's keyword-frequency approach, scaled to 30/365-day windows, surfaced in the Insights panel | `computeTopKeyword()` in `js/app.js` |
| Mood tagging/filtering | The Memory list shows a color dot per entry (matching its stored mood) and filter chips to narrow by mood | `renderMemoryList()` in `js/app.js` |
| Basic accessibility | `aria-label`/`aria-live`/`aria-expanded` on toolbar buttons and dynamic regions, visible focus rings, and a `prefers-color-scheme: dark` variant | `index.html`, `css/style.css` |

## Honest limitations (things you may want to build further)

- **Ink-drawn replies** simulate handwriting with jitter + a moving nib, not true vector glyph tracing. For literal stroke paths like the original reMarkable project, you'd add a font-outline library (e.g. opentype.js) to trace real letterforms.
- **"Show me what I wrote about ___"** uses simple keyword overlap, not real semantic embeddings. For true semantic search you'd need to generate and store embeddings (e.g. via an embeddings API) alongside each entry and compare vectors.
- **Daily nudge notifications** only fire while the tab is open in that session. A true daily push notification needs a service worker plus a push server (e.g. Vercel + web-push), which is a bigger backend addition.
- **Mood detection** now prefers a `MOOD:` label the model reports itself, falling back to keyword scanning only if that's missing — still a soft visual cue, not a clinical read of emotion.
- The **crisis-safe guard** is a normalized keyword check (broader list, punctuation/contraction-insensitive, now also applied to handwritten pages after transcription), not a substitute for real crisis support — the helpline number in `CRISIS_MESSAGE` should be reviewed/updated for your actual audience's region, and it can still miss phrasing the list doesn't anticipate.
- **`isBlank()` on the drawing canvas** now checks stroke history rather than reading back canvas pixels — fast, but a page that's been fully erased back to nothing still technically counts as "written" until cleared/navigated away.
- **Cloud Sync** has no login beyond "knowing the ID" (see `cloudflare/README.md`) — fine for backing up your own diary across your own devices, not a multi-user auth system.

## Other things you'll likely want to tweak

| What | Where |
|---|---|
| Daily chat limit (currently 50) | `DAILY_LIMIT` in `js/app.js` |
| How long before ink "absorbs" | `IDLE_MS` in `js/app.js` |
| How long a reply stays before fading | `REPLY_FADE_DELAY_MS` in `js/app.js` |
| Groq models used | `TEXT_MODEL` / `VISION_MODEL` in `api/chat.js` |
| Diary's personality / tone | `buildPersona()` in `api/chat.js` |
| Colors, paper look, fonts | `css/style.css` |
| How many past pages are remembered | the `.slice(-400)` line in `js/app.js` |

## Notes

- Desktop/laptop: typing is auto-detected; touch/tablet shows a drawing canvas.
- By default, everything about the person and every past page is stored only
  in the browser's `localStorage` — nothing is sent to a server except the
  current question/image, the last 5 entries, and (if a strong match is
  found) one older entry for context. Cloud Sync is opt-in (see above).
- The 50-chats/day counter also lives in `localStorage` and now correctly
  resets at actual local midnight (was previously computed off UTC).
