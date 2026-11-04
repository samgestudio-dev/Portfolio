# Michelangelo's David — web LODs

Source: "Michelangelo's David" by Scan the World (MyMiniFactory #2052),
https://www.myminifactory.com/object/3d-print-michelangelo-s-david-in-florence-italy-2052
Original scan: 1,199,948 triangles, watertight, single shell.

Processing: STL Z-up → glTF Y-up, centred on X/Z, feet on y = 0, height = 1 unit.
Simplified with meshoptimizer (gltf-transform simplify, error 0.001), smooth normals,
quantized (normals 10-bit) and meshopt-compressed. Load with GLTFLoader + MeshoptDecoder.

| file          | triangles | size   | use                                   |
|---------------|-----------|--------|---------------------------------------|
| david-full.glb | 224k     | 0.9 MB | the fine scan (Sam's STL): David's real close-up on a computer (pop page), fetched when first wanted |
| david-hi.glb  | 200k      | 821 KB | Fine Art close-up / zoom              |
| david-mid.glb | 105k      | 733 KB | homepage turntable (desktop + iPhone); hands, feet and genitals at the 200k density; carries `_FORMNORMAL` |
| david-lo.glb  | 30k       | 132 KB | first-paint placeholder / small tiles |

`david-mid.glb` also carries `_FORMNORMAL`: the scan's normal smoothed at muscle scale
(Gaussian-weighted plane fit over a ~6 cm ball, σ = 0.012 David-heights), baked by
`tools/formnormals.py`. The line study uses it for the cel tone and the muscle lines.

`david-mid.glb` is a hybrid: the 200k LOD simplified to 105k with the vertices of the hands,
feet and genitals locked (`tools/regions.py`, `tools/lockedsimplify.mjs`, meshoptimizer
`simplifyWithAttributes`), so those keep the 200k detail in one seamless mesh. Its normals
are carried from the full scan (nearest four scan vertices), not recomputed.

`david-full.glb` is a second, finer-surfaced scan (224k triangles, Sam's STL), brought into the
others' frame: Z-up → Y-up, centred, feet on y = 0, height 1, then fitted to the 1.2M scan by ICP
(rigid + scale; mean distance 5.5 mm per David-height), so the paint placed on the other meshes
lands on it. Its crown sits just above y = 1, so it must be dequantized to floats before it is
moved (see `floatGeo` in `src/pop/object.js`). Quantized and meshopt-compressed with
`gltf-transform optimize --simplify false`.
