import { buildLike } from './_world';
// Connectivité des rues de chaque ville : composantes (rues qui se touchent), longueur de chacune.
const a = +process.argv[2] || 0, b = +process.argv[3] || 0;
for (let s = a; s <= b; s++) {
  const { w, t, wp, roads: r } = buildLike(s); void w; void r;
  console.log(s === 0 ? 'défaut' : 'graine ' + s);
  for (const pl of wp.plans) {
    const S = pl.streets, par = S.map((_, i) => i), f = (i: number): number => (par[i] === i ? i : (par[i] = f(par[i])));
    const dseg = (px: number, pz: number, s2: typeof S[0]) => { let m = 1e9; for (let i = 1; i < s2.pts.length; i++) { const [ax, az] = s2.pts[i - 1], [bx, bz] = s2.pts[i], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1, u = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)); m = Math.min(m, Math.hypot(px - ax - dx * u, pz - az - dz * u)); } return m; };
    const inter = (A: typeof S[0], B: typeof S[0]) => { for (let i = 1; i < A.pts.length; i++) for (let j = 1; j < B.pts.length; j++) { const [p, q] = [A.pts[i - 1], A.pts[i]], [r, u] = [B.pts[j - 1], B.pts[j]]; const r1 = q[0] - p[0], r2 = q[1] - p[1], s1 = u[0] - r[0], s2 = u[1] - r[1], den = r1 * s2 - r2 * s1; if (Math.abs(den) < 1e-9) continue; const tt = ((r[0] - p[0]) * s2 - (r[1] - p[1]) * s1) / den, uu = ((r[0] - p[0]) * r2 - (r[1] - p[1]) * r1) / den; if (tt >= 0 && tt <= 1 && uu >= 0 && uu <= 1) return true; } return false; };
    for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) {
      const A = S[i], B = S[j]; let c = inter(A, B);
      if (!c) for (const e of [A.pts[0], A.pts[A.pts.length - 1]]) if (dseg(e[0], e[1], B) < 5) c = true;
      if (!c) for (const e of [B.pts[0], B.pts[B.pts.length - 1]]) if (dseg(e[0], e[1], A) < 5) c = true;
      if (c) par[f(i)] = f(j);
    }
    const len = new Map<number, number>(), pos = new Map<number, [number, number, number]>();
    S.forEach((st, i) => { let L = 0; for (let k = 1; k < st.pts.length; k++) L += Math.hypot(st.pts[k][0] - st.pts[k - 1][0], st.pts[k][1] - st.pts[k - 1][1]); const r = f(i); len.set(r, (len.get(r) ?? 0) + L); const p = pos.get(r) ?? [0, 0, 0]; pos.set(r, [p[0] + st.pts[0][0], p[1] + st.pts[0][1], p[2] + 1]); });
    const comps = [...len.entries()].sort((x, y) => y[1] - x[1]);
    console.log(`  ${pl.zone.name ?? pl.zone.kind} (${pl.zone.kind}, r=${pl.zone.r}) rues ${S.length}, composantes ${comps.length}: ${comps.map(([r, L]) => `${L.toFixed(0)}m@${(pos.get(r)![0] / pos.get(r)![2]).toFixed(0)},${(pos.get(r)![1] / pos.get(r)![2]).toFixed(0)}`).join(' ')}`);
  }
}
