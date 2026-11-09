// First-person dungeon view in WebGL2. Static level geometry is batched by texture; doors, decals and
// billboards are drawn each frame. Rendering is read-only: nothing here changes the game.
import { DIRS } from '../world.js';
import { colorRgb } from '../colors.js';

const VS = `#version 300 es
in vec3 aPos; in vec2 aUv; in vec3 aNormal;
uniform mat4 uViewProj;
out vec2 vUv; out vec3 vWorld; out vec3 vNormal;
void main() { vUv = aUv; vWorld = aPos; vNormal = aNormal; gl_Position = uViewProj * vec4(aPos, 1.0); }`;

const FS = `#version 300 es
precision highp float;
in vec2 vUv; in vec3 vWorld; in vec3 vNormal;
uniform sampler2D uTex;
uniform vec3 uCam; uniform float uRadius; uniform float uFlicker; uniform float uMono;
uniform vec3 uTint; uniform float uFlash; uniform float uEmissive; uniform float uBillboard;
out vec4 color;
void main() {
  vec4 t = texture(uTex, vUv);
  if (t.a < 0.01) discard;
  vec3 toCam = uCam - vWorld;
  float d = length(toCam);
  float fall = clamp(1.0 - d / uRadius, 0.0, 1.0);
  fall = fall * fall * (3.0 - 2.0 * fall);
  float diffuse = uBillboard > 0.5 ? 1.0 : 0.45 + 0.55 * abs(dot(normalize(vNormal), toCam / max(d, 0.001)));
  vec3 lightCol = mix(vec3(1.0, 0.80, 0.58), vec3(0.72, 0.78, 0.86), uMono);
  vec3 lit = t.rgb * lightCol * (fall * diffuse * uFlicker * 1.5 + 0.012);
  lit = lit / (1.0 + 0.45 * lit); // Soft shoulder, so pale stone up close doesn't blow out.
  if (uMono > 0.5) { float g = dot(lit, vec3(0.3, 0.59, 0.11)); lit = vec3(g) * vec3(0.8, 0.9, 1.0); }
  lit = mix(lit, t.rgb * uTint, uEmissive);
  lit = mix(lit, vec3(1.0, 0.55, 0.4) * t.a, uFlash);
  color = vec4(lit, t.a);
}`;

const STEP_GLIDE = 0.2;
const TURN_GLIDE = 0.18;
const CAMERA_BACK = 0.36; // The eye sits behind the cell centre so the wall ahead fits the view.
const EYE = 0.5;
const FOV_Y = 62 * Math.PI / 180;
// A monster's melee attack rakes across the view just in front of the eye, so it shows even from behind the party.
const SLASH = { ahead: 0.4, side: 0.14, height: 0.36 };
// How long a monster holds its attack pose, outlasting the slash, and how much taller it is drawn: the raised weapon
// reaches the top of that picture, so at the same height the body would shrink.
const ATTACK_POSE = { seconds: 0.6, scale: 1.12 };

const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return h >>> 0; };
const ease = (t) => t * t * (3 - 2 * t);

function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}
function lookAt(ex, ey, ez, cx, cy, cz, ux, uy, uz) {
  let zx = ex - cx, zy = ey - cy, zz = ez - cz;
  let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
  let xx = uy * zz - uz * zy, xy = uz * zx - ux * zz, xz = ux * zy - uy * zx;
  l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  return new Float32Array([xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0, -(xx * ex + xy * ey + xz * ez), -(yx * ex + yy * ey + yz * ez), -(zx * ex + zy * ey + zz * ez), 1]);
}
function multiply(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; }
  return o;
}

export class View3D {
  /** @param canvas target canvas  @param assetUrl name -> image URL */
  constructor(canvas, assetUrl) {
    this.canvas = canvas;
    this.assetUrl = assetUrl;
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL2 is required');
    this.gl = gl;
    this.textures = new Map();
    this.prog = this.program(VS, FS);
    this.u = {};
    for (const n of ['uViewProj', 'uTex', 'uCam', 'uRadius', 'uFlicker', 'uMono', 'uTint', 'uFlash', 'uEmissive', 'uBillboard']) this.u[n] = gl.getUniformLocation(this.prog, n);
    this.aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    this.vao = gl.createVertexArray();
    this.staticBuf = gl.createBuffer();
    this.dynBuf = gl.createBuffer();
    this.dynData = new Float32Array(8 * 6);
    gl.bindVertexArray(this.vao);
    this.batches = [];
    this.meshKey = null;
    this.cam = null;
    this.picks = [];
    this.visual = new Map();
    this.floaters = [];
    this.glow = this.makeGlowTexture();
    gl.enable(gl.DEPTH_TEST);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  }

  program(vs, fs) {
    const gl = this.gl;
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }

  // ---------------------------------------------------------------- textures
  /** Returns a texture record immediately; it fills in when the image has loaded. */
  texture(name) {
    let rec = this.textures.get(name);
    if (rec) return rec;
    const gl = this.gl;
    rec = { tex: gl.createTexture(), w: 1, h: 1, loaded: false, name };
    this.textures.set(name, rec);
    gl.bindTexture(gl.TEXTURE_2D, rec.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
    const url = this.assetUrl(name);
    if (!url) return rec;
    rec.ready = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => { this.upload(rec, img); resolve(rec); };
      img.onerror = () => { console.warn('missing texture', name); resolve(rec); };
      img.src = url;
    });
    return rec;
  }
  upload(rec, source) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, rec.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    if (this.aniso) gl.texParameterf(gl.TEXTURE_2D, this.aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(this.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    rec.w = source.width; rec.h = source.height; rec.loaded = true;
  }
  preload(names) { return Promise.all(names.map((n) => this.texture(n).ready)); }
  makeGlowTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.3, 'rgba(255,255,255,0.75)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    const rec = { tex: this.gl.createTexture(), w: 64, h: 64, loaded: false, name: 'glow' };
    this.upload(rec, c);
    return rec;
  }

  // ---------------------------------------------------------------- static mesh
  /** Rebuilds wall, floor and ceiling geometry when the level or its layout changes. */
  buildLevel(game) {
    const level = game.level;
    const key = `${level.id}:${game.geometryVersion ?? 0}`;
    if (this.meshKey === key) return;
    this.meshKey = key;
    const groups = new Map();
    const push = (tex, verts) => { if (!groups.has(tex)) groups.set(tex, []); groups.get(tex).push(...verts); };
    const tx = level.textures;
    const wallTex = tx.wall ?? 'wall-warren', floorTex = tx.floor ?? 'floor-warren', ceilTex = tx.ceiling ?? 'ceiling';
    const faceObj = new Map();
    for (const o of level.objects) {
      if ((o.type === 'wall' && o.kind === 'alcove') || o.type === 'stairs') faceObj.set(`${o.x},${o.y},${o.face}`, o);
    }
    for (let y = 0; y < level.height; y++) {
      for (let x = 0; x < level.width; x++) {
        if (game.isSolid(x, y, level.id)) continue;
        const flip = hash(x, y);
        const u0 = flip & 1 ? 1 : 0, u1 = 1 - u0, v0 = flip & 2 ? 1 : 0, v1 = 1 - v0;
        push(floorTex, quad([x, y, 0], [x + 1, y, 0], [x + 1, y + 1, 0], [x, y + 1, 0], [u0, v0], [u1, v0], [u1, v1], [u0, v1], [0, 0, 1]));
        push(ceilTex, quad([x, y, 1], [x + 1, y, 1], [x + 1, y + 1, 1], [x, y + 1, 1], [u0, v0], [u1, v0], [u1, v1], [u0, v1], [0, 0, -1]));
        for (let d = 0; d < 4; d++) {
          const nx = x + DIRS[d].x, ny = y + DIRS[d].y;
          if (!game.isSolid(nx, ny, level.id)) continue;
          const o = faceObj.get(`${nx},${ny},${(d + 2) % 4}`);
          let tex = wallTex;
          if (o?.type === 'stairs') tex = o.direction === 'up' ? 'stairs-up' : 'stairs-down';
          else if (o) tex = o.art ?? 'alcove';
          const mirror = !o && hash(nx * 3 + d, ny * 5) & 1;
          push(tex, wallQuad(x, y, d, mirror));
        }
      }
    }
    const gl = this.gl;
    const flat = [];
    this.batches = [];
    for (const [tex, verts] of groups) {
      this.batches.push({ tex, first: flat.length / 8, count: verts.length / 8 });
      flat.push(...verts);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.staticBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(flat), gl.STATIC_DRAW);
  }

  bindAttribs(buf) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    const loc = (n) => gl.getAttribLocation(this.prog, n);
    gl.enableVertexAttribArray(loc('aPos')); gl.vertexAttribPointer(loc('aPos'), 3, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(loc('aUv')); gl.vertexAttribPointer(loc('aUv'), 2, gl.FLOAT, false, 32, 12);
    gl.enableVertexAttribArray(loc('aNormal')); gl.vertexAttribPointer(loc('aNormal'), 3, gl.FLOAT, false, 32, 20);
  }

  // ---------------------------------------------------------------- camera
  updateCamera(game, dt) {
    const p = game.party;
    const f = DIRS[p.dir];
    const tx = p.x + 0.5 - f.x * CAMERA_BACK, ty = p.y + 0.5 - f.y * CAMERA_BACK;
    const angle = p.dir * Math.PI / 2;
    const cut = !this.cam || this.cam.level !== p.level || this.cam.teleports !== (game.teleports ?? 0);
    if (cut) {
      this.cam = { x: tx, y: ty, angle, level: p.level, teleports: game.teleports ?? 0, fromX: tx, fromY: ty, fromA: angle, toX: tx, toY: ty, toA: angle, t: 1, dur: 1 };
    } else {
      const c = this.cam;
      if (c.toX !== tx || c.toY !== ty || c.toA !== angle) {
        // Start a new glide from wherever the camera is now; take the short way round when turning.
        let delta = angle - c.angle;
        delta = Math.atan2(Math.sin(delta), Math.cos(delta));
        c.fromX = c.x; c.fromY = c.y; c.fromA = c.angle;
        c.toX = tx; c.toY = ty; c.toA = angle; c.deltaA = delta;
        c.t = 0; c.dur = Math.abs(delta) > 0.01 ? TURN_GLIDE : STEP_GLIDE;
      }
      if (c.t < 1) {
        c.t = Math.min(1, c.t + dt / c.dur);
        const e = ease(c.t);
        c.x = c.fromX + (c.toX - c.fromX) * e;
        c.y = c.fromY + (c.toY - c.fromY) * e;
        c.angle = c.fromA + (c.deltaA ?? 0) * e;
      } else { c.x = tx; c.y = ty; c.angle = angle; }
    }
    const fx = Math.sin(this.cam.angle), fy = -Math.cos(this.cam.angle);
    this.forward = [fx, fy];
    const w = this.canvas.width, h = this.canvas.height;
    const proj = perspective(FOV_Y, w / h, 0.03, 40);
    // Map coordinates are left-handed (x east, y south, z up) but lookAt assumes right-handed, which would
    // mirror the picture. Flipping clip-space x puts east on the right when facing north.
    proj[0] = -proj[0];
    const view = lookAt(this.cam.x, this.cam.y, EYE, this.cam.x + fx, this.cam.y + fy, EYE, 0, 0, 1);
    this.viewProj = multiply(proj, view);
    this.proj = proj;
  }

  /** World point -> CSS-independent 0..1 viewport coordinates, or null when behind the eye. */
  project(x, y, z) {
    const m = this.viewProj;
    const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
    const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
    const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (cw <= 0.01) return null;
    return { x: (cx / cw + 1) / 2, y: (1 - cy / cw) / 2 };
  }

  // ---------------------------------------------------------------- frame
  render(game, dt) {
    this.ruleset = game.ruleset;
    const gl = this.gl;
    this.buildLevel(game);
    this.updateCamera(game, dt);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    const light = game.ruleset.light(game);
    const t = game.realTime;
    const flicker = light.bright ? 0.94 + 0.04 * Math.sin(t * 9.1) + 0.03 * Math.sin(t * 23.7) : 1;
    gl.uniformMatrix4fv(this.u.uViewProj, false, this.viewProj);
    gl.uniform3f(this.u.uCam, this.cam.x, this.cam.y, EYE);
    gl.uniform1f(this.u.uRadius, light.radius + 0.6);
    gl.uniform1f(this.u.uFlicker, flicker);
    gl.uniform1f(this.u.uMono, light.mono ? 1 : 0);
    gl.uniform1i(this.u.uTex, 0);
    this.setMaterial();

    // Opaque level geometry.
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    gl.disable(gl.CULL_FACE);
    this.bindAttribs(this.staticBuf);
    for (const b of this.batches) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.tileTexture(b.tex).tex);
      gl.drawArrays(gl.TRIANGLES, b.first, b.count);
    }

    // Everything see-through: sorted far to near.
    const draws = this.collect(game, dt);
    draws.sort((a, b) => b.depth - a.depth);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    this.bindAttribs(this.dynBuf);
    this.picks = [];
    for (const d of draws) this.drawOne(d);
    gl.depthMask(true);
  }

  tileTexture(name) {
    const rec = this.texture(name);
    if (rec.loaded && !rec.wrapped) {
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, rec.tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      rec.wrapped = true;
    }
    return rec;
  }

  setMaterial({ tint = [1, 1, 1], flash = 0, emissive = 0, billboard = 0 } = {}) {
    const gl = this.gl;
    gl.uniform3f(this.u.uTint, tint[0], tint[1], tint[2]);
    gl.uniform1f(this.u.uFlash, flash);
    gl.uniform1f(this.u.uEmissive, emissive);
    gl.uniform1f(this.u.uBillboard, billboard);
  }

  depthOf(x, y) { return (x - this.cam.x) * this.forward[0] + (y - this.cam.y) * this.forward[1]; }

  /** Gathers doors, decals, fixtures, creatures, items and effects for this frame. */
  collect(game, dt) {
    const draws = [];
    const level = game.level;
    const inRange = (o) => Math.hypot(o.x + 0.5 - this.cam.x, o.y + 0.5 - this.cam.y) < 14;
    for (const o of level.objects) {
      if (!inRange(o)) continue;
      if (o.type === 'door' && !o.secret) this.collectDoor(o, draws);
      else if (o.type === 'wall') this.collectFixture(o, draws);
      else if ((o.type === 'pit' && !o.hidden) || (o.type === 'plate' && !o.hidden)) {
        draws.push({ verts: quad([o.x + 0.06, o.y + 0.06, 0.004], [o.x + 0.94, o.y + 0.06, 0.004], [o.x + 0.94, o.y + 0.94, 0.004], [o.x + 0.06, o.y + 0.94, 0.004], [0, 0], [1, 0], [1, 1], [0, 1], [0, 0, 1]), tex: this.texture(o.type), depth: this.depthOf(o.x + 0.5, o.y + 0.5) + 2 });
      } else if (o.type === 'ward' && !o.broken) {
        draws.push({ verts: quad([o.x + 0.02, o.y + 0.02, 0.005], [o.x + 0.98, o.y + 0.02, 0.005], [o.x + 0.98, o.y + 0.98, 0.005], [o.x + 0.02, o.y + 0.98, 0.005], [0, 0], [1, 0], [1, 1], [0, 1], [0, 0, 1]), tex: this.texture(o.art ?? 'salt-line'), depth: this.depthOf(o.x + 0.5, o.y + 0.5) });
      } else if (o.type === 'feature') {
        const name = o.sprite === 'chest' && o.opened ? 'chest-open' : o.sprite;
        this.billboard(draws, name, o.x + 0.5, o.y + 0.5, o.height ?? (o.sprite === 'altar' ? 0.5 : 0.36), { pick: { type: 'feature', ref: o } });
      }
    }
    for (const it of game.floorItems) {
      if (it.level !== level.id || !inRange(it)) continue;
      const info = game.ruleset.itemInfo(it.item);
      const px = it.x + 0.2 + it.sx * 0.6, py = it.y + 0.2 + it.sy * 0.6;
      this.billboard(draws, `icon-${info.icon}`, px, py, 0.17, { pick: { type: 'item', ref: it }, lift: 0.01 });
    }
    for (const e of game.entities) {
      if (e.dead || e.level !== level.id) continue;
      this.collectEntity(game, e, draws, dt);
    }
    for (const f of game.fx) {
      if (f.kind === 'slash') this.collectSlash(game, f, draws);
      if (f.kind !== 'bolt') continue;
      const k = (game.realTime - f.born) / f.life;
      const x = f.fromX + (f.toX - f.fromX) * k, y = f.fromY + (f.toY - f.fromY) * k;
      this.billboard(draws, null, x, y, 0.22, { rec: this.glow, emissive: 1, tint: colorRgb(f.color), z: 0.38 });
    }
    return draws;
  }

  /** Toward the side the attacker is on, opening fast and then fading. */
  collectSlash(game, f, draws) {
    const k = (game.realTime - f.born) / f.life;
    const [fx, fy] = this.forward;
    const across = (f.x - this.cam.x) * -fy + (f.y - this.cam.y) * fx;
    const side = Math.abs(across) < 0.5 ? 0 : Math.sign(across) * SLASH.side;
    const x = this.cam.x + fx * SLASH.ahead - fy * side, y = this.cam.y + fy * SLASH.ahead + fx * side;
    const glow = k < 0.2 ? 1 : 1 - (k - 0.2) / 0.8;
    this.billboard(draws, 'slash', x, y, SLASH.height * (0.85 + 0.15 * Math.min(1, k * 4)), { emissive: 1, tint: [glow, glow, glow], z: EYE });
  }

  collectDoor(o, draws) {
    const open = o.open;
    const top = 1, bottom = open * 0.94;
    const uvTop = 0, uvBottom = 1 - open * 0.94;
    const tex = this.texture({ wood: 'door-wood', iron: 'door-iron', portcullis: 'portcullis' }[o.style] ?? 'door-wood');
    const v = (ax, ay, bx, by) => quad([ax, ay, bottom], [bx, by, bottom], [bx, by, top], [ax, ay, top], [0, uvBottom], [1, uvBottom], [1, uvTop], [0, uvTop], o.axis === 'x' ? [1, 0, 0] : [0, 1, 0]);
    const verts = o.axis === 'x' ? v(o.x + 0.5, o.y, o.x + 0.5, o.y + 1) : v(o.x, o.y + 0.5, o.x + 1, o.y + 0.5);
    draws.push({ verts, tex, depth: this.depthOf(o.x + 0.5, o.y + 0.5), writesDepth: true });
  }

  collectFixture(o, draws) {
    if (o.kind === 'alcove') {
      const items = o.items ?? [];
      if (!items.length) return;
      this.onWall(draws, o, `icon-${this.iconFor(items.at(-1))}`, 0.2, 0.34);
      return;
    }
    const name = o.kind === 'lever' ? (o.down ? 'lever-down' : 'lever-up') : o.kind === 'plaque' ? 'plaque' : null;
    if (name) this.onWall(draws, o, name, 0.36, 0.5);
  }
  iconFor(item) { return this.ruleset.itemInfo(item).icon; }

  onWall(draws, o, name, size, cz) {
    const d = DIRS[o.face];
    const nx = d.x, ny = d.y;
    // Just proud of the wall's outward face, half a cell from the wall cell's centre toward the corridor.
    const cx = o.x + 0.5 + nx * 0.505, cy = o.y + 0.5 + ny * 0.505;
    const r = { x: -ny, y: nx };
    const h = size / 2;
    const a = [cx - r.x * h, cy - r.y * h], b = [cx + r.x * h, cy + r.y * h];
    draws.push({
      verts: quad([a[0], a[1], cz - h], [b[0], b[1], cz - h], [b[0], b[1], cz + h], [a[0], a[1], cz + h], [1, 1], [0, 1], [0, 0], [1, 0], [nx, ny, 0]),
      tex: this.texture(name), depth: this.depthOf(cx, cy),
    });
  }

  collectEntity(game, e, draws, dt) {
    const info = game.ruleset.monsterInfo(e);
    const gx = info.fills ? e.x + 0.5 : e.x + 0.25 + (e.sx ?? 0) * 0.5;
    const gy = info.fills ? e.y + 0.5 : e.y + 0.25 + (e.sy ?? 0) * 0.5;
    let v = this.visual.get(e.uid);
    if (!v || v.level !== e.level) { v = { x: gx, y: gy, level: e.level }; this.visual.set(e.uid, v); }
    const k = Math.min(1, dt * 7);
    v.x += (gx - v.x) * k; v.y += (gy - v.y) * k;
    const age = game.realTime - (e.attackAnim ?? -9);
    const lunge = age < 0.3 ? Math.sin(age / 0.3 * Math.PI) : 0;
    const toCamX = this.cam.x - v.x, toCamY = this.cam.y - v.y, l = Math.hypot(toCamX, toCamY) || 1;
    const x = v.x + toCamX / l * lunge * 0.14, y = v.y + toCamY / l * lunge * 0.14;
    const hitAge = game.realTime - (e.hitAt ?? -9);
    const flash = hitAge < 0.16 ? 0.75 * (1 - hitAge / 0.16) : 0;
    // Sprites without an attack picture keep their usual one.
    const pose = age < ATTACK_POSE.seconds && this.assetUrl(`${info.sprite}-attack`) ? `${info.sprite}-attack` : null;
    const height = 0.74 * info.scale;
    const breathe = 1 + 0.012 * Math.sin(game.realTime * 2.2 + hash(e.x, e.y) % 7);
    this.billboard(draws, pose ?? info.sprite, x, y, height * breathe * (pose ? ATTACK_POSE.scale : 1), { flash, pick: { type: 'monster', ref: e } });
    if (e.hitAt != null && e.hitShown !== e.hitAt) {
      e.hitShown = e.hitAt;
      this.floaters.push({ x, y, z: height * 0.8, text: String(e.hitAmount), born: game.realTime });
    }
  }

  billboard(draws, name, x, y, height, { rec = null, pick = null, flash = 0, emissive = 0, tint, lift = 0, z = null } = {}) {
    const tex = rec ?? this.texture(name);
    const aspect = tex.loaded ? tex.w / tex.h : 1;
    const depth = this.depthOf(x, y);
    if (depth < 0.08) return;
    const w = height * aspect;
    const rx = -this.forward[1], ry = this.forward[0];
    const a = [x - rx * w / 2, y - ry * w / 2], b = [x + rx * w / 2, y + ry * w / 2];
    const z0 = z !== null ? z - height / 2 : lift, z1 = z0 + height;
    const verts = quad([a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1], [0, 1], [1, 1], [1, 0], [0, 0], [0, 0, 1]);
    draws.push({ verts, tex, depth, flash, emissive, tint, billboard: 1, pick, box: pick ? { a, b, z0, z1 } : null });
  }

  drawOne(d) {
    const gl = this.gl;
    this.dynData = d.verts instanceof Float32Array ? d.verts : new Float32Array(d.verts);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dynBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.dynData, gl.DYNAMIC_DRAW);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, d.tex.tex);
    this.setMaterial(d);
    if (d.emissive) gl.blendFunc(gl.ONE, gl.ONE); else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(!!d.writesDepth);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    if (d.pick && d.box) {
      const c = [this.project(d.box.a[0], d.box.a[1], d.box.z1), this.project(d.box.b[0], d.box.b[1], d.box.z0)];
      if (c[0] && c[1]) this.picks.push({ ...d.pick, depth: d.depth, x0: Math.min(c[0].x, c[1].x), x1: Math.max(c[0].x, c[1].x), y0: Math.min(c[0].y, c[1].y), y1: Math.max(c[0].y, c[1].y) });
    }
  }

  // ---------------------------------------------------------------- picking
  /**
   * Finds what's under a viewport point (0..1). Sprites are tested against their boxes, then a ray is
   * walked through the grid in the same space the renderer draws, stopping at doors, walls, floor or ceiling.
   */
  pick(game, u, v) {
    const scene = this.pickScene(game, u, v);
    const hits = this.picks.filter((p) => u >= p.x0 && u <= p.x1 && v >= p.y0 && v <= p.y1 && p.depth < scene.t + 0.2).sort((a, b) => a.depth - b.depth);
    return hits[0] ? { ...hits[0], dist: hits[0].depth } : scene;
  }

  pickScene(game, u, v) {
    const aspect = this.canvas.width / this.canvas.height;
    const tanY = Math.tan(FOV_Y / 2);
    const sx = (2 * u - 1) * tanY * aspect, sy = (1 - 2 * v) * tanY;
    const fx = this.forward[0], fy = this.forward[1];
    const rx = -fy, ry = fx;
    const dx = fx + rx * sx, dy = fy + ry * sx, dz = sy;
    const ox = this.cam.x, oy = this.cam.y, oz = EYE;
    const tFloor = dz < 0 ? (0 - oz) / dz : Infinity;
    const tCeil = dz > 0 ? (1 - oz) / dz : Infinity;
    const tPlane = Math.min(tFloor, tCeil);

    let cx = Math.floor(ox), cy = Math.floor(oy);
    const stepX = Math.sign(dx), stepY = Math.sign(dy);
    const nextT = (o, c, d, s) => (d === 0 ? Infinity : ((s > 0 ? c + 1 : c) - o) / d);
    const dtX = dx === 0 ? Infinity : Math.abs(1 / dx), dtY = dy === 0 ? Infinity : Math.abs(1 / dy);
    let tX = nextT(ox, cx, dx, stepX), tY = nextT(oy, cy, dy, stepY);
    let t = 0;
    for (let i = 0; i < 40; i++) {
      // A door plane runs through the middle of its cell.
      const door = game.doorAt(cx, cy);
      if (door && !door.secret) {
        const planeT = door.axis === 'x' ? (cx + 0.5 - ox) / dx : (cy + 0.5 - oy) / dy;
        const px = ox + dx * planeT, py = oy + dy * planeT, pz = oz + dz * planeT;
        if (planeT > t - 1e-6 && planeT > 0 && planeT < Math.min(tX, tY) + 1e-6 && Math.floor(px) === cx && Math.floor(py) === cy && pz >= door.open * 0.94 && pz <= 1) {
          return { type: 'door', ref: door, t: planeT, dist: planeT };
        }
      }
      if (tPlane < Math.min(tX, tY)) {
        return tPlane === tFloor ? { type: 'floor', x: cx, y: cy, t: tPlane, dist: tPlane } : { type: 'ceiling', t: tPlane, dist: tPlane };
      }
      let face;
      if (tX < tY) { t = tX; tX += dtX; cx += stepX; face = stepX > 0 ? 3 : 1; }
      else { t = tY; tY += dtY; cy += stepY; face = stepY > 0 ? 0 : 2; }
      if (game.isSolid(cx, cy)) {
        const obj = game.objectsAt(cx, cy).find((o) => (o.type === 'wall' || o.type === 'stairs') && o.face === face);
        return { type: 'wall', x: cx, y: cy, face, ref: obj ?? null, t, dist: t };
      }
    }
    return { type: 'none', t: Infinity, dist: Infinity };
  }

  /** Damage numbers waiting to be shown; the HUD draws them as text over the canvas. */
  takeFloaters() {
    const out = this.floaters.map((f) => ({ ...f, at: this.project(f.x, f.y, f.z) })).filter((f) => f.at);
    this.floaters = [];
    return out;
  }
}

function quad(a, b, c, d, ua, ub, uc, ud, n) {
  const row = (p, uv) => [p[0], p[1], p[2], uv[0], uv[1], n[0], n[1], n[2]];
  return [...row(a, ua), ...row(b, ub), ...row(c, uc), ...row(a, ua), ...row(c, uc), ...row(d, ud)];
}

/** The wall on side d of floor cell (x,y), textured the right way up and left-to-right seen from inside. */
function wallQuad(x, y, d, mirror) {
  const corners = [
    [[x, y], [x + 1, y]],         // N wall: seen looking north, left is west.
    [[x + 1, y], [x + 1, y + 1]], // E
    [[x + 1, y + 1], [x, y + 1]], // S
    [[x, y + 1], [x, y]],         // W
  ][d];
  const [l, r] = corners;
  const n = DIRS[d];
  const u0 = mirror ? 1 : 0, u1 = 1 - u0;
  return quad([l[0], l[1], 0], [r[0], r[1], 0], [r[0], r[1], 1], [l[0], l[1], 1], [u0, 1], [u1, 1], [u1, 0], [u0, 0], [-n.x, -n.y, 0]);
}
