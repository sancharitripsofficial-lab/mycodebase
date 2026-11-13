/** GLSL for the living photos. Kept in one place so the engine file stays readable. */

const NOISE = /* glsl */ `
float hash12(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3. - 2. * f);
  return mix(mix(hash12(i), hash12(i + vec2(1., 0.)), u.x),
             mix(hash12(i + vec2(0., 1.)), hash12(i + vec2(1., 1.)), u.x), u.y);
}
float fbm(vec2 p){
  float a = .5, s = 0.;
  for (int i = 0; i < OCT; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= .5; }
  return s;
}
`;

export const PHOTO_VERT = /* glsl */ `
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = vec4(position.xy, 0., 1.);
}
`;

/**
 * Re-renders the photo with life. Everything is keyed on the photo itself through a small
 * mask texture (R foliage, G sky, B water) built once per photo on the CPU.
 */
export const PHOTO_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uPhoto;
uniform sampler2D uMask;
uniform vec2 uCover;
uniform vec2 uPan;
uniform float uZoom;
uniform float uTime;
uniform float uAspect;     // photo width / height
uniform float uScreenAsp;  // canvas width / height
uniform vec2 uWindDir;
uniform float uWind;       // 0.25 calm .. 1.6 strong
uniform float uSway;
uniform vec4 uSun;         // x, y (photo uv, y up), strength, enabled
uniform vec3 uSunCol;
uniform vec4 uMist[3];
uniform vec3 uMistCol;
uniform float uMistAmt;
uniform float uFog;
uniform vec4 uPlume[2];
uniform vec4 uPlumeCol[2];
uniform vec4 uGlit;
uniform float uWater;      // 0 none, 1 sea, 2 river
uniform float uRain;
uniform float uCloud;
uniform float uNight;
uniform float uClear;
uniform float uStorm;
uniform float uFx;
uniform float uSkyFlow;
uniform int uDebug;
varying vec2 vUv;
${NOISE}
float ell(vec2 p, vec4 e){
  vec2 d = (p - e.xy) / max(e.zw, vec2(1e-4));
  return 1. - smoothstep(.3, 1., dot(d, d));
}
float rainLayer(vec2 uv, float sc, float sp, float slant){
  uv.x += uv.y * slant;
  vec2 g = vec2(uv.x * sc * uScreenAsp, uv.y * sc * .1 + uTime * sp);
  vec2 id = floor(g), f = fract(g);
  float h = hash12(id);
  float s = smoothstep(.06, 0., abs(f.x - (.15 + .7 * h))) * smoothstep(0., .3, f.y) * smoothstep(1., .55, f.y);
  return s * step(.45, hash12(id + 7.3));
}
void main(){
  vec2 p = (vUv - .5) * uCover / uZoom + .5 + uPan;
  vec3 m = texture2D(uMask, p).rgb;
  float fol = m.r, sky = m.g, wat = m.b;
  float t = uTime;
  vec2 iso = vec2(1. / uAspect, 1.);      // height-units -> uv
  vec2 pi = p * vec2(uAspect, 1.);        // isotropic coords for noise
  vec2 wd = uWindDir;

  // ---- wind in the leaves: gusts travel across, every clump swings on its own phase ----
  float nearK = smoothstep(0., .85, 1. - p.y);
  float fr = mix(34., 12., nearK);
  vec2 q = pi * fr;
  float gust = smoothstep(.28, .78, vnoise(pi * vec2(2.1, 3.) - wd * t * .26 * (.6 + uWind)));
  gust = mix(.22, 1., gust);
  float ph = 6.2831 * vnoise(q * .55 + 3.7);
  float sp = .75 + .45 * uWind;
  float s1 = sin(t * 2.0 * sp + ph);
  float s2 = sin(t * 3.3 * sp + ph * 1.9 + 1.1);
  float sway = .62 * s1 + .38 * s2;
  float amp = uSway * fol * mix(.4, 1., nearK) * gust;
  vec2 off = (wd * (.5 * gust + sway) + vec2(-wd.y, wd.x) * .4 * s2) * amp;

  // ---- water: fine ripples refract the picture, slow swell ----
  vec2 woff = vec2(0.);
  float glint = 0.;
  if (wat > .01) {
    float fy = mix(1., 3., p.y);
    vec2 wq = pi * vec2(34., 90.) * fy;
    float r1 = vnoise(wq + vec2(t * .5, -t * .9));
    float r2 = vnoise(wq * 1.7 + vec2(-t * .4, -t * .7) + 9.);
    float k = uWater > 1.5 ? .28 : 1.;
    woff = (vec2(r1, r2) - .5) * .0052 * wat / fy * k;
    woff.x += sin(t * .55 + pi.y * 24. + vnoise(pi * 6.) * 5.) * .0013 * wat * k;
    float spk = vnoise(wq * 2.3 + vec2(t * 1.3, t * .8)) * vnoise(wq * 1.1 - vec2(t * .9, -t * 1.1));
    glint = smoothstep(.42, .72, spk) * wat;
  }

  vec2 ps = p - (off + woff) * iso;
  vec3 col = texture2D(uPhoto, ps).rgb;

  // ---- sky: the photo's own clouds drift (two-phase flow, never past a non-sky pixel) ----
  if (sky > .01 && uSkyFlow > 0.) {
    float T = 16.;
    float a = fract(t / T), b = fract(t / T + .5);
    float guard = uSun.w > .5 ? smoothstep(.07, .26, distance(pi, uSun.xy * vec2(uAspect, 1.))) : 1.;
    float warp = .55 + .9 * vnoise(pi * 2.6 + 1.3);
    vec2 f = vec2(sign(wd.x + 1e-4), .06) * .055 * uSkyFlow * (.5 + .6 * uWind) * warp * guard * iso;
    vec2 pa = p - f * (a - .5), pb = p - f * (b - .5);
    float ga = smoothstep(.25, .8, min(sky, texture2D(uMask, pa).g));
    float gb = smoothstep(.25, .8, min(sky, texture2D(uMask, pb).g));
    vec3 ca = mix(col, texture2D(uPhoto, pa).rgb, ga);
    vec3 cb = mix(col, texture2D(uPhoto, pb).rgb, gb);
    col = mix(cb, ca, 1. - abs(2. * a - 1.));
    col *= 1. + sky * .035 * (vnoise(pi * 1.7 - vec2(t * .035 * sign(wd.x + 1e-4), 0.)) - .5);
  }

  float lum = dot(col, vec3(.299, .587, .114));

  // ---- leaves catching the light as they turn ----
  float dapple = (vnoise(q * 1.4 + wd * t * .8) - .5) * .1 * (.35 + .65 * uSun.z * uClear);
  col *= 1. + fol * (sway * .05 * gust + dapple) * uFx;

  // ---- sun on water ----
  if (wat > .01) {
    col += vec3(1., .95, .85) * glint * (uWater > 1.5 ? .07 : .2) * (.35 + lum) * (1. - .6 * uCloud) * (1. - .7 * uNight);
    float foam = smoothstep(.6, .85, lum) * wat;
    col *= 1. + foam * .11 * sin(t * .9 + vnoise(pi * 7.) * 6.2831);
  }
  float gl = ell(p, uGlit);
  if (gl > .01) {
    float s = vnoise(pi * vec2(150., 420.) + vec2(t * 1.5, -t * 2.2)) * vnoise(pi * vec2(90., 260.) - vec2(t * 1.1, t * .6));
    col += uSunCol * smoothstep(.3, .65, s) * gl * .5 * (1. - uCloud) * (1. - uNight);
  }

  // ---- sun shafts ----
  if (uSun.w > .5) {
    vec2 d = pi - uSun.xy * vec2(uAspect, 1.);
    float r = length(d);
    vec2 dir = d / max(r, 1e-4);
    float rays = vnoise(dir * 3.2 + t * .03) * vnoise(dir * 7.5 - t * .045 + 5.);
    rays = smoothstep(.1, .5, rays);
    float fall = exp(-r * 2.3) * smoothstep(.03, .18, r);
    float k = uSun.z * (1. - .8 * uCloud) * (1. - uRain) * (1. - uNight);
    col += uSunCol * rays * fall * .2 * k * mix(.4, 1., lum) * uFx;
    col += uSunCol * exp(-r * 7.) * .045 * k * (.5 + .5 * sin(t * .35));
  }

  // ---- mist rolling through the valleys (only onto what is already hazy / far) ----
  float mreg = 0.;
  for (int i = 0; i < 3; i++) mreg = max(mreg, ell(p, uMist[i]));
  if (mreg * uMistAmt + uFog > .005) {
    float md = fbm(pi * vec2(2.2, 5.) - vec2(wd.x * t * .04, t * .007));
    float md2 = fbm(pi * vec2(4.3, 9.) + 11. - vec2(wd.x * t * .07, 0.));
    float dens = smoothstep(.36, .7, md * .65 + md2 * .35);
    float far = smoothstep(.14, .5, lum);
    float mA = dens * (mreg * uMistAmt * far + uFog * (.3 + .45 * mreg) * mix(.45, 1., far));
    col = mix(col, uMistCol * (1. - .3 * uNight), clamp(mA, 0., .85));
  }

  // ---- chimney smoke / coffee steam ----
  for (int i = 0; i < 2; i++) {
    if (uPlumeCol[i].a > 0.) {
      vec2 l = (p - uPlume[i].xy) / uPlume[i].zw;
      if (l.y > 0. && l.y < 1. && abs(l.x) < 2.2) {
        float bend = wd.x * uWind * l.y * l.y * 1.1;
        float x = (l.x - bend) / (.22 + .78 * l.y);
        float n = fbm(vec2(x * 1.5 + 3. * float(i), l.y * 2.6 - t * .42));
        float n2 = vnoise(vec2(x * 3. + sin(t * .3 + l.y * 3.), l.y * 5. - t * .75));
        float body = smoothstep(1., .1, abs(x)) * smoothstep(0., .1, l.y) * pow(1. - l.y, 1.25);
        col = mix(col, uPlumeCol[i].rgb, body * smoothstep(.2, .62, n * .7 + n2 * .3) * uPlumeCol[i].a);
      }
    }
  }

  // ---- what the sky is doing there right now ----
  float g = dot(col, vec3(.299, .587, .114));
  col = mix(col, vec3(g) * vec3(.94, .97, 1.02), .2 * uCloud + .2 * uRain);
  col *= 1. - .06 * uCloud - .11 * uRain - sky * .15 * uRain - .08 * uStorm;
  col *= mix(vec3(1.), vec3(1.03, 1.005, .96), uClear * .6);
  col = mix(col, col * vec3(.6, .7, .98), .3 * uNight);

  if (uRain > .01) {
    float slant = wd.x * (.1 + .22 * uWind);
    float rr = rainLayer(vUv, 34., 6.5, slant)
             + rainLayer(vUv + .37, 62., 5.2, slant) * .6
             + rainLayer(vUv + .71, 110., 4.2, slant) * .35;
    col += vec3(.8, .86, .92) * rr * .17 * uRain;
    float ground = (1. - sky) * smoothstep(.6, .25, vUv.y);
    vec2 gc = vUv * vec2(40. * uScreenAsp, 64.);
    vec2 id = floor(gc), f = fract(gc) - .5;
    float h = hash12(id);
    float tt = fract(t * 1.5 + h * 7.);
    float on = step(.74, hash12(id + floor(t * 1.5 + h * 7.)));
    float ring = smoothstep(.07, 0., abs(length(f * vec2(1., 2.3)) - tt * .34)) * (1. - tt) * on;
    col += vec3(.82, .88, .94) * ring * .2 * ground * uRain;
  }
  if (uStorm > .01) {
    float fl = step(.985, hash12(vec2(floor(t * 9.), 3.))) * step(.5, hash12(vec2(floor(t * .5), 9.)));
    col += vec3(.5, .55, .65) * fl * (.25 + .5 * sky) * uStorm;
  }

  if (uDebug == 1) col = m;
  col += (hash12(gl_FragCoord.xy + fract(t) * 91.) - .5) / 255.;
  gl_FragColor = vec4(col, 1.);
}
`;

// ---------------------------------------------------------------------------------------
// Falling leaves: real 3D quads in front of the photo, lit by the photo's sun, translucent
// when backlit, soft when close to the lens. Motion is a pure function of time.
// ---------------------------------------------------------------------------------------
export const LEAF_VERT = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime;
uniform vec2 uWindDir;
uniform float uWind;
uniform float uTan;
uniform float uScreenAsp;
uniform float uFall;
uniform float uSize;
uniform vec2 uCam;
varying vec2 vL;
varying vec3 vN;
varying float vFade;
varying float vBlur;
varying float vTone;
vec4 hash4(float n){ return fract(sin(vec4(n, n + 1.37, n + 2.71, n + 4.13)) * 43758.5453); }
mat3 rotX(float a){ float c = cos(a), s = sin(a); return mat3(1., 0., 0., 0., c, s, 0., -s, c); }
mat3 rotY(float a){ float c = cos(a), s = sin(a); return mat3(c, 0., -s, 0., 1., 0., s, 0., c); }
mat3 rotZ(float a){ float c = cos(a), s = sin(a); return mat3(c, s, 0., -s, c, 0., 0., 0., 1.); }
void main(){
  float depth = mix(2.6, 8.5, aSeed.w);
  float life = (4.5 + 1.3 * depth) / uFall;
  float tt = uTime / life + aSeed.y * 17.;
  float cyc = floor(tt);
  float ph = fract(tt);
  vec4 r = hash4(cyc * 3.17 + aSeed.z * 91.7);
  float hh = depth * uTan, hw = hh * uScreenAsp;
  float ft = ph * life;
  float sw = ft * (1.5 + r.w) + r.z * 6.2831;
  float vx = uWindDir.x * (.12 + .3 * uWind);
  float x = mix(-hw * 1.25, hw * 1.25, r.y) + vx * (ft - life * .5) + sin(sw) * .16 * (.6 + r.w);
  float y = mix(hh * 1.18, -hh * 1.18, ph) + .05 * sin(2. * sw);
  float z = -depth + cos(sw) * .1;
  mat3 R = rotZ(r.x * 6.2831 + .5 * sin(sw * .5)) * rotY(sin(sw + 1.2) * .8) * rotX(ft * (1.6 + 2.6 * r.z) * (.45 + .55 * uWind) + r.y * 6.);
  vec2 lp = position.xy;
  vec3 P = vec3(lp.x, lp.y * .5, .26 * lp.x * lp.x - .22 * abs(lp.y) * abs(lp.y));
  vec3 N = normalize(vec3(-.52 * lp.x, .22 * lp.y, 1.));
  float size = mix(.085, .135, r.w) * uSize;
  vec3 wp = vec3(x, y, z) + R * (P * size) - vec3(uCam, 0.);
  vN = R * N;
  vL = vec2(lp.x + .5, lp.y * 2.);
  vFade = smoothstep(0., .08, ph) * smoothstep(1., .92, ph);
  vBlur = smoothstep(5., 2.6, depth);
  vTone = r.z;
  gl_Position = projectionMatrix * vec4(wp, 1.);
}
`;

export const LEAF_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uLeafA;
uniform vec3 uLeafB;
uniform vec3 uSunCol;
uniform vec3 uAmb;
uniform vec3 uLight;
uniform float uAlpha;
varying vec2 vL;
varying vec3 vN;
varying float vFade;
varying float vBlur;
varying float vTone;
void main(){
  float u = vL.x, v = vL.y;
  float w = sin(3.14159 * pow(u, .72)) * (.95 - .3 * u);
  float soft = mix(.12, .5, vBlur);
  float a = smoothstep(w, w - soft, abs(v)) * smoothstep(0., .06, u) * smoothstep(1., .94, u);
  if (a < .01) discard;
  vec3 base = mix(uLeafA, uLeafB, vTone);
  float sharp = 1. - vBlur;
  float rib = smoothstep(.07, 0., abs(v)) * .3 * sharp;
  float veins = (sin((u * 13. - abs(v) * 5.) * 3.14159) * .5 + .5) * .1 * sharp;
  base *= 1. - rib - veins;
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) { N = -N; base = mix(base, vec3(dot(base, vec3(.33))), .25) * 1.12; }
  float d = dot(N, uLight);
  vec3 c = base * (uAmb + uSunCol * max(d, 0.) * .9) + base * vec3(1.25, 1.15, .6) * uSunCol * max(-d, 0.) * .5;
  gl_FragColor = vec4(c, a * vFade * uAlpha * mix(1., .78, vBlur));
}
`;

// ---------------------------------------------------------------------------------------
// A small flock crossing the sky now and then: far-off silhouettes with flapping wings.
// ---------------------------------------------------------------------------------------
export const BIRD_VERT = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime;
uniform vec4 uBird;      // band y (0-1, y up), period s, crossing s, size
uniform float uScreenAsp;
uniform float uSeed;
float h1(float n){ return fract(sin(n * 127.1) * 43758.5453); }
void main(){
  float P = uBird.y;
  float tt = (uTime - 3.) / P + 1.;
  float cyc = floor(tt) + uSeed;
  float ph = fract(tt) * P / uBird.z;
  float dir = h1(cyc) > .5 ? 1. : -1.;
  float size = uBird.w * (.75 + .5 * aSeed.z);
  vec2 c = vec2(dir * mix(-1.3, 1.3, ph), uBird.x * 2. - 1. + .07 * sin(ph * 4. + cyc) + (h1(cyc + 3.) - .5) * .12);
  c += vec2(-dir * aSeed.x * .34, (aSeed.y - .5) * .2 - aSeed.x * .05);
  c.y += sin(uTime * .7 + aSeed.w * 20.) * .012;
  float glide = smoothstep(-.3, .25, sin(uTime * .4 + aSeed.w * 9.));
  float flap = sin(uTime * (7.5 + 3. * aSeed.z) + aSeed.w * 6.2831) * glide + .25 * (1. - glide);
  float span = abs(position.x);
  float lift = span * flap * .75 + max(span - .5, 0.) * sin(flap * 1.5 - .5) * .7;
  vec2 lp = vec2(dir * position.y * .9 + position.x * .5, lift + position.x * .1);
  vec2 pos = c + lp * size * vec2(1. / uScreenAsp, 1.);
  if (ph > 1.) pos = vec2(4., 4.);
  gl_Position = vec4(pos, 0., 1.);
}
`;

export const BIRD_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uColor;
uniform float uAlpha;
void main(){ gl_FragColor = vec4(uColor, uAlpha); }
`;

// ---------------------------------------------------------------------------------------
// Dust motes drifting in the low sun.
// ---------------------------------------------------------------------------------------
export const MOTE_VERT = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime;
uniform vec2 uWindDir;
uniform float uPx;
uniform vec2 uSunScreen;
uniform float uScreenAsp;
varying float vA;
void main(){
  float x = fract(aSeed.x + uWindDir.x * uTime * .007 * (.4 + aSeed.w)) * 2.4 - 1.2;
  float y = fract(aSeed.y + uTime * .005 * (aSeed.z - .35)) * 2.2 - 1.1 + sin(uTime * .21 + aSeed.w * 30.) * .02;
  x += sin(uTime * .13 + aSeed.z * 40.) * .03;
  float tw = sin(uTime * (.5 + aSeed.w) + aSeed.x * 50.);
  vec2 d = (vec2(x, y) - uSunScreen) * vec2(uScreenAsp, 1.);
  vA = (.3 + .7 * tw * tw) * exp(-length(d) * 1.25);
  gl_PointSize = uPx * (1.6 + 6. * aSeed.z * aSeed.z);
  gl_Position = vec4(x, y, 0., 1.);
}
`;

export const MOTE_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uColor;
uniform float uAlpha;
varying float vA;
void main(){
  float d = length(gl_PointCoord - .5);
  float a = smoothstep(.5, .05, d);
  gl_FragColor = vec4(uColor, a * a * vA * uAlpha);
}
`;

// ---------------------------------------------------------------------------------------
// Temple flag: a saffron pennant pinned to the photo (it follows the camera drift exactly),
// cloth waves travelling down its length with the live wind, light coming through the cloth.
// ---------------------------------------------------------------------------------------
const FLAG_COMMON = /* glsl */ `
uniform vec4 uFlag;      // pole foot x, y (photo uv, y up), pole height, cloth height
uniform vec2 uCover;
uniform vec2 uPan;
uniform float uZoom;
uniform float uAspect;
vec4 toClip(vec2 P){
  vec2 s = ((P - .5 - uPan) * uZoom) / uCover + .5;
  return vec4(s * 2. - 1., 0., 1.);
}
`;

export const FLAG_VERT = /* glsl */ `
${FLAG_COMMON}
uniform float uTime;
uniform vec2 uWindDir;
uniform float uWind;
uniform float uSeed;
varying float vSlope;
varying vec2 vF;
void main(){
  float u = position.x, v = position.y;
  float H = uFlag.w, L = uFlag.w * 1.6;
  float taper = 1. - .86 * u;
  float w = clamp(uWind, 0., 1.4);
  float t = uTime * (2.6 + 3. * w);
  float breath = .78 + .22 * sin(uTime * .7 + uSeed) * sin(uTime * .23 + uSeed * 2.);
  float env = pow(u, .7);
  float a1 = u * 8.5 - t + uSeed;
  float a2 = u * 14. - t * 1.45 + 1.7 + v * 2.2;
  float a3 = u * 4. - t * .6 + v * 1.2 + uSeed * 2.;
  float amp = env * (.11 + .07 * w) * breath;
  float Z = (sin(a1) * .7 + sin(a2) * .3 + sin(a3) * .35) * amp * H * 1.8;
  // Slope of the cloth along its length: this is what reads as folds once it is shaded.
  vSlope = (cos(a1) * 5.95 + cos(a2) * 4.2 + cos(a3) * 1.4) / 8. * (.35 + .65 * env) * breath;
  float droop = clamp(.62 - .5 * w, .1, .62);
  float X = u * L * (1. - .3 * droop) - .04 * L * env * sin(a1 + .8);
  float Y = (v - .5) * H * taper - u * u * L * droop * .7 + (sin(a2) * .09 + sin(a3) * .12) * H * env;
  float cy = clamp(uWindDir.x * .92, -.92, .92);
  float sy = sqrt(1. - cy * cy) * .7;
  float xs = X * cy + Z * sy;
  vF = vec2(u, v);
  gl_Position = toClip(uFlag.xy + vec2(xs / uAspect, uFlag.z - H * .5 + Y));
}
`;

export const FLAG_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uCloth;
uniform vec3 uSunCol;
uniform vec3 uAmb;
uniform vec4 uHaze;
uniform float uDim;
varying float vSlope;
varying vec2 vF;
void main(){
  // Low sun behind the flag: cloth facing it glows, folds turned away go deep and brown.
  float s = smoothstep(-.75, .75, vSlope);
  vec3 lit = uCloth * (uAmb + uSunCol * .5);
  vec3 dark = uCloth * vec3(.44, .32, .3) * (uAmb * .9 + uSunCol * .1);
  vec3 c = mix(dark, lit, s);
  c *= .88 + .12 * vF.y;
  c *= 1. - .3 * smoothstep(.07, 0., vF.x);
  c = mix(c * uDim, uHaze.rgb, uHaze.a);
  gl_FragColor = vec4(c, .96);
}
`;

export const POLE_VERT = /* glsl */ `
${FLAG_COMMON}
varying float vX;
void main(){
  vX = position.x;
  float wdt = max(uFlag.z * .014, .0007);
  gl_Position = toClip(uFlag.xy + vec2(position.x * wdt / uAspect, position.y * uFlag.z * 1.03));
}
`;

export const POLE_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uSunCol;
uniform vec4 uHaze;
uniform float uDim;
varying float vX;
void main(){
  vec3 c = vec3(.2, .15, .12) + uSunCol * .25 * smoothstep(-.2, 1., vX);
  gl_FragColor = vec4(mix(c * uDim, uHaze.rgb, uHaze.a), 1.);
}
`;
