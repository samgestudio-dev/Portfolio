import { createTurntable, bindWheel } from '../lib/turntable.js';
import { Cam, proj, toward, prism3, circ } from '../lib/iso.js';
import { buildPlatter, PLATTER_R } from '../lib/platter-svg.js';
import { atlas, restHeights, CELLS, EXTENT } from './scene.js';

/* Motion · 02 — a spring atlas on the turntable, after Hairline's Terrain.

   One model drives everything (Kaero): θ, the turntable, and one height per spring.
   At rest each pillar is as tall as its spring takes to settle; the field is a map
   of k across and c back. This first cut is the still: the turntable turns, the
   pillars stand. ?hot=n shows cell n chosen; ?turn=n turns n quarters.            */

const NS = 'http://www.w3.org/2000/svg';
const svg = document.getElementById('stage');
const readout = document.getElementById('readout');
const mk = (tag, cls, parent) => { const e = document.createElementNS(NS, tag); if (cls) e.setAttribute('class', cls); parent.appendChild(e); return e; };

/* ---- the frame (rule 03) ---------------------------------------------------- */
const C = Cam(45, 0.5, 1);
{
  const P = proj(C), pts = [];
  for (const [r, z] of [[PLATTER_R, 0], [PLATTER_R, -7.3], [PLATTER_R * 0.88, -20], [EXTENT.r, EXTENT.top], [EXTENT.r, 0]])
    for (const q of circ(0, 0, r, 96)) pts.push(P(q.u, q.v, z));
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), pad = 6;
  const x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad;
  svg.setAttribute('viewBox', `${x0} ${y0} ${Math.max(...xs) - x0 + pad} ${Math.max(...ys) - y0 + pad}`);
}
function layout() {
  const top = 64, bottom = document.querySelector('.bottom').offsetHeight + 8;
  svg.style.top = top + 'px';
  svg.style.height = Math.max(160, window.innerHeight - top - bottom) + 'px';
}
window.addEventListener('resize', layout);
layout();

const root = mk('g', '', svg);
const base = buildPlatter();
const baseG = mk('g', '', root), backG = mk('g', '', root), fieldG = mk('g', '', root), frontG = mk('g', '', root);
function fill(g, list) {
  while (g.childElementCount < list.length) mk('path', '', g);
  while (g.childElementCount > list.length) g.lastChild.remove();
  list.forEach(([cls, d], i) => { const e = g.children[i]; if (e.getAttribute('class') !== cls) e.setAttribute('class', cls); if (e.getAttribute('d') !== d) e.setAttribute('d', d); });
}
function setAz() { C.az = (45 * Math.PI) / 180 - table.theta; }

/* ---- the model -------------------------------------------------------------- */
const table = createTurntable({ tour: false });
const heights = restHeights();
let hot = -1;

let dragging = false, dragged = false, lastX = 0, lastT = 0, downX = 0, downY = 0;
svg.addEventListener('pointerdown', e => {
  dragging = true; dragged = false; lastX = downX = e.clientX; downY = e.clientY; lastT = performance.now();
  svg.setPointerCapture(e.pointerId);
});
svg.addEventListener('pointermove', e => {
  if (dragging && !dragged && Math.hypot(e.clientX - downX, e.clientY - downY) > 6) { dragged = true; svg.classList.add('dragging'); table.grab(); }
  if (dragging && dragged) {
    const now = performance.now();
    table.drag(((e.clientX - lastX) / Math.min(window.innerWidth, 900)) * Math.PI * 1.2, Math.max(1, now - lastT) / 1000);
    lastX = e.clientX; lastT = now;
  }
});
const release = () => {
  if (!dragging) return;
  dragging = false; svg.classList.remove('dragging');
  if (dragged) { if (performance.now() - lastT > 80) table.drag(0, 0.08); table.release(); }
};
svg.addEventListener('pointerup', release);
svg.addEventListener('pointercancel', release);
bindWheel(svg, table, {});
svg.addEventListener('keydown', e => {
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { table.flickBy(e.key === 'ArrowRight' ? 1 : -1); e.preventDefault(); }
});

/* ---- controls --------------------------------------------------------------- */
const stroke = document.getElementById('stroke'), slowBtn = document.getElementById('slow'), themeBtn = document.getElementById('theme');
let look = 0, slow = false;
const applyLook = () => { document.documentElement.style.setProperty('--hl-sw', stroke.value); look++; };
stroke.addEventListener('input', applyLook);
slowBtn.addEventListener('click', () => { slow = !slow; slowBtn.setAttribute('aria-pressed', slow); });
const sysDark = matchMedia('(prefers-color-scheme: dark)');
const isDark = () => { const t = document.documentElement.dataset.theme; return t ? t === 'dark' : sysDark.matches; };
function syncTheme() {
  const dark = isDark();
  themeBtn.setAttribute('aria-pressed', dark);
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.content = dark ? '#131311' : '#f4f2eb';
}
themeBtn.addEventListener('click', () => { document.documentElement.dataset.theme = isDark() ? 'light' : 'dark'; syncTheme(); });
sysDark.addEventListener('change', syncTheme);
syncTheme();
applyLook();

{
  const q = location.search, t = q.match(/[?&]turn=([\d.]+)/), h = q.match(/[?&]hot=(\d+)/);
  if (t) table.jump(+t[1]);
  if (h) hot = +h[1];
}

/* ---- loop: rewritten only when something moved (rule 07) ------------------------ */
let prev = performance.now(), lastText = '', lastKey = '';
function frame(now) {
  const dt = Math.min(0.05, (now - prev) / 1000) * (slow ? 0.25 : 1);
  prev = now;
  table.step(dt, dragging && dragged);
  const s = table.state();
  const c = CELLS[hot];
  const part = c ? `k ${c.k} · c ${c.c} · ζ ${c.zeta.toFixed(2)} · settle ${c.settle.toFixed(2)} s` : 'rest';
  const text = `θ ${String(Math.round(s.degrees)).padStart(3, '0')}° · face <b>${s.face}</b>/4 · ${part}`;
  if (text !== lastText) { readout.innerHTML = text; lastText = text; }
  const key = `${table.theta.toFixed(5)}|${hot}|${look}`;
  if (key !== lastKey) {
    setAz();
    const P = proj(C), T = toward(C), k = (x, y) => T[0] * x + T[1] * y;
    const pl = [];
    for (const p of base.slice(0, 2)) { const d = prism3(P, T, p.frame, p.ring, p.inner, p.w0, p.w1); pl.push(['sil', d.sil], ['cr', d.crease]); }
    fill(baseG, pl);
    const back = [], front = [];
    for (const p of base.slice(2)) { const d = prism3(P, T, p.frame, p.ring, p.inner, p.w0, p.w1); (k(p.frame.o[0], p.frame.o[1]) < 0 ? back : front).push(['sil', d.sil], ['cr', d.crease]); }
    fill(backG, back); fill(frontG, front);
    fill(fieldG, atlas(P, T, heights, hot));
    lastKey = key;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
