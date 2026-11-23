// Rendu de la carte façon carte ancienne : relief ombré, côtes à l'encre, rivières, symboles, frontières, routes, villes.
import { B, BIOME_COLOR, isWaterBiome } from './terrain.js';
import { jit, makeNoise } from './rng.js';
import { buildCityPlan, drawCityPlan, drawCityBridges, planKey, cityRadius, rgb } from './city.js';

const RES = 8; // pixels par case pour le fond

export function buildBaseLayer(T, seed) {
  const { W, H } = T, N = W * H;
  const cw = W * RES, ch = H * RES;
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(cw, ch); const d = img.data;
  const nz = makeNoise(seed + 99);
  // couleurs par case (terre / eau) + ombrage
  const landC = new Float32Array(N * 3), waterC = new Float32Array(N * 3), shade = new Float32Array(N), wv = new Float32Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, b = T.biome[i];
    const water = isWaterBiome(b);
    wv[i] = water ? (b === B.LAKE ? -0.06 : T.h[i]) : Math.max(0.004, T.h[i]);
    const v = 1 + nz.fbm(x * 0.08, y * 0.08, 3) * 0.06;
    let lc = water ? BIOME_COLOR[B.BEACH] : BIOME_COLOR[b];
    if (!water && b !== B.SNOW && b !== B.MOUNTAIN) { // humidité → teinte plus verte
      const m = T.moist[i] - 0.5;
      lc = [lc[0] - m * 18, lc[1] + m * 4, lc[2] - m * 10];
    }
    let wc;
    if (b === B.LAKE) wc = BIOME_COLOR[B.LAKE];
    else if (water) { const t = Math.min(1, -T.h[i] * 1.6); wc = BIOME_COLOR[B.SEA].map((c, k) => c + (BIOME_COLOR[B.DEEP][k] - c) * t); }
    else wc = BIOME_COLOR[B.SEA];
    for (let k = 0; k < 3; k++) { landC[i * 3 + k] = lc[k] * v; waterC[i * 3 + k] = wc[k] * (1 + (v - 1) * 0.5); }
    const xl = Math.max(0, x - 1), xr = Math.min(W - 1, x + 1), yu = Math.max(0, y - 1), yd = Math.min(H - 1, y + 1);
    const gx = T.shadeH[y * W + xr] - T.shadeH[y * W + xl], gy = T.shadeH[yd * W + x] - T.shadeH[yu * W + x];
    shade[i] = water ? 1 : Math.max(0.55, Math.min(1.35, 1 - (gx + gy) * 2.6));
  }
  const landMask = new Uint8Array(cw * ch);
  const hv = new Float32Array(cw * ch);
  for (let py = 0; py < ch; py++) {
    let fy = (py + 0.5) / RES - 0.5; if (fy < 0) fy = 0; if (fy > H - 1.001) fy = H - 1.001;
    const y0 = Math.floor(fy), ty = fy - y0;
    for (let px = 0; px < cw; px++) {
      let fx = (px + 0.5) / RES - 0.5; if (fx < 0) fx = 0; if (fx > W - 1.001) fx = W - 1.001;
      const x0 = Math.floor(fx), tx = fx - x0;
      const i00 = y0 * W + x0, i10 = i00 + 1, i01 = i00 + W, i11 = i01 + 1;
      const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
      const val = wv[i00] * w00 + wv[i10] * w10 + wv[i01] * w01 + wv[i11] * w11;
      const o = (py * cw + px) * 4;
      const C = val < 0 ? waterC : landC;
      let r = C[i00 * 3] * w00 + C[i10 * 3] * w10 + C[i01 * 3] * w01 + C[i11 * 3] * w11;
      let g = C[i00 * 3 + 1] * w00 + C[i10 * 3 + 1] * w10 + C[i01 * 3 + 1] * w01 + C[i11 * 3 + 1] * w11;
      let bb = C[i00 * 3 + 2] * w00 + C[i10 * 3 + 2] * w10 + C[i01 * 3 + 2] * w01 + C[i11 * 3 + 2] * w11;
      if (val >= 0) {
        const s = shade[i00] * w00 + shade[i10] * w10 + shade[i01] * w01 + shade[i11] * w11;
        r *= s; g *= s; bb *= s * 0.97;
        landMask[py * cw + px] = 1;
      }
      // grain du papier
      const gr = ((px * 73856093 ^ py * 19349663) >>> 0) % 13 - 6;
      d[o] = r + gr; d[o + 1] = g + gr; d[o + 2] = bb + gr * 0.8; d[o + 3] = 255;
      hv[py * cw + px] = val;
    }
  }
  // côtes à l'encre + lignes de profondeur (isobathes)
  const levels = [-0.035, -0.09, -0.17];
  for (let py = 1; py < ch - 1; py++) for (let px = 1; px < cw - 1; px++) {
    const p = py * cw + px, o = p * 4;
    if (landMask[p]) {
      if (!landMask[p - 1] || !landMask[p + 1] || !landMask[p - cw] || !landMask[p + cw]) { d[o] = 74; d[o + 1] = 60; d[o + 2] = 44; }
    } else {
      const v = hv[p];
      for (let k = 0; k < levels.length; k++) {
        const L = levels[k];
        if (v < L && (hv[p - 1] >= L || hv[p + 1] >= L || hv[p - cw] >= L || hv[p + cw] >= L)) {
          const a = 0.35 - k * 0.09;
          d[o] = d[o] + (60 - d[o]) * a; d[o + 1] = d[o + 1] + (90 - d[o + 1]) * a; d[o + 2] = d[o + 2] + (100 - d[o + 2]) * a;
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  ctx.save(); ctx.scale(RES, RES);
  drawRivers(ctx, T);
  drawSymbols(ctx, T, seed);
  ctx.restore();
  // vignette
  const grd = ctx.createRadialGradient(cw / 2, ch / 2, ch * 0.35, cw / 2, ch / 2, cw * 0.7);
  grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(70,45,20,0.35)');
  ctx.fillStyle = grd; ctx.fillRect(0, 0, cw, ch);
  return cv;
}

export function riverPaths(T) {
  // segments vectoriels de rivière groupés par largeur (pour l'affichage net en zoom)
  const { W } = T, groups = new Map();
  const pt = i => [i % W + 0.5 + jit(i, 1) * 0.55, ((i / W) | 0) + 0.5 + jit(i, 2) * 0.55];
  for (let i = 0; i < W * T.H; i++) {
    if (!T.river[i]) continue;
    const n = T.ds[i]; if (n < 0) continue;
    const a = pt(i), b = pt(n);
    const w = Math.round((0.1 + Math.sqrt(T.acc[i]) * 0.011) * 20) / 20;
    if (!groups.has(w)) groups.set(w, new Path2D());
    const p = groups.get(w); p.moveTo(a[0], a[1]); p.lineTo(b[0], b[1]);
  }
  return [...groups.entries()];
}

function drawRivers(ctx, T) {
  const { W } = T;
  const pt = i => [i % W + 0.5 + jit(i, 1) * 0.55, ((i / W) | 0) + 0.5 + jit(i, 2) * 0.55];
  const up = new Uint8Array(W * T.H);
  for (let i = 0; i < W * T.H; i++) if (T.river[i] && T.ds[i] >= 0) up[T.ds[i]]++;
  const done = new Uint8Array(W * T.H);
  ctx.strokeStyle = 'rgb(78,118,142)'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let s = 0; s < W * T.H; s++) {
    if (!T.river[s] || up[s]) continue;
    // remonter une chaîne depuis la source
    const chain = [s]; let c = s;
    while (true) {
      const n = T.ds[c];
      if (n < 0) break;
      chain.push(n);
      if (!T.river[n] && T.h[n] <= 0) break;
      if (T.lake[n]) break;
      if (done[n]) break;
      done[n] = 1; c = n;
    }
    for (let k = 1; k < chain.length - 1; k++) {
      const a = pt(chain[k - 1]), b = pt(chain[k]), e = pt(chain[k + 1]);
      const m0 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], m1 = [(b[0] + e[0]) / 2, (b[1] + e[1]) / 2];
      ctx.lineWidth = 0.1 + Math.sqrt(T.acc[chain[k]]) * 0.011;
      ctx.beginPath(); ctx.moveTo(m0[0], m0[1]); ctx.quadraticCurveTo(b[0], b[1], m1[0], m1[1]); ctx.stroke();
    }
    if (chain.length >= 2) {
      const a = pt(chain[0]), b = pt(chain[1]);
      ctx.lineWidth = 0.1; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2); ctx.stroke();
    }
  }
}

function drawSymbols(ctx, T, seed) {
  const { W, H } = T;
  const items = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x, b = T.biome[i];
    const r = (jit(i, seed) + 0.5);
    const px = x + 0.5 + jit(i, 7) * 0.8, py = y + 0.5 + jit(i, 8) * 0.8;
    if ((b === B.MOUNTAIN || b === B.SNOW) && r < 0.42) items.push([py, 'm', px, py, T.h[i], b === B.SNOW]);
    else if (b === B.HILLS && r < 0.22) items.push([py, 'h', px, py]);
    else if ((b === B.FOREST || b === B.JUNGLE) && r < (b === B.JUNGLE ? 0.75 : 0.55)) items.push([py, 't', px, py, b === B.JUNGLE]);
    else if (b === B.TAIGA && r < 0.5) items.push([py, 'p', px, py]);
    else if (b === B.SWAMP && r < 0.35) items.push([py, 's', px, py]);
    else if (b === B.DESERT && r < 0.25) items.push([py, 'd', px, py]);
  }
  items.sort((a, b) => a[0] - b[0]);
  ctx.lineJoin = 'round';
  for (const it of items) {
    const [, k, x, y] = it;
    if (k === 'm') {
      const s = 0.75 + it[4] * 0.9, w = 1.05 * s, h = 1.05 * s;
      ctx.beginPath(); ctx.moveTo(x - w, y + 0.2); ctx.lineTo(x, y - h); ctx.lineTo(x + w, y + 0.2); ctx.closePath();
      ctx.fillStyle = 'rgb(214,198,164)'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(x, y - h); ctx.lineTo(x + w, y + 0.2); ctx.lineTo(x + w * 0.1, y + 0.2); ctx.lineTo(x + w * 0.15, y - h * 0.4); ctx.closePath();
      ctx.fillStyle = 'rgb(150,128,100)'; ctx.fill();
      if (it[5] || it[4] > 0.85) { ctx.beginPath(); ctx.moveTo(x - w * 0.35, y - h * 0.62); ctx.lineTo(x, y - h); ctx.lineTo(x + w * 0.35, y - h * 0.62); ctx.lineTo(x + w * 0.1, y - h * 0.7); ctx.lineTo(x - w * 0.1, y - h * 0.58); ctx.closePath(); ctx.fillStyle = 'rgb(250,248,240)'; ctx.fill(); }
      ctx.beginPath(); ctx.moveTo(x - w, y + 0.2); ctx.lineTo(x, y - h); ctx.lineTo(x + w, y + 0.2);
      ctx.strokeStyle = 'rgba(70,52,36,0.9)'; ctx.lineWidth = 0.09; ctx.stroke();
    } else if (k === 'h') {
      ctx.beginPath(); ctx.arc(x, y + 0.3, 0.55, Math.PI * 1.1, Math.PI * 1.9);
      ctx.strokeStyle = 'rgba(90,70,48,0.75)'; ctx.lineWidth = 0.08; ctx.stroke();
    } else if (k === 't') {
      ctx.beginPath(); ctx.moveTo(x, y + 0.1); ctx.lineTo(x, y + 0.42);
      ctx.strokeStyle = 'rgba(70,52,36,0.8)'; ctx.lineWidth = 0.07; ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y - 0.08, it[4] ? 0.36 : 0.3, 0, Math.PI * 2);
      ctx.fillStyle = it[4] ? 'rgb(86,128,74)' : 'rgb(112,140,84)'; ctx.fill();
      ctx.strokeStyle = 'rgba(50,60,36,0.85)'; ctx.lineWidth = 0.06; ctx.stroke();
    } else if (k === 'p') {
      ctx.beginPath(); ctx.moveTo(x - 0.28, y + 0.3); ctx.lineTo(x, y - 0.5); ctx.lineTo(x + 0.28, y + 0.3); ctx.closePath();
      ctx.fillStyle = 'rgb(92,118,88)'; ctx.fill(); ctx.strokeStyle = 'rgba(50,60,36,0.85)'; ctx.lineWidth = 0.06; ctx.stroke();
    } else if (k === 's') {
      ctx.beginPath(); for (let q = -1; q <= 1; q++) { ctx.moveTo(x + q * 0.18, y + 0.2); ctx.lineTo(x + q * 0.25, y - 0.15); }
      ctx.moveTo(x - 0.4, y + 0.22); ctx.lineTo(x + 0.4, y + 0.22);
      ctx.strokeStyle = 'rgba(60,80,60,0.8)'; ctx.lineWidth = 0.06; ctx.stroke();
    } else if (k === 'd') {
      ctx.beginPath(); ctx.arc(x, y, 0.5, Math.PI * 1.15, Math.PI * 1.85);
      ctx.strokeStyle = 'rgba(160,120,70,0.6)'; ctx.lineWidth = 0.06; ctx.stroke();
    }
  }
}

// ---------- couche dynamique ----------
export class Renderer {
  constructor(canvas, world) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.setWorld(world);
  }
  setWorld(world) {
    this.world = world;
    this.base = buildBaseLayer(world.T, world.seed);
    this.terrVer = -1; this.roadVer = -1; this.rivers = null;
    this.plans = new Map();
    this.cam = { x: world.W / 2, y: world.H / 2, scale: 4 };
    this.fit();
  }
  fit() {
    const w = this.cv.clientWidth, h = this.cv.clientHeight;
    this.cam.scale = Math.min(w / this.world.W, h / this.world.H) * 1.02;
    this.cam.x = this.world.W / 2; this.cam.y = this.world.H / 2;
    this.minScale = this.cam.scale * 0.8;
  }
  toWorld(sx, sy) { const c = this.cam, w = this.cv.clientWidth, h = this.cv.clientHeight; return [(sx - w / 2) / c.scale + c.x, (sy - h / 2) / c.scale + c.y]; }
  toScreen(x, y) { const c = this.cam, w = this.cv.clientWidth, h = this.cv.clientHeight; return [(x - c.x) * c.scale + w / 2, (y - c.y) * c.scale + h / 2]; }
  zoomAt(sx, sy, f) {
    const [wx, wy] = this.toWorld(sx, sy);
    this.cam.scale = Math.max(this.minScale, Math.min(600, this.cam.scale * f));
    const [nx, ny] = this.toWorld(sx, sy);
    this.cam.x += wx - nx; this.cam.y += wy - ny;
  }

  rebuildTerritory() {
    const wd = this.world, { W, H } = wd;
    const cv = this.terrCv || (this.terrCv = document.createElement('canvas'));
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d'); const img = c.createImageData(W, H);
    const mode = this.mode || 'politique';
    const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const PH = ['#2f9e44', '#82b84a', '#3d7fd6', '#c9a227', '#d9711c', '#c0262a'].map(hex);
    const fc = wd.faiths ? wd.faiths.map(f => hex(f.color)) : [];
    for (let i = 0; i < W * H; i++) {
      const n = wd.cellNation[i];
      if (n < 0 || mode === 'relief') continue;
      let col = wd.nations[n].color;
      if (mode === 'religion' && wd.faiths) { const c = wd.cities[wd.cellCity[i]]; col = fc[c ? c.faith : wd.nations[n].faith] || col; }
      else if (mode === 'economie' && wd.nations[n].phase != null) col = PH[wd.nations[n].phase];
      img.data[i * 4] = col[0]; img.data[i * 4 + 1] = col[1]; img.data[i * 4 + 2] = col[2]; img.data[i * 4 + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    // frontières par marching squares sur les centres de cases (une passe par nation)
    this.borders = [];
    const cn = wd.cellNation;
    const present = new Set(cn);
    for (const nid of present) {
      if (nid < 0) continue;
      const p = new Path2D();
      const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H && cn[y * W + x] === nid;
      for (let y = -1; y < H; y++) for (let x = -1; x < W; x++) {
        const a = inside(x, y), b = inside(x + 1, y), cc = inside(x + 1, y + 1), d = inside(x, y + 1);
        const code = (a ? 8 : 0) | (b ? 4 : 0) | (cc ? 2 : 0) | (d ? 1 : 0);
        if (code === 0 || code === 15) continue;
        const X = x + 0.5, Y = y + 0.5;
        const T = [X + 0.5, Y], R = [X + 1, Y + 0.5], Bm = [X + 0.5, Y + 1], L = [X, Y + 0.5];
        const seg = (u, v) => { p.moveTo(u[0], u[1]); p.lineTo(v[0], v[1]); };
        switch (code) {
          case 1: case 14: seg(L, Bm); break;
          case 2: case 13: seg(Bm, R); break;
          case 3: case 12: seg(L, R); break;
          case 4: case 11: seg(T, R); break;
          case 5: seg(L, T); seg(Bm, R); break;
          case 6: case 9: seg(T, Bm); break;
          case 7: case 8: seg(L, T); break;
          case 10: seg(T, R); seg(L, Bm); break;
        }
      }
      this.borders.push([nid, p]);
    }
    this.terrVer = wd.territoryVersion + '|' + (this.mode || '') + '|' + (wd.faithVersion || 0) + '|' + (this.mode === 'economie' ? wd.year : '');
  }

  rebuildRoads() {
    const wd = this.world, W = wd.W;
    this.roadPaths = wd.roads.map(r => {
      const pts = r.path.map(i => [i % W + 0.5 + jit(i, 3) * 0.35, ((i / W) | 0) + 0.5 + jit(i, 4) * 0.35]);
      // lissage de Chaikin
      let q = pts;
      for (let it = 0; it < 2; it++) {
        const n = [q[0]];
        for (let k = 0; k < q.length - 1; k++) { const a = q[k], b = q[k + 1]; n.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); }
        n.push(q[q.length - 1]); q = n;
      }
      const p = new Path2D(); p.moveTo(q[0][0], q[0][1]); for (const v of q) p.lineTo(v[0], v[1]);
      return { p, road: r };
    });
    this.roadVer = wd.roadVersion;
  }

  draw(ui) {
    const wd = this.world, ctx = this.ctx, cam = this.cam;
    const dpr = window.devicePixelRatio || 1;
    const w = this.cv.clientWidth, h = this.cv.clientHeight;
    if (this.cv.width !== Math.round(w * dpr) || this.cv.height !== Math.round(h * dpr)) { this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr); }
    if (this.terrVer !== wd.territoryVersion + '|' + (this.mode || '') + '|' + (wd.faithVersion || 0) + '|' + (this.mode === 'economie' ? wd.year : '')) this.rebuildTerritory();
    if (this.roadVer !== wd.roadVersion) this.rebuildRoads();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#cdb88e'; ctx.fillRect(0, 0, w, h);
    const s = cam.scale;
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (w / 2 - cam.x * s), dpr * (h / 2 - cam.y * s));
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.base, 0, 0, wd.W, wd.H);
    // territoires
    const cityZoom = Math.max(0, Math.min(1, (s - 22) / 18));
    ctx.globalAlpha = (this.mode && this.mode !== 'politique' ? 0.45 : 0.22) * (1 - cityZoom * 0.7);
    ctx.drawImage(this.terrCv, 0, 0, wd.W, wd.H);
    ctx.globalAlpha = 1;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [nid, p] of this.borders) {
      const c = wd.nations[nid].color;
      ctx.strokeStyle = `rgba(${c[0] * 0.55 | 0},${c[1] * 0.55 | 0},${c[2] * 0.55 | 0},${0.9 - cityZoom * 0.6})`;
      ctx.lineWidth = Math.max(0.12, 2.2 / s);
      ctx.setLineDash(nid === wd.player ? [] : [Math.max(0.3, 5 / s), Math.max(0.2, 3 / s)]);
      ctx.stroke(p);
    }
    ctx.setLineDash([]);
    // routes
    for (const { p, road } of this.roadPaths) {
      const a = wd.cities[road.a], b = wd.cities[road.b];
      const era = Math.max(wd.nations[a.nation].era, wd.nations[b.nation].era);
      if (road.rail) {
        ctx.strokeStyle = 'rgba(40,36,34,0.85)'; ctx.lineWidth = Math.max(0.09, 2.2 / s); ctx.stroke(p);
        ctx.strokeStyle = 'rgba(240,232,210,0.9)'; ctx.lineWidth = Math.max(0.05, 1.1 / s);
        ctx.setLineDash([Math.max(0.15, 4 / s), Math.max(0.15, 4 / s)]); ctx.stroke(p); ctx.setLineDash([]);
      } else if ((road.level || 0) >= 3) {
        ctx.strokeStyle = 'rgba(60,60,64,0.9)'; ctx.lineWidth = Math.max(0.12, 3 / s); ctx.stroke(p);
        ctx.strokeStyle = 'rgba(240,200,90,0.9)'; ctx.lineWidth = Math.max(0.03, 0.8 / s); ctx.stroke(p);
      } else if ((road.level || 0) === 1) {
        ctx.strokeStyle = 'rgba(96,66,40,0.9)'; ctx.lineWidth = Math.max(0.08, 2 / s); ctx.stroke(p);
        ctx.strokeStyle = 'rgba(214,196,160,0.9)'; ctx.lineWidth = Math.max(0.04, 0.9 / s); ctx.stroke(p);
      } else {
        ctx.strokeStyle = era >= 2 ? 'rgba(112,78,48,0.85)' : 'rgba(120,86,52,0.75)';
        ctx.lineWidth = Math.max(0.06, (era >= 2 ? 1.6 : 1.2) / s);
        if (era < 2) ctx.setLineDash([Math.max(0.2, 3 / s), Math.max(0.15, 2.4 / s)]);
        ctx.stroke(p); ctx.setLineDash([]);
      }
    }
    // villes : plans détaillés quand on zoome
    const [vx0, vy0] = this.toWorld(0, 0), [vx1, vy1] = this.toWorld(w, h);
    const visible = wd.cities.filter(c => c.alive && c.x > vx0 - 15 && c.x < vx1 + 15 && c.y > vy0 - 15 && c.y < vy1 + 15);
    if (cityZoom > 0) {
      for (const c of visible) {
        const era = wd.nations[c.nation].era;
        const key = planKey(c, era);
        let plan = this.plans.get(c.id);
        if (!plan || plan.key !== key) { plan = buildCityPlan(c, wd, era); this.plans.set(c.id, plan); }
        drawCityPlan(ctx, plan, s, cityZoom);
      }
    }
    if (s > 14) {
      this.rivers = this.rivers || riverPaths(wd.T);
      ctx.strokeStyle = `rgba(78,118,142,${Math.min(1, (s - 14) / 10)})`; ctx.lineCap = 'round';
      for (const [w, p] of this.rivers) { ctx.lineWidth = w; ctx.stroke(p); }
    }
    if (cityZoom > 0) for (const c of visible) { const plan = this.plans.get(c.id); if (plan) drawCityBridges(ctx, plan, cityZoom); }
    // icônes
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawArmies(ctx, s);
    const labels = [];
    for (const c of visible) {
      const [x, y] = this.toScreen(c.x + 0.5, c.y + 0.5);
      const n = wd.nations[c.nation];
      const isCap = n.capital === c.id;
      const size = 2.5 + Math.log10(c.pop) * 1.4 + (isCap ? 1.5 : 0);
      const a = 1 - cityZoom;
      if (a > 0.02) {
        ctx.globalAlpha = a;
        drawCityIcon(ctx, x, y, size, c, n, isCap);
        ctx.globalAlpha = 1;
      }
      const show = isCap || c.pop > 20000 || s > 7;
      if (show) labels.push({ c, x, y: cityZoom > 0.5 ? y - cityRadius(c.pop) * s - 6 : y - size - 4, isCap, big: c.pop > 30000 });
    }
    // libellés de quartiers
    if (s > 70) {
      ctx.font = 'italic 12px "IM Fell English", Georgia, serif'; ctx.textAlign = 'center';
      for (const c of visible) {
        const plan = this.plans.get(c.id); if (!plan) continue;
        const seen = new Set();
        for (const wdd of plan.wards) {
          if (seen.has(wdd.name) && wdd.type !== 'faubourg') continue;
          seen.add(wdd.name);
          const [x, y] = this.toScreen(wdd.x, wdd.y);
          if (x < -50 || y < -20 || x > w + 50 || y > h + 20) continue;
          haloText(ctx, wdd.name, x, y, 'rgba(50,35,20,0.95)', 'rgba(245,235,210,0.8)');
        }
      }
    }
    ctx.textAlign = 'center';
    // anti-chevauchement : capitales puis grandes villes d'abord
    labels.sort((a, b) => (b.isCap - a.isCap) || (b.c.pop - a.c.pop));
    const placed = [];
    for (const L of labels) {
      const fs = L.isCap || L.big ? 15 : 12;
      ctx.font = `${L.isCap ? 'bold ' : ''}${fs}px "IM Fell English", Georgia, serif`;
      const txt = (L.isCap ? '♛ ' : '') + L.c.name;
      const tw = ctx.measureText(txt).width;
      const box = [L.x - tw / 2 - 2, L.y - fs, L.x + tw / 2 + 2, L.y + 3];
      if (placed.some(p => box[0] < p[2] && box[2] > p[0] && box[1] < p[3] && box[3] > p[1])) continue;
      placed.push(box);
      haloText(ctx, txt, L.x, L.y, 'rgb(40,28,18)', 'rgba(244,232,204,0.85)');
    }
    // noms des nations (zoom faible)
    if (s < 9) {
      ctx.textAlign = 'center';
      for (const n of wd.nations) {
        if (!n.alive) continue;
        const cs = wd.citiesOf(n); if (!cs.length) continue;
        let sx = 0, sy = 0, tw = 0; for (const c of cs) { const k = Math.sqrt(c.pop); sx += c.x * k; sy += c.y * k; tw += k; }
        const [x, y] = this.toScreen(sx / tw, sy / tw + 3);
        const fs = Math.min(30, 12 + Math.sqrt(cs.length) * 4);
        ctx.font = `${fs}px "Cinzel", "IM Fell English", Georgia, serif`;
        ctx.globalAlpha = 0.65 * Math.max(0, Math.min(1, (9 - s) / 3));
        haloText(ctx, n.name.toUpperCase().split('').join(' '), x, y, `rgb(${n.color[0] * 0.45 | 0},${n.color[1] * 0.45 | 0},${n.color[2] * 0.45 | 0})`, 'rgba(240,228,200,0.5)');
        ctx.globalAlpha = 1;
      }
    }
    // sélection
    if (ui.selCity != null) {
      const c = wd.cities[ui.selCity];
      const [x, y] = this.toScreen(c.x + 0.5, c.y + 0.5);
      const r = Math.max(12, cityRadius(c.pop) * s * (cityZoom > 0.3 ? 1.15 : 0) );
      ctx.strokeStyle = 'rgba(160,30,20,0.9)'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
    // rose des vents + échelle
    drawCompass(ctx, w - 70, h - 110);
  }
}

Renderer.prototype.drawArmies = function (ctx, s) {
  const wd = this.world;
  // batailles récentes : épées croisées qui s'estompent
  for (const b of wd.battles || []) {
    const age = (wd.day - b.t) / 360;
    if (age > 1.5) continue;
    const [x, y] = this.toScreen(b.x, b.y);
    ctx.globalAlpha = Math.max(0, 1 - age / 1.5);
    ctx.font = '18px serif'; ctx.textAlign = 'center';
    haloText(ctx, '⚔', x, y + 6, 'rgb(120,20,15)', 'rgba(250,240,220,0.9)');
    ctx.globalAlpha = 1;
  }
  for (const w of wd.wars) for (const side of ['a', 'b']) {
    const u = w.units[side];
    if (!u.path) continue;
    const n = wd.nations[u.nation], p = wd.unitXY(u);
    if (!p) continue;
    const mine = u.nation === wd.player;
    // trajet prévu
    if (u.state === 'march' && (mine || s > 6)) {
      ctx.beginPath();
      const k0 = Math.floor(u.pos);
      const [sx, sy] = this.toScreen(p[0], p[1]); ctx.moveTo(sx, sy);
      for (let k = k0 + 1; k < u.path.length; k += 1) { const i = u.path[k]; const [x, y] = this.toScreen(i % wd.W + 0.5, ((i / wd.W) | 0) + 0.5); ctx.lineTo(x, y); }
      ctx.strokeStyle = `rgba(${n.color[0] * 0.6 | 0},${n.color[1] * 0.6 | 0},${n.color[2] * 0.6 | 0},0.8)`; ctx.lineWidth = 2; ctx.setLineDash([5, 5]); ctx.stroke(); ctx.setLineDash([]);
    }
    const [x, y] = this.toScreen(p[0], p[1]);
    const size = 7 + Math.min(10, Math.log10(1 + n.army * 10) * 2);
    // siège : cercle pulsant autour de la ville
    if (u.state === 'siege') {
      const t = wd.cities[u.target];
      if (t) { const [tx, ty] = this.toScreen(t.x + 0.5, t.y + 0.5); ctx.strokeStyle = 'rgba(160,20,10,0.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(tx, ty, 14 + Math.sin(performance.now() / 200) * 3, 0, Math.PI * 2); ctx.stroke(); }
    }
    // étendard
    ctx.strokeStyle = 'rgb(40,28,18)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x, y + size * 0.6); ctx.lineTo(x, y - size * 1.4); ctx.stroke();
    const wave = Math.sin(performance.now() / 250 + u.nation) * 2;
    ctx.beginPath(); ctx.moveTo(x, y - size * 1.4); ctx.quadraticCurveTo(x + size * 0.7, y - size * 1.4 + wave, x + size * 1.4, y - size * 1.2); ctx.lineTo(x + size * 1.4, y - size * 0.4); ctx.quadraticCurveTo(x + size * 0.7, y - size * 0.6 + wave, x, y - size * 0.6); ctx.closePath();
    ctx.fillStyle = rgb(n.color); ctx.fill(); ctx.lineWidth = mine ? 2 : 1; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y + size * 0.6, 3, 0, Math.PI * 2); ctx.fillStyle = 'rgb(40,28,18)'; ctx.fill();
    if (s > 5) { ctx.font = '11px Georgia, serif'; ctx.textAlign = 'left'; haloText(ctx, `${Math.round(n.army * 10).toLocaleString('fr')}`, x + size * 1.6, y - size * 0.7, 'rgb(40,28,18)', 'rgba(244,232,204,0.85)'); }
  }
};

function haloText(ctx, t, x, y, fg, bg) {
  ctx.lineWidth = 3.5; ctx.strokeStyle = bg; ctx.lineJoin = 'round'; ctx.strokeText(t, x, y);
  ctx.fillStyle = fg; ctx.fillText(t, x, y);
}

function drawCityIcon(ctx, x, y, size, c, n, isCap) {
  const col = n.color;
  ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgb(40,28,18)';
  if (c.pop < 1500) {
    ctx.beginPath(); ctx.arc(x, y, size * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = rgb(col); ctx.fill(); ctx.stroke();
    return;
  }
  // petit groupe de maisons + muraille éventuelle
  if (c.buildings.muraille) {
    ctx.beginPath(); ctx.arc(x, y, size * 0.95, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(235,225,200,0.9)'; ctx.fill(); ctx.lineWidth = 1.6; ctx.stroke(); ctx.lineWidth = 1.2;
  }
  const hs = size * 0.42;
  const houses = c.pop > 20000 ? [[-0.55, 0.2], [0.55, 0.2], [0, -0.35], [0, 0.45]] : [[-0.35, 0.1], [0.35, 0.1], [0, -0.3]];
  for (const [dx, dy] of houses) {
    const hx = x + dx * size * 0.7, hy = y + dy * size * 0.7;
    ctx.beginPath(); ctx.rect(hx - hs / 2, hy - hs / 2, hs, hs * 0.8);
    ctx.fillStyle = 'rgb(236,226,204)'; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(hx - hs * 0.65, hy - hs / 2); ctx.lineTo(hx, hy - hs * 1.15); ctx.lineTo(hx + hs * 0.65, hy - hs / 2); ctx.closePath();
    ctx.fillStyle = rgb(col); ctx.fill(); ctx.stroke();
  }
  if (isCap) {
    ctx.beginPath();
    const cy = y - size * 1.25;
    ctx.moveTo(x - 5, cy + 3); ctx.lineTo(x - 5, cy - 2); ctx.lineTo(x - 2.5, cy + 0.5); ctx.lineTo(x, cy - 3.5); ctx.lineTo(x + 2.5, cy + 0.5); ctx.lineTo(x + 5, cy - 2); ctx.lineTo(x + 5, cy + 3); ctx.closePath();
    ctx.fillStyle = 'rgb(222,178,60)'; ctx.fill(); ctx.lineWidth = 1; ctx.stroke();
  }
}

function drawCompass(ctx, x, y) {
  ctx.save(); ctx.translate(x, y); ctx.globalAlpha = 0.75;
  ctx.strokeStyle = 'rgb(70,50,30)'; ctx.fillStyle = 'rgb(70,50,30)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(0, 0, 26, 0, Math.PI * 2); ctx.stroke();
  for (let k = 0; k < 4; k++) {
    ctx.rotate(Math.PI / 2);
    ctx.beginPath(); ctx.moveTo(0, -34); ctx.lineTo(5, 0); ctx.lineTo(-5, 0); ctx.closePath();
    ctx.fillStyle = k % 2 ? 'rgb(70,50,30)' : 'rgb(230,215,180)'; ctx.fill(); ctx.stroke();
  }
  ctx.rotate(Math.PI * 2);
  ctx.font = 'bold 12px "Cinzel", Georgia, serif'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgb(60,40,24)';
  ctx.fillText('N', 0, -38);
  ctx.restore();
}
