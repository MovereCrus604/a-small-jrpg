/*
 * UI helpers that mirror the Unity uGUI calls used by the original game
 * (Panel / Label / CreateMenuButton / MakeBar ...).
 *
 * Positions are anchor fractions of the whole screen (0..1, origin bottom-left),
 * exactly like Unity anchorMin/anchorMax with zero offsets. Font sizes are the
 * original "reference pixels" (1920x1080 canvas, Match 0.5) multiplied by the
 * game's own 1.12 factor, converted to real pixels with the CSS variable --u.
 */
(function (global) {
  'use strict';
  const REF_W = 1920, REF_H = 1080;
  const MIN_U = 0.58;      // keeps text readable on phone-sized screens
  const MIN_FONT_PX = 9;

  let stage = null;
  let currentCanvas = null;

  const V = (x, y) => ({ x, y });
  const C = (r, g, b, a) => ({ r, g, b, a: a === undefined ? 1 : a });
  const WHITE = C(1, 1, 1, 1);
  const CLEAR = C(0, 0, 0, 0);
  const lerpColor = (a, b, t) => C(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t, a.a + (b.a - a.a) * t);
  const rgba = (c, m, alpha) => 'rgba(' + Math.round(c.r * m * 255) + ',' + Math.round(c.g * m * 255) + ',' + Math.round(c.b * m * 255) + ',' + (alpha === undefined ? c.a : alpha) + ')';

  // ---- scale / fitting ------------------------------------------------------------
  function updateScale() {
    if (!stage) return;
    const W = stage.clientWidth || 1, H = stage.clientHeight || 1;
    // Unity CanvasScaler: ScaleWithScreenSize, reference 1920x1080, match 0.5 (geometric mean)
    const s = Math.max(Math.sqrt((W / REF_W) * (H / REF_H)), MIN_U);
    stage.style.setProperty('--u', s + 'px');
    return s;
  }

  function fitOne(el) {
    const span = el.firstChild;
    if (!span || el.offsetParent === null) return;
    el.style.fontSize = el.dataset.fs;                       // reset to the nominal size
    const bw = el.clientWidth, bh = el.clientHeight;
    if (bw === 0 || bh === 0) return;
    const sw = span.offsetWidth, sh = span.offsetHeight;
    // single-line text may exceed the box height slightly (line-height padding is not ink)
    const slack = span.textContent.indexOf('\n') < 0 ? 1.15 : 1;
    const k = Math.min(1, bw / (sw || 1), (bh * slack) / (sh || 1));
    if (k < 0.995) {
      const px = parseFloat(getComputedStyle(el).fontSize);
      el.style.fontSize = Math.max(MIN_FONT_PX, Math.floor(px * k * 10) / 10) + 'px';
    }
  }
  function fit(root) {
    (root || stage).querySelectorAll('.lbl').forEach(fitOne);
  }
  let fitQueued = false;
  function queueFit() {
    if (fitQueued) return;
    fitQueued = true;
    requestAnimationFrame(() => { fitQueued = false; fit(stage); });
  }

  function init(el) {
    stage = el;
    updateScale();
    const onResize = () => { updateScale(); queueFit(); };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => setTimeout(onResize, 120));
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(queueFit);
  }

  // ---- canvases -----------------------------------------------------------------------
  function newCanvas(name) {
    if (currentCanvas && currentCanvas.parentNode) currentCanvas.parentNode.removeChild(currentCanvas);
    const cv = document.createElement('div');
    cv.className = 'canvas';
    cv.dataset.name = name;
    stage.appendChild(cv);
    currentCanvas = cv;
    queueFit();
    return cv;
  }

  // ---- basic elements ---------------------------------------------------------------------
  function setRect(el, min, max) {
    el.style.left = (min.x * 100) + '%';
    el.style.bottom = (min.y * 100) + '%';
    el.style.width = ((max.x - min.x) * 100) + '%';
    el.style.height = ((max.y - min.y) * 100) + '%';
  }

  function panel(parent, name, min, max, col) {
    const el = document.createElement('div');
    el.className = 'r';
    el.dataset.name = name;
    setRect(el, min, max);
    el._col = col;
    el.style.backgroundColor = rgba(col, 1);
    parent.appendChild(el);
    return el;
  }

  // TextAnchor: 3 = MiddleLeft, 4 = MiddleCenter, 5 = MiddleRight
  function label(parent, name, text, size, anchor, min, max, col) {
    const el = document.createElement('div');
    el.className = 'lbl r';
    el.dataset.name = name;
    setRect(el, min, max);
    const px = Math.round(size * 1.12);
    el.dataset.fs = 'calc(var(--u) * ' + px + ')';
    el.style.fontSize = el.dataset.fs;
    el.style.color = rgba(col, 1);
    const just = anchor === 3 ? 'flex-start' : anchor === 5 ? 'flex-end' : 'center';
    el.style.justifyContent = just;
    el.style.textAlign = anchor === 3 ? 'left' : anchor === 5 ? 'right' : 'center';
    const span = document.createElement('span');
    span.textContent = text;
    el.appendChild(span);
    parent.appendChild(el);
    el.setText = (t) => { span.textContent = t; fitOne(el); };
    return el;
  }

  // Unity Selectable (ColorTint): normal 1.0, highlighted 245/255, pressed 200/255, disabled 200/255 + alpha 128/255
  function paintButton(el) {
    const c = el._col;
    el.style.backgroundColor = '';
    el.style.setProperty('--base', rgba(c, 1));
    el.style.setProperty('--hov', rgba(c, 0.9608));
    el.style.setProperty('--act', rgba(c, 0.7843));
    el.style.setProperty('--dis', rgba(c, 0.7843, +(c.a * 0.502).toFixed(3)));
  }
  function makeButton(el, onClick) {
    el.classList.add('btn');
    paintButton(el);
    el.addEventListener('click', (e) => {
      if (el.classList.contains('dis')) return;
      onClick(e);
    });
    el.setInteractable = (b) => { el.classList.toggle('dis', !b); return el; };
    return el;
  }
  function setColor(el, col) {
    el._col = col;
    if (el.classList.contains('btn')) paintButton(el); else el.style.backgroundColor = rgba(col, 1);
  }

  const MENU_BTN_COLOR = C(0.22, 0.27, 0.37);
  function menuButton(parent, name, text, min, max, onClick) {
    const el = panel(parent, name, min, max, MENU_BTN_COLOR);
    makeButton(el, onClick);
    label(el, 'Label', text, 29, 4, V(0, 0), V(1, 1), WHITE);
    return el;
  }

  // Sprite drawn inside a rect with preserveAspect (transparent background)
  function image(parent, name, tex, min, max) {
    const el = document.createElement('div');
    el.className = 'r';
    el.dataset.name = name;
    setRect(el, min, max);
    const img = document.createElement('img');
    img.src = 'assets/' + tex + '.png';
    img.alt = '';
    img.draggable = false;
    img.className = 'sprite';
    el.appendChild(img);
    el.img = img;
    parent.appendChild(el);
    return el;
  }

  // HP/SP bar: dark track + fill (anchorMax.x scaled by value)
  function bar(parent, name, min, max, col) {
    const track = panel(parent, name, min, max, C(0.07, 0.08, 0.11));
    const fill = panel(track, 'Fill', V(0, 0), V(1, 1), col);
    track.fill = fill;
    return track;
  }
  function setBar(track, pct) {
    track.fill.style.width = (Math.min(Math.max(pct, 0), 1) * 100) + '%';
  }

  // Element centred on an anchor point with a fixed reference-pixel size (map nodes)
  function centered(parent, name, pos, sizeRef, col) {
    const el = document.createElement('div');
    el.className = 'r centered';
    el.dataset.name = name;
    el.style.left = (pos.x * 100) + '%';
    el.style.bottom = (pos.y * 100) + '%';
    el.style.width = 'calc(var(--u) * ' + sizeRef + ')';
    el.style.height = 'calc(var(--u) * ' + sizeRef + ')';
    el._col = col;
    el.style.backgroundColor = rgba(col, 1);
    parent.appendChild(el);
    return el;
  }

  // Thin rotated line between two anchor points (route connections)
  function line(parent, name, a, b, thicknessRef, col) {
    const W = stage.clientWidth, H = stage.clientHeight;
    const dx = (b.x - a.x) * W, dy = (b.y - a.y) * H;
    const el = document.createElement('div');
    el.className = 'r line';
    el.dataset.name = name;
    el.style.left = (((a.x + b.x) / 2) * 100) + '%';
    el.style.bottom = (((a.y + b.y) / 2) * 100) + '%';
    el.style.width = Math.hypot(dx, dy) + 'px';
    el.style.height = 'calc(var(--u) * ' + thicknessRef + ')';
    el.style.transform = 'translate(-50%, 50%) rotate(' + (-Math.atan2(dy, dx)) + 'rad)';
    el.style.backgroundColor = rgba(col, 1);
    parent.appendChild(el);
    return el;
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  global.JRPGUI = {
    init, newCanvas, panel, label, makeButton, setColor, menuButton, image, bar, setBar, centered, line,
    fit, fitOne, queueFit, updateScale, sleep, setRect, V, C, WHITE, CLEAR, lerpColor, rgba,
    get stage() { return stage; },
  };
})(window);
