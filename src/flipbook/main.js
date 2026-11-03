import { createTurntable, bindWheel } from '../lib/turntable.js';
import { Cam, proj, toward, prism3, circ } from '../lib/iso.js';
import { buildPlatter, PLATTER_R } from '../lib/platter-svg.js';
import { book, REST, EXTENT } from './scene.js';

/* Motion · 01 — a flipbook on the turntable, fanned. The rest pose first; the pointer
   comes once the look is agreed. */

const NS = 'http://www.w3.org/2000/svg';
const svg = document.getElementById('stage');
const readout = document.getElementById('readout');
const mk = (tag, cls, parent) => { const e = document.createElementNS(NS, tag); if (cls) e.setAttribute('class', cls); parent.appendChild(e); return e; };

const C = Cam(45, 0.5, 1);
{
  const P = proj(C), pts = [];
  for (const [r, z] of [[PLATTER_R, 0], [PLATTER_R, -7.3], [PLATTER_R * 0.88, -20], [EXTENT.r, EXTENT.top]])
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
const baseG = mk('g', '', root), backG = mk('g', '', root), bookG = mk('g', '', root), frontG = mk('g', '', root);
function fill(g, list) {
  while (g.childElementCount < list.length) mk('path', '', g);
  while (g.childElementCount > list.length) g.lastChild.remove();
  list.forEach(([cls, d], i) => { const e = g.children[i]; if (e.getAttribute('class') !== cls) e.setAttribute('class', cls); if (e.getAttribute('d') !== d) e.setAttribute('d', d); });
}
const table = createTurntable({ tour: false });
function setAz() { C.az = (45 * Math.PI) / 180 - table.theta; }

let dragging = false, lastX = 0, lastT = 0;
svg.addEventListener('pointerdown', e => { dragging = true; lastX = e.clientX; lastT = performance.now(); svg.setPointerCapture(e.pointerId); table.grab(); });
svg.addEventListener('pointermove', e => {
  if (!dragging) return;
  const now = performance.now();
  table.drag(((e.clientX - lastX) / Math.min(window.innerWidth, 900)) * Math.PI * 1.2, Math.max(1, now - lastT) / 1000);
  lastX = e.clientX; lastT = now;
});
const release = () => { if (!dragging) return; dragging = false; if (performance.now() - lastT > 80) table.drag(0, 0.08); table.release(); };
svg.addEventListener('pointerup', release);
svg.addEventListener('pointercancel', release);
bindWheel(svg, table);
{ const t = location.search.match(/[?&]turn=([\d.]+)/); if (t) table.jump(+t[1]); }

let prev = performance.now(), lastKey = '';
function frame(now) {
  const dt = Math.min(0.05, (now - prev) / 1000); prev = now;
  table.step(dt, dragging);
  const s = table.state();
  readout.innerHTML = `θ ${String(Math.round(s.degrees)).padStart(3, '0')}° · face <b>${s.face}</b>/4 · rest`;
  const key = table.theta.toFixed(5);
  if (key !== lastKey) {
    setAz();
    const P = proj(C), T = toward(C), k = (x, y) => T[0] * x + T[1] * y;
    const pl = [];
    for (const p of base.slice(0, 2)) { const d = prism3(P, T, p.frame, p.ring, p.inner, p.w0, p.w1); pl.push(['sil', d.sil], ['cr', d.crease]); }
    fill(baseG, pl);
    const back = [], front = [];
    for (const p of base.slice(2)) { const d = prism3(P, T, p.frame, p.ring, p.inner, p.w0, p.w1); (k(p.frame.o[0], p.frame.o[1]) < 0 ? back : front).push(['sil', d.sil], ['cr', d.crease]); }
    fill(backG, back); fill(frontG, front);
    fill(bookG, book(P, T, REST, -1));
    lastKey = key;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
