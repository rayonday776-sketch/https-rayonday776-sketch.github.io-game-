// Génération du continent : relief, mers, lacs, rivières, climat, biomes
import { makeNoise } from './rng.js';

export const B = { DEEP: 0, SEA: 1, LAKE: 2, BEACH: 3, DESERT: 4, STEPPE: 5, GRASS: 6, FOREST: 7, JUNGLE: 8, TAIGA: 9, TUNDRA: 10, SNOW: 11, HILLS: 12, MOUNTAIN: 13, SWAMP: 14 };
export const BIOME_NAMES = ['Océan profond', 'Mer', 'Lac', 'Littoral', 'Désert', 'Steppe', 'Prairie', 'Forêt', 'Jungle', 'Taïga', 'Toundra', 'Neiges éternelles', 'Collines', 'Montagnes', 'Marais'];
export const BIOME_COLOR = [
  [112, 146, 150], [158, 186, 176], [150, 182, 178], [228, 214, 170], [229, 207, 152], [208, 199, 142],
  [186, 192, 130], [140, 160, 102], [110, 146, 88], [132, 148, 112], [196, 194, 168], [242, 240, 232],
  [190, 176, 128], [176, 158, 124], [146, 158, 116],
];
export const FERT = [0, 0, 0, 0.3, 0.06, 0.5, 1, 0.55, 0.5, 0.3, 0.1, 0, 0.45, 0.05, 0.3];
export const MOVE = [Infinity, Infinity, Infinity, 1, 1.7, 1, 1, 1.8, 2.6, 1.8, 2, 9, 2.2, 6, 3];
export const NEI8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
export const isWaterBiome = b => b <= 2;

export class Heap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v;
    let i = k.length; k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p]; v[i] = v[p]; i = p;
    }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v;
    const top = v[0], topK = k[0];
    const lk = k.pop(), lv = v.pop();
    const n = k.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const m = (r < n && k[r] < k[l]) ? r : l;
        if (k[m] >= lk) break;
        k[i] = k[m]; v[i] = v[m]; i = m;
      }
      k[i] = lk; v[i] = lv;
    }
    this.lastKey = topK;
    return top;
  }
}

const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function generateTerrain(seed, W = 320, H = 200) {
  const N = W * H;
  const n1 = makeNoise(seed), n2 = makeNoise(seed ^ 0x5bd1e995), n3 = makeNoise(seed + 7777), n4 = makeNoise(seed + 31337);
  const h = new Float32Array(N), relief = new Float32Array(N);

  // 1. côtes : masque continental + bruit fractal ; relief : chaînes de montagnes (ridges) + collines, indépendants du masque
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / H, v = y / H, i = y * W + x;
    const dx = (x / W - 0.5) * 2, dy = (y / H - 0.5) * 2;
    let d = Math.sqrt(dx * dx + dy * dy);
    d += n2.fbm(u * 2.0, v * 2.0, 4) * 0.45;
    const mask = 1 - smoothstep(0.3, 1.0, d);
    h[i] = mask * 0.8 + n1.fbm(u * 3.2, v * 3.2, 6) * 0.55;
    const ridge = n3.ridge(u * 2.4 + 3, v * 2.4 + 1, 5);
    const rm = smoothstep(0.05, 0.4, n4.fbm(u * 1.5 + 9, v * 1.5 + 4, 3));
    relief[i] = Math.pow(ridge, 1.6) * rm * 1.1 + (n1.fbm(u * 5 + 20, v * 5 + 20, 4) * 0.5 + 0.5) * 0.22;
  }
  // niveau de la mer par quantile → ~44 % de terres
  const sorted = Float32Array.from(h).sort();
  const sea = sorted[Math.floor(N * 0.56)];
  let maxH = 0, minH = 0;
  for (let i = 0; i < N; i++) {
    const b = h[i] - sea;
    h[i] = b > 0 ? 0.01 + Math.min(b, 0.25) * 0.5 + relief[i] * Math.min(1, b * 12) : b;
    if (h[i] > maxH) maxH = h[i]; if (h[i] < minH) minH = h[i];
  }
  for (let i = 0; i < N; i++) h[i] = h[i] > 0 ? h[i] / maxH : h[i] / -minH;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) { const i = y * W + x; h[i] = Math.min(h[i], -0.05); }
  }

  // 2. comblement des cuvettes (priority-flood) → chaque goutte rejoint la mer ; les cuvettes profondes deviennent des lacs
  const filled = Float32Array.from(h);
  const vis = new Uint8Array(N);
  const heap = new Heap();
  for (let i = 0; i < N; i++) if (h[i] <= 0) { vis[i] = 1; heap.push(h[i], i); }
  const EPS = 1e-5;
  while (heap.size) {
    const c = heap.pop();
    const cx = c % W, cy = (c / W) | 0;
    for (const [dx, dy] of NEI8) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx;
      if (vis[n]) continue;
      vis[n] = 1;
      if (filled[n] <= filled[c] + EPS) filled[n] = filled[c] + EPS;
      heap.push(filled[n], n);
    }
  }
  const lake = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (h[i] > 0 && filled[i] - h[i] > 0.012) lake[i] = 1;

  // 3. écoulement
  const ds = new Int32Array(N).fill(-1);
  for (let i = 0; i < N; i++) {
    if (h[i] <= 0) continue;
    const x = i % W, y = (i / W) | 0;
    let best = -1, bv = filled[i];
    for (const [dx, dy] of NEI8) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx;
      if (filled[n] < bv) { bv = filled[n]; best = n; }
    }
    ds[i] = best;
  }

  // distance à la mer (BFS)
  const distSea = new Int16Array(N).fill(9999);
  const q = new Int32Array(N); let qh = 0, qt = 0;
  for (let i = 0; i < N; i++) if (h[i] <= 0) { distSea[i] = 0; q[qt++] = i; }
  while (qh < qt) {
    const c = q[qh++]; const cx = c % W, cy = (c / W) | 0;
    for (const [dx, dy] of NEI8) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx;
      if (distSea[n] > distSea[c] + 1) { distSea[n] = distSea[c] + 1; q[qt++] = n; }
    }
  }

  // 4. climat
  const moist = new Float32Array(N), temp = new Float32Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, u = x / H, v = y / H;
    const hn = Math.max(0, h[i]);
    moist[i] = 0.55 + n4.fbm(u * 2.4 + 40, v * 2.4 + 40, 4) * 0.55 - Math.min(distSea[i], 45) / 45 * 0.3;
    temp[i] = 0.08 + 0.85 * (y / H) + n2.fbm(u * 2 + 80, v * 2 + 80, 3) * 0.18 - hn * 0.55;
  }

  // 5. accumulation du débit → rivières
  const land = [];
  for (let i = 0; i < N; i++) if (h[i] > 0) land.push(i);
  land.sort((a, b) => filled[b] - filled[a]);
  const acc = new Float32Array(N);
  for (const i of land) acc[i] += 0.4 + Math.max(0, moist[i]);
  for (const i of land) if (ds[i] >= 0) acc[ds[i]] += acc[i];
  const RIV = 38;
  const river = new Uint8Array(N);
  for (const i of land) if (acc[i] > RIV && !lake[i]) river[i] = 1;
  for (const i of land) { moist[i] = Math.min(1, Math.max(0, moist[i] + Math.min(0.25, Math.sqrt(acc[i]) * 0.008))); }

  // seuils montagnes/collines par quantile des terres
  const lh = land.map(i => h[i]).sort((a, b) => a - b);
  const mtnT = lh[Math.floor(lh.length * 0.91)], hillT = lh[Math.floor(lh.length * 0.76)], snowT = lh[Math.floor(lh.length * 0.985)];

  // 6. biomes
  const biome = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (h[i] <= 0) { biome[i] = h[i] < -0.25 ? B.DEEP : B.SEA; continue; }
    if (lake[i]) { biome[i] = B.LAKE; continue; }
    const hv = h[i], m = moist[i], t = temp[i];
    let b;
    if (hv >= snowT || (hv >= mtnT && t < 0.15)) b = B.SNOW;
    else if (hv >= mtnT) b = B.MOUNTAIN;
    else if (hv >= hillT) b = (m > 0.72 && t > 0.3) ? B.FOREST : B.HILLS;
    else if (t < 0.16) b = B.TUNDRA;
    else if (t < 0.34) b = m > 0.42 ? B.TAIGA : B.STEPPE;
    else if (m < 0.24) b = t > 0.55 ? B.DESERT : B.STEPPE;
    else if (m < 0.36) b = B.STEPPE;
    else if (m < 0.6) b = B.GRASS;
    else if (m < 0.8) b = (t > 0.78 ? B.JUNGLE : B.FOREST);
    else b = (hv < hillT * 0.3 && t > 0.35) ? B.SWAMP : (t > 0.72 ? B.JUNGLE : B.FOREST);
    biome[i] = b;
  }
  const coastal = new Uint8Array(N), nearRiver = new Uint8Array(N), nearLake = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (h[i] <= 0 || lake[i]) continue;
    const x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of NEI8) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx;
      if (h[n] <= 0) coastal[i] = 1;
      if (river[n]) nearRiver[i] = 1;
      if (lake[n]) nearLake[i] = 1;
    }
    if (river[i]) nearRiver[i] = 1;
    if (coastal[i] && h[i] < hillT * 0.12 && biome[i] !== B.SNOW && biome[i] !== B.SWAMP) biome[i] = B.BEACH;
  }
  const fert = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let f = FERT[biome[i]];
    if (nearRiver[i]) f += biome[i] === B.DESERT ? 0.8 : 0.4;
    if (nearLake[i]) f += 0.2;
    fert[i] = Math.min(1.5, f);
  }
  // hauteur affichée : vallées creusées par les rivières
  const shadeH = new Float32Array(N);
  for (let i = 0; i < N; i++) shadeH[i] = h[i] > 0 ? h[i] - Math.min(0.12, Math.sqrt(acc[i]) * 0.003) : 0;

  return { W, H, h, filled, lake, ds, acc, river, moist, temp, biome, coastal, nearRiver, fert, shadeH, distSea, mtnT, hillT, snowT, RIV };
}
