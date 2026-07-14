# Thunder's Diary

A personal diary that writes back — type or draw a question, it fades into
the page like ink being absorbed, then the diary replies. Remembers past
pages, tracks streaks, adapts ink color to mood, and works offline.

## File map (edit whichever part you need)

- `index.html` — structure: cover, onboarding, diary page, toolbar, banners
- `css/style.css` — all visual styling, colors, page-flip, wax seal, insights panel
- `js/canvas.js` — pen/finger drawing + ink-drawn reply animation + image compression
- `js/audio.js` — synthesized ambient sound (quill scratch, page rustle)
- `js/app.js` — main behavior: onboarding, idle detection, memory, mood, streaks, offline queue, exports
- `api/chat.js` — Vercel serverless function that talks to Groq (keeps your key secret)

## Setup

1. Get a free Groq API key: https://console.groq.com/keys
2. In Vercel project settings → Environment Variables, add `GROQ_API_KEY`.
3. Deploy the whole `thunders-diary` folder — no build step needed.

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
| Compressed uploads | Drawn pages are downscaled to ~900px JPEG before being sent, for faster/cheaper vision calls | `toCompressedDataURL()` in `js/canvas.js` |
| Retry logic | Failed Groq calls retry twice with backoff before falling back to an offline queue or error message | `sendToOracle()` in `js/app.js` |

## Honest limitations (things you may want to build further)

- **Ink-drawn replies** simulate handwriting with jitter + a moving nib, not true vector glyph tracing. For literal stroke paths like the original reMarkable project, you'd add a font-outline library (e.g. opentype.js) to trace real letterforms.
- **"Show me what I wrote about ___"** uses simple keyword overlap, not real semantic embeddings. For true semantic search you'd need to generate and store embeddings (e.g. via an embeddings API) alongside each entry and compare vectors.
- **Daily nudge notifications** only fire while the tab is open in that session. A true daily push notification needs a service worker plus a push server (e.g. Vercel + web-push), which is a bigger backend addition.
- **Mood detection** is keyword-based on both the client and server — good enough for a soft visual cue, not a clinical read of emotion.
- The **crisis-safe guard** is a basic keyword check, not a substitute for real crisis support — the helpline number in `CRISIS_MESSAGE` should be reviewed/updated for your actual audience's region.

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
- Everything about the person and every past page is stored only in the
  browser's `localStorage` — nothing is sent to a server except the current
  question/image and last 5 entries for context.
- The 50-chats/day counter also lives in `localStorage` and resets at
  midnight local time.
