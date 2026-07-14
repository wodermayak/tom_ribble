/* ===================================================
   THUNDER'S DIARY — canvas.js
   Handles pen/finger drawing on touch & tablet devices.
   Exposes window.DiaryCanvas with a small API used by app.js
   =================================================== */

window.DiaryCanvas = (function () {
  let canvas, ctx;
  let drawing = false;
  let lastX = 0, lastY = 0;
  let currentColor = "#2b2b3d";
  let eraserMode = false;
  let onStrokeCallback = null; // called on every stroke, used to reset idle timer

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

  function endStroke() {
    drawing = false;
  }

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function setColor(hex) {
    currentColor = hex;
    eraserMode = false;
  }

  function toggleEraser(forceState) {
    eraserMode = forceState !== undefined ? forceState : !eraserMode;
    return eraserMode;
  }

  function clear() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function isBlank() {
    const blank = document.createElement("canvas");
    blank.width = canvas.width;
    blank.height = canvas.height;
    return canvas.toDataURL() === blank.toDataURL();
  }

  function toDataURL() {
    return canvas.toDataURL("image/png");
  }

  function onStroke(cb) {
    onStrokeCallback = cb;
  }

  return { init, setColor, toggleEraser, clear, isBlank, toDataURL, onStroke, resize };
})();
