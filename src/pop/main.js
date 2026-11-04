import { createObject } from './object.js';

/* The pop page. Learned from the portfolios studied:
   · the object is the navigation (Lusion, Unseen, Bruno Simon): four comic panels, each
     a live object that answers the hand, open into its discipline
   · a statement for a hero, the disciplines in it as links (Clay Boan, Eduard Bodak),
     here as bold colour blocks that wake their panel
   · work as an index of rows, number · title · kind · year (Bethany Heck, Lusion,
     Dennis Snellenberg), filtered by discipline (Unseen), a preview card at the cursor
   · a few poster-sized lines mid-page (Lusion), services as short headed items (Eduard
     Bodak), a contact block with click to copy and the local time (Eduard Bodak, Rauno)
   Printed in pop: flat colour, black ink, Ben-Day dots, hard shadows.                  */

const DISC = [
  { id: 'art', num: '01', name: 'Art', c: 'var(--red)', sub: 'Sculpture & installation',
    title: 'Sculpture & installation', lede: 'Form, material and space, made away from the screen, and drawn back onto it in lines.',
    items: [
      { t: 'Sculpture', k: 'Fine art', y: 'Ongoing', s: 'Soon' },
      { t: 'Installation', k: 'Fine art', y: 'Ongoing', s: 'Soon' },
      { t: 'David, in lines', k: 'WebGL line study', y: '2026', href: './david.html' },
    ] },
  { id: 'product', num: '02', name: 'Product', c: 'var(--blue)', sub: 'Interfaces people use',
    title: 'Interfaces people use', lede: 'UI and UX case studies, from the first question to the last tap: search, booking, lending.',
    items: [
      { t: 'Trip.com Double Search Bar', k: 'UI / UX case study', y: '2026', s: 'Soon' },
      { t: 'Exhibizio', k: 'iOS app for art shows', y: '2025', s: 'Soon' },
      { t: 'iPhone Air, in layers', k: 'Interactive object', y: '2026', href: './phone.html' },
    ] },
  { id: 'system', num: '03', name: 'System', c: 'var(--yellow)', sub: 'Design systems & tokens',
    title: 'Systems & tokens', lede: 'One source of truth that keeps design and code in step: colour, type, space and the names for them.',
    items: [
      { t: 'PeraSure Design System', k: 'Design system & tokens', y: '2026', s: 'Soon' },
      { t: 'Token cabinet', k: 'Interactive object', y: '2026', href: './cabinet.html' },
    ] },
  { id: 'motion', num: '04', name: 'Motion', c: 'var(--pink)', sub: 'Timing, springs & rhythm',
    title: 'Motion & interaction', lede: 'How a thing should move: springs, timing and the small answers an interface gives back.',
    items: [
      { t: 'PeraSure motion prototypes', k: 'Animation & prototypes', y: '2026', s: 'Soon' },
      { t: 'Spring atlas', k: 'Interactive object', y: '2026', href: './atlas.html' },
      { t: 'Flipbook', k: 'Interactive object', y: '2026', href: './flipbook.html' },
      { t: 'Spring rack', k: 'Interactive object', y: '2026', href: './springs.html' },
      { t: 'Spacing chart', k: 'Interactive object', y: '2026', href: './spacing.html' },
    ] },
];
const byId = Object.fromEntries(DISC.map(d => [d.id, d]));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const touch = matchMedia('(hover: none)').matches;
const $ = id => document.getElementById(id);
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---- the starburst sticker and the marquees ---- */
{
  const pts = [];
  for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2, r = i % 2 ? 44 : 58; pts.push(`${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`); }
  $('burstShape').setAttribute('points', pts.join(' '));
  const words = ['Interfaces', 'Systems', 'Motion', 'Art', 'Design', 'Code', 'Objects'];
  const run = words.map(w => `<span>${w}</span><em>✶</em>`).join('');
  $('mq1').innerHTML = run + run;
  const run2 = ['Open for projects', 'Say hello', 'Design · code · objects'].map(w => `<span>${w}</span><em>●</em>`).join('');
  $('mq2').innerHTML = run2 + run2 + run2 + run2;
}

/* ---- the four panels ---- */
if (touch) document.querySelector('.hero-side .label:last-child').textContent = '↓ Tap an object to open it · swipe sideways on it to turn it';
const comic = $('comic');
for (const d of DISC) {
  const p = document.createElement('div');
  p.className = `panel ${d.id}`;
  p.tabIndex = 0;
  p.setAttribute('role', 'link');
  p.setAttribute('aria-label', `${d.num} ${d.name}: ${d.sub}. Open`);
  p.innerHTML = `<span class="p-num">${d.num}</span><span class="p-hint">${touch ? 'Tap to open' : 'Drag to turn · click to open'}</span><div class="p-stage"></div><div class="p-cap"><b>${d.name}</b><span>${d.sub}</span></div>`;
  comic.appendChild(p);
  d.panel = p; d.stage = p.querySelector('.p-stage');
  d.obj = createObject(d.id, {
    colors: { david: { plate: '#ffffff', hi: '#111111', edge: '#111111', mid: '#1c1c1c', lo: '#3a3a3a' } },
    onOpen: e => open(d.id, e),
  });
  d.obj.mount(d.stage);
  d.obj.bind(p);
  d.obj.bind($('room-stage'));
  p.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') wake(d.id, true); });
  p.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') wake(d.id, false); });
  p.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(d.id, null); } });
  p.addEventListener('focus', () => wake(d.id, true));
  p.addEventListener('blur', () => wake(d.id, false));
}
// a word in the headline and its panel wake each other
function wake(id, on) {
  const d = byId[id];
  d.obj.setHover(on);
  d.panel.classList.toggle('on', on);
  document.querySelector(`.hl[data-k="${id}"]`)?.classList.toggle('on', on);
}
for (const a of document.querySelectorAll('.hl')) {
  a.addEventListener('pointerenter', () => wake(a.dataset.k, true));
  a.addEventListener('pointerleave', () => wake(a.dataset.k, false));
  a.addEventListener('click', e => { e.preventDefault(); open(a.dataset.k, e); });
}
// on a phone there is no hover: a panel wakes while it is well in view
const seen = new Set();
const io = new IntersectionObserver(es => {
  for (const en of es) {
    const d = DISC.find(x => x.panel === en.target);
    if (en.isIntersecting) seen.add(d.id); else seen.delete(d.id);
    if (touch) wake(d.id, en.intersectionRatio > 0.6);
  }
}, { threshold: [0, 0.6] });
DISC.forEach(d => io.observe(d.panel));

/* ---- the index of work, its filters and its cursor card ---- */
const index = $('index'), peek = $('peek');
let n = 0;
for (const d of DISC) for (const it of d.items) {
  n++;
  const row = document.createElement(it.href ? 'a' : 'div');
  row.className = 'row';
  if (it.href) row.href = it.href; else { row.tabIndex = 0; row.setAttribute('role', 'button'); }
  row.dataset.d = d.id;
  row.style.setProperty('--c', d.c);
  row.innerHTML = `<span class="n">${String(n).padStart(2, '0')}</span><span class="t">${esc(it.t)}</span><span class="k">${esc(d.name)} · ${esc(it.k)}</span><span class="y">${esc(it.y)}</span><span class="s ${it.href ? 'lab' : ''}">${it.href ? 'Open ↗' : 'Case soon'}</span>`;
  if (!it.href) {
    row.addEventListener('click', e => open(d.id, e));
    row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(d.id, null); } });
  }
  row.addEventListener('pointerenter', () => { peek.style.setProperty('--c', d.c); $('peek-n').textContent = d.num; $('peek-t').textContent = d.name; peek.classList.add('on'); });
  row.addEventListener('pointerleave', () => peek.classList.remove('on'));
  index.appendChild(row);
}
let px = 0, py = 0, tx = 0, ty = 0;
addEventListener('pointermove', e => { tx = e.clientX + 130; ty = e.clientY; });
const filters = document.querySelector('.filters');
for (const d of DISC) {
  const b = document.createElement('button');
  b.className = 'btn'; b.dataset.f = d.id; b.setAttribute('aria-pressed', 'false');
  b.innerHTML = `<i class="sw" style="--c:${d.c}"></i>${d.name}`;
  filters.appendChild(b);
}
filters.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  for (const x of filters.children) x.setAttribute('aria-pressed', x === b);
  for (const r of index.children) r.hidden = b.dataset.f !== 'all' && r.dataset.d !== b.dataset.f;
});

/* ---- services ---- */
$('services').innerHTML = DISC.map(d => `<div class="svc"><i style="--c:${d.c}">${d.num}</i><b>${esc(d.name)}</b><p>${esc(d.lede)}</p></div>`).join('');

/* ---- poster lines slide in once ---- */
new IntersectionObserver((es, ob) => { for (const en of es) if (en.isIntersecting) { en.target.classList.add('in'); ob.unobserve(en.target); } }, { threshold: 0.3 }).observe($('say'));

/* ---- contact: click to copy, the local time ---- */
const emailBtn = $('email');
emailBtn.addEventListener('click', async () => {
  const addr = emailBtn.dataset.email;
  if (!addr) { emailBtn.textContent = 'Email · add your address in pop.html'; return; }
  try { await navigator.clipboard.writeText(addr); emailBtn.textContent = 'Copied ✓'; } catch { emailBtn.textContent = addr; }
  setTimeout(() => (emailBtn.textContent = `Email · ${addr}`), 1800);
});
function clock() {
  const t = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Shanghai' }).format(new Date());
  $('clock').textContent = `UTC+8 · ${t}`;
  $('clock2').textContent = `(Local time · UTC+8 · ${t})`;
}
clock(); setInterval(clock, 15000);

/* ---- a discipline, opened: its colour floods out from where it was chosen ---- */
const room = $('room'), roomStage = $('room-stage');
let current = null, closing = 0;
function open(id, e) {
  const d = byId[id];
  if (current === id) return;
  const r = d.panel.getBoundingClientRect();
  const x = e?.clientX ?? r.left + r.width / 2, y = e?.clientY ?? r.top + r.height / 2;
  const rad = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) + 40;
  if (current) moveBack();
  current = id;
  clearTimeout(closing);
  room.hidden = false;
  room.style.setProperty('--c', d.c); room.style.setProperty('--x', `${x}px`); room.style.setProperty('--y', `${y}px`); room.style.setProperty('--rad', `${rad}px`);
  room.classList.remove('ready');
  fillRoom(d);
  void room.offsetWidth;
  room.classList.add('on');
  document.body.classList.add('locked');
  wake(id, false);
  // the object leaves its panel once the colour has covered it, and settles into the room
  setTimeout(() => { if (current !== id) return; d.obj.mount(roomStage); d.obj.open = true; d.obj.setHover(true); room.classList.add('ready'); }, reduced ? 0 : 320);
  if (location.hash !== '#' + id) history.pushState(null, '', '#' + id);
  $('room-close').focus({ preventScroll: true });
}
function moveBack() {
  const d = byId[current];
  d.obj.open = false; d.obj.setHover(false);
  d.obj.mount(d.stage);
}
function close(fromHistory = false) {
  if (!current) return;
  const id = current;
  room.classList.remove('ready', 'on');
  document.body.classList.remove('locked');
  // back into its panel as the colour draws in
  closing = setTimeout(() => { if (current === id) { moveBack(); current = null; room.hidden = true; } }, reduced ? 0 : 420);
  if (!fromHistory && location.hash) history.pushState(null, '', location.pathname + location.search);
  byId[id].panel.focus({ preventScroll: true });
}
function fillRoom(d) {
  const i = DISC.indexOf(d), prev = DISC[(i + 3) % 4], next = DISC[(i + 1) % 4];
  $('room-num').textContent = `${d.num} · ${d.name}`;
  $('room-kicker').textContent = `(${d.name})`;
  $('room-h').textContent = d.title;
  $('room-lede').textContent = d.lede;
  $('room-list').innerHTML = d.items.map((it, k) => `<${it.href ? `a href="${it.href}"` : 'div'} class="row" style="--c:var(--white)"><span class="n">${String(k + 1).padStart(2, '0')}</span><span class="t">${esc(it.t)}</span><span class="y">${esc(it.y)}</span><span class="s ${it.href ? 'lab' : ''}">${it.href ? 'Open ↗' : 'Case soon'}</span></${it.href ? 'a' : 'div'}>`).join('');
  $('room-prev').textContent = `← ${prev.num} ${prev.name}`; $('room-prev').onclick = () => open(prev.id, null);
  $('room-next').textContent = `${next.num} ${next.name} →`; $('room-next').onclick = () => open(next.id, null);
  [...$('room-text').children].forEach((el, k) => el.style.setProperty('--i', k));
  [...$('room-list').children].forEach((el, k) => el.style.setProperty('--i', 4 + k));
}
$('room-close').addEventListener('click', () => close());
addEventListener('keydown', e => {
  if (!current) return;
  if (e.key === 'Escape') close();
  else if (e.key === 'ArrowRight' && !e.target.closest('input')) $('room-next').click();
  else if (e.key === 'ArrowLeft' && !e.target.closest('input')) $('room-prev').click();
});
function fromHash() {
  const id = location.hash.slice(1);
  if (byId[id]) open(id, null); else if (current) close(true);
}
addEventListener('popstate', fromHash);
addEventListener('hashchange', fromHash);
if (byId[location.hash.slice(1)]) requestAnimationFrame(() => open(location.hash.slice(1), null));

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
    // drawn once to begin with, then only while it can be seen
    if (seen.has(d.id) || d.obj.open || !d.drawn) { d.obj.draw(); d.drawn = true; }
  }
  px += (tx - px) * 0.2; py += (ty - py) * 0.2;
  peek.style.left = `${px.toFixed(1)}px`; peek.style.top = `${py.toFixed(1)}px`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
