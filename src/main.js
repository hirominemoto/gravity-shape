// 「重力のかたち」— 時刻 t(秒)を渡すと、その瞬間の宇宙が 1 コマ描かれる
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import * as SH from './shaders.js';
import { createSim, simSteps } from './sim.js';

const FPS = 30, DUR = 108, TOTAL = FPS * DUR, W = 1920, H = 1080, TANF = .45, RAD = Math.PI / 180;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const P = (t, a, b) => clamp((t - a) / (b - a));
const ss = (t, a, b) => { const x = P(t, a, b); return x * x * (3 - 2 * x); };
const lerp = (a, b, x) => a + (b - a) * x;
const $ = id => document.getElementById(id);
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
// キーフレームをなめらかにつなぐ(Catmull-Rom)
function keys(K) {
  return t => {
    let i = 0; while (i < K.length - 2 && t > K[i + 1][0]) i++;
    const a = K[Math.max(i - 1, 0)], b = K[i], c = K[i + 1], d = K[Math.min(i + 2, K.length - 1)], u = clamp((t - b[0]) / (c[0] - b[0])), u2 = u * u, u3 = u2 * u, out = [];
    for (let k = 1; k < b.length; k++) { const m1 = (c[k] - a[k]) / (c[0] - a[0]) * (c[0] - b[0]), m2 = (d[k] - b[k]) / (d[0] - b[0]) * (c[0] - b[0]); out.push((2 * u3 - 3 * u2 + 1) * b[k] + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * c[k] + (u3 - u2) * m2); }
    return out;
  };
}

// ---------- 描画の土台 ----------
const renderer = new THREE.WebGLRenderer({ canvas: $('gl'), antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1); renderer.setSize(W, H, false); renderer.autoClear = false;
const rtOpt = { type: THREE.HalfFloatType, depthBuffer: false };
const rtA = new THREE.WebGLRenderTarget(W, H, rtOpt), rtB = new THREE.WebGLRenderTarget(W, H, rtOpt);
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(W, H, rtOpt));
const mixPass = new ShaderPass(new THREE.ShaderMaterial({ uniforms: { tA: { value: rtA.texture }, tB: { value: rtB.texture }, uMix: { value: 0 } }, vertexShader: SH.QUAD_VS, fragmentShader: SH.MIX_FS }), 'none');
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), .9, .75, 1);
const finalPass = new ShaderPass(new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null }, uExp: { value: 1 }, uFade: { value: 1 }, uFlash: { value: 0 }, uStreak: { value: 0 }, uCA: { value: .0015 }, uFrame: { value: 0 } }, vertexShader: SH.QUAD_VS, fragmentShader: SH.FINAL_FS }));
composer.addPass(mixPass); composer.addPass(bloom); composer.addPass(finalPass);
const FU = finalPass.material.uniforms;

const quadGeo = new THREE.PlaneGeometry(2, 2), dummyCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const camU = () => ({ uCam: { value: new THREE.Vector3() }, uCamM: { value: new THREE.Matrix3() }, uTanF: { value: TANF }, uTime: { value: 0 } });
function quad(fs, extra) { const m = new THREE.Mesh(quadGeo, new THREE.ShaderMaterial({ uniforms: { ...camU(), ...extra }, vertexShader: SH.QUAD_VS, fragmentShader: fs, depthTest: false, depthWrite: false })); m.frustumCulled = false; m.renderOrder = -1; return m; }
const V = (x, y, z) => new THREE.Vector3(x, y, z), tmpF = V(), tmpR = V(), tmpU = V(), UP = V(0, 1, 0);
// カメラの位置・向き・傾きをシェーダーに渡す
function aim(u, pos, target, roll = 0) {
  tmpF.subVectors(target, pos).normalize(); tmpR.crossVectors(tmpF, UP).normalize(); tmpU.crossVectors(tmpR, tmpF);
  if (roll) { const c = Math.cos(roll), s = Math.sin(roll), r = tmpR.clone(), up = tmpU.clone(); tmpR.copy(r).multiplyScalar(c).addScaledVector(up, s); tmpU.copy(up).multiplyScalar(c).addScaledVector(r, -s); }
  u.uCam.value.copy(pos); u.uCamM.value.set(tmpR.x, tmpU.x, tmpF.x, tmpR.y, tmpU.y, tmpF.y, tmpR.z, tmpU.z, tmpF.z);
}
const sphV = (az, el, r) => V(Math.cos(el) * Math.cos(az) * r, Math.sin(el) * r, Math.cos(el) * Math.sin(az) * r);

// ---------- 場面 A:惑星の夜明け ----------
const SA = { scene: new THREE.Scene(), camera: dummyCam };
{
  const m = quad(SH.PLANET_FS, { uSun: { value: V(0, 0, -1) }, uMoon: { value: V() } }); SA.scene.add(m); const u = m.material.uniforms;
  const phi = keys([[-1, 3], [0, 4.5], [6, 19.2], [11, 52], [17, 104]]);
  SA.update = t => {
    const f = phi(t)[0] * RAD, e = 4 * RAD, R = lerp(3.0, 3.7, ss(t, 4, 17));
    const pos = V(Math.sin(f) * Math.cos(e) * R, Math.sin(e) * R, Math.cos(f) * Math.cos(e) * R);
    aim(u, pos, V(lerp(.78, .15, ss(t, 5, 15)), lerp(.1, 0, ss(t, 5, 15)), 0), lerp(-.16, -.05, ss(t, 0, 16)));
    u.uTime.value = t; u.uMoon.value.set(1.75 + t * .012, .42, -.9 + t * .05);
  };
}

// ---------- 場面 B:巨大ガス惑星と環 ----------
const SB = { scene: new THREE.Scene(), camera: dummyCam };
{
  const m = quad(SH.GIANT_FS, { uSun: { value: sphV(170 * RAD, 14 * RAD, 1) }, uM1: { value: V() }, uM2: { value: V() } }); SB.scene.add(m); const u = m.material.uniforms;
  const path = keys([[14, 196, 34, 10], [15.25, 200, 32, 9], [20, 226, 22, 6.2], [25, 262, 6, 4.3], [27, 278, -1.5, 3.9], [30, 300, -9, 4.6], [32.75, 316, -12, 16], [34, 320, -12, 24]]);
  SB.update = t => {
    const [az, el, d] = path(t);
    aim(u, sphV(az * RAD, el * RAD, d), V(0, lerp(-.15, .1, ss(t, 16, 30)), 0), .24);
    u.uTime.value = t;
    u.uM1.value.copy(sphV(1.1 + t * .11, 0, 3.15)); u.uM2.value.copy(sphV(4.6 + t * .06, .03, 4.3));   // ケプラーの第3法則どおりの速さで回る衛星
  };
}

// ---------- 場面 C:渦巻銀河(42 万個の星)----------
const SC = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(2 * Math.atan(TANF) / RAD, W / H, .01, 500) };
const skyC = quad(SH.SKY_FS, { uBand: { value: 0 }, uGain: { value: .55 } });
{
  const r = rng(77), gauss = () => Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(6.2832 * r());
  const N = 420000, aP = new Float32Array(N * 4), aC = new Float32Array(N * 3), aS = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let R, th, z, c, s = .03, b = .25 + 1.5 * Math.pow(r(), 4);
    if (r() < .12) { R = Math.abs(gauss()) * .8; th = r() * 6.2832; z = gauss() * .42 * Math.exp(-R * .35); c = [1, .78, .5]; b *= .15; }
    else {
      R = Math.min(-Math.log(1 - r() * .985) * 3.0, 15.5); let arm = r() < .5 ? 0 : Math.PI; if (r() < .28) arm += Math.PI / 2;
      const inArm = r() < .64, spread = inArm ? .3 : 1.4;
      th = arm + 3.2 * Math.log(1 + R / 1.2) + gauss() * spread * (1.2 / (1 + R * .1)) + .12 * Math.sin(R * 2.7 + arm * 3); z = gauss() * .09 * (1 + R * .04);
      c = inArm ? [.62 + r() * .15, .76, 1] : [1, .88, .7];
      if (inArm && r() < .025) { c = [1, .3, .45]; s = .07; b = 1.6; } else if (inArm && r() < .02) { c = [.6, .75, 1]; s = .055; b = 4; }
    }
    aP.set([R, th, z, r()], i * 4); aC.set([c[0] * b, c[1] * b, c[2] * b], i * 3); aS[i] = s * (.7 + r() * .6);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3)); g.setAttribute('aP', new THREE.BufferAttribute(aP, 4)); g.setAttribute('aCol', new THREE.BufferAttribute(aC, 3)); g.setAttribute('aSize', new THREE.BufferAttribute(aS, 1));
  const uni = { uT: { value: 0 }, uPx: { value: H / (2 * TANF) }, uGain: { value: .15 } };
  const starsM = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: uni, vertexShader: SH.GAL_VS, fragmentShader: SH.PT_FS, blending: THREE.AdditiveBlending, transparent: true, depthTest: false, depthWrite: false })); starsM.frustumCulled = false;
  // 暗黒星雲(腕の内側に沿って星の光をさえぎる)
  const ND = 60000, dP = new Float32Array(ND * 4), dC = new Float32Array(ND * 3), dS = new Float32Array(ND);
  for (let i = 0; i < ND; i++) { const R = 1.2 + 11 * Math.pow(r(), .8), arm = (r() < .5 ? 0 : Math.PI) + (r() < .25 ? Math.PI / 2 : 0); dP.set([R, arm + 3.2 * Math.log(1 + R / 1.2) - .2 + gauss() * .09, gauss() * .03, 0], i * 4); dC.set([1, 1, 1], i * 3); dS[i] = .22 + r() * .25; }
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ND * 3), 3)); dg.setAttribute('aP', new THREE.BufferAttribute(dP, 4)); dg.setAttribute('aCol', new THREE.BufferAttribute(dC, 3)); dg.setAttribute('aSize', new THREE.BufferAttribute(dS, 1));
  const dust = new THREE.Points(dg, new THREE.ShaderMaterial({ uniforms: { uT: uni.uT, uPx: uni.uPx, uGain: { value: 1 } }, vertexShader: SH.GAL_VS, fragmentShader: SH.DUST_FS, blending: THREE.CustomBlending, blendSrc: THREE.ZeroFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor, transparent: true, depthTest: false, depthWrite: false })); dust.frustumCulled = false; dust.renderOrder = 2; starsM.renderOrder = 1;
  SC.scene.add(skyC, starsM, dust);
  const path = keys([[30, 7.3, .02, -1.2, 6.2, 0, 3.2], [31.5, 7.1, .035, .2, 5.4, 0, 4.2], [35.5, 9.2, 2.0, 2.6, 2, 0, 1.2], [40.5, 10, 7.0, 6.5, 0, 0, 0], [45.5, 4, 10.5, 13, 0, 0, 0], [48.75, 12, 40, 46, 0, 0, 0], [50, 14, 46, 52, 0, 0, 0]]);
  SC.update = t => {
    const [x, y, z, tx, ty, tz] = path(t); SC.camera.position.set(x, y, z); SC.camera.up.set(0, 1, 0); SC.camera.lookAt(tx, ty, tz); SC.camera.updateMatrixWorld();
    aim(skyC.material.uniforms, SC.camera.position, V(tx, ty, tz)); uni.uT.value = t - 30;
  };
}

// ---------- 場面 D:銀河の衝突と合体(16 万体の重力計算)----------
const SD = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(2 * Math.atan(TANF) / RAD, W / H, .01, 500) };
const sim = createSim(), skyD = quad(SH.SKY_FS, { uBand: { value: 0 }, uGain: { value: .5 } });
{
  const g = new THREE.BufferGeometry(), pa = new THREE.BufferAttribute(sim.pos, 3); pa.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('position', pa); g.setAttribute('aCol', new THREE.BufferAttribute(sim.col, 3)); g.setAttribute('aSize', new THREE.BufferAttribute(sim.size, 1));
  const uni = { uPx: { value: H / (2 * TANF) }, uGain: { value: .55 } };
  const pts = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: uni, vertexShader: SH.SIM_VS, fragmentShader: SH.PT_FS, blending: THREE.AdditiveBlending, transparent: true, depthTest: false, depthWrite: false })); pts.frustumCulled = false;
  // 2 つの核の輝き
  const cg = new THREE.BufferGeometry(), cp = new Float32Array(6); cg.setAttribute('position', new THREE.BufferAttribute(cp, 3)); cg.setAttribute('aCol', new THREE.BufferAttribute(new Float32Array([1, .85, .6, 1, .75, .5]), 3)); cg.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array([.75, .65]), 1));
  const cores = new THREE.Points(cg, new THREE.ShaderMaterial({ uniforms: { uPx: uni.uPx, uGain: { value: 2.6 } }, vertexShader: SH.SIM_VS, fragmentShader: SH.PT_FS, blending: THREE.AdditiveBlending, transparent: true, depthTest: false, depthWrite: false })); cores.frustumCulled = false;
  SD.scene.add(skyD, pts, cores);
  SD.update = t => {
    sim.advanceTo(simSteps(t)); pa.needsUpdate = true;
    const a = sim.core[0].p, b = sim.core[1].p; cp.set([a[0], a[1], a[2], b[0], b[1], b[2]]); cg.attributes.position.needsUpdate = true;
    const dive = ss(t, 63.5, 70), k = Math.pow(dive, .7), cx = lerp(0, a[0], k), cy = lerp(0, a[1], k), cz = lerp(0, a[2], k);
    const az = .5 + (t - 48) * .045, el = lerp(52, 30, ss(t, 56, 68)) * RAD, d = lerp(25, 16, ss(t, 47, 62)) * Math.pow(.012, dive);
    SD.camera.position.set(cx + Math.cos(el) * Math.cos(az) * d, cy + Math.sin(el) * d, cz + Math.cos(el) * Math.sin(az) * d); SD.camera.up.set(0, 1, 0); SD.camera.lookAt(cx, cy, cz); SD.camera.updateMatrixWorld();
    aim(skyD.material.uniforms, SD.camera.position, V(cx, cy, cz)); uni.uGain.value = lerp(.55, .16, dive);
  };
}

// ---------- 場面 F:ブラックホール ----------
const SF = { scene: new THREE.Scene(), camera: dummyCam };
{
  const m = quad(SH.BH_FS, { uT: { value: 0 }, uStar: { value: V() } }); SF.scene.add(m); const u = m.material.uniforms;
  //            時刻  log(距離)        仰角  方位
  const path = keys([[68, Math.log(94), 23, -8], [70, Math.log(81), 22, 0], [78, Math.log(29), 20, 25], [84, Math.log(16), 6, 70], [90, Math.log(14), 3.5, 115], [95, Math.log(10), 9, 150], [99, Math.log(3.2), 6.5, 185], [101, Math.log(.7), 4, 200], [102.2, Math.log(.12), 3, 206], [102.8, Math.log(.03), 3, 208], [103.5, Math.log(.006), 3, 210], [104.3, Math.log(.0015), 3, 212], [105.2, Math.log(.0004), 3, 213], [106.5, Math.log(.0003), 3, 214]]);
  SF.update = t => {
    const [lr, el, az] = path(t), pos = sphV(az * RAD, el * RAD, 1 + Math.exp(lr));
    const k = ss(t, 99.4, 101.1), pn = pos.clone().normalize(), s = Math.sin(Math.PI * k);
    const tgt = k > 0 ? pos.clone().addScaledVector(pn, 2 * k - 1).addScaledVector(V(-pn.z, 0, pn.x).normalize(), s * 1.2).addScaledVector(UP, s * .25) : V(0, lerp(0, -.25, ss(t, 78, 90)) * (1 - ss(t, 92, 98)), 0);
    aim(u, pos, tgt, lerp(.1, -.06, ss(t, 70, 96)));
    u.uTime.value = t; u.uT.value = t * 10;
    const sa = (272 - 5.8 * (t - 87.2)) * RAD; u.uStar.value.set(Math.cos(sa) * 17, Math.sin(sa + .6) * 1.1, Math.sin(sa) * 17);   // 円盤の外を回る青い星
  };
}

// ---------- 場面の出入りと仕上げ ----------
const SCENES = [[SA, -2, -1, 15.25, 16.75], [SB, 15.25, 16.75, 31.5, 32.75], [SC, 31.5, 32.75, 47.25, 48.75], [SD, 47.25, 48.75, 70, 70.001], [SF, 70, 70.001, 999, 1000]];
const title = $('title'), credit = $('credit');
function renderAt(t) {
  const act = []; for (const [s, a, b, c, d] of SCENES) { const w = ss(t, a, b) * (1 - ss(t, c, d)); if (w > .0005) act.push([s, w]); }
  act.slice(0, 2).forEach(([s], i) => { s.update(t); renderer.setRenderTarget(i ? rtB : rtA); renderer.clear(); renderer.render(s.scene, s.camera); });
  mixPass.material.uniforms.uMix.value = act.length > 1 ? act[1][1] / (act[0][1] + act[1][1]) : 0;
  // 露出・光のにじみ・速度感
  bloom.strength = t < 32 ? .55 : t < 70 ? .62 : .5;
  FU.uExp.value = t < 70 ? 1 + .6 * ss(t, 68.6, 70) : 1 + 1.6 * ss(t, 101.2, 104.2);
  FU.uStreak.value = t < 70 ? .2 * ss(t, 66, 69.6) : .1 * ss(t, 98.5, 100.5) * (1 - .6 * ss(t, 101, 102.5)) + .2 * (1 - ss(t, 70, 72.5));
  FU.uFlash.value = t < 70 ? Math.pow(ss(t, 69, 70), 2) : 1 - ss(t, 70, 71.5);
  FU.uCA.value = .0015 + .004 * ss(t, 98, 102);
  FU.uFade.value = ss(t, .2, 2.5) * (1 - ss(t, 104.2, 105.2)); FU.uFrame.value = Math.round(t * FPS);
  renderer.setRenderTarget(null); composer.render();
  title.style.opacity = ss(t, 9.2, 11) * (1 - ss(t, 14.2, 15.6)); title.style.letterSpacing = lerp(.42, .52, P(t, 9, 16)) + 'em';
  credit.style.opacity = ss(t, 105.4, 106.2) * (1 - ss(t, 107.3, 107.9));
}
window.renderAt = renderAt; window.TOTAL = TOTAL; window.FPS = FPS;

// ---------- ブラウザでそのまま再生(撮影時は ?capture) ----------
function fit() { const s = Math.min(innerWidth / W, innerHeight / H); $('stage').style.transform = `translate(${(innerWidth - W * s) / 2}px,${(innerHeight - H * s) / 2}px) scale(${s})`; }
addEventListener('resize', fit); fit(); renderAt(0); window.ready = true;
if (!location.search.includes('capture')) {
  const au = $('au'), pl = $('play'); pl.style.display = 'flex';
  pl.onclick = () => {
    pl.style.display = 'none'; const t0 = performance.now(); let useAu = true; au.currentTime = 0; au.play().catch(() => { useAu = false; });
    const loop = () => { const t = useAu && !au.paused ? au.currentTime : (performance.now() - t0) / 1000; if (t >= DUR - .05 || au.ended) { renderAt(DUR - .01); pl.style.display = 'flex'; return; } renderAt(t); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  };
}
