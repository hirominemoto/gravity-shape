// 銀河衝突:2 つの銀河の核(重い質点)と、その重力だけを感じる 16 万個の星(制限つき N 体計算)
// 固定の時間刻みで進めるので、何コマ目から計算しても必ず同じ結果になる
export const DT = 0.0156;
export function createSim(N1 = 80000, N2 = 80000) {
  const N = N1 + N2, pos = new Float32Array(N * 3), vel = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N);
  const M = [1, .75], MU = M[0] + M[1], EPS2 = .25 * .25, EPSC2 = 1.0;
  const core = [{ p: [0, 0, 0], v: [0, 0, 0] }, { p: [0, 0, 0], v: [0, 0, 0] }];
  const S = { N, pos, col, size, core, step: 0, sep: 0 };
  let seed = 1;
  const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(6.2832 * rnd());
  const rotX = (v, a) => [v[0], v[1] * Math.cos(a) - v[2] * Math.sin(a), v[1] * Math.sin(a) + v[2] * Math.cos(a)];
  const rotZ = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a), v[2]];

  S.reset = () => {
    seed = 20261111; S.step = 0;
    // ほぼ放物線の軌道で近づける(近点距離 q)
    const d0 = 11, q = 2.6, h = Math.sqrt(2 * MU * q) * .97, v = Math.sqrt(2 * MU / d0) * .93, vt = h / d0, vr = -Math.sqrt(v * v - vt * vt);
    core[0].p = [-M[1] / MU * d0, 0, 0]; core[1].p = [M[0] / MU * d0, 0, 0];
    core[0].v = [-M[1] / MU * vr, 0, -M[1] / MU * vt]; core[1].v = [M[0] / MU * vr, 0, M[0] / MU * vt];
    const tilt = [w => rotX(w, .3), w => rotZ(rotX(w, -.9), .5)], RMIN = [.35, .3], RMAX = [3.2, 2.6];
    let i = 0;
    for (let g = 0; g < 2; g++) {
      const e1 = tilt[g]([1, 0, 0]), e2 = tilt[g]([0, 0, -1]), en = tilt[g]([0, 1, 0]), n = g ? N2 : N1;
      for (let k = 0; k < n; k++, i++) {
        const f = Math.pow(rnd(), .8), r = RMIN[g] + (RMAX[g] - RMIN[g]) * f, th = rnd() * 6.2832, c = Math.cos(th), s = Math.sin(th);
        const vc = Math.sqrt(M[g] * r * r / Math.pow(r * r + EPS2, 1.5)), zz = gauss() * .035 * r, dv = () => 1 + gauss() * .025;
        for (let a = 0; a < 3; a++) {
          pos[i * 3 + a] = core[g].p[a] + r * (c * e1[a] + s * e2[a]) + zz * en[a];
          vel[i * 3 + a] = core[g].v[a] + vc * dv() * (-s * e1[a] + c * e2[a]);
        }
        const b = .35 + 1.3 * Math.pow(rnd(), 3), ff = Math.pow(f, .7);
        const ca = g ? [1, .8, .55] : [1, .86, .62], cb = g ? [1, .45, .4] : [.45, .65, 1];
        for (let a = 0; a < 3; a++) col[i * 3 + a] = (ca[a] + (cb[a] - ca[a]) * ff) * b;
        size[i] = .035 + .05 * Math.pow(rnd(), 4);
      }
    }
  };

  const stepOnce = () => {
    // 核どうし:やわらげた重力+近づいたときの力学的摩擦(合体させる)
    const a = core[0], b = core[1], dx = b.p[0] - a.p[0], dy = b.p[1] - a.p[1], dz = b.p[2] - a.p[2], r2 = dx * dx + dy * dy + dz * dz, inv = 1 / Math.pow(r2 + EPSC2, 1.5);
    const sep = Math.sqrt(r2), fr = .07 * Math.exp(-sep * sep / 9);
    const d = [dx, dy, dz];
    for (let k = 0; k < 3; k++) { const rv = b.v[k] - a.v[k]; a.v[k] += (M[1] * d[k] * inv + fr * rv * M[1] / MU) * DT; b.v[k] += (-M[0] * d[k] * inv - fr * rv * M[0] / MU) * DT; }
    for (let k = 0; k < 3; k++) { a.p[k] += a.v[k] * DT; b.p[k] += b.v[k] * DT; }
    const ax = a.p[0], ay = a.p[1], az = a.p[2], bx = b.p[0], by = b.p[1], bz = b.p[2], m0 = M[0] * DT, m1 = M[1] * DT;
    for (let i = 0, j = 0; i < N; i++, j += 3) {
      const x = pos[j], y = pos[j + 1], z = pos[j + 2];
      let ux = ax - x, uy = ay - y, uz = az - z, q2 = ux * ux + uy * uy + uz * uz + EPS2, w = m0 / (q2 * Math.sqrt(q2));
      let vx = vel[j] + ux * w, vy = vel[j + 1] + uy * w, vz = vel[j + 2] + uz * w;
      ux = bx - x; uy = by - y; uz = bz - z; q2 = ux * ux + uy * uy + uz * uz + EPS2; w = m1 / (q2 * Math.sqrt(q2));
      vx += ux * w; vy += uy * w; vz += uz * w;
      vel[j] = vx; vel[j + 1] = vy; vel[j + 2] = vz; pos[j] = x + vx * DT; pos[j + 1] = y + vy * DT; pos[j + 2] = z + vz * DT;
    }
    S.sep = sep; S.step++;
  };
  S.advanceTo = target => { if (target < S.step) S.reset(); while (S.step < target) stepOnce(); };
  S.reset();
  return S;
}
// 映像の時刻(秒)→ シミュレーションの歩数。終盤は時間の流れをゆるめる
export const simSteps = t => Math.round(t <= 48 ? 0 : t <= 62 ? 300 * (t - 48) : t <= 66 ? 4200 + 300 * (t - 62) - 30 * (t - 62) ** 2 : 4920 + 60 * (t - 66));
