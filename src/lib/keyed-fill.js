/* Paths kept by name, not by place in the paint order. Each part keeps its own element
   for life, so when a turn reorders the painting only the order of the elements changes,
   never their class: the stroke transition (there for the highlight) then runs only when a
   part's own ink changes, and never flashes as one element is handed from part to part.
   list: [cls, d, key] in paint order.                                                */
const NS = 'http://www.w3.org/2000/svg';
export function fillKeyed(g, list) {
  const map = g._parts || (g._parts = new Map());
  const seen = new Set();
  let cursor = g.firstChild;
  for (const [cls, d, key] of list) {
    let e = map.get(key);
    if (!e) { e = document.createElementNS(NS, 'path'); map.set(key, e); }
    seen.add(key);
    if (e.getAttribute('class') !== cls) e.setAttribute('class', cls);
    if (e.getAttribute('d') !== d) e.setAttribute('d', d);
    if (e === cursor) cursor = cursor.nextSibling;
    else g.insertBefore(e, cursor);
  }
  for (const [key, e] of map) if (!seen.has(key)) { e.remove(); map.delete(key); }
}
