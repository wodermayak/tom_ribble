-- Thunder's Diary — Cloud Sync schema
-- Run once: wrangler d1 execute thunders_diary --file=./cloudflare/schema.sql
-- (the worker also creates this automatically on first request, so this
-- file is mainly for explicit/manual setup or CI migrations)

CREATE TABLE IF NOT EXISTS diaries (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_diaries_updated_at ON diaries (updated_at);
