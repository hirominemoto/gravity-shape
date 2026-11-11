// すべての画素を数式で描くためのシェーダー(GLSL)
export const QUAD_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`;

const COMMON = `
precision highp float;
varying vec2 vUv;
uniform vec3 uCam; uniform mat3 uCamM; uniform float uTanF, uTime;
float hash11(float p){ p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash13(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
vec3 hash33(vec3 p3){ p3 = fract(p3 * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yxx) * p3.zyx); }
float noise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3. - 2. * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p){ float a = .5, s = 0.; for(int i = 0; i < 6; i++){ s += a * noise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= .5; } return s; }
float fbm4(vec3 p){ float a = .5, s = 0.; for(int i = 0; i < 4; i++){ s += a * noise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= .5; } return s; }
float n1(float x){ float i = floor(x), f = fract(x); f = f * f * (3. - 2. * f); return mix(hash11(i), hash11(i + 1.), f); }
mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
vec2 sph(vec3 ro, vec3 rd, vec3 c, float R){ vec3 o = ro - c; float b = dot(o, rd), cc = dot(o, o) - R * R, h = b * b - cc; if(h < 0.) return vec2(-1.); h = sqrt(h); return vec2(-b - h, -b + h); }
// 星空:方向ベクトルから星を決める。光が曲がれば星の像も一緒に歪む
vec3 starLayer(vec3 d, float S, float dens, float sig){
  vec3 p = d * S, ip = floor(p); if(hash13(ip + 1.3) > dens) return vec3(0.);
  vec3 sp = ip + .2 + .6 * hash33(ip + 11.7); float dd = length(p - sp);
  float mag = pow(hash13(ip + 3.1), 7.) * 7. + .05;
  vec3 c = mix(vec3(1., .7, .45), vec3(.7, .82, 1.), hash13(ip + 5.7)); c = mix(c, vec3(1.), .35);
  return c * mag * exp(-dd * dd / (sig * sig));
}
const mat3 BAND = mat3(.80, .52, -.30, -.42, .83, .36, .43, -.16, .89);
vec3 stars(vec3 d, float band){
  vec3 c = starLayer(d, 110., .1, .11) + starLayer(d, 230., .16, .2) * .4;
  if(band > 0.){
    vec3 bd = BAND * d; float b = exp(-bd.y * bd.y * 12.);
    float n = fbm(bd * 4. + 2.), n2 = fbm(bd * 9. + 3.);
    vec3 mw = mix(vec3(.75, .8, 1.), vec3(1., .8, .6), n) * b * (.05 + .55 * n * n);
    mw *= 1. - .9 * smoothstep(.42, .68, n2) * exp(-bd.y * bd.y * 50.);
    c += (mw * .4 + starLayer(d, 420., .5, .32) * .22 * (.1 + b * 3.)) * band;
  }
  return c;
}
vec3 ray(out vec2 p){ p = vUv * 2. - 1.; p.x *= 16. / 9.; return normalize(uCamM * vec3(p * uTanF, 1.)); }
`;

// ── 星空だけ(銀河の場面の背景) ──
export const SKY_FS = COMMON + `
uniform float uBand, uGain;
void main(){ vec2 p; vec3 rd = ray(p); if(abs(p.y) > .76){ gl_FragColor = vec4(0.); return; } gl_FragColor = vec4(stars(rd, uBand) * uGain, 1.); }`;

// ── 岩石惑星:海・大陸・雲・大気・夜の街明かり ──
export const PLANET_FS = COMMON + `
uniform vec3 uSun, uMoon;
float terr(vec3 q){ return fbm(q * 1.7 + .35 * fbm4(q * 2. + 5.) + vec3(3., 1., 7.)); }
float cloud(vec3 c){ return fbm(c * 3.4 + 1.3 * fbm4(c * 2. + uTime * .012)); }
vec3 shade(vec3 n, vec3 rd){
  float ang = uTime * .012; vec3 q = n; q.xz = rot(ang) * q.xz; vec3 sq = uSun; sq.xz = rot(ang) * sq.xz;
  float h = terr(q), land = smoothstep(.535, .55, h), lat = abs(q.y), moist = fbm4(q * 3. + 20.);
  vec3 lc = mix(vec3(.05, .14, .03), vec3(.34, .24, .11), smoothstep(.42, .62, moist + (1. - lat) * .25 - .12));
  lc = mix(lc, vec3(.24, .2, .17), smoothstep(.62, .7, h)); lc = mix(lc, vec3(.85), smoothstep(.7, .76, h));
  float ice = smoothstep(.8, .88, lat + (h - .5) * .5);
  vec3 oc = mix(vec3(.003, .018, .07), vec3(.01, .1, .15), smoothstep(.44, .535, h));
  vec3 alb = mix(mix(oc, lc, land), vec3(.8, .86, .92), ice);
  float ndl = dot(n, uSun);
  float bump = clamp((h - terr(normalize(q + sq * .012))) * 16., -1., 1.) * land;
  float dif = clamp(ndl + bump * .4 * smoothstep(-.1, .3, ndl), 0., 1.);
  ang = uTime * .02 + 1.; vec3 cq = n; cq.xz = rot(ang) * cq.xz; vec3 sc = uSun; sc.xz = rot(ang) * sc.xz;
  float cm = smoothstep(.5, .72, cloud(cq)), csh = smoothstep(.5, .72, cloud(normalize(cq + sc * .03)));
  vec3 sunCol = mix(vec3(1., .4, .15), vec3(1., .96, .9), smoothstep(0., .35, ndl));
  vec3 col = alb * dif * sunCol * (1. - .6 * csh * (1. - cm)) * 1.25;
  float sp = pow(max(dot(n, normalize(uSun - rd)), 0.), 110.) * (1. - land) * (1. - ice) * (1. - cm);
  col += sunCol * sp * 4. * step(0., ndl);
  col = mix(col, vec3(1.) * sunCol * clamp(ndl * 1.2 + .06, 0., 1.) * 1.15, cm * .93);
  float night = smoothstep(.02, -.2, ndl);
  float city = smoothstep(.5, .66, fbm4(q * 9. + 40.)) * smoothstep(.6, .9, noise(q * 270.)) * land * (1. - ice);
  col += vec3(1., .6, .22) * city * night * (1. - cm) * 2.2;
  float fr = pow(1. - max(dot(n, -rd), 0.), 3.5);
  vec3 atm = mix(vec3(1., .36, .1), vec3(.22, .48, 1.), smoothstep(-.05, .3, ndl));
  col += atm * fr * smoothstep(-.28, .15, ndl) * 1.7 + vec3(.22, .48, 1.) * .07 * clamp(ndl, 0., 1.);
  return col;
}
void main(){
  vec2 p; vec3 rd = ray(p); if(abs(p.y) > .76){ gl_FragColor = vec4(0.); return; }
  vec3 ro = uCam; vec2 tp = sph(ro, rd, vec3(0.), 1.), tm = sph(ro, rd, uMoon, .09);
  vec3 col;
  if(tm.x > 0. && (tp.x < 0. || tm.x < tp.x)){
    vec3 n = normalize(ro + rd * tm.x - uMoon); float c = fbm(n * 5. + 9.);
    col = vec3(.5, .48, .45) * (.55 + .7 * c) * max(dot(n, uSun), 0.) * 1.5 + vec3(.02, .03, .05) * max(dot(n, -normalize(uMoon)), 0.);
  } else if(tp.x > 0.){
    col = shade(normalize(ro + rd * tp.x), rd);
  } else {
    col = stars(rd, 1.) * .8;
    float sd = max(dot(rd, uSun), 0.);
    col += vec3(1., .93, .82) * (smoothstep(.99988, .99994, sd) * 90. + pow(sd, 4000.) * 12. + pow(sd, 300.) * .55 + pow(sd, 20.) * .05);
    float tc = max(-dot(ro, rd), 0.); vec3 pc = ro + rd * tc; float alt = length(pc) - 1.;
    float halo = exp(-max(alt, 0.) / .028), l = dot(normalize(pc), uSun);
    col += vec3(.22, .5, 1.) * halo * smoothstep(-.3, .1, l) * 1.0;
    col += mix(vec3(1., .4, .12), vec3(1., .85, .7), pow(sd, 60.)) * halo * pow(sd, 10.) * 3.2;
  }
  gl_FragColor = vec4(col, 1.);
}`;

// ── 巨大ガス惑星と環:縞の乱流、大赤斑、環の影、衛星 ──
export const GIANT_FS = COMMON + `
uniform vec3 uSun, uM1, uM2;
float ringD(float r){
  float d = smoothstep(1.28, 1.4, r) * smoothstep(2.56, 2.48, r);
  d *= .22 + .78 * n1(r * 14. + 2.); d *= .5 + .5 * n1(r * 55.); d *= .82 + .18 * n1(r * 180.);
  d *= 1. - .92 * smoothstep(.035, 0., abs(r - 1.98)); d *= 1. - .7 * smoothstep(.014, 0., abs(r - 2.33));
  d *= mix(.3, 1., smoothstep(1.4, 1.62, r));
  return clamp(d * 1.35, 0., 1.);
}
float moonSh(vec3 p, vec3 m, float R){ vec3 d = m - p; float t = dot(d, uSun); if(t < 0.) return 1.; return smoothstep(R * .6, R * 1.5, length(d - uSun * t)); }
vec3 giant(vec3 n, vec3 rd){
  float lat = n.y; vec3 q = n; q.xz = rot(uTime * (.03 + .025 * sin(lat * 11.))) * q.xz;
  float t1 = fbm(q * vec3(2.5, 7., 2.5) + 3.), t2 = fbm(q * vec3(7., 22., 7.) + uTime * .01);
  float b = lat * 6.5 + (t1 - .5) * 1.7 + (t2 - .5) * .55;
  float S = 2.4 - uTime * .03; vec3 c = normalize(vec3(cos(S), -.36, sin(S)));
  vec3 east = normalize(cross(vec3(0., 1., 0.), c)), north = cross(c, east), dv = n - c;
  vec2 e = vec2(dot(dv, east) / .2, dot(dv, north) / .1); float el = length(e), sw = exp(-el * el);
  b += sw * sin(atan(e.y, e.x) * 2. + el * 5. - uTime * .6) * .25;
  float s1 = .5 + .5 * sin(b * 6.283), s2 = .5 + .5 * sin(b * 2.7 + 1.3);
  vec3 col = mix(mix(vec3(.8, .68, .5), vec3(.55, .35, .2), s1), mix(vec3(.88, .84, .76), vec3(.42, .27, .2), s1), s2 * .7);
  col = mix(col, vec3(.75, .27, .12), smoothstep(1., .2, el) * .85);
  col = mix(col, vec3(.3, .42, .6), smoothstep(.72, .95, abs(lat)) * .65);
  col *= .8 + .4 * t2;
  float ndl = dot(n, uSun), dif = smoothstep(-.06, .85, ndl);
  vec3 P = n; float sh = 1.;
  if(uSun.y * P.y < 0.){ float t = -P.y / uSun.y; vec3 h = P + uSun * t; sh = 1. - .82 * ringD(length(h.xz)); }
  sh *= moonSh(P, uM1, .06) * moonSh(P, uM2, .085);
  col = col * dif * sh * mix(vec3(1., .6, .35), vec3(1.), smoothstep(0., .4, ndl)) * 1.1;
  float fr = pow(1. - max(dot(n, -rd), 0.), 4.);
  col += vec3(.5, .6, .9) * fr * smoothstep(-.2, .2, ndl) * .5;
  return col;
}
vec3 moonCol(vec3 ro, vec3 rd, float t, vec3 m){ vec3 n = normalize(ro + rd * t - m); return vec3(.6, .57, .52) * (.6 + .6 * fbm4(n * 6.)) * max(dot(n, uSun), 0.) * 1.4; }
void main(){
  vec2 p; vec3 rd = ray(p); if(abs(p.y) > .76){ gl_FragColor = vec4(0.); return; }
  vec3 ro = uCam; vec2 tp = sph(ro, rd, vec3(0.), 1.), ta = sph(ro, rd, uM1, .06), tb = sph(ro, rd, uM2, .085);
  float tHit = 1e9; vec3 col = stars(rd, 1.) * .7;
  float sd = max(dot(rd, uSun), 0.);
  col += vec3(1., .94, .85) * (smoothstep(.99996, .99998, sd) * 90. + pow(sd, 9000.) * 10. + pow(sd, 500.) * .35 + pow(sd, 30.) * .03);
  if(tp.x > 0.){ tHit = tp.x; col = giant(normalize(ro + rd * tp.x), rd); }
  if(ta.x > 0. && ta.x < tHit){ tHit = ta.x; col = moonCol(ro, rd, ta.x, uM1); }
  if(tb.x > 0. && tb.x < tHit){ tHit = tb.x; col = moonCol(ro, rd, tb.x, uM2); }
  float tr = -ro.y / rd.y;
  if(tr > 0. && tr < tHit){
    vec3 h = ro + rd * tr; float r = length(h.xz), d = ringD(r);
    if(d > 0.){
      vec2 ts = sph(h, uSun, vec3(0.), 1.); float lit = 1.;
      if(ts.y > 0.){ float b = dot(h, uSun); lit = smoothstep(.985, 1.02, length(h - uSun * b)); }
      lit *= moonSh(h, uM1, .06) * moonSh(h, uM2, .085);
      vec3 rc = mix(vec3(.7, .58, .44), vec3(.95, .9, .82), n1(r * 9. + 5.));
      float same = step(0., uSun.y * ro.y), I = mix(4. * d * (1. - d) * .8 + .05, .25 + .75 * d, same);
      float fw = pow(sd, 5.) * 2.5 * (1. - same * .7);
      float a = d * mix(.85, 1., same) * smoothstep(0., .02, abs(rd.y) * tr + .01);
      col = mix(col, rc * (I * (1. + fw) * lit * .78 + .008), a);
    }
  }
  gl_FragColor = vec4(col, 1.);
}`;

// ── ブラックホール:シュワルツシルト時空の中で、光の道筋を 1 画素ずつ積分する ──
// 単位はシュワルツシルト半径 = 1(事象の地平面 r=1、光子球 r=1.5、最内安定円軌道 r=3)
export const BH_FS = COMMON + `
uniform float uT; uniform vec3 uStar;
vec3 bb(float t){ t = clamp(t, 0., 2.2);
  vec3 c = mix(vec3(1., .1, .005), vec3(1., .42, .08), smoothstep(0., .45, t));
  c = mix(c, vec3(1., .8, .5), smoothstep(.35, .85, t)); return mix(c, vec3(.8, .9, 1.35), smoothstep(.8, 1.7, t)); }
vec4 disk(vec3 p, vec3 v){
  float r = length(p.xz); if(r < 2.6 || r > 14.) return vec4(0.);
  float edge = smoothstep(2.6, 3.3, r) * smoothstep(14., 8.5, r), w = sqrt(.5 / (r * r * r)), ph = atan(p.z, p.x), dens = 0.;
  for(int k = 0; k < 2; k++){
    float tk = mod(uT + float(k) * 30., 60.), wt = 1. - abs(tk / 30. - 1.), a = ph + w * (tk + 40.);
    vec3 q = vec3(r * cos(a), r * sin(a), float(k) * 7.3);
    dens += wt * (fbm(q * .8) * .65 + fbm4(q * 3.1) * .35);
  }
  dens = smoothstep(.27, .72, dens); dens = (dens * dens * 1.5 + .1) * (.68 + .32 * n1(r * 9.));
  float beta = sqrt(.5 / (r - 1.)), gam = 1. / sqrt(1. - beta * beta);
  float cs = dot(vec3(sin(ph), 0., -cos(ph)), -normalize(v));
  float g = sqrt(1. - 1. / r) / (gam * (1. - beta * cs));          // ドップラー効果 × 重力赤方偏移
  vec3 c = bb(pow(3. / r, .75) * g * 1.08) * pow(3. / r, 2.2) * pow(g, 3.5) * dens * edge * 3.4;
  return vec4(c, clamp(dens * edge * 1.25, 0., .96));
}
void main(){
  vec2 p; vec3 v = ray(p); if(abs(p.y) > .76){ gl_FragColor = vec4(0.); return; }
  vec3 x = uCam, er = normalize(x); float vr0 = dot(v, er); v = normalize(v + er * vr0 * (sqrt(1. - 1. / length(x)) - 1.));
  vec3 hv = cross(x, v), col = vec3(0.); float h2 = dot(hv, hv), tr = 1., esc = 0.;
  float rEsc = max(length(uCam) * 1.05 + 2., 40.);
  for(int i = 0; i < 340; i++){
    float r2 = dot(x, x), r = sqrt(r2);
    if(r < 1.0001){ tr = 0.; break; }
    float dt = clamp(.07 * r, .02, 6.);
    vec3 v2 = v - 1.5 * h2 * x / (r2 * r2 * r) * dt, xn = x + v2 * dt;      // 光の測地線(曲がる光)
    if(x.y * xn.y < 0.){ vec4 d = disk(mix(x, xn, x.y / (x.y - xn.y)), v2); col += tr * d.rgb; tr *= 1. - d.a; }
    vec3 sdv = uStar - x; float tt = clamp(dot(sdv, v2) / dot(v2, v2), 0., dt), ds = length(sdv - v2 * tt);
    if(ds < .55){ float mu = sqrt(1. - ds * ds / .3025); col += tr * vec3(.7, .86, 1.5) * (2. + 4.5 * mu); tr = 0.; break; }
    col += tr * vec3(.45, .68, 1.3) * dt * .011 / (ds * ds + .08);
    float rr = length(x.xz);
    col += tr * vec3(1., .45, .15) * dt * .002 * exp(-abs(x.y) * 1.6) * smoothstep(2.6, 3.6, rr) * smoothstep(15., 6., rr) * pow(3. / rr, 1.5);
    x = xn; v = v2;
    if(tr < .01) break;
    if(r > rEsc && dot(x, v) > 0.){ esc = 1.; break; }
  }
  if(esc > 0.) col += tr * stars(normalize(v), 1.) * 1.3;
  gl_FragColor = vec4(col, 1.);
}`;

// ── 銀河の星(点)──
export const GAL_VS = `
attribute vec4 aP; attribute vec3 aCol; attribute float aSize;
uniform float uT, uPx, uGain; varying vec4 vC;
void main(){
  float r = aP.x, th = aP.y - uT * .9 / (r + .7); vec3 pos = vec3(r * cos(th), aP.z, r * sin(th));
  vec4 mv = modelViewMatrix * vec4(pos, 1.); gl_Position = projectionMatrix * mv;
  float d = max(-mv.z, .001), s = aSize * uPx / d;
  gl_PointSize = clamp(s, 1.6, 90.);
  vC = vec4(aCol * uGain * min(1., s * s / 2.56) * min(1., 900. / (s * s + 1.)) * smoothstep(.01, .12, d), aP.w);
}`;
export const SIM_VS = `
attribute vec3 aCol; attribute float aSize;
uniform float uPx, uGain; varying vec4 vC;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv;
  float d = max(-mv.z, .001), s = aSize * uPx / d;
  gl_PointSize = clamp(s, 1.6, 90.);
  vC = vec4(aCol * uGain * min(1., s * s / 2.56) * min(1., 900. / (s * s + 1.)) * smoothstep(.01, .1, d), 1.);
}`;
export const PT_FS = `precision highp float; varying vec4 vC;
void main(){ vec2 d = gl_PointCoord - .5; float g = exp(-dot(d, d) * 16.); gl_FragColor = vec4(vC.rgb * g, 1.); }`;
export const DUST_FS = `precision highp float; varying vec4 vC;
void main(){ vec2 d = gl_PointCoord - .5; float g = exp(-dot(d, d) * 14.); gl_FragColor = vec4(0., 0., 0., min(.4, g * .05 * vC.r)); }`;

// ── 合成と仕上げ ──
export const MIX_FS = `uniform sampler2D tA, tB; uniform float uMix; varying vec2 vUv;
void main(){ gl_FragColor = mix(texture2D(tA, vUv), texture2D(tB, vUv), uMix); }`;
export const FINAL_FS = `
uniform sampler2D tDiffuse; uniform float uExp, uFade, uFlash, uStreak, uCA, uFrame; varying vec2 vUv;
vec3 aces(vec3 x){ return clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), 0., 1.); }
float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main(){
  vec2 c = vUv - .5; vec3 col = vec3(0.); float n = uStreak > .001 ? 16. : 1.;
  for(float i = 0.; i < 16.; i++){ if(i >= n) break; float s = 1. - uStreak * i / 16.;
    col += vec3(texture2D(tDiffuse, .5 + c * s * (1. + uCA)).r, texture2D(tDiffuse, .5 + c * s).g, texture2D(tDiffuse, .5 + c * s * (1. - uCA)).b); }
  col = col / n * uExp + uFlash * vec3(1., .92, .8) * 4.;
  col = pow(aces(col), vec3(1. / 2.2));
  col *= 1. - dot(c, c) * .85;
  col += (hash(vUv * vec2(1920., 1080.) + uFrame * 17.13) - .5) * .03;
  col *= uFade; if(abs(c.y) > .3718) col = vec3(0.);
  gl_FragColor = vec4(col, 1.);
}`;
