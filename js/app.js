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

// EDIT: keep this list broader than feels necessary — false positives just
// show a caring message, false negatives are the real risk. Matching runs
// against normalizeForCrisisCheck() output (lowercased, punctuation and
// apostrophes stripped, whitespace collapsed) so "can't go on", "cant go on"
// and "can’t   go on" all match the single "cant go on" entry below.
const CRISIS_KEYWORDS = [
  "kill myself", "kill me", "want to die", "wanna die", "end my life",
  "end it all", "suicide", "suicidal", "hurt myself", "hurting myself",
  "self harm", "selfharm", "dont want to live", "dont want to be here",
  "dont want to be here anymore", "cant go on", "no reason to live",
  "no reason to keep living", "better off dead", "better off without me",
  "not worth living", "give up on life", "want to disappear forever",
  "cant do this anymore", "cant take this anymore", "nothing left to live for",
];

// EDIT: simple keyword -> ink color map used for "mood ink". Extend freely —
// just keep MOOD_WORDS in api/chat.js in sync so server-detected moods (and
// the model's own MOOD: line) map to a color that exists here.
const MOOD_COLORS = {
  sad: "#3a4fd9", lonely: "#3a4fd9", cry: "#3a4fd9", down: "#3a4fd9",
  angry: "#b23b3b", frustrated: "#b23b3b", mad: "#b23b3b", furious: "#b23b3b",
  anxious: "#60A5FA", stressed: "#60A5FA", worried: "#60A5FA", nervous: "#60A5FA",
  happy: "#7C3AED", excited: "#7C3AED", grateful: "#7C3AED", proud: "#7C3AED",
  calm: "#2f9e7a", peaceful: "#2f9e7a", content: "#2f9e7a",
  tired: "#6b6b6b", exhausted: "#6b6b6b", drained: "#6b6b6b",
  hopeful: "#c98a2b", motivated: "#c98a2b", inspired: "#c98a2b",
  overwhelmed: "#8a5bc9", confused: "#8a5bc9",
  scared: "#4a4a8a", afraid: "#4a4a8a",
};
const STOPWORDS = new Set(["the","a","an","is","are","was","were","to","of","and","in","on","for","i","my","me","it","that","this","with","about","just","so","but","not"]);

// EDIT: idle prompts shown as a faint nudge on a blank page (typed placeholder
// rotation, or a faint canvas hint for touch) to lower the activation barrier.
const IDLE_PROMPTS = [
  "What made you smile today?",
  "What's on your mind right now?",
  "What's one thing you're carrying today?",
  "What are you looking forward to?",
  "What's something you'd tell no one else?",
  "How did today actually feel?",
];
const IDLE_PROMPT_ROTATE_MS = 6000; // EDIT: how often the blank-page prompt changes
const BACKUP_REMINDER_DAYS = 30;    // EDIT: days between "please export" nudges

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
  canvasWrap: document.getElementById("canvasWrap"),
  canvasFsToolbar: document.getElementById("canvasFsToolbar"),
  fullscreenBtn: document.getElementById("fullscreenBtn"),
  fsEraserBtn: document.getElementById("fsEraserBtn"),
  fsUndoBtn: document.getElementById("fsUndoBtn"),
  fsExitBtn: document.getElementById("fsExitBtn"),
  inkColorsFs: document.getElementById("inkColorsFs"),
  replyArea: document.getElementById("replyArea"),
  limitNote: document.getElementById("limitNote"),
  inkColors: document.getElementById("inkColors"),
  eraserBtn: document.getElementById("eraserBtn"),
  undoBtn: document.getElementById("undoBtn"),
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
  backupBanner: document.getElementById("backupBanner"),
  backupBannerText: document.getElementById("backupBannerText"),
  backupBannerExport: document.getElementById("backupBannerExport"),
  backupBannerDismiss: document.getElementById("backupBannerDismiss"),
  navPrev: document.getElementById("navPrev"),
  navNext: document.getElementById("navNext"),
  paper: document.getElementById("paper"),
  syncBtn: document.getElementById("syncBtn"),
  syncPanel: document.getElementById("syncPanel"),
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
  entries.push({ ...entry, localDate: entry.localDate || localDateStr(entry.date) });
  localStorage.setItem("thunderDiaryEntries", JSON.stringify(entries.slice(-400))); // EDIT: history length
}

function loadQueue() {
  try { return JSON.parse(localStorage.getItem("thunderDiaryQueue")) || []; }
  catch { return []; }
}
function saveQueue(q) { localStorage.setItem("thunderDiaryQueue", JSON.stringify(q)); }

// BUG FIX: toISOString() is always UTC, but "resets at midnight" (see
// msUntilMidnight() and the README) means *local* midnight. Building the
// string from local getFullYear/getMonth/getDate keeps the daily counter,
// streak, and "today" checks aligned with the clock the person actually
// sees, regardless of timezone offset.
function localDateStr(input) {
  const d = input ? new Date(input) : new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function todayStr() { return localDateStr(); }
// Every saved entry also gets a localDate field going forward (see
// saveEntry()); this falls back to converting the ISO date for older
// entries saved before that field existed.
function entryLocalDate(entry) { return entry.localDate || localDateStr(entry.date); }

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
  maybeShowBackupReminder();
  startIdlePromptRotation();
  updateNavButtons();

  if (isTouchDevice) {
    els.typedInput.classList.add("hidden");
    els.canvasWrap.classList.remove("hidden");
    if (els.undoBtn) els.undoBtn.classList.remove("hidden");
    if (els.fullscreenBtn) els.fullscreenBtn.classList.remove("hidden");
    DiaryCanvas.init(els.drawCanvas);
    DiaryCanvas.onStroke(() => { resetIdleTimer(); DiaryAudio.quillScratch(); });
  } else {
    els.canvasWrap.classList.add("hidden");
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
function selectInkColor(color, sourceGroup) {
  [els.inkColors, els.inkColorsFs].forEach(group => {
    if (!group) return;
    [...group.children].forEach(c => c.classList.toggle("active", c.dataset.color === color));
  });
  manualColorChosen = true;
  applyInkColor(color);
}
els.inkColors.addEventListener("click", (e) => {
  const sw = e.target.closest(".swatch"); if (!sw) return;
  selectInkColor(sw.dataset.color);
});
if (els.inkColorsFs) {
  els.inkColorsFs.addEventListener("click", (e) => {
    const sw = e.target.closest(".swatch"); if (!sw) return;
    selectInkColor(sw.dataset.color);
  });
}

function applyInkColor(color) {
  els.typedInput.style.color = color;
  els.replyArea.style.color = color;
  if (isTouchDevice) DiaryCanvas.setColor(color);
}

function toggleEraserMode() {
  if (!isTouchDevice) { els.typedInput.value = ""; return; }
  const active = DiaryCanvas.toggleEraser();
  els.eraserBtn.classList.toggle("active", active);
  if (els.fsEraserBtn) els.fsEraserBtn.classList.toggle("active", active);
}
els.eraserBtn.addEventListener("click", toggleEraserMode);
if (els.fsEraserBtn) els.fsEraserBtn.addEventListener("click", toggleEraserMode);

if (els.undoBtn) {
  els.undoBtn.addEventListener("click", () => {
    if (isTouchDevice) DiaryCanvas.undo();
  });
}
if (els.fsUndoBtn) {
  els.fsUndoBtn.addEventListener("click", () => {
    if (isTouchDevice) DiaryCanvas.undo();
  });
}

/* ---------------- FULLSCREEN CANVAS ---------------- */
// A bigger writing surface is the single biggest lever on handwriting
// legibility (more room per letter = less cramped strokes = an easier read
// for the vision model), so this gives touch/pen users a real fullscreen
// mode for the canvas. Tries the actual Fullscreen API first (hides browser
// chrome entirely on most tablets/Android); several browsers — notably iOS
// Safari — block or don't support requestFullscreen() on arbitrary
// elements, so this falls back to a CSS-only "maximized" overlay that
// covers the viewport instead, with an explicit exit button since there's
// no native Escape-to-exit for that path.
function isNativelyFullscreen() {
  return document.fullscreenElement === els.canvasWrap
    || document.webkitFullscreenElement === els.canvasWrap;
}

async function enterFullscreenCanvas() {
  const req = els.canvasWrap.requestFullscreen || els.canvasWrap.webkitRequestFullscreen;
  if (req) {
    try {
      await req.call(els.canvasWrap);
    } catch {
      els.canvasWrap.classList.add("fullscreen-fallback"); // native request rejected — fall back
    }
  } else {
    els.canvasWrap.classList.add("fullscreen-fallback"); // Fullscreen API unavailable
  }
  onFullscreenCanvasChange();
}

function exitFullscreenCanvas() {
  if (isNativelyFullscreen()) {
    (document.exitFullscreen || document.webkitExitFullscreen || function(){}).call(document);
  }
  els.canvasWrap.classList.remove("fullscreen-fallback");
  onFullscreenCanvasChange();
}

function onFullscreenCanvasChange() {
  const active = isNativelyFullscreen() || els.canvasWrap.classList.contains("fullscreen-fallback");
  els.canvasWrap.classList.toggle("fullscreen-active", active);
  els.canvasFsToolbar.classList.toggle("hidden", !active);
  els.fullscreenBtn.setAttribute("aria-pressed", String(active));
  els.fullscreenBtn.classList.toggle("active", active);
  els.fullscreenBtn.textContent = active ? "Exit fullscreen" : "Fullscreen";
  // Give the browser a frame to finish the layout change before resampling
  // the canvas backing store at its new on-screen size.
  requestAnimationFrame(() => { if (isTouchDevice) DiaryCanvas.resize(); });
}

if (els.fullscreenBtn) {
  els.fullscreenBtn.addEventListener("click", () => {
    const active = isNativelyFullscreen() || els.canvasWrap.classList.contains("fullscreen-fallback");
    if (active) exitFullscreenCanvas(); else enterFullscreenCanvas();
  });
}
if (els.fsExitBtn) els.fsExitBtn.addEventListener("click", exitFullscreenCanvas);
document.addEventListener("fullscreenchange", onFullscreenCanvasChange);
document.addEventListener("webkitfullscreenchange", onFullscreenCanvasChange);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && els.canvasWrap.classList.contains("fullscreen-fallback")) {
    exitFullscreenCanvas();
  }
});

els.closeBookBtn.addEventListener("click", closeBook);

/* ---------------- BLANK-PAGE PROMPTS ---------------- */
// Right now a blank page just waits. Rotate a gentle, low-pressure prompt
// through the placeholder (typed) / a faint canvas hint (touch) to lower
// the activation barrier — only while the live writing page is empty.
let idlePromptTimer = null;
function startIdlePromptRotation() {
  clearInterval(idlePromptTimer);
  let i = Math.floor(Math.random() * IDLE_PROMPTS.length);
  applyIdlePrompt(IDLE_PROMPTS[i]);
  idlePromptTimer = setInterval(() => {
    if (currentPageIndex !== loadEntries().length) return; // not on the live page
    const isEmpty = isTouchDevice
      ? (typeof DiaryCanvas !== "undefined" && DiaryCanvas.isBlank && DiaryCanvas.isBlank())
      : !els.typedInput.value.trim();
    if (!isEmpty) return;
    i = (i + 1) % IDLE_PROMPTS.length;
    applyIdlePrompt(IDLE_PROMPTS[i]);
  }, IDLE_PROMPT_ROTATE_MS);
}
function applyIdlePrompt(text) {
  if (els.typedInput) els.typedInput.placeholder = text;
  if (isTouchDevice && typeof DiaryCanvas !== "undefined" && DiaryCanvas.showPrompt) {
    DiaryCanvas.showPrompt(text);
  }
}

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

// The API only ever sees the last 5 entries for cost reasons, so a goal
// mentioned two weeks ago would otherwise be "forgotten". Reuse the same
// keyword-overlap scoring behind "show me what I wrote about ___" to pull
// in the single best-matching older entry (if any) as extra context.
function findRelevantOlderEntry(question, excludeRecent) {
  if (!question) return null;
  const queryWords = tokenize(question);
  if (!queryWords.length) return null;
  const older = loadEntries().slice(0, -excludeRecent || undefined);
  let best = null, bestScore = 0;
  older.forEach(e => {
    const words = tokenize(e.question + " " + e.answer);
    const score = queryWords.filter(w => words.includes(w)).length;
    if (score > bestScore) { bestScore = score; best = e; }
  });
  return bestScore >= 2 ? best : null; // EDIT: overlap threshold before it's worth including
}

async function sendToOracle({ question, imageData }, attempt = 0) {
  const entries = loadEntries();
  const recent = entries.slice(-5);
  const olderEntry = question ? findRelevantOlderEntry(question, 5) : null;
  const payload = { profile, question, image: imageData, recentEntries: recent, olderEntry };

  if (!navigator.onLine) { queueForLater(payload); return; }

  try {
    const res = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("network");
    const data = await res.json();
    const readQuestion = data.transcribedQuestion || question || "(a drawn page)";

    // BUG FIX: typed input is checked locally in handlePause() before it's
    // ever sent, but handwritten/drawn pages go straight to the vision
    // model with no local check — the transcript coming back is the first
    // point a touch/pen entry can be screened. Check it here, before
    // anything is rendered or saved, so the safety net covers both paths
    // instead of relying solely on the persona's safetyLine.
    const crisisHit = containsCrisisLanguage(readQuestion);
    const answer = crisisHit
      ? CRISIS_MESSAGE
      : (data.reply || "The page stays quiet for a moment...");
    const mood = crisisHit ? null : (data.mood || detectMoodLocally(readQuestion));

    if (!manualColorChosen && mood && MOOD_COLORS[mood]) applyInkColor(MOOD_COLORS[mood]);

    if (isTouchDevice) {
      DiaryCanvas.drawReplyAsInk(answer, els.replyArea.style.color || "#7C3AED", () => scheduleFade());
    } else {
      typewriteReply(answer);
    }

    saveEntry({ id: Date.now(), date: new Date().toISOString(), question: readQuestion, answer, mood });
    if (typeof DiarySync !== "undefined") DiarySync.pushDebounced();
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
// Strips punctuation/apostrophes and collapses whitespace so contraction
// variants ("can't", "cant", "can’t") and casual punctuation all normalize
// to the same comparable string as the keyword list.
function normalizeForCrisisCheck(text) {
  return (text || "")
    .toLowerCase()
    .replace(/['’‘]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function containsCrisisLanguage(text) {
  const normalized = normalizeForCrisisCheck(text);
  if (!normalized) return false;
  return CRISIS_KEYWORDS.some(k => normalized.includes(normalizeForCrisisCheck(k)));
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

/* ---------------- MEMORY BUTTON (list view, filterable by mood) ---------------- */
function moodDot(mood) {
  const color = mood && MOOD_COLORS[mood] ? MOOD_COLORS[mood] : "#c9c2d9";
  return `<span class="mood-dot" style="background:${color}" title="${mood ? escapeHtml(mood) : "no mood detected"}"></span>`;
}

function renderMemoryList(activeMood) {
  const entries = loadEntries();
  if (!entries.length) {
    els.replyArea.innerHTML = `<div class="memory-list"><em>No pages written yet.</em></div>`;
    return;
  }
  const moodsPresent = [...new Set(entries.map(e => e.mood).filter(Boolean))];
  const chips = moodsPresent.length
    ? `<div class="mood-filter-chips">` +
      `<button class="mood-chip${!activeMood ? " active" : ""}" data-mood="">All</button>` +
      moodsPresent.map(m => `<button class="mood-chip${activeMood === m ? " active" : ""}" data-mood="${m}">${moodDot(m)}${escapeHtml(m)}</button>`).join("") +
      `</div>`
    : "";

  const filtered = activeMood ? entries.filter(e => e.mood === activeMood) : entries;
  const list = filtered.slice(-15).reverse().map((e) => {
    const d = new Date(e.date);
    const dateStr = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return `<div data-id="${e.id}">${moodDot(e.mood)}${dateStr} — ${escapeHtml(e.question).slice(0, 60)}</div>`;
  }).join("") || `<em>No pages with that mood yet.</em>`;

  els.replyArea.innerHTML = `<div class="memory-list">${chips}${list}</div>`;

  els.replyArea.querySelectorAll(".mood-chip").forEach(chip => {
    chip.addEventListener("click", () => renderMemoryList(chip.dataset.mood || null));
  });
  els.replyArea.querySelectorAll(".memory-list div[data-id]").forEach(row => {
    row.addEventListener("click", () => {
      const entry = entries.find(e => String(e.id) === row.dataset.id);
      if (entry) jumpToEntry(entry);
    });
  });
}

els.memoryBtn.addEventListener("click", () => {
  els.replyArea.classList.remove("fading");
  renderMemoryList(null);
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
    els.canvasWrap.classList.toggle("hidden", !isTouchDevice);
    els.typedInput.disabled = false;
    els.replyArea.textContent = "";
    return;
  }
  // read-only past page
  const entry = entries[currentPageIndex];
  els.typedInput.classList.add("hidden");
  els.canvasWrap.classList.add("hidden");
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
  const days = new Set(entries.map(entryLocalDate));
  let streak = 0;
  let cursor = new Date();
  while (days.has(localDateStr(cursor))) {
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
  const today = entries.filter(e => entryLocalDate(e) === todayStr()).length;
  const panelHidden = els.insightsPanel.classList.contains("hidden");
  if (panelHidden) {
    const monthTop = computeTopKeyword(entries, 30);
    const yearTop = computeTopKeyword(entries, 365, 5);
    els.insightsPanel.innerHTML = `
      <h3>Insights</h3>
      <div>Total pages: ${entries.length}</div>
      <div>Pages today: ${today}</div>
      <div>Current streak: ${streak} day${streak === 1 ? "" : "s"}</div>
      ${monthTop ? `<div>This month: "${escapeHtml(monthTop.topWord)}" came up ${monthTop.count}×</div>` : ""}
      ${yearTop ? `<div>This year: "${escapeHtml(yearTop.topWord)}" came up ${yearTop.count}×</div>` : ""}
    `;
  }
  els.insightsPanel.classList.toggle("hidden");
  els.insightsBtn.setAttribute("aria-expanded", String(!els.insightsPanel.classList.contains("hidden")));
});

/* ---------------- RECAP (weekly banner + monthly/yearly in Insights) ---------------- */
// Same keyword-frequency approach as the weekly banner, scaled to any window
// in days — reused for the "this month" / "this year" lines in Insights.
function computeTopKeyword(entries, days, minCount = 3) {
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const windowed = entries.filter(e => new Date(e.date).getTime() > since);
  if (windowed.length < 3) return null;
  const freq = {};
  windowed.forEach(e => tokenize(e.question).forEach(w => { freq[w] = (freq[w] || 0) + 1; }));
  const [topWord, count] = Object.entries(freq).sort((a, b) => b[1] - a[1])[0] || [];
  return topWord && count >= minCount ? { topWord, count, pages: windowed.length } : null;
}

function maybeShowRecap() {
  const lastRecap = localStorage.getItem("thunderDiaryLastRecap");
  if (lastRecap === todayStr()) return;

  const result = computeTopKeyword(loadEntries(), 7);
  if (result) {
    els.recapBanner.textContent = `You've written about "${result.topWord}" ${result.count} times this week.`;
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
  const wroteToday = entries.some(e => entryLocalDate(e) === todayStr());
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

/* ---------------- CLOUD SYNC (Cloudflare D1, optional) ---------------- */
function renderSyncPanel(status) {
  if (!els.syncPanel) return;
  const enabled = DiarySync.isEnabled();
  const id = DiarySync.getId();
  const endpoint = DiarySync.getEndpoint();
  const lastSync = DiarySync.getLastSync();

  els.syncPanel.innerHTML = `
    <h3>Cloud Sync</h3>
    <p class="sync-note">Optional off-device backup via your own Cloudflare Worker + D1 database. Off by default — your diary stays local unless you turn this on.</p>
    <label class="sync-label">Sync server URL
      <input type="text" id="syncEndpointInput" placeholder="https://your-worker.workers.dev" value="${escapeHtml(endpoint)}" />
    </label>
    <div class="sync-row">
      <button id="syncToggleBtn" class="tool-btn${enabled ? " active" : ""}">${enabled ? "Cloud backup: on" : "Cloud backup: off"}</button>
      ${id ? `<span class="sync-id-badge" title="Your sync ID">${escapeHtml(id)}</span>` : ""}
    </div>
    ${id ? `<p class="sync-note">Enter this ID on another device to pull this diary down there. ${lastSync ? `Last synced ${new Date(lastSync).toLocaleString()}.` : ""}</p>` : ""}
    <label class="sync-label">Connect an existing ID (pulls that diary down here)
      <input type="text" id="syncConnectInput" placeholder="paste a sync ID" />
    </label>
    <button id="syncConnectBtn" class="tool-btn">Connect &amp; restore</button>
    <p class="sync-status" id="syncStatusLine">${status || ""}</p>
  `;

  document.getElementById("syncEndpointInput").addEventListener("change", (e) => {
    DiarySync.setEndpoint(e.target.value);
  });

  document.getElementById("syncToggleBtn").addEventListener("click", async () => {
    const line = document.getElementById("syncStatusLine");
    if (DiarySync.isEnabled()) {
      DiarySync.disable();
      renderSyncPanel("Cloud backup turned off. Your existing sync ID is kept if you want to turn it back on.");
      return;
    }
    try {
      line.textContent = "Creating a sync ID...";
      const newId = DiarySync.getId() ? DiarySync.getId() : await DiarySync.createAndEnable();
      if (DiarySync.getId() && !newId) { DiarySync.setEnabled(true); await DiarySync.push(); }
      renderSyncPanel("Cloud backup is on.");
    } catch (err) {
      renderSyncPanel(err.message || "Couldn't turn on cloud backup.");
    }
  });

  document.getElementById("syncConnectBtn").addEventListener("click", async () => {
    const val = document.getElementById("syncConnectInput").value.trim();
    if (!val) return;
    const ok = confirm("This replaces the diary on THIS device with the one stored under that ID. Anything written here since your last sync will be lost. Continue?");
    if (!ok) return;
    const line = document.getElementById("syncStatusLine");
    try {
      line.textContent = "Connecting...";
      const remote = await DiarySync.connectExisting(val);
      if (remote) {
        if (remote.profile) saveProfile(remote.profile);
        localStorage.setItem("thunderDiaryEntries", JSON.stringify(remote.entries || []));
      }
      renderSyncPanel("Connected — reloading...");
      setTimeout(() => location.reload(), 800);
    } catch (err) {
      renderSyncPanel(err.message || "Couldn't connect to that ID.");
    }
  });
}

if (els.syncBtn) {
  els.syncBtn.addEventListener("click", () => {
    const wasHidden = els.syncPanel.classList.contains("hidden");
    els.syncPanel.classList.toggle("hidden");
    els.syncBtn.setAttribute("aria-expanded", String(wasHidden));
    if (wasHidden) renderSyncPanel();
  });
}

/* ---------------- EXPORT / BACKUP REMINDER ---------------- */
function doExport() {
  const data = { profile, entries: loadEntries(), exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `thunders-diary-backup-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  localStorage.setItem("thunderDiaryLastExport", new Date().toISOString());
  els.backupBanner.classList.add("hidden");
}
els.exportBtn.addEventListener("click", doExport);
if (els.backupBannerExport) els.backupBannerExport.addEventListener("click", doExport);
if (els.backupBannerDismiss) {
  els.backupBannerDismiss.addEventListener("click", () => {
    // snooze — don't nag again until another full reminder window has passed
    localStorage.setItem("thunderDiaryLastExport", new Date().toISOString());
    els.backupBanner.classList.add("hidden");
  });
}

// Everything lives in localStorage only, and a cleared cache/new device
// silently wipes it. Nudge people to export every BACKUP_REMINDER_DAYS,
// but don't nag brand-new diaries with only a couple of pages.
function maybeShowBackupReminder() {
  if (!els.backupBanner) return;
  const entries = loadEntries();
  if (entries.length < 5) return;

  const lastExportRaw = localStorage.getItem("thunderDiaryLastExport");
  const since = lastExportRaw ? new Date(lastExportRaw) : new Date(entries[0].date);
  const daysSince = Math.floor((Date.now() - since.getTime()) / 86400000);
  if (daysSince < BACKUP_REMINDER_DAYS) return;

  els.backupBannerText.textContent = lastExportRaw
    ? `It's been ${daysSince} days since your last backup — this diary only lives on this device.`
    : `You've never exported a backup — ${entries.length} pages only live on this device right now.`;
  els.backupBanner.classList.remove("hidden");
}
