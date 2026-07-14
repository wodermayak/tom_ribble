/* ===================================================
   THUNDER'S DIARY — audio.js
   Ambient sound effects synthesized with the Web Audio
   API (white-noise buffers shaped with filters), so no
   external sound files need to be hosted or licensed.
   Off by default; toggled from the toolbar.
   =================================================== */

window.DiaryAudio = (function () {
  let ctx = null;
  let enabled = false;

  function ensureContext() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
  }

  function setEnabled(state) { enabled = state; }
  function isEnabled() { return enabled; }

  function noiseBuffer(duration) {
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  // Short, soft scratch — played in little bursts while writing
  function quillScratch() {
    if (!enabled) return;
    ensureContext();
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(0.09);
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 2800; // EDIT: higher = scratchier
    filter.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.05, ctx.currentTime); // EDIT: volume
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start();
  }

  // Softer, longer rustle — played on page turns / opening / closing
  function pageRustle() {
    if (!enabled) return;
    ensureContext();
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(0.4);
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 1200;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 0.05); // EDIT: volume
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start();
  }

  return { setEnabled, isEnabled, quillScratch, pageRustle };
})();
