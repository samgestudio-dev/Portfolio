/* A small panel of sliders for tuning a set of numbers live: each change takes effect at
   once, is kept in this browser, and the whole set can be copied out to be written into
   the code. spec: [{ key, label, min, max, step, value, group? }].                     */

export function createTune({ title, spec, storeKey, onAction = {} }) {
  const defaults = Object.fromEntries(spec.map(s => [s.key, s.value]));
  const v = { ...defaults };
  try { Object.assign(v, JSON.parse(localStorage.getItem(storeKey) || '{}')); } catch {}
  for (const k of Object.keys(v)) if (!(k in defaults)) delete v[k];
  const save = () => { try { localStorage.setItem(storeKey, JSON.stringify(v)); } catch {} };

  const root = document.createElement('div');
  root.className = 'tune mono';
  root.hidden = true;
  root.innerHTML = `<div class="tune-head"><b>${title}</b><button data-act="close" aria-label="Close the tuning panel">×</button></div>`;
  const body = document.createElement('div');
  body.className = 'tune-body';
  root.appendChild(body);
  const inputs = {};
  let group = null;
  for (const s of spec) {
    if (s.group && s.group !== group) {
      group = s.group;
      const h = document.createElement('div'); h.className = 'tune-group'; h.textContent = group; body.appendChild(h);
    }
    const row = document.createElement('label');
    row.className = 'tune-row';
    const digits = Math.max(0, -Math.floor(Math.log10(s.step) + 1e-9));
    row.innerHTML = `<span>${s.label}</span><input type="range" min="${s.min}" max="${s.max}" step="${s.step}"><output></output>`;
    const inp = row.querySelector('input'), out = row.querySelector('output');
    const show = () => { out.textContent = (+v[s.key]).toFixed(digits); row.classList.toggle('changed', +v[s.key] !== defaults[s.key]); };
    inp.value = v[s.key]; show();
    inp.addEventListener('input', () => { v[s.key] = +inp.value; show(); save(); });
    // a double click puts one number back
    row.addEventListener('dblclick', () => { v[s.key] = defaults[s.key]; inp.value = v[s.key]; show(); save(); });
    inputs[s.key] = { inp, show };
    body.appendChild(row);
  }
  const foot = document.createElement('div');
  foot.className = 'tune-foot';
  foot.innerHTML = [...Object.keys(onAction).map(k => `<button data-act="${k}">${k}</button>`), '<button data-act="reset">Reset</button>', '<button data-act="copy">Copy values</button>'].join('');
  root.appendChild(foot);
  const note = document.createElement('div'); note.className = 'tune-note'; root.appendChild(note);
  const say = t => { note.textContent = t; clearTimeout(say.t); say.t = setTimeout(() => (note.textContent = ''), 2400); };

  root.addEventListener('click', async e => {
    const act = e.target.closest('button')?.dataset.act;
    if (!act) return;
    if (act === 'close') toggle(false);
    else if (act === 'reset') { Object.assign(v, defaults); for (const k in inputs) { inputs[k].inp.value = v[k]; inputs[k].show(); } save(); say('Back to the defaults'); }
    else if (act === 'copy') {
      const text = JSON.stringify(v, null, 2);
      try { await navigator.clipboard.writeText(text); say('Copied: paste it to Claude'); }
      catch { const ta = document.createElement('textarea'); ta.value = text; ta.className = 'tune-copy'; note.replaceChildren(ta); ta.select(); }
    } else onAction[act]?.();
  });
  // keys typed into the panel stay in it
  root.addEventListener('keydown', e => e.stopPropagation());
  root.addEventListener('pointerdown', e => e.stopPropagation());
  root.addEventListener('wheel', e => e.stopPropagation());
  document.body.appendChild(root);

  function toggle(on = root.hidden) { root.hidden = !on; }
  return { v, toggle, el: root };
}
