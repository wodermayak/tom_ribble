/* ===================================================
   THUNDER'S DIARY — app.js
   Main logic: onboarding, device detection, idle-based
   "ink absorption", Groq calls, memory search, mood ink,
   page-turn navigation, streaks/insights, export, offline
   queueing, crisis-safe guard, daily nudge.

   EASY-EDIT POINTS are marked with // EDIT:
   =================================================== */

const DAILY_LIMIT = 50;                 // EDIT: chats-per-day limit
const IDLE_MS = 2800;                   // EDIT: pause before ink is "absorbed"
const REPLY_FADE_DELAY_MS = 16000;      // EDIT: how long reply stays before fading
const API_ENDPOINT = "/api/chat";       // EDIT: serverless proxy path
const MAX_RETRIES = 2;                  // EDIT: retry attempts if Groq call fails

// EDIT: default crisis resource line — India-focused by default since this
// project is built for an India-based audience. Swap for your region/audience.
const CRISIS_MESSAGE =
  "That sounds really heavy, and I don't want you carrying it alone. " +
  "Please reach out to someone you trust, or a crisis line like KIRAN " +
  "(1800-599-0019, India, 24/7) — they're there for exactly this.";
const CRISIS_KEYWORDS = [
  "kill myself", "want to die", "end my life", "suicide",
  "hurt myself", "self harm", "self-harm", "don't want to live",
];

// EDIT: simple keyword -> ink color map used for "mood ink"
const MOOD_COLORS = {
  sad: "#3a4fd9", lonely: "#3a4fd9", cry: "#3a4fd9", down: "#3a4fd9",
  angry: "#b23b3b", frustrated: "#b23b3b", mad: "#b23b3b", furious: "#b23b3b",
  anxious: "#60A5FA", stressed: "#60A5FA", worried: "#60A5FA", nervous: "#60A5FA",
  happy: "#7C3AED", excited: "#7C3AED", grateful: "#7C3AED", proud: "#7C3AED",
};
const STOPWORDS = new Set(["the","a","an","is","are","was","were","to","of","and","in","on","for","i","my","me","it","that","this","with","about","just","so","but","not"]);

const els = {
  cover: document.getElementById("cover"),
  book: document.getElementById("book"),
  tapHint: document.getElementById("tapHint"),
  waxSeal: document.getElementById("waxSeal"),
  bookTitleText: document.getElementById("bookTitleText"),
  onboarding: document.getElementById("onboarding"),
  diary: document.getElementById("diary"),
  greetingLine: document.getElementById("greetingLine"),
  streakLine: document.getElementById("streakLine"),
  typedInput: document.getElementById("typedInput"),
  drawCanvas: document.getElementById("drawCanvas"),
  replyArea: document.getElementById("replyArea"),
  limitNote: document.getElementById("limitNote"),
  inkColors: document.getElementById("inkColors"),
  eraserBtn: document.getElementById("eraserBtn"),
  memoryBtn: document.getElementById("memoryBtn"),
  insightsBtn: document.getElementById("insightsBtn"),
  insightsPanel: document.getElementById("insightsPanel"),
  soundBtn: document.getElementById("soundBtn"),
  notifyBtn: document.getElementById("notifyBtn"),
  exportBtn: document.getElementById("exportBtn"),
  closeBookBtn: document.getElementById("closeBookBtn"),
  recapBanner: document.getElementById("recapBanner"),
  nudgeBanner: document.getElementById("nudgeBanner"),
  offlineBanner: document.getElementById("offlineBanner"),
  navPrev: document.getElementById("navPrev"),
  navNext: document.getElementById("navNext"),
  paper: document.getElementById("paper"),
};

let idleTimer = null;
let profile = loadProfile();
let isTouchDevice = matchMedia("(pointer: coarse)").matches;
let manualColorChosen = false;
let currentPageIndex = 0; // set properly once entries are loaded

/* ---------------- STORAGE HELPERS ---------------- */
function loadProfile() {
  try { return JSON.parse(localStorage.getItem("thunderDiaryProfile")); }
  catch { return null; }
}
function saveProfile(p) { localStorage.setItem("thunderDiaryProfile", JSON.stringify(p)); }

function loadEntries() {
  try { return JSON.parse(localStorage.getItem("thunderDiaryEntries")) || []; }
  catch { return []; }
}
function saveEntry(entry) {
  const entries = loadEntries();
  entries.push(entry);
  localStorage.setItem("thunderDiaryEntries", JSON.stringify(entries.slice(-400))); // EDIT: history length
}

function loadQueue() {
  try { return JSON.parse(localStorage.getItem("thunderDiaryQueue")) || []; }
  catch { return []; }
}
function saveQueue(q) { localStorage.setItem("thunderDiaryQueue", JSON.stringify(q)); }

function todayStr() { return new Date().toISOString().slice(0, 10); }

function getUsage() {
  try {
    const u = JSON.parse(localStorage.getItem("thunderDiaryUsage"));
    if (u && u.date === todayStr()) return u;
  } catch {}
  return { date: todayStr(), count: 0 };
}
function bumpUsage() {
  const u = getUsage();
  u.count += 1;
  localStorage.setItem("thunderDiaryUsage", JSON.stringify(u));
  return u;
}

function msUntilMidnight() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight - now;
}
function formatCountdown(ms) {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${m}m`;
}

function refreshLimitNote() {
  const u = getUsage();
  const left = Math.max(0, DAILY_LIMIT - u.count);
  if (left <= 0) {
    els.limitNote.textContent = `Today's pages are full — resets in ${formatCountdown(msUntilMidnight())}`;
  } else {
    els.limitNote.textContent = `${left} of ${DAILY_LIMIT} pages left today`;
  }
}
setInterval(() => { if (els.diary && !els.diary.classList.contains("hidden")) refreshLimitNote(); }, 30000);

/* ---------------- COVER / OPEN BOOK ---------------- */
els.book.addEventListener("click", openBook);

function openBook() {
  DiaryAudio.pageRustle();
  els.book.classList.add("opening");
  els.tapHint.style.opacity = 0;
  setTimeout(() => {
    els.cover.classList.add("hidden");
    if (!profile) els.onboarding.classList.remove("hidden");
    else enterDiary();
  }, 700);
}

function closeBook() {
  DiaryAudio.pageRustle();
  els.waxSeal.classList.remove("hidden");
  requestAnimationFrame(() => els.waxSeal.classList.add("stamping"));
  setTimeout(() => location.reload(), 900);
}

/* ---------------- ONBOARDING ---------------- */
let obGender = null, obPurpose = null, obCoverColor = "brown", obTone = "short";

document.querySelectorAll(".btn-next[data-next]").forEach(btn => {
  btn.addEventListener("click", () => {
    const current = btn.closest(".step");
    const next = btn.dataset.next;
    if (current.dataset.step === "1" && !document.getElementById("obName").value.trim()) return;
    current.classList.add("hidden");
    document.querySelector(`.step[data-step="${next}"]`).classList.remove("hidden");
  });
});

document.getElementById("obGender").addEventListener("click", (e) => {
  const btn = e.target.closest(".choice"); if (!btn) return;
  [...e.currentTarget.children].forEach(c => c.classList.remove("selected"));
  btn.classList.add("selected"); obGender = btn.dataset.value;
});
document.getElementById("obPurpose").addEventListener("click", (e) => {
  const btn = e.target.closest(".choice"); if (!btn) return;
  [...e.currentTarget.children].forEach(c => c.classList.remove("selected"));
  btn.classList.add("selected"); obPurpose = btn.dataset.value;
});
document.getElementById("obCoverColor").addEventListener("click", (e) => {
  const btn = e.target.closest(".cover-swatch"); if (!btn) return;
  [...e.currentTarget.children].forEach(c => c.classList.remove("selected"));
  btn.classList.add("selected"); obCoverColor = btn.dataset.value;
});
document.getElementById("obTone").addEventListener("click", (e) => {
  const btn = e.target.closest(".choice"); if (!btn) return;
  [...e.currentTarget.children].forEach(c => c.classList.remove("selected"));
  btn.classList.add("selected"); obTone = btn.dataset.value;
});

document.getElementById("obFinish").addEventListener("click", () => {
  const name = document.getElementById("obName").value.trim() || "Friend";
  const diaryName = document.getElementById("obDiaryName").value.trim() || "Thunder's Diary";
  profile = { name, gender: obGender || "they", purpose: obPurpose || "both", diaryName, coverColor: obCoverColor, tone: obTone };
  saveProfile(profile);
  els.onboarding.classList.add("hidden");
  enterDiary();
});

/* ---------------- ENTER DIARY ---------------- */
function enterDiary() {
  document.body.dataset.cover = profile.coverColor || "brown";
  els.bookTitleText.innerHTML = (profile.diaryName || "Thunder's Diary").replace(" ", "<br>");
  els.diary.classList.remove("hidden");
  els.greetingLine.textContent = `Dear ${profile.name},`;

  const entries = loadEntries();
  currentPageIndex = entries.length; // start on the fresh writing page
  renderStreak();
  refreshLimitNote();
  maybeShowRecap();
  maybeShowNudge();
  updateNavButtons();

  if (isTouchDevice) {
    els.typedInput.classList.add("hidden");
    els.drawCanvas.classList.remove("hidden");
    DiaryCanvas.init(els.drawCanvas);
    DiaryCanvas.onStroke(() => { resetIdleTimer(); DiaryAudio.quillScratch(); });
  } else {
    els.drawCanvas.classList.add("hidden");
    els.typedInput.classList.remove("hidden");
    els.typedInput.focus();
    els.typedInput.addEventListener("input", () => { resetIdleTimer(); DiaryAudio.quillScratch(); });
  }

  window.addEventListener("online", flushQueue);
  window.addEventListener("offline", () => els.offlineBanner.classList.remove("hidden"));
  if (!navigator.onLine) els.offlineBanner.classList.remove("hidden");
  flushQueue();
}

/* ---------------- INK COLORS / ERASER ---------------- */
els.inkColors.addEventListener("click", (e) => {
  const sw = e.target.closest(".swatch"); if (!sw) return;
  [...els.inkColors.children].forEach(c => c.classList.remove("active"));
  sw.classList.add("active");
  manualColorChosen = true;
  applyInkColor(sw.dataset.color);
});

function applyInkColor(color) {
  els.typedInput.style.color = color;
  els.replyArea.style.color = color;
  if (isTouchDevice) DiaryCanvas.setColor(color);
}

els.eraserBtn.addEventListener("click", () => {
  if (isTouchDevice) {
    const active = DiaryCanvas.toggleEraser();
    els.eraserBtn.classList.toggle("active", active);
  } else {
    els.typedInput.value = "";
  }
});

els.closeBookBtn.addEventListener("click", closeBook);

/* ---------------- IDLE DETECTION -> "ink absorbed" ---------------- */
function resetIdleTimer() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(handlePause, IDLE_MS);
}

async function handlePause() {
  if (currentPageIndex !== loadEntries().length) return; // only write on the live page

  const usage = getUsage();
  if (usage.count >= DAILY_LIMIT) { refreshLimitNote(); return; }

  let question = "";
  let imageData = null;

  if (isTouchDevice) {
    if (DiaryCanvas.isBlank()) return;
    imageData = DiaryCanvas.toCompressedDataURL();
    els.drawCanvas.classList.add("absorbing");
  } else {
    question = els.typedInput.value.trim();
    if (!question) return;

    // crisis-safe guard, checked locally before anything is sent
    if (containsCrisisLanguage(question)) {
      typewriteReply(CRISIS_MESSAGE);
      els.typedInput.value = "";
      return;
    }

    // local "show me what I wrote about ___" search — no API call needed
    const searchTerm = extractMemoryQuery(question);
    if (searchTerm) {
      showLocalMemorySearch(searchTerm);
      els.typedInput.value = "";
      return;
    }

    els.typedInput.classList.add("absorbing");
  }

  showThinking();
  await sendToOracle({ question, imageData });
}

async function sendToOracle({ question, imageData }, attempt = 0) {
  const entries = loadEntries();
  const recent = entries.slice(-5);
  const payload = { profile, question, image: imageData, recentEntries: recent };

  if (!navigator.onLine) { queueForLater(payload); return; }

  try {
    const res = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("network");
    const data = await res.json();
    const answer = data.reply || "The page stays quiet for a moment...";
    const readQuestion = data.transcribedQuestion || question || "(a drawn page)";
    const mood = data.mood || detectMoodLocally(readQuestion);

    if (!manualColorChosen && mood && MOOD_COLORS[mood]) applyInkColor(MOOD_COLORS[mood]);

    if (isTouchDevice) {
      DiaryCanvas.drawReplyAsInk(answer, els.replyArea.style.color || "#7C3AED", () => scheduleFade());
    } else {
      typewriteReply(answer);
    }

    saveEntry({ id: Date.now(), date: new Date().toISOString(), question: readQuestion, answer, mood });
    bumpUsage();
    refreshLimitNote();
    renderStreak();
    currentPageIndex = loadEntries().length;
    updateNavButtons();
  } catch (err) {
    if (attempt < MAX_RETRIES) {
      setTimeout(() => sendToOracle({ question, imageData }, attempt + 1), 800 * (attempt + 1));
    } else if (!navigator.onLine) {
      queueForLater(payload);
    } else {
      typewriteReply("The ink smudged on its way to me. Try again in a moment.");
    }
  } finally {
    if (isTouchDevice) {
      setTimeout(() => { DiaryCanvas.clear(); els.drawCanvas.classList.remove("absorbing"); }, 900);
    } else {
      setTimeout(() => { els.typedInput.value = ""; els.typedInput.classList.remove("absorbing"); }, 900);
    }
  }
}

/* ---------------- OFFLINE QUEUE ---------------- */
function queueForLater(payload) {
  const q = loadQueue();
  q.push(payload);
  saveQueue(q);
  els.offlineBanner.classList.remove("hidden");
  typewriteReply("You're offline — I'll keep this page safe and answer as soon as you're back.");
}
async function flushQueue() {
  if (!navigator.onLine) return;
  const q = loadQueue();
  if (!q.length) { els.offlineBanner.classList.add("hidden"); return; }
  saveQueue([]);
  els.offlineBanner.classList.add("hidden");
  for (const payload of q) {
    await sendToOracle({ question: payload.question, imageData: payload.image });
  }
}

/* ---------------- CRISIS GUARD ---------------- */
function containsCrisisLanguage(text) {
  const lower = text.toLowerCase();
  return CRISIS_KEYWORDS.some(k => lower.includes(k));
}

/* ---------------- MOOD (local fallback) ---------------- */
function detectMoodLocally(text) {
  const lower = (text || "").toLowerCase();
  for (const word of Object.keys(MOOD_COLORS)) {
    if (lower.includes(word)) return word;
  }
  return null;
}

/* ---------------- THINKING / TYPEWRITER ---------------- */
function showThinking() {
  els.replyArea.classList.remove("fading");
  els.replyArea.innerHTML =
    '<span class="thinking-dot"></span><span class="thinking-dot"></span><span class="thinking-dot"></span>';
}

function typewriteReply(text) {
  els.replyArea.classList.remove("fading");
  els.replyArea.textContent = "";
  let i = 0;
  const speed = 22; // EDIT: ms per character
  function step() {
    if (i <= text.length) {
      els.replyArea.textContent = text.slice(0, i);
      i++;
      setTimeout(step, speed);
    } else {
      scheduleFade();
    }
  }
  step();
}
function scheduleFade() {
  setTimeout(() => els.replyArea.classList.add("fading"), REPLY_FADE_DELAY_MS);
}

/* ---------------- LOCAL "SHOW ME WHAT I WROTE ABOUT ___" ---------------- */
function extractMemoryQuery(text) {
  const m = text.match(/show me what i wrote about (.+)/i) || text.match(/what did i write about (.+)/i);
  return m ? m[1].replace(/[?.!]+$/, "").trim() : null;
}

function showLocalMemorySearch(query) {
  const entries = loadEntries();
  const queryWords = tokenize(query);
  let best = null, bestScore = 0;
  entries.forEach(e => {
    const words = tokenize(e.question + " " + e.answer);
    const score = queryWords.filter(w => words.includes(w)).length;
    if (score > bestScore) { bestScore = score; best = e; }
  });

  els.replyArea.classList.remove("fading");
  if (!best || bestScore === 0) {
    els.replyArea.textContent = `I don't have a page about "${query}" yet.`;
    return;
  }
  const d = new Date(best.date);
  const dateStr = d.toLocaleDateString(undefined, { month: "long", day: "numeric" });
  typewriteReply(`On ${dateStr}, you wrote: "${best.question}"\n\nAnd I said: ${best.answer}`);
}

function tokenize(str) {
  return (str || "").toLowerCase().match(/[a-z']+/g)?.filter(w => !STOPWORDS.has(w)) || [];
}

/* ---------------- MEMORY BUTTON (list view) ---------------- */
els.memoryBtn.addEventListener("click", () => {
  const entries = loadEntries();
  els.replyArea.classList.remove("fading");
  if (!entries.length) {
    els.replyArea.innerHTML = `<div class="memory-list"><em>No pages written yet.</em></div>`;
    return;
  }
  const list = entries.slice(-15).reverse().map((e) => {
    const d = new Date(e.date);
    const dateStr = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return `<div data-id="${e.id}">${dateStr} — ${escapeHtml(e.question).slice(0, 60)}</div>`;
  }).join("");
  els.replyArea.innerHTML = `<div class="memory-list">${list}</div>`;

  els.replyArea.querySelectorAll(".memory-list div").forEach(row => {
    row.addEventListener("click", () => {
      const entry = entries.find(e => String(e.id) === row.dataset.id);
      if (entry) jumpToEntry(entry);
    });
  });
});

function jumpToEntry(entry) {
  const entries = loadEntries();
  const idx = entries.findIndex(e => e.id === entry.id);
  if (idx >= 0) { currentPageIndex = idx; renderPage(); }
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

/* ---------------- PAGE-TURN NAVIGATION ---------------- */
els.navPrev.addEventListener("click", () => flipTo(currentPageIndex - 1));
els.navNext.addEventListener("click", () => flipTo(currentPageIndex + 1));

function flipTo(newIndex) {
  const entries = loadEntries();
  if (newIndex < 0 || newIndex > entries.length) return;
  DiaryAudio.pageRustle();
  els.paper.classList.add("flipping-out");
  setTimeout(() => {
    currentPageIndex = newIndex;
    renderPage();
    els.paper.classList.remove("flipping-out");
    els.paper.classList.add("flipping-in");
    setTimeout(() => els.paper.classList.remove("flipping-in"), 500);
  }, 400);
}

function renderPage() {
  const entries = loadEntries();
  updateNavButtons();
  if (currentPageIndex >= entries.length) {
    // live writing page
    els.typedInput.classList.toggle("hidden", isTouchDevice);
    els.drawCanvas.classList.toggle("hidden", !isTouchDevice);
    els.typedInput.disabled = false;
    els.replyArea.textContent = "";
    return;
  }
  // read-only past page
  const entry = entries[currentPageIndex];
  els.typedInput.classList.add("hidden");
  els.drawCanvas.classList.add("hidden");
  const d = new Date(entry.date);
  els.replyArea.innerHTML =
    `<div style="color:#4a3a2a;font-family:'Cormorant Garamond',serif;font-style:italic;margin-bottom:10px;font-size:16px;">${d.toLocaleDateString(undefined,{month:"long",day:"numeric",year:"numeric"})}</div>` +
    `<div class="handwriting" style="color:#2b2b3d;margin-bottom:14px;">${escapeHtml(entry.question)}</div>` +
    `<div class="handwriting">${escapeHtml(entry.answer)}</div>`;
}

function updateNavButtons() {
  const entries = loadEntries();
  els.navPrev.disabled = currentPageIndex <= 0;
  els.navNext.disabled = currentPageIndex >= entries.length;
}

/* ---------------- STREAKS & INSIGHTS ---------------- */
function computeStreak(entries) {
  const days = new Set(entries.map(e => e.date.slice(0, 10)));
  let streak = 0;
  let cursor = new Date();
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function renderStreak() {
  const entries = loadEntries();
  const streak = computeStreak(entries);
  els.streakLine.textContent = streak > 1 ? `${streak}-day writing streak` : "";
}

els.insightsBtn.addEventListener("click", () => {
  const entries = loadEntries();
  const streak = computeStreak(entries);
  const today = entries.filter(e => e.date.slice(0, 10) === todayStr()).length;
  const panelHidden = els.insightsPanel.classList.contains("hidden");
  if (panelHidden) {
    els.insightsPanel.innerHTML = `
      <h3>Insights</h3>
      <div>Total pages: ${entries.length}</div>
      <div>Pages today: ${today}</div>
      <div>Current streak: ${streak} day${streak === 1 ? "" : "s"}</div>
    `;
  }
  els.insightsPanel.classList.toggle("hidden");
});

/* ---------------- WEEKLY RECAP ---------------- */
function maybeShowRecap() {
  const lastRecap = localStorage.getItem("thunderDiaryLastRecap");
  if (lastRecap === todayStr()) return;

  const entries = loadEntries();
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recent = entries.filter(e => new Date(e.date).getTime() > weekAgo);
  if (recent.length < 3) return;

  const freq = {};
  recent.forEach(e => tokenize(e.question).forEach(w => { freq[w] = (freq[w] || 0) + 1; }));
  const [topWord, count] = Object.entries(freq).sort((a, b) => b[1] - a[1])[0] || [];
  if (topWord && count >= 3) {
    els.recapBanner.textContent = `You've written about "${topWord}" ${count} times this week.`;
    els.recapBanner.classList.remove("hidden");
    localStorage.setItem("thunderDiaryLastRecap", todayStr());
  }
}

/* ---------------- DAILY NUDGE ---------------- */
els.notifyBtn.addEventListener("click", async () => {
  if (els.notifyBtn.dataset.on === "true") {
    els.notifyBtn.dataset.on = "false";
    els.notifyBtn.textContent = "Nudge: off";
    return;
  }
  if ("Notification" in window) {
    const perm = await Notification.requestPermission();
    if (perm === "granted") {
      els.notifyBtn.dataset.on = "true";
      els.notifyBtn.textContent = "Nudge: on";
      scheduleSameSessionNudge();
    }
  }
});

function scheduleSameSessionNudge() {
  // NOTE: true daily push notifications need a service worker + push
  // server; this only reminds while the tab stays open in this session.
  const entries = loadEntries();
  const wroteToday = entries.some(e => e.date.slice(0, 10) === todayStr());
  if (wroteToday) return;
  setTimeout(() => {
    if (Notification.permission === "granted") {
      new Notification("Thunder's Diary", { body: "Your diary is waiting, whenever you're ready." });
    }
  }, 4 * 60 * 60 * 1000); // EDIT: 4-hour same-session reminder delay
}

function maybeShowNudge() {
  const entries = loadEntries();
  const lastEntry = entries[entries.length - 1];
  if (!lastEntry) return;
  const daysSince = Math.floor((Date.now() - new Date(lastEntry.date).getTime()) / 86400000);
  if (daysSince >= 2) {
    els.nudgeBanner.textContent = `It's been ${daysSince} days — your diary missed you.`;
    els.nudgeBanner.classList.remove("hidden");
  }
}

/* ---------------- SOUND TOGGLE ---------------- */
els.soundBtn.addEventListener("click", () => {
  const next = !DiaryAudio.isEnabled();
  DiaryAudio.setEnabled(next);
  els.soundBtn.textContent = `Sound: ${next ? "on" : "off"}`;
  els.soundBtn.classList.toggle("active", next);
});

/* ---------------- EXPORT ---------------- */
els.exportBtn.addEventListener("click", () => {
  const data = { profile, entries: loadEntries(), exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `thunders-diary-backup-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});
