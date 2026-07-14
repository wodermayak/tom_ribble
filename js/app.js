/* ===================================================
   THUNDER'S DIARY — app.js
   Main logic: onboarding, device detection, idle-based
   "ink absorption", Groq calls, memory, daily chat limit.

   EASY-EDIT POINTS are marked with // EDIT:
   =================================================== */

const DAILY_LIMIT = 50;                 // EDIT: change chats-per-day limit
const IDLE_MS = 2800;                   // EDIT: pause before ink is "absorbed"
const REPLY_FADE_DELAY_MS = 16000;      // EDIT: how long reply stays before fading
const API_ENDPOINT = "/api/chat";       // EDIT: serverless proxy path

const els = {
  cover: document.getElementById("cover"),
  book: document.getElementById("book"),
  tapHint: document.getElementById("tapHint"),
  onboarding: document.getElementById("onboarding"),
  diary: document.getElementById("diary"),
  greetingLine: document.getElementById("greetingLine"),
  typedInput: document.getElementById("typedInput"),
  drawCanvas: document.getElementById("drawCanvas"),
  replyArea: document.getElementById("replyArea"),
  limitNote: document.getElementById("limitNote"),
  inkColors: document.getElementById("inkColors"),
  eraserBtn: document.getElementById("eraserBtn"),
  memoryBtn: document.getElementById("memoryBtn"),
  closeBookBtn: document.getElementById("closeBookBtn"),
};

let idleTimer = null;
let profile = loadProfile();
let isTouchDevice = matchMedia("(pointer: coarse)").matches;

/* ---------------- STORAGE HELPERS ---------------- */
function loadProfile() {
  try { return JSON.parse(localStorage.getItem("thunderDiaryProfile")); }
  catch { return null; }
}
function saveProfile(p) {
  localStorage.setItem("thunderDiaryProfile", JSON.stringify(p));
}
function loadEntries() {
  try { return JSON.parse(localStorage.getItem("thunderDiaryEntries")) || []; }
  catch { return []; }
}
function saveEntry(entry) {
  const entries = loadEntries();
  entries.push(entry);
  // EDIT: change 400 to store more/fewer past pages
  localStorage.setItem("thunderDiaryEntries", JSON.stringify(entries.slice(-400)));
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
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
function refreshLimitNote() {
  const u = getUsage();
  const left = Math.max(0, DAILY_LIMIT - u.count);
  els.limitNote.textContent = `${left} of ${DAILY_LIMIT} pages left today`;
}

/* ---------------- COVER / OPEN BOOK ---------------- */
els.book.addEventListener("click", openBook);

function openBook() {
  els.book.classList.add("opening");
  els.tapHint.style.opacity = 0;
  setTimeout(() => {
    els.cover.classList.add("hidden");
    if (!profile) {
      els.onboarding.classList.remove("hidden");
    } else {
      enterDiary();
    }
  }, 700);
}

/* ---------------- ONBOARDING ---------------- */
let obGender = null, obPurpose = null;

document.querySelectorAll(".btn-next[data-next]").forEach(btn => {
  btn.addEventListener("click", () => {
    const current = btn.closest(".step");
    const next = btn.dataset.next;
    if (current.dataset.step === "1" && !els.typedInputSafeName()) return;
    current.classList.add("hidden");
    document.querySelector(`.step[data-step="${next}"]`).classList.remove("hidden");
  });
});

// small guard so step 1 can't proceed with an empty name
els.typedInputSafeName = function () {
  const name = document.getElementById("obName").value.trim();
  return name.length > 0;
};

document.getElementById("obGender").addEventListener("click", (e) => {
  const btn = e.target.closest(".choice");
  if (!btn) return;
  [...e.currentTarget.children].forEach(c => c.classList.remove("selected"));
  btn.classList.add("selected");
  obGender = btn.dataset.value;
});

document.getElementById("obPurpose").addEventListener("click", (e) => {
  const btn = e.target.closest(".choice");
  if (!btn) return;
  [...e.currentTarget.children].forEach(c => c.classList.remove("selected"));
  btn.classList.add("selected");
  obPurpose = btn.dataset.value;
});

document.getElementById("obFinish").addEventListener("click", () => {
  const name = document.getElementById("obName").value.trim() || "Friend";
  profile = {
    name,
    gender: obGender || "they",
    purpose: obPurpose || "both",
  };
  saveProfile(profile);
  els.onboarding.classList.add("hidden");
  enterDiary();
});

/* ---------------- ENTER DIARY ---------------- */
function enterDiary() {
  els.diary.classList.remove("hidden");
  els.greetingLine.textContent = `Dear ${profile.name},`;
  refreshLimitNote();

  if (isTouchDevice) {
    els.typedInput.classList.add("hidden");
    els.drawCanvas.classList.remove("hidden");
    DiaryCanvas.init(els.drawCanvas);
    DiaryCanvas.onStroke(resetIdleTimer);
  } else {
    els.drawCanvas.classList.add("hidden");
    els.typedInput.classList.remove("hidden");
    els.typedInput.focus();
    els.typedInput.addEventListener("input", resetIdleTimer);
  }
}

/* ---------------- INK COLORS / ERASER ---------------- */
els.inkColors.addEventListener("click", (e) => {
  const sw = e.target.closest(".swatch");
  if (!sw) return;
  [...els.inkColors.children].forEach(c => c.classList.remove("active"));
  sw.classList.add("active");
  const color = sw.dataset.color;
  els.typedInput.style.color = color;
  els.replyArea.style.color = color;
  if (isTouchDevice) DiaryCanvas.setColor(color);
});

els.eraserBtn.addEventListener("click", () => {
  if (isTouchDevice) {
    const active = DiaryCanvas.toggleEraser();
    els.eraserBtn.classList.toggle("active", active);
  } else {
    els.typedInput.value = "";
  }
});

els.closeBookBtn.addEventListener("click", () => location.reload());

/* ---------------- IDLE DETECTION -> "ink absorbed" ---------------- */
function resetIdleTimer() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(handlePause, IDLE_MS);
}

async function handlePause() {
  const usage = getUsage();
  if (usage.count >= DAILY_LIMIT) {
    els.limitNote.textContent = "Today's pages are full — come back tomorrow.";
    return;
  }

  let question = "";
  let imageData = null;

  if (isTouchDevice) {
    if (DiaryCanvas.isBlank()) return;
    imageData = DiaryCanvas.toDataURL();
    els.drawCanvas.classList.add("absorbing");
  } else {
    question = els.typedInput.value.trim();
    if (!question) return;
    els.typedInput.classList.add("absorbing");
  }

  showThinking();

  try {
    const entries = loadEntries();
    const recent = entries.slice(-5);

    const res = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profile,
        question,
        image: imageData,
        recentEntries: recent,
      }),
    });

    if (!res.ok) throw new Error("network");
    const data = await res.json();
    const answer = data.reply || "The page stays quiet for a moment...";
    const readQuestion = data.transcribedQuestion || question || "(a drawn page)";

    typewriteReply(answer);
    saveEntry({ id: Date.now(), date: new Date().toISOString(), question: readQuestion, answer });
    bumpUsage();
    refreshLimitNote();
  } catch (err) {
    typewriteReply("The ink smudged on its way to me. Try again in a moment.");
  } finally {
    if (isTouchDevice) {
      setTimeout(() => { DiaryCanvas.clear(); els.drawCanvas.classList.remove("absorbing"); }, 900);
    } else {
      setTimeout(() => { els.typedInput.value = ""; els.typedInput.classList.remove("absorbing"); }, 900);
    }
  }
}

function showThinking() {
  els.replyArea.classList.remove("fading");
  els.replyArea.innerHTML =
    '<span class="thinking-dot"></span><span class="thinking-dot"></span><span class="thinking-dot"></span>';
}

/* ---------------- HANDWRITTEN REPLY ANIMATION ---------------- */
function typewriteReply(text) {
  els.replyArea.classList.remove("fading");
  els.replyArea.textContent = "";
  let i = 0;
  const speed = 22; // EDIT: ms per character, lower = faster "writing"
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

/* ---------------- MEMORY ---------------- */
els.memoryBtn.addEventListener("click", () => {
  const entries = loadEntries();
  els.replyArea.classList.remove("fading");
  if (!entries.length) {
    els.replyArea.innerHTML = `<div class="memory-list"><em>No pages written yet.</em></div>`;
    return;
  }
  const list = entries.slice(-15).reverse().map(e => {
    const d = new Date(e.date);
    const dateStr = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return `<div>${dateStr} — ${escapeHtml(e.question).slice(0, 60)}</div>`;
  }).join("");
  els.replyArea.innerHTML = `<div class="memory-list">${list}</div>`;
});

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[m]));
}
