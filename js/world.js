// Monde : villes, nations, routes, économie, politique, guerres. Simulation au jour/mois/an.
import { RNG, hash2 } from './rng.js';
import { generateTerrain, B, MOVE, NEI8, Heap } from './terrain.js';
import * as NM from './names.js';

export const ERAS = [
  { name: 'Antiquité', tech: 0, food: 1, currency: 'oboles' },
  { name: 'Âge classique', tech: 260, food: 1.3, currency: 'deniers' },
  { name: 'Moyen Âge', tech: 750, food: 1.7, currency: 'écus' },
  { name: 'Renaissance', tech: 1600, food: 2.3, currency: 'livres' },
  { name: 'Ère industrielle', tech: 2900, food: 4.5, currency: 'francs' },
  { name: 'Ère moderne', tech: 4800, food: 9, currency: 'crédits' },
];
export const GOODS = [
  { name: 'Blé', base: 1, cons: 1 },
  { name: 'Bois', base: 2, cons: 0.25 },
  { name: 'Pierre', base: 3, cons: 0.1 },
  { name: 'Fer', base: 6, cons: 0.06 },
  { name: 'Étoffes', base: 5, cons: 0.15 },
  { name: 'Épices', base: 12, cons: 0.03 },
];
// production mensuelle par case (hors blé, calculé via la fertilité) : bois, pierre, fer, étoffes, épices
const PROD = {
  [B.GRASS]: [0.005, 0, 0, 0.015, 0], [B.STEPPE]: [0, 0.002, 0, 0.035, 0], [B.FOREST]: [0.08, 0, 0, 0.002, 0],
  [B.JUNGLE]: [0.06, 0, 0, 0, 0.012], [B.TAIGA]: [0.07, 0, 0.002, 0.005, 0], [B.TUNDRA]: [0.005, 0.005, 0.003, 0.01, 0],
  [B.HILLS]: [0.01, 0.035, 0.008, 0.015, 0], [B.MOUNTAIN]: [0.005, 0.05, 0.025, 0, 0], [B.SNOW]: [0, 0.02, 0.01, 0, 0],
  [B.DESERT]: [0, 0.01, 0.002, 0, 0.008], [B.BEACH]: [0, 0, 0, 0, 0.004], [B.SWAMP]: [0.02, 0, 0, 0, 0.002],
};
export const BUILDINGS = {
  muraille: { name: 'Muraille', era: 0, cost: c => Math.round(110 + c.pop / 150), desc: 'Défense ×2. Fige l\'enceinte : la ville déborde ensuite en faubourgs.' },
  marche: { name: 'Marché', era: 0, cost: () => 90, desc: '+35 % de revenus commerciaux.' },
  temple: { name: 'Temple', era: 0, cost: () => 80, desc: '+stabilité, +influence religieuse.' },
  port: { name: 'Port', era: 0, cost: () => 140, coastal: true, desc: 'Pêche + commerce maritime.' },
  universite: { name: 'Université', era: 2, cost: () => 240, desc: '+recherche.' },
  manufacture: { name: 'Manufacture', era: 3, cost: () => 300, desc: '+production d\'étoffes et de fer.' },
  usine: { name: 'Usine', era: 4, cost: () => 480, desc: 'Production ×2, attire les ouvriers (exode rural).' },
};
export const TEMPLE_NAMES = ['Temple', 'Temple', 'Cathédrale', 'Basilique', 'Église', 'Centre spirituel'];

export const REGIMES = {
  'Chefferie': { titles: ['Chef', 'Cheffe'], hered: true },
  'Royaume': { titles: ['Roi', 'Reine'], hered: true },
  'Empire': { titles: ['Empereur', 'Impératrice'], hered: true },
  'Théocratie': { titles: ['Grand prêtre', 'Grande prêtresse'], hered: false },
  'République': { titles: ['Consul', 'Consule'], hered: false, term: 5 },
  'Démocratie': { titles: ['Président', 'Présidente'], hered: false, term: 4 },
  'Dictature': { titles: ['Dictateur', 'Dictatrice'], hered: false },
};
export const TRAITS = {
  batisseur: 'Bâtisseur', conquerant: 'Conquérant', marchand: 'Marchand', sage: 'Sage',
  cruel: 'Cruel', pieux: 'Pieux', prodigue: 'Prodigue', prudent: 'Prudent',
};
// rôles politiques (repris d'EcoPol) : tradition, militaire, religion, commerce, peuple
const ROLES = ['tradition', 'militaire', 'religion', 'commerce', 'peuple'];
function partyNames(era) {
  if (era <= 1) return ['Anciens', 'Guerriers', 'Prêtres', 'Marchands', 'Plèbe'];
  if (era <= 3) return ['Noblesse', 'Chevalerie', 'Clergé', 'Bourgeoisie', 'Paysannerie'];
  if (era === 4) return ['Conservateurs', 'Nationalistes', 'Cléricaux', 'Libéraux', 'Socialistes'];
  return ['Conservateurs', 'Nationalistes', 'Démocrates-chrétiens', 'Libéraux', 'Sociaux-démocrates'];
}

function hsl(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

export const fmtYear = y => y < 0 ? `${-y} av. J.-C.` : `${y}`;
export const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

export class World {
  constructor(seed) {
    this.seed = seed;
    this.rng = new RNG(seed * 7 + 3);
    this.T = generateTerrain(seed);
    const { W, H } = this.T;
    this.W = W; this.H = H;
    this.cities = []; this.nations = []; this.roads = []; this.wars = [];
    this.roadCell = new Uint16Array(W * H);
    this.cellCity = new Int32Array(W * H).fill(-1);
    this.nearCity = new Uint8Array(W * H);
    this.adj = new Map();
    this.day = 0; this.month = 0; this.year = -800;
    this.events = []; this.newEvents = []; this.gazettes = [];
    this.territoryVersion = 0; this.roadVersion = 0; this.cityVersion = 0;
    this.player = -1;
    this.computeSiteScores();
    this.placeInitial();
    this.buildInitialRoads();
    this.updateTerritory();
    for (const c of this.cities) this.computeProduction(c);
  }

  // ---------- utilitaires ----------
  idx(x, y) { return y * this.W + x; }
  dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  nation(id) { return this.nations[id]; }
  citiesOf(n) { return this.cities.filter(c => c.alive && c.nation === n.id); }
  eraOf(n) { return n ? n.era : 0; }
  dateStr() { return `${1 + Math.floor((this.day % 30))} ${MONTHS[this.month]} ${fmtYear(this.year)}`; }

  log(type, o) {
    const e = { y: this.year, m: this.month, type, w: 3, nations: [], ...o };
    this.events.push(e);
    if (this.events.length > 4000) this.events.splice(0, 1000);
    this.newEvents.push(e);
    return e;
  }

  computeSiteScores() {
    const T = this.T, { W, H } = T;
    this.site = new Float32Array(W * H);
    for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
      const i = y * W + x, b = T.biome[i];
      if (b <= B.LAKE || b === B.MOUNTAIN || b === B.SNOW) { this.site[i] = -1; continue; }
      let f = 0, n = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { f += T.fert[i + dy * W + dx]; n++; }
      let s = f / n;
      if (T.river[i]) s += 0.35; else if (T.nearRiver[i]) s += 0.25;
      if (T.coastal[i]) s += 0.3;
      if (b === B.HILLS) s -= 0.1;
      if (b === B.SWAMP) s -= 0.3;
      this.site[i] = s;
    }
  }

  markNear(c, r = 8) {
    const { W, H } = this;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      const x = c.x + dx, y = c.y + dy;
      if (x >= 0 && y >= 0 && x < W && y < H) this.nearCity[y * W + x] = 1;
    }
  }

  // ---------- création ----------
  makeLeader(n, opts = {}) {
    const r = this.rng;
    const female = opts.female ?? r.chance(n.regime === 'Démocratie' || n.regime === 'République' ? 0.35 : 0.18);
    const keys = Object.keys(TRAITS);
    const traits = [];
    while (traits.length < 2) { const t = r.pick(keys); if (!traits.includes(t)) traits.push(t); }
    let name = NM.personName(n.culture, r, female);
    if (opts.dynastyName) name = opts.firstName || name;
    const L = {
      name, female, age: opts.age ?? r.int(22, 50), traits,
      dynasty: opts.dynasty ?? NM.dynastyName(n.culture, r),
      seed: r.int(1, 1e9), party: opts.party ?? null, since: this.year,
    };
    if (REGIMES[n.regime].hered) {
      n.names = n.names || {};
      n.names[name] = (n.names[name] || 0) + 1;
      L.ordinal = n.names[name];
    }
    return L;
  }
  leaderTitle(n) {
    const L = n.leader; const t = REGIMES[n.regime].titles[L.female ? 1 : 0];
    if ((n.regime === 'République') && n.era >= 3) return L.female ? 'Présidente' : 'Président';
    return t;
  }
  leaderFull(n) {
    const L = n.leader;
    const ord = L.ordinal && L.ordinal > 1 ? ' ' + NM.ROMAN(L.ordinal) : (L.ordinal === 1 && REGIMES[n.regime].hered ? ' Ier' : '');
    return `${L.name}${ord}`;
  }

  createNation(capital, culture, regime) {
    const r = this.rng;
    const id = this.nations.length;
    const color = hsl((id * 137.508 + this.seed % 360) % 360, r.int(38, 55), r.int(50, 60));
    const n = {
      id, name: NM.nationName(culture, r), culture, color, capital: capital.id, alive: true, regime,
      treasury: 120, tax: 0.15, stability: 0.7, legitimacy: 0.8, army: 0, tech: r.range(0, 60), era: 0,
      rel: {}, neighbors: new Set(), founded: this.year, auto: false, exhaustion: 0,
      parties: partyNames(0).map((nm, k) => ({ name: nm, role: ROLES[k], support: 0.2 })),
      history: [], conquests: 0, shortage: 0, income: 0, expense: 0,
    };
    this.nations.push(n);
    n.leader = this.makeLeader(n);
    capital.nation = id;
    return n;
  }

  createCity(x, y, nationId, pop, culture) {
    const r = this.rng;
    const i = this.idx(x, y);
    const c = {
      id: this.cities.length, x, y, i, nation: nationId, pop, alive: true,
      name: NM.cityName(culture, r), culture, founded: this.year, seed: r.int(1, 1e9),
      coastal: !!this.T.coastal[i], river: !!this.T.nearRiver[i],
      buildings: {}, wallR: 0, stock: GOODS.map(() => 2), price: GOODS.map(g => g.base),
      prodFull: GOODS.map(() => 0), imp: GOODS.map(() => 0), tradeIncome: 0, tradeEMA: 0, K: pop * 1.5, shortage: 0, cells: 0,
    };
    this.cities.push(c);
    this.markNear(c);
    this.cityVersion++;
    return c;
  }

  placeInitial() {
    const r = this.rng, { W, H } = this;
    const cand = [];
    for (let i = 0; i < W * H; i++) if (this.site[i] > 0.4) cand.push([i, this.site[i] + r.next() * 0.35]);
    cand.sort((a, b) => b[1] - a[1]);
    const caps = [];
    for (const [i] of cand) {
      const x = i % W, y = (i / W) | 0;
      if (caps.every(c => Math.hypot(c.x - x, c.y - y) >= 34)) caps.push({ x, y });
      if (caps.length >= 14) break;
    }
    for (const p of caps) {
      const cul = NM.makeCulture(r);
      const c = this.createCity(p.x, p.y, -1, r.int(2500, 6000), cul);
      const n = this.createNation(c, cul, r.chance(0.55) ? 'Chefferie' : (r.chance(0.75) ? 'Royaume' : 'République'));
      n.leader = this.makeLeader(n);
    }
    // villages
    const vill = [];
    for (const [i] of cand) {
      const x = i % W, y = (i / W) | 0;
      if (this.cities.every(c => Math.hypot(c.x - x, c.y - y) >= 10) && vill.every(c => Math.hypot(c.x - x, c.y - y) >= 10)) vill.push({ x, y, i });
      if (vill.length >= caps.length * 3) break;
    }
    // rattachement au chef-lieu le plus proche (coût de trajet)
    const owner = this.multiSourceCost(this.cities.map(c => c.i), 60);
    for (const v of vill) {
      const capIdx = owner[v.i];
      if (capIdx < 0) continue;
      const cap = this.cities[capIdx];
      this.createCity(v.x, v.y, cap.nation, r.int(200, 900), this.nations[cap.nation].culture);
    }
    for (const a of this.nations) for (const b of this.nations) if (a !== b) a.rel[b.id] = r.int(-15, 25);
    for (const n of this.nations) {
      n.army = this.citiesOf(n).reduce((s, c) => s + c.pop, 0) * 0.012;
      this.log('fondation', { w: 1, nations: [n.id], title: `Naissance de ${n.name}`, text: `${n.name} s'organise autour de ${this.cities[n.capital].name}.` });
    }
  }

  multiSourceCost(sources, limit) {
    const { W, H } = this, T = this.T, N = W * H;
    const dist = new Float32Array(N).fill(Infinity), own = new Int32Array(N).fill(-1);
    const heap = new Heap();
    sources.forEach((s, k) => { dist[s] = 0; own[s] = k; heap.push(0, s); });
    while (heap.size) {
      const c = heap.pop(); const d = heap.lastKey;
      if (d > dist[c]) continue;
      const cx = c % W, cy = (c / W) | 0;
      for (let k = 0; k < 8; k++) {
        const nx = cx + NEI8[k][0], ny = cy + NEI8[k][1];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx;
        const nd = d + MOVE[T.biome[n]] * (k > 3 ? 1.414 : 1);
        if (nd < dist[n] && nd < limit) { dist[n] = nd; own[n] = own[c]; heap.push(nd, n); }
      }
    }
    return own;
  }

  // ---------- routes ----------
  stepCost(n) {
    const T = this.T, b = T.biome[n];
    let c = MOVE[b];
    if (!isFinite(c)) return Infinity;
    if (this.roadCell[n]) return 0.3;
    if (T.river[n]) c += 2.5;
    return c;
  }
  findPath(a, b, maxExp = 60000) {
    const { W, H } = this, N = W * H;
    const g = this._g || (this._g = new Float32Array(N));
    const came = this._came || (this._came = new Int32Array(N));
    const stamp = this._stamp || (this._stamp = new Uint32Array(N));
    this._st = (this._st || 0) + 1; const st = this._st;
    const bx = b % W, by = (b / W) | 0;
    const hf = i => { const dx = Math.abs(i % W - bx), dy = Math.abs(((i / W) | 0) - by); return (Math.max(dx, dy) + 0.414 * Math.min(dx, dy)) * 0.3; };
    const heap = new Heap();
    stamp[a] = st; g[a] = 0; came[a] = -1; heap.push(hf(a), a);
    let exp = 0;
    while (heap.size) {
      const c = heap.pop();
      if (c === b) break;
      if (++exp > maxExp) return null;
      const cx = c % W, cy = (c / W) | 0;
      for (let k = 0; k < 8; k++) {
        const nx = cx + NEI8[k][0], ny = cy + NEI8[k][1];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx;
        const sc = n === b ? 1 : this.stepCost(n);
        if (!isFinite(sc)) continue;
        const ng = g[c] + sc * (k > 3 ? 1.414 : 1);
        if (stamp[n] !== st || ng < g[n]) { stamp[n] = st; g[n] = ng; came[n] = c; heap.push(ng + hf(n), n); }
      }
    }
    if (stamp[b] !== st) return null;
    const path = []; let c = b;
    while (c !== -1) { path.push(c); c = came[c]; }
    return { path: path.reverse(), cost: g[b] };
  }
  connected(a, b) { return this.adj.get(a.id)?.has(b.id); }
  buildRoad(ca, cb, silent = true) {
    if (ca === cb || this.connected(ca, cb)) return null;
    const res = this.findPath(ca.i, cb.i);
    if (!res) return null;
    for (const n of res.path) this.roadCell[n]++;
    const road = { a: ca.id, b: cb.id, path: res.path, year: this.year, rail: false, len: res.path.length };
    this.roads.push(road);
    if (!this.adj.has(ca.id)) this.adj.set(ca.id, new Set());
    if (!this.adj.has(cb.id)) this.adj.set(cb.id, new Set());
    this.adj.get(ca.id).add(cb.id); this.adj.get(cb.id).add(ca.id);
    this.roadVersion++;
    if (!silent) this.log('route', { w: 2, nations: [ca.nation, cb.nation], text: `Une route relie désormais ${ca.name} à ${cb.name}.` });
    return road;
  }
  buildInitialRoads() {
    const cs = this.cities;
    for (const c of cs) {
      const near = cs.filter(o => o !== c).map(o => [o, this.dist(c, o)]).filter(p => p[1] < 30).sort((a, b) => a[1] - b[1]).slice(0, 2);
      for (const [o] of near) this.buildRoad(c, o);
    }
  }

  // ---------- territoire ----------
  cityStrength(c) { return 1 + Math.log10(Math.max(100, c.pop)) * 0.4; }
  cityReach(c) { const n = this.nations[c.nation]; return 4 + Math.log10(Math.max(100, c.pop)) * 2.4 + (n ? n.era : 0) * 0.9; }
  updateTerritory() {
    const { W, H } = this, T = this.T, N = W * H;
    const dist = new Float32Array(N).fill(Infinity), raw = new Float32Array(N);
    const own = new Int32Array(N).fill(-1);
    const heap = new Heap();
    const alive = this.cities.filter(c => c.alive);
    const str = [], reach = [];
    for (const c of alive) { str[c.id] = this.cityStrength(c); reach[c.id] = this.cityReach(c); dist[c.i] = 0; own[c.i] = c.id; heap.push(0, c.i); }
    while (heap.size) {
      const c = heap.pop(); const d = heap.lastKey;
      if (d > dist[c]) continue;
      const cid = own[c];
      const cx = c % W, cy = (c / W) | 0;
      for (let k = 0; k < 8; k++) {
        const nx = cx + NEI8[k][0], ny = cy + NEI8[k][1];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx;
        let mc = MOVE[T.biome[n]];
        if (!isFinite(mc)) continue;
        if (this.roadCell[n]) mc *= 0.6;
        mc *= (k > 3 ? 1.414 : 1);
        const nr = raw[c] + mc;
        if (nr > reach[cid]) continue;
        const nd = d + mc / str[cid];
        if (nd < dist[n]) { dist[n] = nd; raw[n] = nr; own[n] = cid; heap.push(nd, n); }
      }
    }
    this.cellCity = own;
    const cn = this.cellNation = new Int16Array(N).fill(-1);
    for (let i = 0; i < N; i++) if (own[i] >= 0) cn[i] = this.cities[own[i]].nation;
    for (const n of this.nations) n.neighbors = new Set();
    for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
      const i = y * W + x, a = cn[i];
      for (const j of [i + 1, i + W]) {
        const b = cn[j];
        if (a >= 0 && b >= 0 && a !== b) { this.nations[a].neighbors.add(b); this.nations[b].neighbors.add(a); }
      }
    }
    // voisins maritimes proches (ports)
    this.territoryVersion++;
  }

  computeProduction(c) {
    const { W, H } = this, T = this.T, R = 5;
    const p = GOODS.map(() => 0); let cells = 0;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dy * dy > R * R) continue;
      const x = c.x + dx, y = c.y + dy;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = y * W + x;
      if (this.cellCity[i] !== c.id) continue;
      cells++;
      p[0] += 0.13 * T.fert[i];
      const row = PROD[T.biome[i]];
      if (row) for (let g = 1; g < 6; g++) p[g] += row[g - 1];
    }
    if (c.coastal) p[0] += c.buildings.port ? 2.2 : 0.8;
    c.prodFull = p; c.cells = cells;
  }

  // ---------- simulation ----------
  stepDay() {
    this.day++;
    if (this.day % 30 === 0) this.monthly();
  }

  monthly() {
    this.month = (this.month + 1) % 12;
    if (this.month === 0) { this.year++; if (this.year === 0) this.year = 1; }
    const alive = this.cities.filter(c => c.alive);
    for (const n of this.nations) { n.shortage = 0; n.monthTrade = 0; }
    // production & consommation
    for (const c of alive) {
      const n = this.nations[c.nation], era = n.era, E = ERAS[era];
      const labour = Math.min(6, Math.sqrt(c.pop / 3000 + 0.1)) * (1 + 0.45 * era);
      const bmul = [1, 1, 1, (c.buildings.manufacture ? 1.6 : 1) * (c.buildings.usine ? 2.2 : 1), (c.buildings.manufacture ? 1.8 : 1) * (c.buildings.usine ? 2.2 : 1), 1];
      c.tradeIncome = 0;
      for (let g = 0; g < 6; g++) {
        const prod = g === 0 ? c.prodFull[0] * E.food + (c.extraFood || 0) : c.prodFull[g] * labour * bmul[g];
        const cons = c.pop / 1000 * GOODS[g].cons * (g === 0 ? 1 : 1 + 0.35 * era);
        c.stock[g] += prod - cons;
        if (c.stock[g] < 0) { if (g === 0) c.shortage = Math.min(1, -c.stock[g] / Math.max(0.01, cons)); c.stock[g] = 0; }
        else if (g === 0) c.shortage *= 0.5;
        c.stock[g] = Math.min(c.stock[g], cons * 24 + 5);
        c.price[g] = GOODS[g].base * Math.max(0.3, Math.min(4, (cons * 4 + 0.4) / (c.stock[g] + 0.4)));
        c._cons = c._cons || []; c._cons[g] = cons;
      }
    }
    this.trade(alive);
    // croissance
    for (const c of alive) {
      const n = this.nations[c.nation], era = n.era, E = ERAS[era];
      c.tradeEMA = c.tradeEMA * 0.92 + c.tradeIncome * 0.08;
      const foodK = (c.prodFull[0] * E.food + c.imp[0]) * 880 * (c.id === n.capital ? 1.2 : 1);
      let K = foodK;
      K += Math.min(foodK * (0.4 + era * 0.3), c.tradeEMA * (era >= 3 ? 220 * era : 90));
      if (c.buildings.usine) K += 22000 * (era - 3);
      if (c.buildings.manufacture) K += 4000;
      if (c.buildings.marche) K *= 1.1;
      c.K = Math.max(150, K);
      // la population urbaine « bonus » est nourrie par l'arrière-pays (marchés nationaux)
      c.extraFood = Math.max(0, Math.min(c.pop, K) - foodK) / 1000;
      const r = era >= 4 ? 0.007 : 0.004;
      c.pop += c.pop * r * (1 - c.pop / c.K) + this.rng.gauss() * c.pop * 0.0015;
      if (c.shortage > 0.05) { c.pop *= 1 - 0.025 * c.shortage; n.shortage = Math.max(n.shortage, c.shortage); }
      c.pop = Math.max(60, c.pop);
    }
    // finances, armée, stabilité, partis
    for (const n of this.nations) if (n.alive) this.nationMonthly(n);
    this.warsMonthly();
    if (this.month === 0) this.yearly();
  }

  trade(alive) {
    const pairs = [];
    for (const r of this.roads) pairs.push([this.cities[r.a], this.cities[r.b], 1]);
    const ports = alive.filter(c => c.buildings.port);
    for (let i = 0; i < ports.length; i++) for (let j = i + 1; j < ports.length; j++) {
      if (this.dist(ports[i], ports[j]) < 55) pairs.push([ports[i], ports[j], 0.6]);
    }
    for (const c of alive) c.imp = c.imp.map(v => v * 0.9);
    for (const [a, b, eff] of pairs) {
      if (!a.alive || !b.alive) continue;
      const na = this.nations[a.nation], nb = this.nations[b.nation];
      if (na !== nb && this.atWar(na.id, nb.id)) continue;
      const pact = na !== nb && (na.pacts?.has(nb.id)) ? 1.4 : 1;
      for (let g = 0; g < 6; g++) {
        let s = a, d = b;
        if (a.price[g] > b.price[g]) { s = b; d = a; }
        const diff = d.price[g] - s.price[g];
        if (diff < GOODS[g].base * 0.2) continue;
        const q = Math.min(s.stock[g] * 0.15, d._cons[g] * 2 + 0.2) * eff * pact;
        if (q <= 0.001) continue;
        s.stock[g] -= q; d.stock[g] += q; d.imp[g] += q * 0.1;
        const profit = q * diff * 0.12;
        const ms = s.buildings.marche ? 1.35 : 1, md = d.buildings.marche ? 1.35 : 1;
        s.tradeIncome += profit * 0.5 * ms; d.tradeIncome += profit * 0.5 * md;
        if (na !== nb) { na.monthTrade += profit; nb.monthTrade += profit; na._tradeWith = na._tradeWith || {}; na._tradeWith[nb.id] = (na._tradeWith[nb.id] || 0) + profit; }
      }
    }
  }

  nationMonthly(n) {
    const cs = this.citiesOf(n);
    if (!cs.length) return;
    const pop = cs.reduce((s, c) => s + c.pop, 0);
    n.pop = pop;
    const base = cs.reduce((s, c) => s + c.pop / 1000 * (0.5 + 0.25 * n.era) + c.tradeIncome, 0);
    const T = n.leader.traits;
    let income = base * n.tax * 3.2 * (T.includes('marchand') ? 1.1 : 1);
    const atWar = this.warsOf(n.id).length;
    let target = pop * 0.012 * (atWar ? 1.7 : 1) * (T.includes('conquerant') ? 1.3 : 1) * (n.regime === 'Dictature' ? 1.4 : 1);
    if (n.treasury < 0) target *= 0.6;
    n.army += (target - n.army) * 0.05;
    const nb = cs.reduce((s, c) => s + Object.keys(c.buildings).length, 0);
    const upkeep = n.army * 0.004 * (1 + n.era * 0.3) + cs.length * 0.12 * (1 + n.era * 0.5) + nb * 0.08 * (1 + n.era * 0.3) + (T.includes('prodigue') ? income * 0.2 : 0)
      + Math.max(0, n.treasury - Math.max(300, income * 60)) * 0.02; // corruption / gaspillage des trésors dormants
    n.income = income; n.expense = upkeep;
    n.treasury += income - upkeep;
    // stabilité
    const temples = cs.filter(c => c.buildings.temple).length;
    let t = 0.66 - (n.tax - 0.15) * 1.8 - atWar * 0.07 - n.shortage * 0.4 + temples / cs.length * 0.12
      + (n.legitimacy - 0.6) * 0.25 - Math.max(0, cs.length - 9) * 0.012;
    if (T.includes('pieux')) t += 0.05; if (T.includes('sage')) t += 0.04; if (T.includes('cruel')) t -= 0.07; if (T.includes('prudent')) t += 0.02;
    if (n.era >= 4 && REGIMES[n.regime].hered) t -= 0.1;
    if (n.regime === 'Dictature') t -= 0.04;
    if (n.treasury < 0) t -= 0.15;
    n.stability += (Math.max(0, Math.min(1, t)) - n.stability) * 0.06 + this.rng.gauss() * 0.008;
    n.stability = Math.max(0, Math.min(1, n.stability));
    // partis (modèle EcoPol simplifié)
    const w = {
      tradition: 1 + (REGIMES[n.regime].hered ? 0.4 : 0) + n.stability * 0.5,
      militaire: 0.8 + atWar * 0.8 + (n.conquests ? 0.3 : 0),
      religion: 0.8 + temples / cs.length + n.shortage,
      commerce: 0.7 + Math.min(1.5, n.monthTrade * 0.3 + cs.reduce((s, c) => s + c.tradeIncome, 0) / Math.max(1, pop / 1000) * 2) + (0.2 - n.tax),
      peuple: 0.7 + Math.max(0, n.tax - 0.15) * 4 + n.shortage * 2 + n.era * 0.15,
    };
    const tot = n.parties.reduce((s, p) => s + w[p.role], 0);
    for (const p of n.parties) p.support += (w[p.role] / tot - p.support) * 0.03;
  }

  warsOf(id) { return this.wars.filter(w => w.a === id || w.b === id); }
  atWar(a, b) { return this.wars.some(w => (w.a === a && w.b === b) || (w.a === b && w.b === a)); }

  declareWar(a, b) {
    if (a === b || this.atWar(a, b)) return false;
    const A = this.nations[a], Bn = this.nations[b];
    this.wars.push({ a, b, start: this.year, months: 0, score: 0 });
    A.rel[b] = Math.min(A.rel[b] ?? 0, -60); Bn.rel[a] = Math.min(Bn.rel[a] ?? 0, -60);
    A.pacts?.delete(b); Bn.pacts?.delete(a);
    this.log('guerre', { w: 9, nations: [a, b], title: `${A.name} déclare la guerre à ${Bn.name} !`, text: `${this.leaderTitle(A)} ${this.leaderFull(A)} lance ses armées contre ${Bn.name}.`, body: `Les tambours résonnent aux frontières. ${A.name} aligne environ ${Math.round(A.army * 10).toLocaleString('fr')} soldats face aux ${Math.round(Bn.army * 10).toLocaleString('fr')} de ${Bn.name}. Les marchands ferment leurs comptoirs.` });
    return true;
  }
  makePeace(w, reason) {
    this.wars = this.wars.filter(x => x !== w);
    const A = this.nations[w.a], Bn = this.nations[w.b];
    if (!A.alive || !Bn.alive) return;
    const win = w.score > 0 ? A : Bn;
    A.rel[Bn.id] = -20; Bn.rel[A.id] = -20;
    this.log('paix', { w: 7, nations: [w.a, w.b], title: `Paix entre ${A.name} et ${Bn.name}`, text: `Un traité met fin à la guerre entre ${A.name} et ${Bn.name}${Math.abs(w.score) > 3 ? `, à l'avantage de ${win.name}` : ''}.`, body: reason || `Après ${w.months} mois de combats, les plénipotentiaires signent la paix.` });
  }
  offerPeace(a, b) {
    const w = this.wars.find(x => (x.a === a && x.b === b) || (x.a === b && x.b === a));
    if (!w) return false;
    const other = this.nations[b];
    const losing = (w.a === b ? w.score : -w.score) < 0;
    if (losing || w.months > 14 || other.stability < 0.35 || this.rng.chance(0.25)) { this.makePeace(w, 'La paix est proposée et acceptée.'); return true; }
    return false;
  }

  warsMonthly() {
    for (const w of [...this.wars]) {
      const A = this.nations[w.a], Bn = this.nations[w.b];
      if (!A.alive || !Bn.alive) { this.wars = this.wars.filter(x => x !== w); continue; }
      w.months++;
      const sa = A.army * (1 + A.era * 0.25) * this.rng.range(0.7, 1.3);
      const sb = Bn.army * (1 + Bn.era * 0.25) * this.rng.range(0.7, 1.3);
      A.army = Math.max(1, A.army - sb * 0.025); Bn.army = Math.max(1, Bn.army - sa * 0.025);
      w.score += sa > sb ? 1 : -1;
      A.exhaustion += 0.02; Bn.exhaustion += 0.02;
      if (w.months % 3 === 0) {
        const winner = sa > sb ? A : Bn, loser = winner === A ? Bn : A;
        const ratio = Math.max(sa, sb) / Math.max(1, Math.min(sa, sb));
        if (ratio > 1.15) this.tryCapture(winner, loser);
      }
      if (!A.alive || !Bn.alive) { this.wars = this.wars.filter(x => x !== w); continue; }
      const tired = w.months > 12 && this.rng.chance(0.03 + Math.abs(w.score) * 0.004 + w.months * 0.0008);
      const ai = (w.a !== this.player && w.b !== this.player) || (A.auto && Bn.auto);
      if (tired && ai) this.makePeace(w);
      else if (tired && w.months > 30 && this.rng.chance(0.3)) this.makePeace(w, 'Épuisés, les deux camps signent une paix blanche.');
    }
  }

  tryCapture(win, lose) {
    const lc = this.citiesOf(lose), wc = this.citiesOf(win);
    if (!lc.length || !wc.length) return;
    let best = null, bd = Infinity;
    for (const c of lc) for (const o of wc) { const d = this.dist(c, o); if (d < bd) { bd = d; best = c; } }
    if (!best || bd > 45) return;
    const def = best.buildings.muraille ? 0.45 : 1;
    if (!this.rng.chance(0.5 * def)) {
      if (best.buildings.muraille && this.rng.chance(0.3)) this.log('siege', { w: 4, nations: [win.id, lose.id], city: best.id, text: `Les murailles de ${best.name} repoussent l'assaut de ${win.name}.` });
      return;
    }
    this.transferCity(best, win, 'conquest');
  }

  transferCity(c, to, why) {
    const from = this.nations[c.nation];
    const wasCapital = from.capital === c.id;
    c.nation = to.id; c.pop *= why === 'conquest' ? 0.85 : 1;
    to.conquests++;
    this.cityVersion++;
    if (why === 'conquest') {
      this.log('conquete', { w: wasCapital ? 9 : 6, nations: [to.id, from.id], city: c.id, title: `${c.name} tombe aux mains de ${to.name}`, text: `${to.name} s'empare de ${c.name}${wasCapital ? `, capitale de ${from.name}` : ''}.`, body: `Après un siège éprouvant, les troupes de ${to.name} entrent dans ${c.name}. La population, estimée à ${Math.round(c.pop).toLocaleString('fr')} âmes, attend le sort que lui réserve son nouveau maître.` });
    }
    const rest = this.citiesOf(from);
    if (!rest.length) {
      from.alive = false;
      this.wars = this.wars.filter(w => w.a !== from.id && w.b !== from.id);
      this.log('chute', { w: 10, nations: [from.id, to.id], title: `Chute de ${from.name}`, text: `${from.name} cesse d'exister, absorbé par ${to.name}.`, body: `Fondé en ${fmtYear(from.founded)}, ${from.name} disparaît des cartes. Les chroniqueurs se souviendront de ${this.leaderTitle(from).toLowerCase()} ${this.leaderFull(from)}, son dernier souverain.` });
    } else if (wasCapital) {
      rest.sort((a, b) => b.pop - a.pop);
      from.capital = rest[0].id;
      from.stability *= 0.7; from.legitimacy *= 0.7;
      this.log('capitale', { w: 5, nations: [from.id], text: `${from.name} transfère sa capitale à ${rest[0].name}.` });
    }
  }

  yearly() {
    const r = this.rng;
    for (const n of this.nations) if (n.alive) {
      n.exhaustion = Math.max(0, n.exhaustion - 0.15);
      n.legitimacy = Math.min(1, n.legitimacy + 0.02);
      // technologie
      const cs = this.citiesOf(n);
      const pop = cs.reduce((s, c) => s + c.pop, 0);
      const unis = cs.filter(c => c.buildings.universite).length;
      let gain = 0.3 + Math.sqrt(pop) / 420 + Math.min(unis, 4) * 0.5 + (n.leader.traits.includes('sage') ? 0.4 : 0) + Math.min(1, n.monthTrade * 0.05);
      for (const nb of n.neighbors) { const o = this.nations[nb]; if (o.alive && o.tech > n.tech) gain += Math.min(1, (o.tech - n.tech) * 0.002); }
      n.tech += gain / (1 + n.era * 0.25);
      let era = 0; for (let e = 0; e < ERAS.length; e++) if (n.tech >= ERAS[e].tech) era = e;
      if (era > n.era) this.enterEra(n, era);
      // dirigeant
      n.leader.age++;
      const a = n.leader.age;
      const p = a < 35 ? 0.006 : a < 50 ? 0.014 : a < 62 ? 0.035 : a < 72 ? 0.08 : 0.17;
      if (r.chance(p)) this.leaderDies(n);
      else if (REGIMES[n.regime].term && this.year - n.leader.since >= REGIMES[n.regime].term) this.election(n);
      // révoltes / révolutions
      if (n.stability < 0.22 && r.chance(0.18)) this.revolution(n);
      else if (n.stability < 0.3 && cs.length >= 3 && r.chance(0.2)) this.secession(n);
      // événements
      this.randomEvents(n, cs);
      for (const c of cs) {
        if (c.pop > 3000 && n.era >= 0 && !c.wallR && c.buildings.muraille) c.wallR = 1;
      }
    }
    // relations
    for (const a of this.nations) if (a.alive) for (const b of this.nations) if (b.alive && a.id < b.id) {
      let d = r.gauss() * 2;
      if (a.neighbors.has(b.id)) d -= 2.5;
      if (a._tradeWith?.[b.id]) d += Math.min(4, a._tradeWith[b.id] * 0.2);
      if (a.culture === b.culture) d += 1;
      const v = Math.max(-100, Math.min(100, ((a.rel[b.id] ?? 0) + (b.rel[a.id] ?? 0)) / 2 + d));
      a.rel[b.id] = v; b.rel[a.id] = v;
    }
    for (const n of this.nations) n._tradeWith = {};
    // IA
    for (const n of this.nations) if (n.alive && (n.id !== this.player || n.auto)) this.ai(n);
    // chemins de fer
    for (const rd of this.roads) {
      const a = this.cities[rd.a], b = this.cities[rd.b];
      if (!rd.rail && a.alive && b.alive && this.nations[a.nation].era >= 4 && this.nations[b.nation].era >= 4 && a.pop > 12000 && b.pop > 8000) {
        rd.rail = true; this.roadVersion++;
        if (r.chance(0.3)) this.log('rail', { w: 3, nations: [a.nation], text: `La ligne de chemin de fer ${a.name}–${b.name} est inaugurée.` });
      }
    }
    this.updateTerritory();
    for (const c of this.cities) if (c.alive) this.computeProduction(c);
  }

  enterEra(n, era) {
    n.era = era;
    const old = n.parties;
    n.parties = partyNames(era).map((nm, k) => ({ name: nm, role: ROLES[k], support: old[k] ? old[k].support : 0.2 }));
    let extra = '';
    if (era >= 1 && n.regime === 'Chefferie') { n.regime = 'Royaume'; extra = ` La chefferie devient un royaume.`; }
    this.log('ere', { w: 6, nations: [n.id], title: `${n.name} entre dans l'${ERAS[era].name.startsWith('Â') || ERAS[era].name.startsWith('È') || ERAS[era].name.startsWith('A') ? '' : ''}${ERAS[era].name}`, text: `${n.name} entre dans une nouvelle ère : ${ERAS[era].name}.${extra}`, body: `Savants et artisans de ${n.name} rivalisent d'inventions. On dit que le monde ne sera plus jamais le même.${extra}` });
  }

  leaderDies(n) {
    const old = n.leader, oldFull = this.leaderFull(n), oldTitle = this.leaderTitle(n);
    const reign = this.year - old.since;
    const cause = this.warsOf(n.id).length && this.rng.chance(0.3) ? 'tombé au combat' : this.rng.pick(['emporté par la fièvre', 'mort dans son sommeil', 'mort de vieillesse', 'victime d\'une chute de cheval', 'empoisonné, murmure-t-on']);
    if (REGIMES[n.regime].hered) {
      n.leader = this.makeLeader(n, { dynasty: old.dynasty, age: this.rng.int(14, 42) });
      if (this.rng.chance(0.12)) { n.legitimacy -= 0.3; n.stability -= 0.15; }
    } else {
      n.leader = this.makeLeader(n, { party: this.topParty(n).name });
    }
    this.log('mort', { w: n.id === this.player ? 9 : 5, nations: [n.id], title: `${oldTitle} ${oldFull} est mort${old.female ? 'e' : ''}`, text: `${oldTitle} ${oldFull} de ${n.name} est ${cause.replace('mort', old.female ? 'morte' : 'mort').replace('tombé', old.female ? 'tombée' : 'tombé').replace('emporté', old.female ? 'emportée' : 'emporté').replace('empoisonné', old.female ? 'empoisonnée' : 'empoisonné')} à ${old.age} ans. ${this.leaderFull(n)} ${old.female ? 'lui' : 'lui'} succède.`, body: `Après ${reign} années au pouvoir, ${oldFull} s'éteint. ${this.leaderTitle(n)} ${this.leaderFull(n)}, ${n.leader.age} ans, ${REGIMES[n.regime].hered ? `de la maison ${n.leader.dynasty}` : `issu${n.leader.female ? 'e' : ''} du parti ${n.leader.party}`}, prend la tête de ${n.name}.`, obit: { name: oldFull, title: oldTitle, age: old.age, reign } });
  }

  topParty(n) { return [...n.parties].sort((a, b) => b.support - a.support)[0]; }
  election(n) {
    const sorted = [...n.parties].sort((a, b) => b.support - a.support);
    const win = this.rng.chance(0.75) ? sorted[0] : sorted[1];
    const re = this.rng.chance(0.3) && n.leader.party === win.name;
    if (re) { n.leader.since = this.year; this.log('election', { w: 4, nations: [n.id], text: `${this.leaderFull(n)} est réélu${n.leader.female ? 'e' : ''} à la tête de ${n.name}.` }); return; }
    n.leader = this.makeLeader(n, { party: win.name });
    this.log('election', { w: n.id === this.player ? 7 : 4, nations: [n.id], title: `Élections : triomphe des ${win.name.toLowerCase()}`, text: `Élections en ${n.name} : ${win.name} en tête (${Math.round(win.support * 100)} %). ${this.leaderFull(n)} prend ses fonctions.`, body: `Les ${win.name} l'emportent avec ${Math.round(win.support * 100)} % des voix. ${this.leaderTitle(n)} ${this.leaderFull(n)}, ${n.leader.age} ans, promet ${win.role === 'commerce' ? 'la prospérité des comptoirs' : win.role === 'peuple' ? 'du pain pour tous' : win.role === 'militaire' ? 'la grandeur par les armes' : win.role === 'religion' ? 'le retour à la piété' : 'l\'ordre et la tradition'}.` });
  }

  revolution(n) {
    const top = this.topParty(n);
    const map = {
      tradition: n.era >= 2 ? 'Empire' : 'Royaume',
      militaire: n.era >= 3 ? 'Dictature' : 'Empire',
      religion: 'Théocratie',
      commerce: 'République',
      peuple: n.era >= 4 ? 'Démocratie' : 'République',
    };
    let reg = map[top.role];
    if (reg === n.regime) reg = n.era >= 4 ? 'Démocratie' : 'République';
    const oldReg = n.regime, oldFull = this.leaderFull(n);
    n.regime = reg;
    n.leader = this.makeLeader(n, { party: top.name });
    n.stability = 0.5; n.legitimacy = 0.45;
    this.log('revolution', { w: 10, nations: [n.id], title: `Révolution en ${n.name} !`, text: `Révolution en ${n.name} : ${oldReg.toLowerCase()} renversé${oldReg === 'Royaume' || oldReg === 'Empire' ? '' : 'e'}, ${reg} proclamé${reg === 'Empire' || reg === 'Royaume' ? '' : 'e'}.`, body: `Portés par les ${top.name}, les insurgés chassent ${oldFull}. ${this.leaderTitle(n)} ${this.leaderFull(n)} proclame ${reg === 'Empire' || reg === 'Royaume' ? 'l\'' : 'la '}${reg} et promet une ère nouvelle.` });
  }

  secession(n) {
    const cs = this.citiesOf(n).filter(c => c.id !== n.capital);
    if (!cs.length) return;
    const cap = this.cities[n.capital];
    cs.sort((a, b) => this.dist(b, cap) - this.dist(a, cap));
    const rebel = cs[0];
    const cul = NM.driftCulture(n.culture, this.rng);
    const nn = this.createNation(rebel, cul, n.era >= 3 ? 'République' : 'Royaume');
    nn.tech = n.tech; nn.era = n.era; nn.parties = partyNames(n.era).map((nm, k) => ({ name: nm, role: ROLES[k], support: 0.2 }));
    nn.founded = this.year; nn.army = n.army * 0.25; n.army *= 0.75;
    nn.treasury = 60;
    for (const o of this.nations) { nn.rel[o.id] = o.id === n.id ? -50 : 0; o.rel[nn.id] = o.id === n.id ? -50 : 0; }
    for (const c of cs.slice(1)) if (this.dist(c, rebel) < 14 && this.rng.chance(0.6)) { c.nation = nn.id; }
    rebel.nation = nn.id;
    n.stability += 0.1;
    this.cityVersion++;
    this.log('secession', { w: 9, nations: [nn.id, n.id], city: rebel.id, title: `${rebel.name} proclame son indépendance`, text: `${rebel.name} fait sécession de ${n.name} et fonde ${nn.name}.`, body: `Lassés des impôts et de l'éloignement de ${cap.name}, les notables de ${rebel.name} proclament ${nn.name}. ${this.leaderTitle(nn)} ${this.leaderFull(nn)} en prend la tête.` });
    if (this.rng.chance(0.5)) this.declareWar(n.id, nn.id);
  }

  randomEvents(n, cs) {
    const r = this.rng;
    if (!cs.length) return;
    const big = [...cs].sort((a, b) => b.pop - a.pop)[0];
    if (n.era < 4 && r.chance(0.012)) {
      for (const c of cs) c.pop *= r.range(0.7, 0.85);
      n.stability -= 0.1;
      this.log('peste', { w: 8, nations: [n.id], title: `La peste ravage ${n.name}`, text: `Une épidémie frappe ${n.name}. Les morts se comptent par milliers.`, body: `Partie des quais de ${big.name}, la maladie s'est répandue le long des routes. Les médecins, impuissants, recommandent la prière et le vinaigre.` });
    } else if (r.chance(0.01)) {
      const c = r.pick(cs); c.pop *= 0.94;
      this.log('incendie', { w: 4, nations: [n.id], city: c.id, text: `Un grand incendie détruit plusieurs quartiers de ${c.name}.` });
    } else if (r.chance(0.02) && n.stability > 0.6) {
      n.tech += 25; n.stability = Math.min(1, n.stability + 0.05);
      this.log('ageor', { w: 5, nations: [n.id], title: `Âge d'or à ${big.name}`, text: `Arts et sciences fleurissent à ${big.name}.`, body: `Poètes, architectes et savants affluent à ${big.name}. Le palais commande fresques et traités.` });
    } else if (n.shortage > 0.4 && r.chance(0.12)) {
      this.log('famine', { w: 7, nations: [n.id], title: `Famine en ${n.name}`, text: `Les greniers de ${n.name} sont vides : la famine sévit.`, body: `Le prix du blé s'envole sur les marchés de ${big.name} (${big.price[0].toFixed(1)} ${ERAS[n.era].currency} la mesure). Des émeutes éclatent.` });
    }
  }

  // ---------- actions (joueur & IA) ----------
  canBuild(c, key) {
    const b = BUILDINGS[key], n = this.nations[c.nation];
    if (c.buildings[key]) return 'déjà construit';
    if (n.era < b.era) return `requiert ${ERAS[b.era].name}`;
    if (b.coastal && !c.coastal) return 'ville non côtière';
    if (n.treasury < b.cost(c)) return 'trésor insuffisant';
    return null;
  }
  build(c, key, silent) {
    const why = this.canBuild(c, key);
    if (why) return why;
    const n = this.nations[c.nation];
    n.treasury -= BUILDINGS[key].cost(c);
    c.buildings[key] = this.year;
    if (key === 'muraille') c.wallR = 1;
    if (key === 'port') this.computeProduction(c);
    this.cityVersion++;
    const nm = key === 'temple' ? TEMPLE_NAMES[n.era] : BUILDINGS[key].name;
    if (!silent || n.id === this.player) this.log('construction', { w: key === 'muraille' || key === 'universite' ? 4 : 2, nations: [n.id], city: c.id, text: `${c.name} : construction ${key === 'muraille' ? 'des murailles' : `d'un${['temple', 'port', 'marche'].includes(key) ? '' : 'e'} ${nm.toLowerCase()}`}.` });
    return null;
  }

  colonySite(n) {
    const { W, H } = this, own = this.citiesOf(n);
    let best = -1, bs = 0.3;
    const r = this.rng;
    for (let k = 0; k < 2500; k++) {
      const src = r.pick(own);
      const x = Math.round(src.x + r.range(-20, 20)), y = Math.round(src.y + r.range(-20, 20));
      if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) continue;
      const i = y * W + x;
      if (this.nearCity[i] || this.site[i] <= bs) continue;
      const cn = this.cellNation[i];
      if (cn !== -1 && cn !== n.id) continue;
      bs = this.site[i]; best = i;
    }
    return best;
  }
  colonyCost(n) { return 120 + 20 * this.citiesOf(n).length; }
  foundColony(n, silent) {
    const cost = this.colonyCost(n);
    if (n.treasury < cost) return `trésor insuffisant (${cost})`;
    const i = this.colonySite(n);
    if (i < 0) return 'aucun site libre à proximité';
    const x = i % this.W, y = (i / this.W) | 0;
    const own = this.citiesOf(n).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
    const c = this.createCity(x, y, n.id, this.rng.int(180, 350), n.culture);
    n.treasury -= cost;
    this.buildRoad(own[0], c);
    this.computeProduction(c);
    this.log('colonie', { w: 3, nations: [n.id], city: c.id, text: `${n.name} fonde ${c.name}.` });
    return c;
  }
  proposePact(a, b) {
    const A = this.nations[a], Bn = this.nations[b];
    if ((A.rel[b] ?? 0) < -10 || this.atWar(a, b)) return false;
    A.pacts = A.pacts || new Set(); Bn.pacts = Bn.pacts || new Set();
    A.pacts.add(b); Bn.pacts.add(a);
    A.rel[b] += 15; Bn.rel[a] += 15;
    this.log('pacte', { w: 4, nations: [a, b], text: `${A.name} et ${Bn.name} signent un traité de commerce.` });
    return true;
  }

  ai(n) {
    const r = this.rng, cs = this.citiesOf(n).sort((a, b) => b.pop - a.pop);
    if (!cs.length) return;
    const T = n.leader.traits;
    // impôts
    const rich = n.treasury > Math.max(400, n.income * 120);
    n.tax += ((n.treasury < 50 ? 0.22 : (n.stability < 0.45 || rich) ? 0.08 : 0.16) - n.tax) * 0.3;
    // construction
    const builder = T.includes('batisseur') ? 2 : 1;
    for (let k = 0; k < builder; k++) {
      for (const c of cs) {
        const wants = [];
        if (c.pop > 2500 && (this.warsOf(n.id).length || r.chance(0.3))) wants.push('muraille');
        if (c.pop > 1200) wants.push('marche');
        if (n.stability < 0.65 || T.includes('pieux')) wants.push('temple');
        if (c.coastal && c.pop > 800) wants.push('port');
        if (c.pop > 7000) wants.push('universite');
        if (c.pop > 9000) wants.push('manufacture');
        if (c.pop > 15000) wants.push('usine');
        const key = wants.find(w => !this.canBuild(c, w) && n.treasury > BUILDINGS[w].cost(c) * 1.4);
        if (key) { this.build(c, key, true); break; }
      }
    }
    // colonisation
    if (n.treasury > this.colonyCost(n) * 1.5 && r.chance(0.3)) this.foundColony(n, true);
    // routes
    if (r.chance(0.35)) {
      const a = r.pick(cs);
      const others = this.cities.filter(o => o.alive && o !== a && !this.connected(a, o) && this.dist(a, o) < 24 && !this.atWar(n.id, o.nation)).sort((x, y) => this.dist(a, x) - this.dist(a, y));
      if (others.length && n.treasury > 40) { if (this.buildRoad(a, others[0], others[0].nation === n.id)) n.treasury -= 25; }
    }
    // diplomatie
    const wars = this.warsOf(n.id);
    if (!wars.length && n.stability > 0.45 && n.exhaustion < 0.5) {
      for (const nb of n.neighbors) {
        const o = this.nations[nb];
        if (!o.alive) continue;
        const aggr = (T.includes('conquerant') ? 0.08 : 0.025) + (n.regime === 'Dictature' || n.regime === 'Empire' ? 0.03 : 0);
        if ((n.rel[nb] ?? 0) < -35 && n.army > o.army * 1.25 && r.chance(aggr * 2)) { this.declareWar(n.id, nb); break; }
        if ((n.rel[nb] ?? 0) > 35 && !(n.pacts?.has(nb)) && r.chance(0.1) && nb !== this.player) this.proposePact(n.id, nb);
      }
    }
  }
}
