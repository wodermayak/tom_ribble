/* ===================================================
   THUNDER'S DIARY — canvas.js
   Handles pen/finger drawing, plus animating the AI's
   reply as real ink strokes on the same canvas (instead
   of a typed font) for touch/pen devices.

   NOTE on "true" handwriting: this draws each letter as a
   jittered pen stroke with a moving nib, which reads as
   real ink motion. It is not full vector glyph-outline
   tracing (that needs a font-outline parser like
   opentype.js). Swap `drawReplyAsInk` for an opentype.js
   based tracer later if you want literal glyph paths.
   =================================================== */

window.DiaryCanvas = (function () {
  let canvas, ctx;
  let drawing = false;
  let lastX = 0, lastY = 0;
  let currentColor = "#2b2b3d";
  let eraserMode = false;
  let onStrokeCallback = null;

  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext("2d");
    resize();
    window.addEventListener("resize", resize);

    canvas.addEventListener("pointerdown", startStroke);
    canvas.addEventListener("pointermove", moveStroke);
    canvas.addEventListener("pointerup", endStroke);
    canvas.addEventListener("pointerleave", endStroke);
  }

  function resize() {
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(ratio, ratio);
  }

  function startStroke(e) {
    drawing = true;
    const p = getPos(e);
    lastX = p.x; lastY = p.y;
  }

  function moveStroke(e) {
    if (!drawing) return;
    const p = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(p.x, p.y);
    ctx.lineWidth = eraserMode ? 22 : (e.pressure ? 1 + e.pressure * 3 : 2.4);
    ctx.lineCap = "round";
    ctx.strokeStyle = eraserMode ? "#fdfcf7" : currentColor;
    ctx.stroke();
    lastX = p.x; lastY = p.y;
    if (onStrokeCallback) onStrokeCallback();
  }

  function endStroke() { drawing = false; }

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function setColor(hex) { currentColor = hex; eraserMode = false; }

  function toggleEraser(forceState) {
    eraserMode = forceState !== undefined ? forceState : !eraserMode;
    return eraserMode;
  }

  function clear() {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  function isBlank() {
    const blank = document.createElement("canvas");
    blank.width = canvas.width;
    blank.height = canvas.height;
    return canvas.toDataURL() === blank.toDataURL();
  }

  function toDataURL() { return canvas.toDataURL("image/png"); }

  // EDIT: lower maxWidth / lower jpeg quality for smaller, cheaper uploads
  function toCompressedDataURL(maxWidth = 900, quality = 0.72) {
    const scale = Math.min(1, maxWidth / canvas.width);
    if (scale === 1) return canvas.toDataURL("image/jpeg", quality);
    const off = document.createElement("canvas");
    off.width = canvas.width * scale;
    off.height = canvas.height * scale;
    const offCtx = off.getContext("2d");
    offCtx.fillStyle = "#fdfcf7";
    offCtx.fillRect(0, 0, off.width, off.height);
    offCtx.drawImage(canvas, 0, 0, off.width, off.height);
    return off.toDataURL("image/jpeg", quality);
  }

  function onStroke(cb) { onStrokeCallback = cb; }

  /* ---------- Ink-drawn reply animation (touch devices) ---------- */
  // Draws `text` onto the canvas character-by-character with a moving
  // pen-nib dot and slight per-letter jitter/rotation, simulating a hand
  // writing the reply. Calls onDone() when finished.
  function drawReplyAsInk(text, color, onDone) {
    clear();
    const rect = canvas.getBoundingClientRect();
    const fontSize = 30;
    ctx.font = `${fontSize}px 'Caveat', cursive`;
    ctx.fillStyle = color || "#7C3AED";
    ctx.textBaseline = "alphabetic";

    const maxWidth = rect.width - 24;
    const lineHeight = fontSize * 1.15;
    let x = 12, y = fontSize + 10;

    // wrap text into lines first so we know when to break
    const words = text.split(" ");
    const lines = [];
    let line = "";
    words.forEach((w) => {
      const test = line ? line + " " + w : w;
      if (ctx.measureText(test).width > maxWidth) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    });
    if (line) lines.push(line);

    let li = 0, ci = 0;
    const speed = 26; // EDIT: ms per character

    function step() {
      if (li >= lines.length) {
        if (onDone) onDone();
        return;
      }
      const currentLine = lines[li];
      if (ci > currentLine.length) {
        li++; ci = 0; x = 12; y += lineHeight;
        setTimeout(step, speed);
        return;
      }
      const ch = currentLine[ci];
      ctx.save();
      const jitterY = (Math.random() - 0.5) * 1.6;
      const jitterRot = (Math.random() - 0.5) * 0.04;
      ctx.translate(x, y + jitterY);
      ctx.rotate(jitterRot);
      ctx.fillText(ch, 0, 0);
      ctx.restore();
      x += ctx.measureText(ch).width;

      // moving "nib" dot just ahead of the ink
      ctx.save();
      ctx.fillStyle = "rgba(124,58,237,0.35)";
      ctx.beginPath();
      ctx.arc(x + 2, y - 4, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ci++;
      setTimeout(step, speed);
    }
    step();
  }

  return {
    init, setColor, toggleEraser, clear, isBlank,
    toDataURL, toCompressedDataURL, onStroke, resize, drawReplyAsInk,
  };
})();
