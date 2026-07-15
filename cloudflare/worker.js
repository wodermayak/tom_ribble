
/* ===================================================
   THUNDER'S DIARY — cloudflare/worker.js
   Tiny Cloudflare Worker backed by a D1 database, giving
   the diary an optional off-device backup/sync target.

   Deploy this once (see cloudflare/README.md), then paste
   its https://*.workers.dev URL into the diary's
   Settings > Cloud Sync > "Sync server URL" field.

   Routes:
     POST /api/sync            -> creates a new row, returns { id }
     GET  /api/sync/:id        -> returns { id, data, updatedAt } or 404
     PUT  /api/sync/:id        -> body { data }, upserts, returns { ok: true }

   "data" is treated as an opaque JSON blob — the diary sends
   { profile, entries } but the worker doesn't need to know that
   shape, it just stores and returns whatever it's given.

   Deliberately minimal: no auth beyond "knowing the ID" (same
   trust model as a shared link/password). Good enough for a
   personal-diary backup between someone's own devices; add
   auth in front of this (e.g. Cloudflare Access, or a shared
   secret header) before using it for anything more sensitive.
   =================================================== */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*", // EDIT: lock this to your diary's origin in production
  "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// EDIT: bump this if you ever want to cap how much any single diary can
// store server-side (bytes of the JSON-stringified blob).
const MAX_BLOB_BYTES = 5 * 1024 * 1024; // 5MB

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    try {
      if (url.pathname === "/api/sync" && request.method === "POST") {
        return await createSync(env);
      }

      const match = url.pathname.match(/^\/api\/sync\/([a-zA-Z0-9-]{6,64})$/);
      if (match) {
        const id = match[1];
        if (request.method === "GET") return await getSync(env, id);
        if (request.method === "PUT") return await putSync(env, id, request);
      }

      return json({ error: "not_found" }, 404);
    } catch (err) {
      return json({ error: "server_error", detail: String(err && err.message || err) }, 500);
    }
  },
};

async function ensureSchema(env) {
  // Cheap idempotent guard so a fresh D1 database "just works" without a
  // separate migration step, in addition to schema.sql for explicit setup.
  await env.DB.exec(
    `CREATE TABLE IF NOT EXISTS diaries (
       id TEXT PRIMARY KEY,
       data TEXT NOT NULL DEFAULT '{}',
       updated_at TEXT NOT NULL
     )`
  );
}

async function createSync(env) {
  await ensureSchema(env);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare("INSERT INTO diaries (id, data, updated_at) VALUES (?, ?, ?)")
    .bind(id, "{}", now)
    .run();
  return json({ id });
}

async function getSync(env, id) {
  await ensureSchema(env);
  const row = await env.DB.prepare("SELECT data, updated_at FROM diaries WHERE id = ?")
    .bind(id)
    .first();
  if (!row) return json({ error: "not_found" }, 404);
  let data = null;
  try { data = JSON.parse(row.data); } catch { data = null; }
  return json({ id, data, updatedAt: row.updated_at });
}

async function putSync(env, id, request) {
  await ensureSchema(env);
  let body;
  try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const serialized = JSON.stringify(body.data ?? {});
  if (serialized.length > MAX_BLOB_BYTES) {
    return json({ error: "too_large", maxBytes: MAX_BLOB_BYTES }, 413);
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO diaries (id, data, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
  ).bind(id, serialized, now).run();

  return json({ ok: true, updatedAt: now });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}
