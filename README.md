# Thunder's Diary

A personal diary that writes back — type or draw a question, it fades into
the page like ink being absorbed, then the diary replies in a handwritten
font. Remembers past pages on your device.

## File map (edit whichever part you need)

- `index.html` — page structure (cover, onboarding, diary page)
- `css/style.css` — all visual styling, colors, animations
- `js/canvas.js` — pen/finger drawing logic (mobile & tablet)
- `js/app.js` — main behavior: onboarding, idle detection, memory, daily limit
- `api/chat.js` — Vercel serverless function that talks to Groq (keeps your key secret)

## Setup

1. Get a free Groq API key: https://console.groq.com/keys
2. In your Vercel project settings → Environment Variables, add:
   - `GROQ_API_KEY` = your key
3. Deploy the whole `thunders-diary` folder to Vercel (works as-is with the
   Vercel Node.js serverless runtime — no build step needed).

## Things you'll likely want to tweak later

| What | Where |
|---|---|
| Daily chat limit (currently 50) | `DAILY_LIMIT` in `js/app.js` |
| How long before ink "absorbs" | `IDLE_MS` in `js/app.js` |
| How long a reply stays before fading | `REPLY_FADE_DELAY_MS` in `js/app.js` |
| Groq models used | `TEXT_MODEL` / `VISION_MODEL` in `api/chat.js` |
| Diary's personality / tone | `buildPersona()` in `api/chat.js` |
| Colors, paper look, fonts | `css/style.css` |
| Ink color swatches | `#inkColors` buttons in `index.html` |
| How many past pages are remembered | the `.slice(-400)` line in `js/app.js` |

## Notes

- Desktop/laptop: typing is detected automatically (`pointer: coarse` check)
  and shows a text box; touch/tablet shows a drawing canvas instead.
- Drawn pages are sent as an image to a vision-capable Groq model, which
  reads the handwriting and replies in character in one step.
- Everything about the person (name, pronouns, purpose) and every past page
  is stored only in the browser's `localStorage` — nothing is sent to a
  server except the current question/image and last 5 entries for context.
- The 50-chats/day counter also lives in `localStorage` and resets at
  midnight local time.
