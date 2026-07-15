# Cloud Sync (optional) — Cloudflare Worker + D1

This is the off-device backup path referenced in Settings > Cloud Sync.
It's entirely optional — the diary works fully offline/local-only without it.

## What it is

A tiny Worker (`worker.js`) backed by one D1 table (`diaries`). Each diary
that turns on Cloud Sync gets a random ID; the Worker stores one JSON blob
(`{ profile, entries }`) per ID and lets that ID push/pull the blob. Enter
the same ID in Settings on another device to pull the diary down there.

There's no login — knowing the ID is the access control, the same trust
model as a shareable link. Fine for backing up your own diary between your
own devices; if you want more than that, put auth (Cloudflare Access, a
shared-secret header, etc.) in front of it before relying on it further.

## Setup

1. Install Wrangler if you don't have it: `npm install -g wrangler`
2. `wrangler login`
3. Create the D1 database:
   ```
   cd cloudflare
   wrangler d1 create thunders_diary
   ```
   This prints a `database_id` — paste it into `wrangler.toml`.
4. (Optional — the Worker also creates the table itself on first request)
   Apply the schema explicitly:
   ```
   wrangler d1 execute thunders_diary --file=./schema.sql
   ```
5. Deploy:
   ```
   wrangler deploy
   ```
   Wrangler prints your Worker's URL, e.g. `https://thunders-diary-sync.yourname.workers.dev`.
6. In the diary, open **Settings > Cloud Sync**, paste that URL into
   "Sync server URL", then tap **Cloud backup: off** to turn it on — you'll
   get a sync ID. Enter that same ID on another device's Cloud Sync panel
   ("Connect an existing ID") to restore this diary there.

## Notes

- `Access-Control-Allow-Origin: *` in `worker.js` is wide open by default —
  tighten it to your diary's actual domain once you've deployed both.
- There's a 5MB cap per diary blob (`MAX_BLOB_BYTES` in `worker.js`) —
  plenty of headroom for hundreds of years of text entries, since drawn
  pages are only ever compressed transiently for the vision call and are
  never stored.
- The Worker is stateless aside from D1, so it costs nothing beyond
  Cloudflare's free tier for personal use.
