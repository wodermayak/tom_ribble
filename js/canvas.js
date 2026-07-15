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
  let currentStrokePoints = null; // points of the in-progress stroke, for undo history
  let strokeHistory = [];         // [{ points:[{x,y,pressure}], color, eraser }]
  let promptShowing = false;
  const GUIDE_LINE_HEIGHT = 40; // EDIT: px between ruled guide lines (in CSS px, not device px)

  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext("2d");
    resize();
    window.addEventListener("resize", resize);

    canvas.addEventListener("pointerdown", startStroke);
    canvas.addEventListener("pointermove", moveStroke);
    canvas.addEventListener("pointerup", endStroke);
    canvas.addEventListener("pointerleave", endStroke);
    canvas.addEventListener("pointercancel", endStroke);
  }

  function resize() {
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(ratio, ratio);
    redrawFromHistory();
  }

  // Faint ruled lines, redrawn as the base of every clear/redraw. Two jobs:
  // (1) helps people actually write straighter/more evenly-spaced, which
  // directly helps legibility, and (2) mirrors the kind of ruled-notebook
  // background handwriting OCR models are heavily trained on, rather than
  // blank white — small thing, but it's "free" context for the vision call.
  function drawGuideLines() {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    ctx.save();
    ctx.strokeStyle = "rgba(80,70,50,0.12)";
    ctx.lineWidth = 1;
    for (let y = GUIDE_LINE_HEIGHT; y < rect.height; y += GUIDE_LINE_HEIGHT) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(rect.width, y + 0.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  function wipe() {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  function startStroke(e) {
    // A faint idle prompt may be sitting on the canvas — the moment someone
    // actually starts writing, clear it so it doesn't get baked into what's
    // sent to the vision model.
    if (promptShowing) { clear(); promptShowing = false; }

    drawing = true;
    const p = getPos(e);
    lastX = p.x; lastY = p.y;
    currentStrokePoints = [{ x: p.x, y: p.y, pressure: e.pressure || 0.5 }];
  }

  // BUG-ADJACENT FIX: fast strokes on mobile can generate move events far
  // apart in screen space even though the OS captured many intermediate
  // points at a higher rate. Reading getCoalescedEvents() (when supported)
  // recovers those in-between points so quick handwriting doesn't come out
  // as jagged straight-line segments — this alone meaningfully improves
  // what the vision model has to read.
  function moveStroke(e) {
    if (!drawing) return;
    const events = (typeof e.getCoalescedEvents === "function" && e.getCoalescedEvents().length)
      ? e.getCoalescedEvents()
      : [e];

    events.forEach(evt => drawSegmentTo(getPos(evt), evt.pressure));
    if (onStrokeCallback) onStrokeCallback();
  }

  // Quadratic-curve through the midpoint of the last two points instead of a
  // straight lineTo — smooths out the natural jitter of finger/pen input so
  // strokes read as continuous ink rather than a chain of tiny segments.
  function drawSegmentTo(p, pressure) {
    const midX = (lastX + p.x) / 2;
    const midY = (lastY + p.y) / 2;
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.quadraticCurveTo(lastX, lastY, midX, midY);
    ctx.lineTo(p.x, p.y);
    ctx.lineWidth = eraserMode ? 22 : (pressure ? 1.4 + pressure * 3.2 : 2.6);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = eraserMode ? "#fdfcf7" : currentColor;
    ctx.stroke();
    lastX = p.x; lastY = p.y;
    if (currentStrokePoints) currentStrokePoints.push({ x: p.x, y: p.y, pressure: pressure || 0.5 });
  }

  function endStroke() {
    if (drawing && currentStrokePoints && currentStrokePoints.length > 1) {
      strokeHistory.push({
        points: currentStrokePoints,
        color: eraserMode ? "#fdfcf7" : currentColor,
        eraser: eraserMode,
      });
    }
    drawing = false;
    currentStrokePoints = null;
  }

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
    wipe();
    strokeHistory = [];
    promptShowing = false;
    drawGuideLines();
  }

  // Undoes the single most recent completed stroke by replaying history —
  // simple but effective for a "whoops, wrong word" moment while writing.
  function undo() {
    if (!strokeHistory.length) return false;
    strokeHistory.pop();
    redrawFromHistory();
    return true;
  }

  function redrawFromHistory() {
    wipe();
    drawGuideLines();
    strokeHistory.forEach(stroke => {
      ctx.strokeStyle = stroke.color;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const pts = stroke.points;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineWidth = stroke.eraser ? 22 : 1.4 + (b.pressure || 0.5) * 3.2;
        ctx.stroke();
      }
    });
  }

  function isBlank() {
    // Not a pixel-perfect check (fully erasing real ink still counts strokes
    // as "written"), but avoids the cost of a canvas readback on every check
    // and is right in the overwhelming majority of real usage.
    return !strokeHistory.some(s => !s.eraser) && !promptShowing;
  }

  function toDataURL() { return canvas.toDataURL("image/png"); }

  // EDIT: cap on the longer side before upload. Bumped up now that fullscreen
  // mode (see app.js) gives people a much bigger area to write in — more
  // detail worth preserving. PNG instead of JPEG: this is near-flat-color
  // ink-on-white content, so PNG compresses it efficiently AND, unlike
  // JPEG, has no ringing/blockiness artifacts right at thin stroke edges —
  // exactly where a vision model's read of handwriting is most sensitive.
  // This mirrors what riddle itself ships (PNG page captures), not JPEG.
  function toCompressedDataURL(maxWidth = 1400) {
    const scale = Math.min(1, maxWidth / canvas.width);
    const targetW = Math.round(canvas.width * scale);
    const targetH = Math.round(canvas.height * scale);
    const off = document.createElement("canvas");
    off.width = targetW;
    off.height = targetH;
    const offCtx = off.getContext("2d");
    // Pure white background (rather than the paper's cream tone) maximizes
    // ink-to-background contrast for the vision model's OCR pass.
    offCtx.fillStyle = "#ffffff";
    offCtx.fillRect(0, 0, off.width, off.height);
    offCtx.imageSmoothingEnabled = true;
    offCtx.imageSmoothingQuality = "high";
    offCtx.drawImage(canvas, 0, 0, off.width, off.height);
    return off.toDataURL("image/png");
  }

  function onStroke(cb) { onStrokeCallback = cb; }

  // Draws a faint, non-committal prompt (from IDLE_PROMPTS in app.js) onto
  // an empty canvas to lower the activation barrier on a blank page. Purely
  // visual — isBlank() still returns true while a prompt is showing, and
  // the first real stroke clears it automatically (see startStroke()).
  function showPrompt(text) {
    if (strokeHistory.length) return; // don't show over real content
    wipe();
    drawGuideLines();
    const rect = canvas.getBoundingClientRect();
    ctx.font = "24px 'Caveat', cursive";
    ctx.fillStyle = "rgba(43,43,61,0.28)";
    ctx.fillText(text, 12, 34, rect.width - 24);
    promptShowing = true;
  }
  function hidePrompt() {
    if (!promptShowing) return;
    clear();
    promptShowing = false;
  }

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
    init, setColor, toggleEraser, clear, isBlank, undo,
    toDataURL, toCompressedDataURL, onStroke, resize, drawReplyAsInk,
    showPrompt, hidePrompt,
  };
})();
