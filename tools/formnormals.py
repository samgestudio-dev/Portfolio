"""Bake 'form normals' into the LOD: the normal of the scan smoothed at muscle scale
(Gaussian-weighted plane fit over a ball of radius ~sigma, David height = 1). Lines drawn
from these see pectorals, rectus abdominis, deltoids... but not pores or chisel marks.
usage: formnormals.py scan.stl lod.glb out.glb sigma"""
import sys, time, numpy as np, trimesh
from scipy.spatial import cKDTree
scan, lod, out, sigma = sys.argv[1], sys.argv[2], sys.argv[3], float(sys.argv[4])
t = time.time()
S = trimesh.load(scan, force='mesh')
V = S.vertices[:, [0, 2, 1]] * np.array([1, 1, -1.0])
V -= [(V[:, 0].min() + V[:, 0].max()) / 2, V[:, 1].min(), (V[:, 2].min() + V[:, 2].max()) / 2]
V /= V[:, 1].max()
Q = V[np.random.default_rng(0).choice(len(V), 200_000, replace=False)]
tree = cKDTree(Q)
M = trimesh.load(lod, force='mesh', process=False); M.merge_vertices()
P, N = M.vertices, M.vertex_normals
FN = np.zeros_like(P)
for s in range(0, len(P), 2000):
    nb = tree.query_ball_point(P[s:s+2000], 1.6 * sigma)
    for j, ids in enumerate(nb):
        i = s + j
        X = Q[ids]
        # keep the near sheet only: thin parts (fingers, sling) must not mix front and back
        X = X[(X - P[i]) @ N[i] > -0.6 * sigma]
        if len(X) < 8: FN[i] = N[i]; continue
        w = np.exp(-((X - P[i]) ** 2).sum(1) / (2 * sigma ** 2))
        mu = (X * w[:, None]).sum(0) / w.sum()
        D = (X - mu) * np.sqrt(w)[:, None]
        n = np.linalg.eigh(D.T @ D)[1][:, 0]
        FN[i] = n if n @ N[i] > 0 else -n
print(f'form normals sigma {sigma}: {time.time()-t:.0f}s, mean dev {np.degrees(np.arccos(np.clip((FN*N).sum(1),-1,1))).mean():.1f}°')
M.vertex_attributes['_FORMNORMAL'] = FN.astype(np.float32)
M.export(out, include_normals=True)
