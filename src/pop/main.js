import { gsap } from 'gsap';
import { Flip } from 'gsap/Flip';
import { CustomEase } from 'gsap/CustomEase';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';
import { createObject } from './object.js';

gsap.registerPlugin(Flip, CustomEase, ScrollToPlugin);

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

/* ---- motion: every move on the page is a GSAP tween or timeline ---- */
// Hairline's curve for things that travel and settle; a gentler S for the strip's glides
CustomEase.create('hair', '.32,.72,0,1');
CustomEase.create('glide', '.65,0,.2,1');
// ?slow=k plays every move k times slower, for looking at it; reduced motion all but skips them
const SLOW = +(location.search.match(/[?&]slow=([\d.]+)/)?.[1] || 1);
gsap.globalTimeline.timeScale(reduced ? 40 : 1 / SLOW);
const done = anim => new Promise(r => anim.eventCallback('onComplete', r));
// ?debug keeps each move's timeline on window.__tl, to be paused and scrubbed
const DEBUG = /[?&]debug\b/.test(location.search);
const keep = tl => (DEBUG && (window.__tl = tl), tl);

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

/* ---- the strip glides: one ScrollTo tween, eased, killed by any hand on the strip;
   snap held off while it moves ---- */
const axis = () => (vertical() ? 'scrollTop' : 'scrollLeft');
function targetOf(i) {
  const f = FRAMES[i];
  if (vertical()) return Math.max(0, Math.min(strip.scrollHeight - strip.clientHeight, f.offsetTop + f.offsetHeight / 2 - strip.clientHeight / 2));
  return Math.max(0, Math.min(strip.scrollWidth - strip.clientWidth, f.offsetLeft + f.offsetWidth / 2 - strip.clientWidth / 2));
}
let glide = null;
// longer for a longer way, but never slow: about .7 s a frame, 1.1 s for the whole strip
const glideDur = n => 0.52 + 0.18 * Math.sqrt(Math.max(1, n));
function glideTween(i) {
  stopGlide();
  const n = Math.abs(i - fracIndex());
  strip.classList.add('gliding');
  glide = gsap.to(strip, { scrollTo: vertical() ? { y: targetOf(i) } : { x: targetOf(i) }, duration: glideDur(n), ease: 'glide',
    onComplete: () => { strip.classList.remove('gliding'); glide = null; } });
  return glide;
}
function stopGlide() { if (glide) { glide.kill(); glide = null; strip.classList.remove('gliding'); } }
function goTo(i) { return done(glideTween(Math.max(0, Math.min(FRAMES.length - 1, i)))); }
$('home').addEventListener('click', e => { e.preventDefault(); if (current) close(); else goTo(0); });

/* ---- moving the strip: wheel, trackpad, a drag on empty ground, keys ---- */
strip.addEventListener('wheel', e => {
  if (current || e.ctrlKey) return;
  if (vertical()) { stopGlide(); return; }                     // the strip is the page's own scroller there
  const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  if (e.target.closest('.p-stage') && Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;   // a sideways swipe on an object turns it
  e.preventDefault();
  stopGlide();
  strip.scrollLeft += dx;
  // once the wheel (or a trackpad's coast) goes quiet, settle on the nearest frame
  clearTimeout(settleT);
  settleT = setTimeout(() => { if (!current && !pan && !busy) goTo(Math.round(fracIndex())); }, 140);
}, { passive: false });
let settleT = 0;
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
    else if (e.key === 'ArrowRight') nextB.click();
    else if (e.key === 'ArrowLeft') prevB.click();
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

/* ---- a frame, opened. Never a new page: the frame itself grows to the page, and everything
   in it goes along — the coloured ground (clip) and its dots, the object, the name box, the
   caption, the number, the hint; the page's own chrome hands over too: the counter becomes
   Back, the film-strip opens into the two ways on. Closing is the same film backwards. Another
   frame is one camera move: back out to the strip (black gutters), glide along it pulled back
   a little, and in again. Each is one GSAP timeline.                                     ---- */
const room = $('room'), roomStage = $('room-stage'), roomH = $('room-h'), roomLede = $('room-lede'), roomNum = $('room-num');
const roomDots = room.querySelector('.room-dots'), roomHint = roomStage.querySelector('.f-hint');
const back = $('room-close'), prevB = $('room-prev'), nextB = $('room-next'), topBar = document.querySelector('.top');
const roomBack = $('room-back');
const T_OPEN = 0.95, T_CLOSE = 0.72;
let current = null, busy = false, want = undefined;
const rowHTML = (it, n) => {
  const link = !!it.href, tag = link ? 'a' : 'div';
  return `<${tag} class="row ${link ? 'link' : 'soon'}"${link ? ` href="${it.href}"` : ''}><span class="n">${String(n).padStart(2, '0')}</span><span><span class="t">${esc(it.t)}</span><br><span class="k">${esc(it.k)}</span></span><span class="go">${link ? 'Open →' : 'Soon'}</span></${tag}>`;
};
const R = el => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
const fs = el => parseFloat(getComputedStyle(el).fontSize);
// the clip that leaves only rectangle r of the page showing
const inset = (r, rad = 6) => `inset(${Math.max(0, r.y)}px ${Math.max(0, innerWidth - r.x - r.w)}px ${Math.max(0, innerHeight - r.y - r.h)}px ${Math.max(0, r.x)}px round ${rad}px)`;
const FULL = 'inset(0px 0px 0px 0px round 0px)';
// the object's drawing, fitted in a stage the way it is drawn (meet)
function fit(r, A) {
  let w = r.w, h = r.h;
  if (w / h > A) w = h * A; else h = w / A;
  return { x: r.x + (r.w - w) / 2, y: r.y + (r.h - h) / 2, w, h };
}
// x, y, scale (from the element's top-left) that show box `at` (inside element box `el`) at `want`
function place(want, at, el, scale = want.w / at.w) {
  return { x: want.x - el.x - (at.x - el.x) * scale, y: want.y - el.y - (at.y - el.y) * scale, scale, transformOrigin: '0 0' };
}
// a stand-in for something the room does not have: a copy, drawn where the original stands
const KEEP = ['font', 'fontVariationSettings', 'letterSpacing', 'textTransform', 'color', 'background', 'padding', 'border', 'borderRadius', 'boxShadow', 'lineHeight', 'display', 'alignItems', 'gap'];
function ghostOf(el) {
  const g = el.cloneNode(true), cs = getComputedStyle(el), r = R(el);
  for (const k of KEEP) g.style[k] = cs[k];
  g.classList.add('ghost'); g.removeAttribute('id'); g.setAttribute('aria-hidden', 'true');
  Object.assign(g.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', transform: 'none', opacity: 1, visibility: 'visible' });
  room.appendChild(g);
  return g;
}
// the caption's box alone (white, edged, shadowed), to carry from one size to another
function boxAt(r) {
  const b = document.createElement('div'); b.className = 'ghost-box'; b.setAttribute('aria-hidden', 'true');
  gsap.set(b, { left: r.x, top: r.y, width: r.w, height: r.h });
  room.appendChild(b);
  return b;
}
const SHARED = () => [roomH, roomLede, roomNum, roomHint, back, prevB, nextB, ...$('room-list').children];

// ask for a frame (or none): one move runs at a time; the last ask made while busy is kept
function open(id) { request(id); }
function close() { request(null); }
async function request(id) {
  if (busy) { want = id; return; }
  if (id === current) return;
  busy = true;
  try {
    if (current && id) await switchTo(id);
    else if (id) { const i = FRAMES.indexOf(byId[id].frame); if (Math.abs(fracIndex() - i) > 0.01) await goTo(i); await grow(id); }
    else await shrink();
  } finally { busy = false; }
  if (want !== undefined) { const w = want; want = undefined; request(w); }
}
// another category, from an opened one: one camera move on the pages themselves — this page
// pulls back a little (its black edges show), slides away as the next slides in beside it,
// and the next comes up to fill the screen. The page leaving is a still copy of itself; the
// room underneath has already become the next one.
async function switchTo(id) {
  const from = byId[current], to = byId[id];
  const di = (DISC.indexOf(to) - DISC.indexOf(from) + DISC.length) % DISC.length, dir = di === DISC.length - 1 ? -1 : 1;
  const still = room.cloneNode(true);
  still.removeAttribute('id'); still.querySelectorAll('[id]').forEach(e => e.removeAttribute('id'));
  still.classList.add('still'); still.setAttribute('aria-hidden', 'true');
  still.querySelector('.room-stage .obj-svg, .room-stage .obj-canvas')?.replaceWith(from.obj.snapshot());
  room.before(still);                       // beneath the room, which covers it as it comes up
  roomBack.hidden = false;
  // the room becomes the next one underneath: the old object home to its frame, the new one in
  from.obj.open = false; from.obj.setHover(false); from.obj.mount(from.stage);
  from.frame.classList.remove('away'); wake(from);
  current = id;
  room.className = `room ${id}`;
  fillRoom(to);
  to.obj.setHover(false); to.obj.mount(roomStage); to.obj.open = true;
  to.frame.classList.add('away');
  gsap.set([to.obj.el, ...SHARED()], { clearProps: 'all' });
  // the strip, unseen beneath, moves to the next frame, so Back closes onto it
  stopGlide(); strip[axis()] = targetOf(FRAMES.indexOf(to.frame));
  const s = 0.88, shift = (innerWidth * s + 16) * dir, R = 'inset(0px 0px 0px 0px round 16px)';
  gsap.set([room, still], { transformOrigin: '50% 50%' });
  gsap.set(still, { clipPath: FULL, x: 0, scale: 1 });
  gsap.set(room, { clipPath: R, x: shift, scale: s });
  const tl = gsap.timeline({ defaults: { ease: 'hair' } })
    // it eases back from rest (never a jump), and is still settling as the slide takes it
    .to(still, { scale: s, clipPath: R, duration: 0.42, ease: 'power2.inOut' }, 0)
    .to([still, room], { x: `-=${shift}`, duration: 0.54, ease: 'glide' }, 0.26)
    .to(room, { scale: 1, clipPath: FULL, duration: 0.44, ease: 'power2.inOut' }, 0.7)
    .from([...$('room-list').children], { y: 14, autoAlpha: 0, duration: 0.4, stagger: 0.04, clearProps: 'all' }, 0.72)
    .add(() => {
      still.remove(); roomBack.hidden = true;
      gsap.set(room, { clearProps: 'transform' });
      to.obj.setHover(true);
    });
  history.replaceState(null, '', '#' + id);
  back.focus({ preventScroll: true });
  await done(keep(tl));
}

function grow(id, { replace = false } = {}) {
  const d = byId[id];
  current = id;
  room.className = `room ${id}`;
  fillRoom(d);
  const fr = R(d.frame);
  // where everything stands in the frame, and on the page's chrome
  const first = { stage: R(d.stage), big: R(d.bigEl), sub: R(d.subEl), num: R(d.numEl), hint: R(d.frame.querySelector('.f-hint')), counter: R(counter), film: R(film) };
  const gSub = ghostOf(d.subEl), gOpen = ghostOf(d.frame.querySelector('.cap .open'));
  // the object moves house; the frame keeps only the places of what the room now draws
  d.obj.setHover(false);
  d.obj.mount(roomStage); d.obj.open = true;
  d.frame.classList.add('away');
  gsap.set([d.obj.el, ...SHARED()], { clearProps: 'all' });
  room.hidden = false;
  gsap.set(room, { autoAlpha: 1, clipPath: inset(fr) });
  gsap.set(roomDots, { left: fr.x, top: fr.y, width: fr.w, height: fr.h });
  const A = d.obj.aspect(), stage = R(roomStage), h = R(roomH), lede = R(roomLede), num = R(roomNum), hint = R(roomHint), bk = R(back), pv = R(prevB), nx = R(nextB);
  const sF = fs(d.subEl) / fs(roomLede);
  const rows = [...$('room-list').children];
  gSub.classList.add('bare'); roomLede.classList.add('bare');
  const bx = boxAt(first.sub);

  const tl = gsap.timeline({ defaults: { duration: T_OPEN, ease: 'hair' } });
  tl.addLabel('grow', 0)
    // the ground: the frame's colour opens to the page, its dots go with it
    .to(room, { clipPath: FULL }, 'grow')
    .to(roomDots, { left: 0, top: 0, width: innerWidth, height: innerHeight }, 'grow')
    // the object, from where it stood
    .from(d.obj.el, { ...place(fit(first.stage, A), fit(stage, A), stage), duration: T_OPEN * 1.08 }, 'grow')
    // the name box, the caption (crossing over its stand-in), the number, the hint
    .from(roomH, { ...Flip.fit(roomH, d.bigEl, { scale: true, getVars: true }), transformOrigin: '0 0' }, 'grow+=0.02')
    // the caption: its white box travels and resizes on its own; its words change inside it
    // (the frame's leave first, the room's longer ones come in as the box settles)
    .to(bx, { left: lede.x, top: lede.y, width: lede.w, height: lede.h }, 'grow+=0.04')
    .to(gSub, { x: lede.x - first.sub.x, y: lede.y - first.sub.y }, 'grow+=0.04')
    .to(gSub, { autoAlpha: 0, duration: 0.16, ease: 'power1.in' }, 'grow+=0.04')
    .from(roomLede, { ...place(first.sub, lede, lede, sF) }, 'grow+=0.04')
    .from(roomLede, { autoAlpha: 0, duration: 0.36, ease: 'power1.out' }, 'grow+=0.16')
    .to(gOpen, { y: -10, autoAlpha: 0, duration: 0.3, ease: 'power2.in' }, 'grow')
    .from(roomNum, { x: first.num.x - num.x, y: first.num.y - num.y, clipPath: `inset(0px ${Math.max(0, num.w - first.num.w)}px 0px 0px round 999px)` }, 'grow')
    .from(roomHint, { x: first.hint.x - hint.x, y: first.hint.y - hint.y, autoAlpha: 0, duration: T_OPEN * 0.9 }, 'grow')
    // the chrome hands over: the counter becomes Back, the film-strip parts into the two ways on
    .to([topBar, film], { autoAlpha: 0, duration: 0.3, ease: 'power1.in' }, 'grow')
    .from(back, { x: first.counter.x + first.counter.w - bk.x - bk.w, y: first.counter.y - bk.y, autoAlpha: 0, duration: T_OPEN * 0.9 }, 'grow+=0.08')
    .from(prevB, { x: first.film.x - pv.x, y: first.film.y - pv.y, autoAlpha: 0, duration: T_OPEN * 1.05 }, 'grow+=0.1')
    .from(nextB, { x: first.film.x + first.film.w - nx.x - nx.w, y: first.film.y - nx.y, autoAlpha: 0, duration: T_OPEN * 1.05 }, 'grow+=0.1')
    // and what belongs to the room alone comes in last, one row at a time
    .from(rows, { y: 26, autoAlpha: 0, duration: 0.7, stagger: 0.06 }, 'grow+=0.34')
    .add(() => { gSub.remove(); gOpen.remove(); bx.remove(); roomLede.classList.remove('bare'); d.obj.setHover(true); gsap.set([back, prevB, nextB, roomHint, ...rows], { clearProps: 'transform,opacity,visibility' }); });
  if (replace) history.replaceState(null, '', '#' + id);
  else if (location.hash !== '#' + id) history.pushState(null, '', '#' + id);
  back.focus({ preventScroll: true });
  return done(keep(tl));
}

function shrink({ quiet = false, dur = T_CLOSE } = {}) {
  if (!current) return Promise.resolve();
  const id = current, d = byId[id];
  const fr = R(d.frame);
  const to = { stage: R(d.stage), big: R(d.bigEl), sub: R(d.subEl), num: R(d.numEl), hint: R(d.frame.querySelector('.f-hint')), counter: R(counter), film: R(film) };
  const A = d.obj.aspect(), stage = R(roomStage), lede = R(roomLede), num = R(roomNum), hint = R(roomHint), bk = R(back), pv = R(prevB), nx = R(nextB);
  const sF = fs(d.subEl) / fs(roomLede);
  const gSub = ghostOf(d.subEl);
  gSub.classList.add('bare');
  gsap.set(gSub, { x: lede.x - to.sub.x, y: lede.y - to.sub.y, autoAlpha: 0 });
  const bx = boxAt(lede); roomLede.classList.add('bare');
  d.obj.setHover(false);

  const tl = gsap.timeline({ defaults: { duration: dur, ease: 'hair' } });
  tl.addLabel('shrink', 0)
    .to([...$('room-list').children].reverse(), { y: 10, autoAlpha: 0, duration: 0.16, stagger: 0.02, ease: 'power1.in' }, 'shrink')
    .to(back, { x: to.counter.x + to.counter.w - bk.x - bk.w, y: to.counter.y - bk.y, autoAlpha: 0, duration: dur * 0.8 }, 'shrink')
    .to(prevB, { x: to.film.x - pv.x, y: to.film.y - pv.y, autoAlpha: 0, duration: dur * 0.8 }, 'shrink')
    .to(nextB, { x: to.film.x + to.film.w - nx.x - nx.w, y: to.film.y - nx.y, autoAlpha: 0, duration: dur * 0.8 }, 'shrink')
    .to(room, { clipPath: inset(fr) }, 'shrink+=0.04')
    .to(roomDots, { left: fr.x, top: fr.y, width: fr.w, height: fr.h }, 'shrink+=0.04')
    .to(d.obj.el, { ...place(fit(to.stage, A), fit(stage, A), stage) }, 'shrink+=0.02')
    .to(roomH, { ...Flip.fit(roomH, d.bigEl, { scale: true, getVars: true }), transformOrigin: '0 0' }, 'shrink+=0.04')
    .to(bx, { left: to.sub.x, top: to.sub.y, width: to.sub.w, height: to.sub.h }, 'shrink+=0.04')
    .to(roomLede, { ...place(to.sub, lede, lede, sF) }, 'shrink+=0.04')
    .to(roomLede, { autoAlpha: 0, duration: 0.14, ease: 'power1.in' }, 'shrink+=0.04')
    .to(gSub, { x: 0, y: 0 }, 'shrink+=0.04')
    .to(gSub, { autoAlpha: 1, duration: 0.3, ease: 'power1.out' }, `shrink+=${dur * 0.3}`)
    .to(roomNum, { x: to.num.x - num.x, y: to.num.y - num.y, clipPath: `inset(0px ${Math.max(0, num.w - to.num.w)}px 0px 0px round 999px)` }, 'shrink+=0.04')
    .to(roomHint, { x: to.hint.x - hint.x, y: to.hint.y - hint.y, autoAlpha: 0, duration: dur * 0.8 }, 'shrink+=0.04')
    .to([topBar, film], { autoAlpha: 1, duration: 0.4, ease: 'power1.out' }, `shrink+=${dur * 0.55}`)
    .add(() => {
      // the frame takes its own things back, exactly where the room left them
      d.obj.open = false;
      d.obj.mount(d.stage);
      gsap.set([d.obj.el, ...SHARED()], { clearProps: 'all' });
      d.frame.classList.remove('away');
      gsap.from(d.frame.querySelector('.cap .open'), { y: 8, autoAlpha: 0, duration: 0.4, ease: 'power2.out', clearProps: 'all' });
      gSub.remove(); bx.remove(); roomLede.classList.remove('bare');
      current = null;
      room.hidden = true;
      gsap.set(room, { autoAlpha: 0, clearProps: 'clipPath' });
      wake(d);
      if (!quiet) d.frame.focus({ preventScroll: true });
    });
  if (!quiet && location.hash) history.pushState(null, '', location.pathname + location.search);
  return done(keep(tl));
}

function fillRoom(d) {
  const i = DISC.indexOf(d), prev = DISC[(i + 3) % 4], next = DISC[(i + 1) % 4];
  roomNum.textContent = `${d.num} · ${d.name}`;
  roomH.textContent = d.name;
  roomLede.innerHTML = `<b>${esc(d.sub)}.</b> ${esc(d.lede)}`;
  $('room-list').innerHTML = d.items.map((it, k) => rowHTML(it, k + 1)).join('');
  prevB.innerHTML = `<span class="l" aria-hidden="true">←</span><span><small>${prev.num}</small> ${esc(prev.name)}</span>`; prevB.href = '#' + prev.id; prevB.style.setProperty('--c', prev.c);
  nextB.innerHTML = `<span><small>${next.num}</small> ${esc(next.name)}</span><span class="r" aria-hidden="true">→</span>`; nextB.href = '#' + next.id; nextB.style.setProperty('--c', next.c);
  prevB.onclick = e => { e.preventDefault(); open(prev.id); };
  nextB.onclick = e => { e.preventDefault(); open(next.id); };
}
back.addEventListener('click', () => close());
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
