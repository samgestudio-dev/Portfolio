# Michelangelo's David — web LODs

Source: "Michelangelo's David" by Scan the World (MyMiniFactory #2052),
https://www.myminifactory.com/object/3d-print-michelangelo-s-david-in-florence-italy-2052
Original scan: 1,199,948 triangles, watertight, single shell.

Processing: STL Z-up → glTF Y-up, centred on X/Z, feet on y = 0, height = 1 unit.
Simplified with meshoptimizer (gltf-transform simplify, error 0.001), smooth normals,
quantized (normals 10-bit) and meshopt-compressed. Load with GLTFLoader + MeshoptDecoder.

| file          | triangles | size   | use                                   |
|---------------|-----------|--------|---------------------------------------|
| david-hi.glb  | 200k      | 821 KB | Fine Art close-up / zoom              |
| david-mid.glb | 80k       | 564 KB | homepage turntable (desktop + iPhone); carries `_FORMNORMAL` |
| david-lo.glb  | 30k       | 132 KB | first-paint placeholder / small tiles |

`david-mid.glb` also carries `_FORMNORMAL`: the scan's normal smoothed at muscle scale
(Gaussian-weighted plane fit over a ~6 cm ball, σ = 0.012 David-heights), baked by
`tools/formnormals.py`. The line study uses it for the cel tone and the muscle lines.
