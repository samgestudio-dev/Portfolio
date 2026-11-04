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
  d.obj = createObject(d.id, {
    colors: { david: { plate: '#ffffff', hi: '#141412', edge: '#141412', mid: '#1c1c1c', lo: '#3a3a3a' } },
    onOpen: e => open(d.id, e),
  });
  d.obj.mount(d.stage);
  d.obj.bind(d.stage);
  d.obj.bind($('room-stage'));
  // the frame's ground opens it too (a drag on it pans the strip, handled below)
  f.addEventListener('click', e => { if (!panned && !e.target.closest('.p-stage')) open(d.id, e); });
  f.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') d.obj.setHover(true); });
  f.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !d.obj.open) d.obj.setHover(false); });
  f.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(d.id, null); } });
}
const FRAMES = [...strip.querySelectorAll('.frame')];
for (const a of document.querySelectorAll('.intro .hl')) a.addEventListener('click', e => { e.preventDefault(); open(a.dataset.k, e); });

/* ---- the film-strip, and which frame is in view ---- */
const film = $('film'), counter = $('counter');
FRAMES.forEach((f, i) => {
  const b = document.createElement('button');
  b.setAttribute('aria-label', f.getAttribute('aria-label').split('.')[0]);
  const d = DISC.find(x => x.frame === f);
  if (d) b.style.setProperty('--c', d.c); else if (f.classList.contains('outro')) b.style.setProperty('--c', '#1b1b19');
  b.addEventListener('click', () => goTo(i));
  film.appendChild(b);
});
let active = 0;
const seen = new Set();
const io = new IntersectionObserver(es => {
  for (const en of es) {
    const i = FRAMES.indexOf(en.target), d = DISC.find(x => x.frame === en.target);
    if (en.intersectionRatio > 0.55) {
      active = i;
      counter.textContent = `${String(i + 1).padStart(2, '0')} / ${String(FRAMES.length).padStart(2, '0')}`;
      [...film.children].forEach((b, k) => b.setAttribute('aria-current', k === i));
    }
    en.target.classList.toggle('live', en.intersectionRatio > 0.55);
    if (d) { if (en.isIntersecting) seen.add(d.id); else seen.delete(d.id); if (touch) d.obj.setHover(en.intersectionRatio > 0.55); }
  }
}, { threshold: [0, 0.55] });
FRAMES.forEach(f => io.observe(f));
function goTo(i) {
  i = Math.max(0, Math.min(FRAMES.length - 1, i));
  FRAMES[i].scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest', inline: 'center' });
}
$('home').addEventListener('click', e => { e.preventDefault(); goTo(0); });

/* ---- moving the strip: wheel, trackpad, a drag on empty ground, keys ---- */
// the wheel: a vertical wheel runs the strip sideways; a trackpad's sideways swipe runs it too
let wheelT = 0;
strip.addEventListener('wheel', e => {
  if (current || e.ctrlKey) return;
  if (vertical()) return;                                       // the strip is the page's own scroller there
  const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  if (e.target.closest('.p-stage') && Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;   // a sideways swipe on an object turns it
  e.preventDefault();
  strip.scrollLeft += dx;
  clearTimeout(wheelT); wheelT = setTimeout(() => {}, 120);
}, { passive: false });
// a drag on the ground pans the strip and lets it coast to the nearest frame
let pan = null, panned = false;
strip.addEventListener('pointerdown', e => {
  if (current || e.button || e.target.closest('.p-stage, .hl, .mail, a, button')) return;
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
  goTo(step ? active + step : nearest());
  setTimeout(() => (panned = false), 50);
};
strip.addEventListener('pointerup', endPan);
strip.addEventListener('pointercancel', endPan);
function nearest() {
  const c = strip.scrollLeft + strip.clientWidth / 2;
  let best = 0, bd = Infinity;
  FRAMES.forEach((f, i) => { const d = Math.abs(f.offsetLeft + f.offsetWidth / 2 - c); if (d < bd) { bd = d; best = i; } });
  return best;
}
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
  else if (k === 'Enter' || k === ' ') { const d = DISC.find(x => x.frame === FRAMES[active]); if (d) open(d.id, null); else return; }
  else if (/^[1-4]$/.test(k)) open(DISC[+k - 1].id, null);
  else return;
  e.preventDefault();
});

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

/* ---- a frame, opened: it grows from where it stands to fill the page ---- */
const room = $('room'), roomStage = $('room-stage');
let current = null, closing = 0, pushed = false;
const rowHTML = (it, n) => {
  const link = !!it.href, tag = link ? 'a' : 'div';
  return `<${tag} class="row ${link ? 'link' : 'soon'}"${link ? ` href="${it.href}"` : ''}><span class="n">${String(n).padStart(2, '0')}</span><span><span class="t">${esc(it.t)}</span><br><span class="k">${esc(it.k)}</span></span><span class="go">${link ? 'Open →' : 'Soon'}</span></${tag}>`;
};
function open(id, e) {
  const d = byId[id];
  if (current === id) return;
  const r = d.frame.getBoundingClientRect();
  if (current) moveBack();
  current = id;
  clearTimeout(closing);
  room.hidden = false;
  room.className = `room ${id}`;
  room.style.setProperty('--t', `${Math.max(0, r.top)}px`); room.style.setProperty('--l', `${Math.max(0, r.left)}px`);
  room.style.setProperty('--b', `${Math.max(0, innerHeight - r.bottom)}px`); room.style.setProperty('--r', `${Math.max(0, innerWidth - r.right)}px`);
  fillRoom(d);
  void room.offsetWidth;
  room.classList.add('on');
  d.obj.setHover(false);
  // the object leaves its frame once the frame has grown over it, and settles into the room
  setTimeout(() => { if (current !== id) return; d.obj.mount(roomStage); d.obj.open = true; d.obj.setHover(true); room.classList.add('ready'); }, reduced ? 0 : 320);
  if (location.hash !== '#' + id) { pushed = true; history.pushState(null, '', '#' + id); }
  $('room-close').focus({ preventScroll: true });
}
function moveBack() {
  const d = byId[current];
  d.obj.open = false; d.obj.setHover(false);
  d.obj.mount(d.stage);
}
function close(fromHistory = false) {
  if (!current) return;
  const id = current, d = byId[id];
  // shrink back onto the frame where it now stands
  const r = d.frame.getBoundingClientRect();
  room.style.setProperty('--t', `${Math.max(0, r.top)}px`); room.style.setProperty('--l', `${Math.max(0, r.left)}px`);
  room.style.setProperty('--b', `${Math.max(0, innerHeight - r.bottom)}px`); room.style.setProperty('--r', `${Math.max(0, innerWidth - r.right)}px`);
  room.classList.remove('ready', 'on');
  closing = setTimeout(() => { if (current === id) { moveBack(); current = null; room.hidden = true; } }, reduced ? 0 : 400);
  if (!fromHistory && location.hash) history.pushState(null, '', location.pathname + location.search);
  d.frame.focus({ preventScroll: true });
}
function fillRoom(d) {
  const i = DISC.indexOf(d), prev = DISC[(i + 3) % 4], next = DISC[(i + 1) % 4];
  $('room-num').textContent = `${d.num} · ${d.name}`;
  $('room-h').textContent = d.name;
  $('room-lede').innerHTML = `<b>${esc(d.sub)}.</b> ${esc(d.lede)}`;
  $('room-list').innerHTML = d.items.map((it, k) => rowHTML(it, k + 1)).join('');
  const pv = $('room-prev'), nx = $('room-next');
  pv.innerHTML = `<span class="l">←</span> ${prev.num} ${esc(prev.name)}`; pv.href = '#' + prev.id; pv.onclick = e => { e.preventDefault(); goTo(FRAMES.indexOf(prev.frame)); open(prev.id, null); };
  nx.innerHTML = `${next.num} ${esc(next.name)} <span class="r">→</span>`; nx.href = '#' + next.id; nx.onclick = e => { e.preventDefault(); goTo(FRAMES.indexOf(next.frame)); open(next.id, null); };
}
$('room-close').addEventListener('click', () => close());
function fromHash() {
  const id = location.hash.slice(1);
  if (byId[id]) { goTo(FRAMES.indexOf(byId[id].frame)); open(id, null); } else if (current) close(true);
}
addEventListener('popstate', fromHash);
addEventListener('hashchange', fromHash);
if (byId[location.hash.slice(1)]) requestAnimationFrame(() => { const d = byId[location.hash.slice(1)]; FRAMES[FRAMES.indexOf(d.frame)].scrollIntoView({ inline: 'center', block: 'nearest' }); open(d.id, null); });
// ?frame=n opens the strip on frame n (for still pictures)
{ const m = location.search.match(/[?&]frame=(\d+)/); if (m) requestAnimationFrame(() => FRAMES[+m[1]]?.scrollIntoView({ inline: 'center', block: 'nearest' })); }

/* ---- sizes ---- */
const ro = new ResizeObserver(() => DISC.forEach(d => d.obj.resize()));
DISC.forEach(d => ro.observe(d.stage));
ro.observe(roomStage);

/* ---- one loop: each object steps, and draws only when it moved and can be seen ---- */
let prev = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - prev) / 1000);
  prev = now;
  for (const d of DISC) {
    d.obj.step(dt);
    if (seen.has(d.id) || d.obj.open || !d.drawn) { d.obj.draw(); d.drawn = true; }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
