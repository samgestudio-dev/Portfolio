// Simplify the 200k David to ~85k triangles, keeping hands and feet at full density
// (their vertices are locked), so the result is one seamless mesh.
import fs from 'fs';
import { MeshoptSimplifier } from 'meshoptimizer';
const npy = f => { const b = fs.readFileSync(f); const hl = b.readUInt16LE(8); const hdr = b.slice(10, 10 + hl).toString(); const off = 10 + hl;
  const dt = /'descr': '([<|]\w+)'/.exec(hdr)[1]; const ab = b.buffer.slice(b.byteOffset + off, b.byteOffset + b.length);
  return dt.includes('f4') ? new Float32Array(ab) : dt.includes('u4') ? new Uint32Array(ab) : new Uint8Array(ab); };
await MeshoptSimplifier.ready;
MeshoptSimplifier.useExperimentalFeatures = true;
const pos = npy('hi_pos.npy'), idx = npy('hi_idx.npy'), lock = npy('lock.npy'), nrm = npy('hi_nrm.npy');
const target = +process.argv[2] || 85000;
const lockArr = new Uint8Array(lock);
const [out, err] = MeshoptSimplifier.simplifyWithAttributes(idx, pos, 3, nrm, 3, [], lockArr, target * 3, +(process.argv[3] || 0.001), []);
console.log('triangles', out.length / 3, 'error', err);
fs.writeFileSync('hyb_idx.bin', Buffer.from(out.buffer));
