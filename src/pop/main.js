import { createObject } from './object.js';

/* The pop page, v3: a comic page read sideways. Six frames in a strip; one thing in each.
   The four coloured frames hold the objects, alive; a frame opens by growing to the page,
   where its words and its work come in. The strip answers the wheel, a trackpad, a drag on
   empty ground, the arrow keys and the film-strip at the foot; on a phone it runs down.   */

const DISC = [
  { id: 'art', num: '01', name: 'Art', c: 'var(--red)', sub: 'Sculpture & installation',
    lede: 'Form, material and space, made away from the screen, and drawn back onto it in lines.',
    items: [
      { t: 'Sculpture', k: 'Fine art · ongoing' },
      { t: 'Installation', k: 'Fine art · ongoing' },
      { t: 'David, in lines', k: 'WebGL line study · 2026', href: './david.html' },
    ] },
  { id: 'product', num: '02', name: 'Product', c: 'var(--blue)', sub: 'Interfaces people use',
    lede: 'UI and UX case studies, from the first question to the last tap: search, booking, lending.',
    items: [
      { t: 'Trip.com double search bar', k: 'UI / UX case study · 2026' },
      { t: 'Exhibizio', k: 'iOS app for art shows · 2025' },
      { t: 'iPhone Air, in layers', k: 'Interactive object · 2026', href: './phone.html' },
    ] },
  { id: 'system', num: '03', name: 'System', c: 'var(--yellow)', sub: 'Design systems & tokens',
    lede: 'One source of truth that keeps design and code in step: colour, type, space, and the names for them.',
    items: [
      { t: 'PeraSure design system', k: 'Design system & tokens · 2026' },
      { t: 'Token cabinet', k: 'Interactive object · 2026', href: './cabinet.html' },
    ] },
  { id: 'motion', num: '04', name: 'Motion', c: 'var(--pink)', sub: 'Timing, springs & rhythm',
    lede: 'How a thing should move: springs, timing and the small answers an interface gives back.',
    items: [
      { t: 'PeraSure motion prototypes', k: 'Animation & prototypes · 2026' },
      { t: 'Spring atlas', k: 'Interactive object · 2026', href: './atlas.html' },
      { t: 'Flipbook', k: 'Interactive object · 2026', href: './flipbook.html' },
      { t: 'Spring rack', k: 'Interactive object · 2026', href: './springs.html' },
      { t: 'Spacing chart', k: 'Interactive object · 2026', href: './spacing.html' },
    ] },
];
const byId = Object.fromEntries(DISC.map(d => [d.id, d]));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const touch = matchMedia('(hover: none)').matches;
const vertical = () => innerWidth <= 860;
const $ = id => document.getElementById(id);
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---- motion, by hand: one curve solver for every glide the page makes ---- */
function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = t => ((ax * t + bx) * t + cx) * t, Y = t => ((ay * t + by) * t + cy) * t;
  return x => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let lo = 0, hi = 1, t = x;
    for (let i = 0; i < 24; i++) { const v = X(t); if (Math.abs(v - x) < 1e-5) break; if (v < x) lo = t; else hi = t; t = (lo + hi) / 2; }
    return Y(t);
  };
}
const GLIDE = bezier(0.65, 0, 0.2, 1);        // the strip, frame to frame: leaves gently, lands softly
// ?slow=k plays every move k times slower, for looking at it
const SLOW = +(location.search.match(/[?&]slow=([\d.]+)/)?.[1] || 1);
if (SLOW !== 1) document.documentElement.style.setProperty('--slowk', SLOW);
const sleep = ms => new Promise(r => setTimeout(r, reduced ? 0 : ms * SLOW));
const raf2 = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

/* ---- the four coloured frames ---- */
const strip = $('strip'), outro = $('f-outro');
for (const d of DISC) {
  const f = document.createElement('section');
  f.className = `frame colour ${d.id}`;
  f.id = 'f-' + d.id; f.tabIndex = 0; f.setAttribute('role', 'listitem');
  f.setAttribute('aria-label', `${d.num} ${d.name}: ${d.sub}. Press Enter to open`);
  f.innerHTML = `<span class="f-num">${d.num}</span><span class="f-hint">${touch ? 'Tap to open' : 'Drag to turn · click to open'}</span><div class="p-stage"></div>
    <div class="cap"><span class="box big">${d.name}</span><span class="box sub"><b>${esc(d.sub)}.</b> ${esc(d.lede)}</span><span class="open">Open <span aria-hidden="true">→</span></span></div>`;
  strip.insertBefore(f, outro);
  d.frame = f; d.stage = f.querySelector('.p-stage');
  d.bigEl = f.querySelector('.cap .big'); d.subEl = f.querySelector('.cap .sub'); d.numEl = f.querySelector('.f-num');
  d.obj = createObject(d.id, {
    colors: { david: { plate: '#ffffff', hi: '#141412', edge: '#141412', mid: '#1c1c1c', lo: '#3a3a3a' } },
    onOpen: e => open(d.id),
  });
  d.obj.mount(d.stage);
  d.obj.bind(d.stage);
  d.obj.bind($('room-stage'));
  // the frame's ground opens it too (a drag on it pans the strip, handled below)
  f.addEventListener('click', e => { if (!panned && !e.target.closest('.p-stage')) open(d.id); });
  // awake while in view, or while the mouse is over it
  f.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') { d.pin = true; wake(d); } });
  f.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { d.pin = false; d.obj.away(); wake(d); } });
  f.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(d.id); } });
}
function wake(d) { if (!d.obj.open) d.obj.setHover(!!(d.live || d.pin)); }
const FRAMES = [...strip.querySelectorAll('.frame')];
for (const a of document.querySelectorAll('.intro .hl')) a.addEventListener('click', e => { e.preventDefault(); open(a.dataset.k); });

/* ---- the film-strip, the counter, and which frame is in view ---- */
const film = $('film'), counter = $('counter'), reel = $('reel');
FRAMES.forEach((f, i) => {
  const b = document.createElement('button');
  b.setAttribute('aria-label', f.getAttribute('aria-label').split('.')[0]);
  const d = DISC.find(x => x.frame === f);
  if (d) b.style.setProperty('--c', d.c); else if (f.classList.contains('outro')) b.style.setProperty('--c', '#1b1b19');
  b.addEventListener('click', () => goTo(i));
  film.appendChild(b);
});
const FILM = [...film.querySelectorAll('button')];
const ind = document.createElement('i'); ind.className = 'film-ind'; ind.setAttribute('aria-hidden', 'true'); film.appendChild(ind);
reel.innerHTML = FRAMES.map((_, i) => `<span>${String(i + 1).padStart(2, '0')}</span>`).join('');
let active = 0;
const seen = new Set();
const io = new IntersectionObserver(es => {
  for (const en of es) {
    const d = DISC.find(x => x.frame === en.target), live = en.intersectionRatio > 0.55;
    en.target.classList.toggle('live', live);
    if (d) { if (en.isIntersecting) seen.add(d.id); else seen.delete(d.id); d.live = live; wake(d); }
  }
}, { threshold: [0, 0.55] });
FRAMES.forEach(f => io.observe(f));
function setActive(i) {
  if (i === active && counter.dataset.i) return;
  active = i; counter.dataset.i = i;
  reel.style.setProperty('--i', i);
  counter.setAttribute('aria-label', `Frame ${i + 1} of ${FRAMES.length}`);
  FILM.forEach((b, k) => b.setAttribute('aria-current', k === i));
}

/* ---- the strip glides by hand: eased, interruptible, snap held off while it moves ---- */
const axis = () => (vertical() ? 'scrollTop' : 'scrollLeft');
function targetOf(i) {
  const f = FRAMES[i];
  if (vertical()) return Math.max(0, Math.min(strip.scrollHeight - strip.clientHeight, f.offsetTop + f.offsetHeight / 2 - strip.clientHeight / 2));
  return Math.max(0, Math.min(strip.scrollWidth - strip.clientWidth, f.offsetLeft + f.offsetWidth / 2 - strip.clientWidth / 2));
}
let glide = null;
function glideTo(target, dur) {
  stopGlide();
  const ax = axis(), from = strip[ax];
  if (reduced || Math.abs(target - from) < 1) { strip[ax] = target; return Promise.resolve(); }
  strip.classList.add('gliding');
  return new Promise(res => {
    const t0 = performance.now();
    glide = { res, raf: 0 };
    const tick = now => {
      const t = Math.min(1, (now - t0) / (dur * SLOW));
      strip[ax] = from + (target - from) * GLIDE(t);
      if (t < 1) glide.raf = requestAnimationFrame(tick);
      else { glide = null; strip.classList.remove('gliding'); res(); }
    };
    glide.raf = requestAnimationFrame(tick);
  });
}
function stopGlide() { if (!glide) return; cancelAnimationFrame(glide.raf); const r = glide.res; glide = null; strip.classList.remove('gliding'); r(); }
// longer for a longer way, but never slow: about 640 ms a frame, 1.1 s for the whole strip
const glideDur = n => 520 + 180 * Math.sqrt(Math.max(1, n));
function goTo(i) {
  i = Math.max(0, Math.min(FRAMES.length - 1, i));
  return glideTo(targetOf(i), glideDur(Math.abs(i - fracIndex())));
}
$('home').addEventListener('click', e => { e.preventDefault(); if (current) close(); goTo(0); });

/* ---- moving the strip: wheel, trackpad, a drag on empty ground, keys ---- */
strip.addEventListener('wheel', e => {
  if (current || e.ctrlKey) return;
  if (vertical()) { stopGlide(); return; }                     // the strip is the page's own scroller there
  const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  if (e.target.closest('.p-stage') && Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;   // a sideways swipe on an object turns it
  e.preventDefault();
  stopGlide();
  strip.scrollLeft += dx;
}, { passive: false });
let pan = null, panned = false;
strip.addEventListener('pointerdown', e => {
  if (current || e.button || e.target.closest('.p-stage, .hl, .mail, a, button')) return;
  stopGlide();
  pan = { x: e.clientX, y: e.clientY, sl: strip.scrollLeft, st: strip.scrollTop, id: e.pointerId, t: performance.now(), v: 0, last: e.clientX };
  panned = false;
});
strip.addEventListener('pointermove', e => {
  if (!pan) return;
  const dx = e.clientX - pan.x, dy = e.clientY - pan.y;
  if (!panned && Math.hypot(dx, dy) > 8) { panned = true; strip.classList.add('panning'); strip.setPointerCapture(pan.id); }
  if (!panned) return;
  if (vertical()) strip.scrollTop = pan.st - dy; else strip.scrollLeft = pan.sl - dx;
  const now = performance.now(); pan.v = (e.clientX - pan.last) / Math.max(1, now - pan.t); pan.t = now; pan.last = e.clientX;
});
const endPan = e => {
  if (!pan) return;
  const was = panned, v = pan.v; pan = null;
  strip.classList.remove('panning');
  if (!was) return;
  // a throw carries it to the next frame; otherwise it settles on the nearest
  const step = vertical() ? 0 : v < -0.6 ? 1 : v > 0.6 ? -1 : 0;
  goTo(step ? Math.round(fracIndex()) + step : Math.round(fracIndex()));
  setTimeout(() => (panned = false), 50);
};
strip.addEventListener('pointerup', endPan);
strip.addEventListener('pointercancel', endPan);
addEventListener('keydown', e => {
  if (current) {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') $('room-next').click();
    else if (e.key === 'ArrowLeft') $('room-prev').click();
    return;
  }
  if (e.target.closest('input, textarea')) return;
  const k = e.key;
  if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'PageDown') goTo(active + 1);
  else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp') goTo(active - 1);
  else if (k === 'Home') goTo(0); else if (k === 'End') goTo(FRAMES.length - 1);
  else if (k === 'Enter' || k === ' ') { const d = DISC.find(x => x.frame === FRAMES[active]); if (d) open(d.id); else return; }
  else if (/^[1-4]$/.test(k)) open(DISC[+k - 1].id);
  else return;
  e.preventDefault();
});

/* ---- the strip as it moves: each frame knows where it stands (p: -1 left … 0 centre … 1 right)
   and its contents answer — the object lags, the caption leads, the dots drift, frames off the
   centre fall back and dim; the objects take a turn from the strip's speed; the film-strip's
   marker and the counter follow continuously ---- */
let lastPos = null, lastSize = 0;
function fracIndex() {
  const v = vertical(), c = v ? strip.scrollTop + strip.clientHeight / 2 : strip.scrollLeft + strip.clientWidth / 2;
  const mid = f => (v ? f.offsetTop + f.offsetHeight / 2 : f.offsetLeft + f.offsetWidth / 2);
  for (let i = 0; i < FRAMES.length - 1; i++) {
    const a = mid(FRAMES[i]), b = mid(FRAMES[i + 1]);
    if (c <= b || i === FRAMES.length - 2) return Math.max(0, Math.min(FRAMES.length - 1, i + (c - a) / (b - a)));
  }
  return 0;
}
function scrollFx() {
  const v = vertical(), pos = strip[axis()], size = innerWidth * 10000 + innerHeight;
  if (pos === lastPos && size === lastSize) return;
  const dpx = lastPos === null || size !== lastSize ? 0 : pos - lastPos;
  lastPos = pos; lastSize = size;
  const fi = fracIndex();
  FRAMES.forEach((f, i) => {
    const p = Math.max(-1.5, Math.min(1.5, i - fi));
    f.style.setProperty('--p', p.toFixed(4));
    f.style.setProperty('--a', Math.min(1, Math.abs(p)).toFixed(4));
  });
  if (dpx) for (const d of DISC) d.obj.nudge(dpx);
  // the marker: between two film buttons in proportion
  const i0 = Math.floor(fi), i1 = Math.min(FILM.length - 1, i0 + 1), t = fi - i0;
  const x = FILM[i0].offsetLeft + (FILM[i1].offsetLeft - FILM[i0].offsetLeft) * t;
  ind.style.transform = `translateX(${x.toFixed(2)}px)`;
  ind.style.width = FILM[i0].offsetWidth + 'px'; ind.style.height = FILM[i0].offsetHeight + 'px';
  setActive(Math.round(fi));
}

/* ---- contact ---- */
const emailBtn = $('email');
emailBtn.addEventListener('click', async () => {
  const addr = emailBtn.dataset.email;
  if (!addr) return;
  try { await navigator.clipboard.writeText(addr); $('email-note').textContent = 'copied'; } catch { $('email-note').textContent = 'select to copy'; }
  setTimeout(() => ($('email-note').textContent = 'click to copy'), 1800);
});
if (emailBtn.dataset.email) $('email-text').textContent = emailBtn.dataset.email;
function clock() {
  const t = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Shanghai' }).format(new Date());
  $('clock2').textContent = `UTC+8 · ${t}`;
}
clock(); setInterval(clock, 15000);

/* ---- a frame, opened. Never a new page: the frame itself grows to the page, and what was
   in it goes with it — the object grows from where it stood, the name box and the caption
   travel to their places, the number to the corner. Closing is the same film backwards.
   Another frame is reached as one camera move: back out to the strip (black gutters), glide
   along it, and in again.                                                               ---- */
const room = $('room'), roomStage = $('room-stage'), roomH = $('room-h'), roomLede = $('room-lede'), roomNum = $('room-num');
const OPEN = 760, CLOSE = 560;
let current = null, busy = false, want = undefined, ghost = null;
const rowHTML = (it, n) => {
  const link = !!it.href, tag = link ? 'a' : 'div';
  return `<${tag} class="row ${link ? 'link' : 'soon'}"${link ? ` href="${it.href}"` : ''}><span class="n">${String(n).padStart(2, '0')}</span><span><span class="t">${esc(it.t)}</span><br><span class="k">${esc(it.k)}</span></span><span class="go">${link ? 'Open →' : 'Soon'}</span></${tag}>`;
};
// the object's drawing, fitted in a stage the way it is drawn (meet)
function fit(r, A) {
  let w = r.width, h = r.height;
  if (w / h > A) w = h * A; else h = w / A;
  return { x: r.left + (r.width - w) / 2, y: r.top + (r.height - h) / 2, w, h };
}
// the transform that shows box `to` (inside element box `el`) at `from`, scaled uniformly
function toward_(from, to, el, s = from.w / to.w) {
  const tx = from.x - el.x - (to.x - el.x) * s, ty = from.y - el.y - (to.y - el.y) * s;
  return `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${s.toFixed(4)})`;
}
const box = r => ({ x: r.left, y: r.top, w: r.width, h: r.height });
const rect = el => box(el.getBoundingClientRect());
const fs = el => parseFloat(getComputedStyle(el).fontSize);
function setInset(r) {
  room.style.setProperty('--t', `${Math.max(0, r.top)}px`); room.style.setProperty('--l', `${Math.max(0, r.left)}px`);
  room.style.setProperty('--b', `${Math.max(0, innerHeight - r.bottom)}px`); room.style.setProperty('--r', `${Math.max(0, innerWidth - r.right)}px`);
}
// set each element's transform with no transition, then (next frame) let them all run home
function jump(list) { for (const [el, tf, op] of list) { el.style.transition = 'none'; el.style.transform = tf; if (op !== undefined) el.style.opacity = op; } }
function run(list, dur, ease = 'var(--ease)') {
  for (let [el, tf, op, delay = 0, odur] of list) {
    odur = (odur ?? Math.round(dur * 0.5)) * SLOW; delay *= SLOW; const D = dur * SLOW;
    el.style.transition = `transform ${D}ms ${ease} ${delay}ms, opacity ${odur}ms linear ${delay}ms`;
    el.style.transform = tf; if (op !== undefined) el.style.opacity = op;
  }
}
const clear = (...els) => els.forEach(el => { el.style.transition = el.style.transform = el.style.opacity = ''; });
function makeGhost(d) {
  ghost?.remove();
  ghost = d.subEl.cloneNode(true);
  ghost.classList.add('ghost'); ghost.setAttribute('aria-hidden', 'true');
  const r = d.subEl.getBoundingClientRect();
  Object.assign(ghost.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px' });
  room.appendChild(ghost);
  return ghost;
}

// ask for a frame (or none): one move runs at a time; the last ask made while busy is kept
function open(id) { request(id); }
function close() { request(null); }
async function request(id) {
  if (busy) { want = id; return; }
  if (id === current) return;
  busy = true;
  try {
    if (current && id) await switchTo(id);
    else if (id) { await centre(id); await grow(id); }
    else await shrink();
  } finally { busy = false; }
  if (want !== undefined) { const w = want; want = undefined; request(w); }
}
async function centre(id) {
  const i = FRAMES.indexOf(byId[id].frame);
  if (Math.abs(fracIndex() - i) > 0.01) await goTo(i);
}
async function switchTo(id) {
  // 1 back out to the strip: the opened frame shrinks home, its black gutters return
  await shrink({ quiet: true, dur: CLOSE });
  // 2 glide along it, pulled back a little, as a camera on a dolly
  const i = FRAMES.indexOf(byId[id].frame), n = Math.abs(i - fracIndex());
  strip.classList.add('pulled');
  const g = goTo(i), dur = glideDur(n);
  await sleep(Math.max(0, dur - 460));
  strip.classList.remove('pulled');
  await g; await sleep(reduced ? 0 : 60);
  // 3 and in again
  await grow(id, { replace: true });
}

async function grow(id, { replace = false } = {}) {
  const d = byId[id];
  current = id;
  ghost?.remove(); ghost = null;
  const fr = d.frame.getBoundingClientRect();
  room.style.setProperty('--rd', OPEN * SLOW + 'ms');
  setInset(fr);
  room.hidden = false;
  room.className = `room ${id}`;
  fillRoom(d);
  // what was in the frame is now drawn by the room, from the same places
  const first = { stage: rect(d.stage), big: rect(d.bigEl), sub: rect(d.subEl), num: rect(d.numEl) };
  d.obj.setHover(false);
  d.obj.mount(roomStage); d.obj.open = true;
  d.frame.classList.add('away');
  clear(d.obj.el, roomH, roomLede, roomNum);
  const A = d.obj.aspect(), stL = rect(roomStage), bigL = rect(roomH), ledeL = rect(roomLede), numL = rect(roomNum);
  const g = makeGhost(d);
  const sF = fs(d.subEl) / fs(roomLede);
  jump([
    [d.obj.el, toward_(fit(first.stage, A), fit(stL, A), stL)],
    [roomH, toward_(first.big, bigL, bigL)],
    [roomLede, toward_(first.sub, ledeL, ledeL, sF), 0],
    [roomNum, `translate(${first.num.x - numL.x}px, ${first.num.y - numL.y}px)`],
    [g, 'none', 1],
  ]);
  void room.offsetWidth;
  await raf2();
  if (current !== id) return;
  room.classList.add('on');
  const gx = ledeL.x - first.sub.x, gy = ledeL.y - first.sub.y;
  run([
    [d.obj.el, 'none'],
    [roomH, 'none', undefined, 20],
    [roomLede, 'none', 1, 60, 340],
    [roomNum, 'none'],
    [g, `translate(${gx}px, ${gy}px) scale(${(1 / sF).toFixed(3)})`, 0, 60, 220],
  ], OPEN);
  d.obj.setHover(true);
  setTimeout(() => current === id && room.classList.add('ready'), reduced ? 0 : OPEN * 0.42 * SLOW);
  if (replace) history.replaceState(null, '', '#' + id);
  else if (location.hash !== '#' + id) history.pushState(null, '', '#' + id);
  $('room-close').focus({ preventScroll: true });
  await sleep(OPEN);
  ghost?.remove(); ghost = null;
}

async function shrink({ quiet = false, dur = CLOSE + 80 } = {}) {
  if (!current) return;
  const id = current, d = byId[id];
  const fr = d.frame.getBoundingClientRect();
  room.style.setProperty('--rd', dur * SLOW + 'ms');
  // back to where each thing stands in the frame now
  const to = { stage: rect(d.stage), big: rect(d.bigEl), sub: rect(d.subEl), num: rect(d.numEl) };
  const A = d.obj.aspect(), stL = rect(roomStage);
  clear(roomH, roomLede, roomNum);
  const bigL = rect(roomH), ledeL = rect(roomLede), numL = rect(roomNum), sF = fs(d.subEl) / fs(roomLede);
  const g = makeGhost(d);
  jump([[g, `translate(${ledeL.x - to.sub.x}px, ${ledeL.y - to.sub.y}px) scale(${(1 / sF).toFixed(3)})`, 0]]);
  void g.offsetWidth;
  room.classList.remove('ready');
  setInset(fr);
  room.classList.remove('on');
  run([
    [d.obj.el, toward_(fit(to.stage, A), fit(stL, A), stL)],
    [roomH, toward_(to.big, bigL, bigL)],
    [roomLede, toward_(to.sub, ledeL, ledeL, sF), 0, 0, 200],
    [roomNum, `translate(${to.num.x - numL.x}px, ${to.num.y - numL.y}px)`],
    [g, 'none', 1, Math.round(dur * 0.25), Math.round(dur * 0.4)],
  ], dur);
  if (!quiet && location.hash) history.pushState(null, '', location.pathname + location.search);
  await sleep(dur);
  // the frame takes its own things back, exactly where the room left them
  d.obj.open = false;
  d.obj.mount(d.stage);
  clear(d.obj.el, roomH, roomLede, roomNum);
  d.frame.classList.remove('away');
  ghost?.remove(); ghost = null;
  current = null;
  room.hidden = true;
  wake(d);
  if (!quiet) d.frame.focus({ preventScroll: true });
}

function fillRoom(d) {
  const i = DISC.indexOf(d), prev = DISC[(i + 3) % 4], next = DISC[(i + 1) % 4];
  roomNum.textContent = `${d.num} · ${d.name}`;
  roomH.textContent = d.name;
  roomLede.innerHTML = `<b>${esc(d.sub)}.</b> ${esc(d.lede)}`;
  $('room-list').innerHTML = d.items.map((it, k) => rowHTML(it, k + 1)).join('');
  const pv = $('room-prev'), nx = $('room-next');
  pv.innerHTML = `<span class="l" aria-hidden="true">←</span><span><small>${prev.num}</small> ${esc(prev.name)}</span>`; pv.href = '#' + prev.id; pv.style.setProperty('--c', prev.c);
  nx.innerHTML = `<span><small>${next.num}</small> ${esc(next.name)}</span><span class="r" aria-hidden="true">→</span>`; nx.href = '#' + next.id; nx.style.setProperty('--c', next.c);
  pv.onclick = e => { e.preventDefault(); open(prev.id); };
  nx.onclick = e => { e.preventDefault(); open(next.id); };
}
$('room-close').addEventListener('click', () => close());
function fromHash() {
  const id = location.hash.slice(1);
  if (byId[id]) { if (id !== current) open(id); } else if (current) request(null);
}
addEventListener('popstate', fromHash);
addEventListener('hashchange', fromHash);
if (byId[location.hash.slice(1)]) requestAnimationFrame(() => { const d = byId[location.hash.slice(1)]; strip[axis()] = targetOf(FRAMES.indexOf(d.frame)); open(d.id); });
// ?frame=n opens the strip on frame n (for still pictures)
{ const m = location.search.match(/[?&]frame=(\d+)/); if (m) requestAnimationFrame(() => { strip[axis()] = targetOf(+m[1]); }); }

/* ---- sizes ---- */
const ro = new ResizeObserver(() => { DISC.forEach(d => d.obj.resize()); lastSize = 0; });
DISC.forEach(d => ro.observe(d.stage));
ro.observe(roomStage);

/* ---- one loop: the strip's effects, then each object steps, and draws only when it moved
   and can be seen ---- */
let prev = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - prev) / 1000);
  prev = now;
  scrollFx();
  for (const d of DISC) {
    d.obj.step(dt);
    if (seen.has(d.id) || d.obj.open || !d.drawn) { d.obj.draw(); d.drawn = true; }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
