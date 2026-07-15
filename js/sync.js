/* ===================================================
   THUNDER'S DIARY — sync.js
   Optional cloud backup/sync against a small Cloudflare
   Worker + D1 database (see /cloudflare in this repo).

   This is entirely optional and off by default — everything
   still works purely from localStorage if it's never turned on.
   When enabled, it gives you a sync ID: enter that same ID on
   another device's Settings > Cloud Sync panel to pull the same
   profile + entries down there.

   Storage keys used:
     thunderDiarySyncEnabled  -> "true" | "false"
     thunderDiarySyncEndpoint -> base URL of your deployed Worker
     thunderDiarySyncId       -> the sync ID for this diary
     thunderDiaryLastSync     -> ISO timestamp of last successful push/pull
   =================================================== */

window.DiarySync = (function () {
  // EDIT: set a default Worker URL here if you always deploy to the same
  // place, so people don't have to paste it in Settings themselves.
  const DEFAULT_ENDPOINT = "https://tom-ribble.wmcopy100.workers.dev";
  let pushTimer = null;
  const PUSH_DEBOUNCE_MS = 1500; // EDIT: how long to wait after a change before pushing

  function isEnabled() { return localStorage.getItem("thunderDiarySyncEnabled") === "true"; }
  function setEnabled(v) { localStorage.setItem("thunderDiarySyncEnabled", v ? "true" : "false"); }

  function getEndpoint() {
    return (localStorage.getItem("thunderDiarySyncEndpoint") || DEFAULT_ENDPOINT || "").replace(/\/+$/, "");
  }
  function setEndpoint(url) { localStorage.setItem("thunderDiarySyncEndpoint", (url || "").trim().replace(/\/+$/, "")); }

  function getId() { return localStorage.getItem("thunderDiarySyncId") || null; }
  function setId(id) { localStorage.setItem("thunderDiarySyncId", id); }

  function getLastSync() { return localStorage.getItem("thunderDiaryLastSync"); }
  function setLastSync() { localStorage.setItem("thunderDiaryLastSync", new Date().toISOString()); }

  function requireEndpoint() {
    const ep = getEndpoint();
    if (!ep) throw new Error("No sync server URL set yet — add your deployed Worker URL in Settings > Cloud Sync first.");
    return ep;
  }

  // Creates a brand-new sync ID on the server and stores it locally.
  async function createAndEnable() {
    const ep = requireEndpoint();
    const res = await fetch(`${ep}/api/sync`, { method: "POST" });
    if (!res.ok) throw new Error(`Could not create a sync ID (server said ${res.status}).`);
    const data = await res.json();
    if (!data.id) throw new Error("Server didn't return a sync ID.");
    setId(data.id);
    setEnabled(true);
    await push(); // seed it with whatever's on this device right now
    return data.id;
  }

  // Enters an existing ID from another device and pulls its data down,
  // overwriting what's on THIS device (caller should confirm with the user
  // first — this is destructive to local-only unsynced entries).
  async function connectExisting(id) {
    const ep = requireEndpoint();
    const cleanId = (id || "").trim();
    if (!cleanId) throw new Error("Enter a sync ID first.");
    const res = await fetch(`${ep}/api/sync/${encodeURIComponent(cleanId)}`);
    if (res.status === 404) throw new Error("No diary found for that ID — double-check it.");
    if (!res.ok) throw new Error(`Could not reach the sync server (${res.status}).`);
    const data = await res.json();
    setId(cleanId);
    setEnabled(true);
    setLastSync();
    return data.data || null; // { profile, entries } or null if that ID was never pushed to
  }

  // Pushes current localStorage profile+entries up. Safe to call often —
  // callers should debounce (see pushDebounced) rather than call this raw
  // on every keystroke.
  async function push() {
    if (!isEnabled()) return;
    const ep = getEndpoint();
    const id = getId();
    if (!ep || !id) return;
    let profile = null, entries = [];
    try { profile = JSON.parse(localStorage.getItem("thunderDiaryProfile")); } catch {}
    try { entries = JSON.parse(localStorage.getItem("thunderDiaryEntries")) || []; } catch {}
    const res = await fetch(`${ep}/api/sync/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: { profile, entries } }),
    });
    if (res.ok) setLastSync();
    return res.ok;
  }

  // Debounced push for hooking into "an entry was just saved" without
  // hammering the Worker on rapid successive saves (e.g. offline flush).
  function pushDebounced() {
    if (!isEnabled()) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => { push().catch(() => {}); }, PUSH_DEBOUNCE_MS);
  }

  function disable() {
    setEnabled(false);
    // Deliberately keep the ID and endpoint stored so re-enabling doesn't
    // orphan the existing cloud copy; only the "actively syncing" flag flips.
  }

  return {
    isEnabled, setEnabled, getEndpoint, setEndpoint, getId, getLastSync,
    createAndEnable, connectExisting, push, pushDebounced, disable,
  };
})();
