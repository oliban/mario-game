// WebGL2 post-processing chain for the 256x240 NES framebuffer.
//
// The chain is deliberately deterministic: no time-based noise, no random grain.
// The same 256x240 buffer always produces the same pixels, so screenshot diffs stay honest.
//
// Passes (each independently toggleable via setPass):
//   bloom        bright-pass + separable gaussian at quarter resolution, additively recombined
//   scanlines    soft horizontal beam modulation locked to source rows
//   mask         RGB phosphor triad in device pixels
//   barrel       gentle tube curvature with black edge clipping
//   vignette     radial falloff
//   glow         faint cool corner scatter (glass bloom)
//   aberration   sub-pixel R/B separation growing toward the edges
//   persistence  phosphor trail, blends a fraction of the previous frame
//   grade        gamma / saturation / contrast lift so the NES palette reads rich
//
// Every GL call is guarded. If anything fails we log once and report failure so the
// renderer can fall back to plain Canvas2D nearest-neighbour scaling.

import { SCREEN_W, SCREEN_H } from '../core/constants.js';

export const POST_PASSES = [
  'bloom',
  'scanlines',
  'mask',
  'barrel',
  'vignette',
  'glow',
  'aberration',
  'persistence',
  'grade',
];

export const POST_PRESETS = ['pure', 'crisp', 'crt'];

const PASS_ALIASES = {
  scanline: 'scanlines',
  scan: 'scanlines',
  phosphor: 'persistence',
  trail: 'persistence',
  curve: 'barrel',
  curvature: 'barrel',
  crt: 'barrel',
  chroma: 'aberration',
  chromatic: 'aberration',
  fringe: 'aberration',
  aperture: 'mask',
  triad: 'mask',
  color: 'grade',
  grading: 'grade',
  corner: 'glow',
  vig: 'vignette',
};

const BLOOM_DIV = 4;
const BLOOM_W = Math.ceil(SCREEN_W / BLOOM_DIV);
const BLOOM_H = Math.ceil(SCREEN_H / BLOOM_DIV);

const warned = new Set();
function warnOnce(msg) {
  if (warned.has(msg)) return;
  warned.add(msg);
  console.warn(`[post] ${msg}`);
}

function baseParams() {
  return {
    // Width of the edge ramp used by the sharp-bilinear fetch, in device pixels.
    // 0 collapses to nearest-neighbour, 1 gives a single-device-pixel soft edge.
    sharp: 0.9,

    // Threshold is on luminance. The NES overworld sky sits at ~0.56, coins at ~0.82
    // and white at 1.0, so anything from ~0.66 up keys the objects and not the sky.
    bloomThreshold: 0.68,
    bloomKnee: 0.1,
    bloomAmount: 1.8,
    bloomRadius: 0.9,
    bloomSpread: 2.1,
    bloomIterations: 1,

    scanline: 0.22,
    mask: 0.14,

    curve: 0.16,
    curveAspect: 1.15,

    vignette: 0.26,
    glow: 0.08,
    aberration: 1.0,
    persistence: 0.2,

    gamma: 1.03,
    saturation: 1.12,
    contrast: 1.04,
    brightness: 1.0,
    lift: 0.004,
  };
}

const PRESET_DEFS = {
  pure: {
    passes: {
      bloom: false,
      scanlines: false,
      mask: false,
      barrel: false,
      vignette: false,
      glow: false,
      aberration: false,
      persistence: false,
      grade: false,
    },
    params: { sharp: 0 },
  },
  crisp: {
    passes: {
      bloom: true,
      scanlines: true,
      mask: false,
      barrel: false,
      vignette: true,
      glow: true,
      aberration: false,
      persistence: false,
      grade: true,
    },
    params: {
      sharp: 0.85,
      bloomThreshold: 0.72,
      bloomKnee: 0.09,
      bloomAmount: 1.35,
      bloomRadius: 0.85,
      bloomIterations: 1,
      scanline: 0.1,
      vignette: 0.15,
      glow: 0.05,
      gamma: 1.02,
      saturation: 1.1,
      contrast: 1.03,
      brightness: 1.0,
      lift: 0.0,
    },
  },
  crt: {
    passes: {
      bloom: true,
      scanlines: true,
      mask: true,
      barrel: true,
      vignette: true,
      glow: true,
      aberration: true,
      persistence: true,
      grade: true,
    },
    params: {
      sharp: 1.0,
      bloomThreshold: 0.67,
      bloomKnee: 0.11,
      bloomAmount: 2.1,
      bloomRadius: 0.95,
      bloomIterations: 1,
      scanline: 0.26,
      mask: 0.15,
      curve: 0.16,
      curveAspect: 1.15,
      vignette: 0.3,
      glow: 0.1,
      aberration: 1.1,
      persistence: 0.2,
      gamma: 1.05,
      saturation: 1.17,
      contrast: 1.06,
      brightness: 1.0,
      lift: 0.006,
    },
  },
};

/* ------------------------------------------------------------------ shaders */

const VS_QUAD = `#version 300 es
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const FS_COPY = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
out vec4 fragColor;
void main() {
  fragColor = vec4(texture(uTex, vUv).rgb, 1.0);
}
`;

// Quarter-resolution bright pass. Four bilinear taps cover the full 4x4 source block
// so nothing sparkles when the camera scrolls. Each tap is thresholded on its own —
// averaging first would drown small bright things (a fireball, a coin sparkle) in
// their dark neighbours.
//
// The key is LUMINANCE, not max-channel: a saturated NES sky (#5c94fc) has a blue
// channel of 0.99 and would otherwise bloom the entire frame into mush.
const FS_BRIGHT = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform float uThreshold;
uniform float uKnee;
out vec4 fragColor;

vec3 bright(vec3 c) {
  float b = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float knee = max(uKnee, 1e-4);
  float soft = clamp(b - uThreshold + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee);
  return c * clamp(max(soft, b - uThreshold) / max(b, 1e-4), 0.0, 1.0);
}

void main() {
  vec3 c = bright(texture(uTex, vUv + vec2(-uTexel.x, -uTexel.y)).rgb);
  c += bright(texture(uTex, vUv + vec2(uTexel.x, -uTexel.y)).rgb);
  c += bright(texture(uTex, vUv + vec2(-uTexel.x, uTexel.y)).rgb);
  c += bright(texture(uTex, vUv + vec2(uTexel.x, uTexel.y)).rgb);
  fragColor = vec4(c * 0.25, 1.0);
}
`;

// Separable gaussian: five taps per direction, bilinear-weighted so it behaves
// like a nine-tap kernel. Run twice (narrow then wide) for a smooth falloff.
const FS_BLUR = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uDir;
out vec4 fragColor;
const float W0 = 0.2270270270;
const float W1 = 0.3162162162;
const float W2 = 0.0702702703;
const float O1 = 1.3846153846;
const float O2 = 3.2307692308;
void main() {
  vec3 c = texture(uTex, vUv).rgb * W0;
  c += (texture(uTex, vUv + uDir * O1).rgb + texture(uTex, vUv - uDir * O1).rgb) * W1;
  c += (texture(uTex, vUv + uDir * O2).rgb + texture(uTex, vUv - uDir * O2).rgb) * W2;
  fragColor = vec4(c, 1.0);
}
`;

const FS_PERSIST = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uCur;
uniform sampler2D uPrev;
uniform float uAmount;
out vec4 fragColor;
void main() {
  vec3 c = texture(uCur, vUv).rgb;
  vec3 p = texture(uPrev, vUv).rgb;
  fragColor = vec4(mix(c, max(c, p), uAmount), 1.0);
}
`;

const FS_COMPOSITE = `#version 300 es
precision highp float;
in vec2 vUv;

uniform sampler2D uSrc;
uniform sampler2D uBloom;

uniform vec2  uSrcSize;
uniform vec2  uOutSize;
uniform vec2  uBloomTexel;
uniform float uScale;
uniform float uSharp;

uniform float uBloomAmt;
uniform float uScan;
uniform float uMask;
uniform vec2  uCurve;
uniform float uCurveOn;
uniform float uVign;
uniform float uGlow;
uniform float uAber;

uniform float uGamma;
uniform float uSat;
uniform float uContrast;
uniform float uBright;
uniform float uLift;

out vec4 fragColor;

const float PI = 3.14159265359;

vec2 curveUv(vec2 uv) {
  vec2 c = uv * 2.0 - 1.0;
  vec2 o = abs(c.yx) * uCurve;
  c += c * o * o;
  return c * 0.5 + 0.5;
}

// Sharp bilinear: snaps to texel centres but keeps a ~1 device pixel ramp on the
// edges. Under curvature this reads far cleaner than raw nearest sampling.
vec3 sampleSharp(vec2 uv) {
  vec2 p = uv * uSrcSize;
  vec2 i = floor(p) + 0.5;
  vec2 f = p - i;
  vec2 r = vec2(max(uSharp, 1e-4));
  vec2 s = clamp(f / r, -0.5, 0.5);
  return texture(uSrc, (i + s) / uSrcSize).rgb;
}

vec3 sampleBloom(vec2 uv) {
  vec2 t = uBloomTexel;
  vec3 s = texture(uBloom, uv + vec2(-t.x, -t.y)).rgb;
  s += texture(uBloom, uv + vec2(t.x, -t.y)).rgb;
  s += texture(uBloom, uv + vec2(-t.x, t.y)).rgb;
  s += texture(uBloom, uv + vec2(t.x, t.y)).rgb;
  return s * 0.25;
}

void main() {
  vec2 uv = uCurveOn > 0.0 ? curveUv(vUv) : vUv;

  vec3 col;
  if (uAber > 0.0) {
    vec2 d = uv - 0.5;
    vec2 off = d * (uAber * dot(d, d)) / uSrcSize;
    col.r = sampleSharp(uv + off).r;
    col.g = sampleSharp(uv).g;
    col.b = sampleSharp(uv - off).b;
  } else {
    col = sampleSharp(uv);
  }

  if (uBloomAmt > 0.0) {
    col += sampleBloom(uv) * uBloomAmt;
  }

  if (uScan > 0.0) {
    // Fade the beam out at low integer scales: below 3x there are not enough
    // device rows per source row to draw it without aliasing.
    float aa = clamp((uScale - 1.0) * 0.5, 0.0, 1.0);
    float amt = uScan * aa;
    if (amt > 0.0) {
      float w = sin(PI * uv.y * uSrcSize.y);
      float beam = 0.34 + 0.66 * w * w;
      col *= mix(1.0, beam, amt) / (1.0 - 0.33 * amt);
    }
  }

  if (uMask > 0.0) {
    float aa = clamp((uScale - 2.0) * 0.5, 0.0, 1.0);
    float amt = uMask * aa;
    if (amt > 0.0) {
      int px = int(gl_FragCoord.x) % 3;
      vec3 tri = px == 0 ? vec3(1.0, 0.72, 0.78)
               : px == 1 ? vec3(0.78, 1.0, 0.72)
                         : vec3(0.72, 0.78, 1.0);
      col *= mix(vec3(1.0), tri, amt) / (1.0 - 0.1667 * amt);
    }
  }

  vec2 vc = (vUv - 0.5) * 2.0;
  float r2 = clamp(dot(vc, vc) * 0.5, 0.0, 1.0);

  if (uVign > 0.0) {
    col *= 1.0 - uVign * pow(r2, 1.6);
  }
  if (uGlow > 0.0) {
    float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col += uGlow * pow(r2, 2.2) * vec3(0.30, 0.42, 0.85) * (0.25 + lum);
  }

  col = max(col, vec3(0.0));
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, uSat);
  col = (col - 0.5) * uContrast + 0.5;
  col = pow(max(col, vec3(0.0)), vec3(1.0 / uGamma));
  col = col * uBright + uLift;

  if (uCurveOn > 0.0) {
    vec2 aa = vec2(1.5) / uOutSize;
    vec2 e0 = smoothstep(vec2(0.0), aa, uv);
    vec2 e1 = smoothstep(vec2(0.0), aa, vec2(1.0) - uv);
    col *= e0.x * e0.y * e1.x * e1.y;
  }

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

/* -------------------------------------------------------------- gl plumbing */

function compile(gl, type, src, label) {
  const sh = gl.createShader(type);
  if (!sh) throw new Error(`could not create shader (${label})`);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) || '(no log)';
    gl.deleteShader(sh);
    throw new Error(`shader "${label}" failed to compile: ${log}`);
  }
  return sh;
}

function link(gl, vsSrc, fsSrc, label) {
  const vs = compile(gl, gl.VERTEX_SHADER, vsSrc, `${label}.vert`);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc, `${label}.frag`);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.bindAttribLocation(prog, 0, 'aPos');
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog) || '(no log)';
    gl.deleteProgram(prog);
    throw new Error(`program "${label}" failed to link: ${log}`);
  }
  const u = Object.create(null);
  const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(prog, i);
    if (!info) continue;
    const name = info.name.replace(/\[0\]$/, '');
    u[name] = gl.getUniformLocation(prog, name);
  }
  return { prog, u, label };
}

function makeTarget(gl, w, h, linear) {
  const filter = linear ? gl.LINEAR : gl.NEAREST;
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    gl.deleteFramebuffer(fb);
    gl.deleteTexture(tex);
    throw new Error(`framebuffer ${w}x${h} incomplete (0x${status.toString(16)})`);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.viewport(0, 0, w, h);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { tex, fb, w, h };
}

function killTarget(gl, t) {
  if (!t) return;
  gl.deleteFramebuffer(t.fb);
  gl.deleteTexture(t.tex);
}

/* ------------------------------------------------------------------- chain */

export class PostChain {
  constructor(gl, canvas) {
    this.gl = gl;
    this.canvas = canvas;
    this.dead = false;
    this.outW = Math.max(1, canvas.width | 0);
    this.outH = Math.max(1, canvas.height | 0);
    this.frames = 0;

    this.params = baseParams();
    this.passes = {};
    for (const p of POST_PASSES) this.passes[p] = false;
    this._presetName = 'crisp';

    this._targets = { scene: null, hist: [null, null] };
    this._histIndex = 0;
    this._linearSrc = true;

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.CULL_FACE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    // One oversized triangle covers the viewport with no interior seam.
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.progCopy = link(gl, VS_QUAD, FS_COPY, 'copy');
    this.progBright = link(gl, VS_QUAD, FS_BRIGHT, 'bright');
    this.progBlur = link(gl, VS_QUAD, FS_BLUR, 'blur');
    this.progPersist = link(gl, VS_QUAD, FS_PERSIST, 'persist');
    this.progComposite = link(gl, VS_QUAD, FS_COMPOSITE, 'composite');

    this.srcTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA8, SCREEN_W, SCREEN_H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.bloomA = makeTarget(gl, BLOOM_W, BLOOM_H, true);
    this.bloomB = makeTarget(gl, BLOOM_W, BLOOM_H, true);

    const err = gl.getError();
    if (err !== gl.NO_ERROR) throw new Error(`gl error during init: 0x${err.toString(16)}`);

    this.setPreset('crisp');
  }

  get preset() {
    return this._presetName;
  }

  get scale() {
    return this.outW / SCREEN_W;
  }

  setPreset(name) {
    const def = PRESET_DEFS[name];
    if (!def) return false;
    this._presetName = name;
    this.params = baseParams();
    Object.assign(this.params, def.params);
    for (const p of POST_PASSES) this.passes[p] = !!def.passes[p];
    this._syncSrcFilter();
    return true;
  }

  setPass(name, on = true) {
    const key = PASS_ALIASES[name] || name;
    if (!Object.prototype.hasOwnProperty.call(this.passes, key)) return false;
    this.passes[key] = !!on;
    this._syncSrcFilter();
    return true;
  }

  getPass(name) {
    const key = PASS_ALIASES[name] || name;
    return !!this.passes[key];
  }

  setParam(name, value) {
    if (!Object.prototype.hasOwnProperty.call(this.params, name)) return false;
    this.params[name] = value;
    this._syncSrcFilter();
    return true;
  }

  // True when nothing is enabled and the frame can go straight to the screen
  // through an exact nearest-neighbour blit.
  get passthrough() {
    for (const p of POST_PASSES) if (this.passes[p]) return false;
    return true;
  }

  _syncSrcFilter() {
    const gl = this.gl;
    if (!gl || this.dead) return;
    const wantLinear = !this.passthrough;
    if (wantLinear === this._linearSrc) return;
    this._linearSrc = wantLinear;
    const f = wantLinear ? gl.LINEAR : gl.NEAREST;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
  }

  resize(w, h) {
    const nw = Math.max(1, w | 0);
    const nh = Math.max(1, h | 0);
    if (nw === this.outW && nh === this.outH && this._targets.scene) return;
    this.outW = nw;
    this.outH = nh;
    this._freeDisplayTargets();
  }

  _freeDisplayTargets() {
    const gl = this.gl;
    killTarget(gl, this._targets.scene);
    killTarget(gl, this._targets.hist[0]);
    killTarget(gl, this._targets.hist[1]);
    this._targets.scene = null;
    this._targets.hist[0] = null;
    this._targets.hist[1] = null;
  }

  _ensureDisplayTargets() {
    if (this._targets.scene) return true;
    const gl = this.gl;
    try {
      this._targets.scene = makeTarget(gl, this.outW, this.outH, false);
      this._targets.hist[0] = makeTarget(gl, this.outW, this.outH, false);
      this._targets.hist[1] = makeTarget(gl, this.outW, this.outH, false);
      this._histIndex = 0;
      return true;
    } catch (e) {
      warnOnce(`persistence targets unavailable (${e.message}) — pass disabled`);
      this._freeDisplayTargets();
      this.passes.persistence = false;
      return false;
    }
  }

  _use(p) {
    this.gl.useProgram(p.prog);
    return p;
  }

  _draw(target) {
    const gl = this.gl;
    if (target) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
      gl.viewport(0, 0, target.w, target.h);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.outW, this.outH);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  _bind(unit, tex, loc) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (loc) gl.uniform1i(loc, unit);
  }

  // Upload the 256x240 Canvas2D buffer and run the enabled passes.
  render(source) {
    const gl = this.gl;
    if (this.dead || !gl || gl.isContextLost()) return false;

    if (this.canvas.width !== this.outW || this.canvas.height !== this.outH) {
      this.resize(this.canvas.width, this.canvas.height);
    }

    gl.bindVertexArray(this.vao);
    gl.disable(gl.BLEND);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);

    if (this.passthrough) {
      const p = this._use(this.progCopy);
      this._bind(0, this.srcTex, p.u.uTex);
      this._draw(null);
      this.frames++;
      return true;
    }

    const P = this.params;
    const on = this.passes;

    let bloomTex = this.bloomA.tex;
    const bloomAmt = on.bloom ? P.bloomAmount : 0;
    if (bloomAmt > 0) this._runBloom();

    const usePersist = on.persistence && P.persistence > 0 && this._ensureDisplayTargets();
    const compositeTarget = usePersist ? this._targets.scene : null;

    const c = this._use(this.progComposite);
    this._bind(0, this.srcTex, c.u.uSrc);
    this._bind(1, bloomTex, c.u.uBloom);

    const scale = this.outW / SCREEN_W;
    gl.uniform2f(c.u.uSrcSize, SCREEN_W, SCREEN_H);
    gl.uniform2f(c.u.uOutSize, this.outW, this.outH);
    gl.uniform2f(c.u.uBloomTexel, 0.6 / BLOOM_W, 0.6 / BLOOM_H);
    gl.uniform1f(c.u.uScale, scale);
    gl.uniform1f(c.u.uSharp, P.sharp > 0 ? P.sharp / Math.max(scale, 1e-4) : 0);
    gl.uniform1f(c.u.uBloomAmt, bloomAmt);
    gl.uniform1f(c.u.uScan, on.scanlines ? P.scanline : 0);
    gl.uniform1f(c.u.uMask, on.mask ? P.mask : 0);
    gl.uniform2f(c.u.uCurve, P.curve, P.curve * P.curveAspect);
    gl.uniform1f(c.u.uCurveOn, on.barrel && P.curve > 0 ? 1 : 0);
    gl.uniform1f(c.u.uVign, on.vignette ? P.vignette : 0);
    gl.uniform1f(c.u.uGlow, on.glow ? P.glow : 0);
    gl.uniform1f(c.u.uAber, on.aberration ? P.aberration : 0);
    if (on.grade) {
      gl.uniform1f(c.u.uGamma, P.gamma);
      gl.uniform1f(c.u.uSat, P.saturation);
      gl.uniform1f(c.u.uContrast, P.contrast);
      gl.uniform1f(c.u.uBright, P.brightness);
      gl.uniform1f(c.u.uLift, P.lift);
    } else {
      gl.uniform1f(c.u.uGamma, 1);
      gl.uniform1f(c.u.uSat, 1);
      gl.uniform1f(c.u.uContrast, 1);
      gl.uniform1f(c.u.uBright, 1);
      gl.uniform1f(c.u.uLift, 0);
    }
    this._draw(compositeTarget);

    if (usePersist) {
      const prev = this._targets.hist[this._histIndex];
      const next = this._targets.hist[this._histIndex ^ 1];
      const pp = this._use(this.progPersist);
      this._bind(0, this._targets.scene.tex, pp.u.uCur);
      this._bind(1, prev.tex, pp.u.uPrev);
      gl.uniform1f(pp.u.uAmount, Math.min(0.85, Math.max(0, P.persistence)));
      this._draw(next);

      const cp = this._use(this.progCopy);
      this._bind(0, next.tex, cp.u.uTex);
      this._draw(null);
      this._histIndex ^= 1;
    }

    this.frames++;
    return true;
  }

  _runBloom() {
    const gl = this.gl;
    const P = this.params;

    const b = this._use(this.progBright);
    this._bind(0, this.srcTex, b.u.uTex);
    gl.uniform2f(b.u.uTexel, 1 / SCREEN_W, 1 / SCREEN_H);
    gl.uniform1f(b.u.uThreshold, P.bloomThreshold);
    gl.uniform1f(b.u.uKnee, P.bloomKnee);
    this._draw(this.bloomA);

    // Separable H then V, ping-ponging A -> B -> A. One iteration keeps the glow
    // tight enough that a 10px coin still reads as a glowing coin; wider kernels
    // dilute small sources into nothing and only make large areas smear.
    const bl = this._use(this.progBlur);
    const iterations = Math.max(1, Math.min(3, (P.bloomIterations | 0) || 1));
    let r = P.bloomRadius;
    for (let i = 0; i < iterations; i++) {
      this._bind(0, this.bloomA.tex, bl.u.uTex);
      gl.uniform2f(bl.u.uDir, r / BLOOM_W, 0);
      this._draw(this.bloomB);

      this._bind(0, this.bloomB.tex, bl.u.uTex);
      gl.uniform2f(bl.u.uDir, 0, r / BLOOM_H);
      this._draw(this.bloomA);

      r *= P.bloomSpread;
    }
  }

  info() {
    return {
      backend: 'webgl2',
      preset: this._presetName,
      passes: { ...this.passes },
      params: { ...this.params },
      size: [this.outW, this.outH],
      scale: this.outW / SCREEN_W,
      frames: this.frames,
    };
  }

  dispose() {
    const gl = this.gl;
    this.dead = true;
    if (!gl) return;
    try {
      this._freeDisplayTargets();
      killTarget(gl, this.bloomA);
      killTarget(gl, this.bloomB);
      gl.deleteTexture(this.srcTex);
      gl.deleteBuffer(this.vbo);
      gl.deleteVertexArray(this.vao);
      for (const p of [
        this.progCopy, this.progBright, this.progBlur, this.progPersist, this.progComposite,
      ]) {
        if (p) gl.deleteProgram(p.prog);
      }
    } catch (e) {
      // Disposal is best-effort; the context may already be gone.
    }
  }
}

// Attempts to take over `canvas` with a WebGL2 post chain.
// Returns { chain, claimed, error }. `claimed` is true when a WebGL context was
// created on the canvas — the caller must then swap the element out before it
// can use Canvas2D on it.
export function createPostChain(canvas, opts = {}) {
  let gl = null;
  try {
    gl = canvas.getContext('webgl2', {
      alpha: false,
      depth: false,
      stencil: false,
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
      desynchronized: false,
    });
  } catch (e) {
    gl = null;
  }
  if (!gl) {
    warnOnce('WebGL2 unavailable — falling back to Canvas2D nearest-neighbour scaling');
    return { chain: null, claimed: false, error: 'no-webgl2' };
  }

  let chain = null;
  try {
    chain = new PostChain(gl, canvas);
  } catch (e) {
    warnOnce(`post chain init failed (${e && e.message}) — falling back to Canvas2D`);
    try {
      if (chain) chain.dispose();
    } catch (e2) {
      /* ignore */
    }
    return { chain: null, claimed: true, error: String((e && e.message) || e) };
  }

  const onLost = (ev) => {
    ev.preventDefault();
    chain.dead = true;
    warnOnce('WebGL context lost — falling back to Canvas2D');
    if (typeof opts.onLost === 'function') opts.onLost();
  };
  canvas.addEventListener('webglcontextlost', onLost, false);
  chain._onLost = onLost;

  return { chain, claimed: true, error: null };
}

export default createPostChain;
