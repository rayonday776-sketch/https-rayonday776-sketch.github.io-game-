// Plan procédural d'une ville : vieille ville organique, extensions en damier (Renaissance et après),
// quartiers typés, toits à deux pans avec ombres, monuments, ponts, port et bateaux, enceinte
// (murs → bastions en étoile → boulevards), champs en lanières. Unités = cases de la carte.
import { RNG, makeNoise } from './rng.js';
import { B, isWaterBiome } from './terrain.js';

export const cityRadius = pop => 0.16 * Math.pow(Math.max(100, pop), 0.31);

export const WARD_TYPES = {
  centre: { name: 'Cœur de ville', fill: 1.0 },
  noble: { name: 'Quartier noble', fill: 0.55 },
  marchand: { name: 'Quartier marchand', fill: 0.95 },
  artisan: { name: 'Quartier des artisans', fill: 0.9 },
  populaire: { name: 'Quartier populaire', fill: 1.0 },
  port: { name: 'Quartier du port', fill: 0.8 },
  temple: { name: 'Quartier du temple', fill: 0.6 },
  faubourg: { name: 'Faubourg', fill: 0.5 },
  industriel: { name: 'Quartier industriel', fill: 0.85 },
  parc: { name: 'Jardins', fill: 0 },
  universite: { name: 'Quartier latin', fill: 0.7 },
  neuf: { name: 'Quartier neuf', fill: 0.9 },
  affaires: { name: 'Quartier des affaires', fill: 0.8 },
};

// palettes de toits par ère : [clair, moyen, sombre] par groupe
const ROOFS = [
  { base: [[204, 126, 88], [190, 112, 78], [176, 104, 72]], noble: [[226, 196, 150], [214, 180, 132], [232, 214, 178]], poor: [[176, 132, 96], [160, 116, 84], [150, 110, 80]], ind: [[150, 130, 110], [140, 120, 100], [130, 112, 96]], ground: [228, 210, 168] },
  { base: [[200, 118, 82], [186, 106, 74], [210, 132, 92]], noble: [[232, 222, 200], [220, 206, 180], [210, 190, 160]], poor: [[170, 120, 88], [158, 110, 80], [148, 104, 76]], ind: [[150, 130, 110], [140, 120, 100], [130, 112, 96]], ground: [228, 212, 172] },
  { base: [[156, 112, 86], [140, 100, 78], [168, 120, 90]], noble: [[128, 126, 136], [116, 116, 126], [140, 138, 146]], poor: [[132, 100, 74], [120, 92, 68], [144, 108, 80]], ind: [[120, 110, 100], [110, 100, 92], [130, 118, 106]], ground: [216, 200, 162] },
  { base: [[184, 100, 74], [170, 92, 70], [196, 112, 82]], noble: [[112, 118, 134], [100, 108, 124], [124, 128, 142]], poor: [[146, 104, 82], [134, 96, 76], [156, 112, 88]], ind: [[120, 105, 95], [110, 96, 88], [130, 114, 102]], ground: [220, 206, 168] },
  { base: [[142, 84, 66], [128, 76, 60], [154, 92, 72]], noble: [[112, 114, 124], [100, 104, 114], [124, 126, 136]], poor: [[124, 88, 70], [112, 80, 64], [134, 96, 76]], ind: [[96, 94, 98], [86, 84, 90], [106, 104, 108]], ground: [200, 190, 162] },
  { base: [[176, 174, 176], [160, 160, 164], [190, 188, 186]], noble: [[136, 162, 186], [120, 148, 174], [150, 172, 194]], poor: [[156, 150, 144], [144, 138, 134], [166, 160, 152]], ind: [[112, 112, 118], [100, 100, 108], [124, 124, 130]], ground: [204, 202, 194] },
];
export const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const GROUND_TINT = {
  noble: [0.97, 1.02, 0.95], populaire: [0.95, 0.93, 0.9], faubourg: [0.98, 1.0, 0.92], industriel: [0.88, 0.87, 0.86],
  port: [0.96, 0.95, 0.93], parc: [0.8, 0.92, 0.72], universite: [0.98, 0.98, 0.95],
};

export function planKey(c, era) {
  const rings = Math.round(Math.log2(Math.max(100, c.pop)) * 2);
  return `${rings}|${era}|${Object.keys(c.buildings).sort().join(',')}|${c.wallR}|${c.monument || 0}`;
}

export function buildCityPlan(c, world, era) {
  const T = world.T, W = T.W;
  const rng = new RNG(c.seed);
  const nz = makeNoise(c.seed + 17);
  const cx = c.x + 0.5, cy = c.y + 0.5;
  const R = cityRadius(c.pop);
  const pal = ROOFS[era];
  const cellB = (x, y) => { const ix = Math.floor(x), iy = Math.floor(y); if (ix < 0 || iy < 0 || ix >= W || iy >= T.H) return B.DEEP; return T.biome[iy * W + ix]; };
  const water = (x, y) => isWaterBiome(cellB(x, y));
  const riverAt = (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y), i = iy * W + ix;
    if (!T.river[i]) return false;
    const dx = x - (ix + 0.5), dy = y - (iy + 0.5);
    return dx * dx + dy * dy < 0.12;
  };
  // déformation organique : le rayon ondule selon l'angle, les rues radiales se courbent
  const amp = 0.13;
  const P = (a, r) => {
    const rr = r * (1 + amp * nz.noise(Math.cos(a) * 1.4 + 5, Math.sin(a) * 1.4 + 5) * 1.5);
    const aa = a + 0.1 * nz.noise(r * 0.5 + 9, 3.3) + 0.04 * nz.noise(Math.cos(a) * 3, Math.sin(a) * 3);
    return [cx + Math.cos(aa) * rr, cy + Math.sin(aa) * rr];
  };
  const polySector = (path, r0, r1, a0, a1) => {
    if (a1 <= a0 || r1 <= r0) return;
    const n = Math.max(3, Math.ceil((a1 - a0) * r1 / 0.15));
    for (let k = 0; k <= n; k++) { const p = P(a0 + (a1 - a0) * k / n, r1); k ? path.lineTo(p[0], p[1]) : path.moveTo(p[0], p[1]); }
    for (let k = n; k >= 0; k--) { const p = P(a0 + (a1 - a0) * k / n, r0); path.lineTo(p[0], p[1]); }
    path.closePath();
  };

  // avenues : vers les villes reliées + axes aléatoires
  const angles = [];
  const adj = world.adj.get(c.id);
  if (adj) for (const o of adj) { const oc = world.cities[o]; angles.push(Math.atan2(oc.y - c.y, oc.x - c.x)); }
  const nAv = Math.min(8, 4 + Math.floor(R / 2));
  while (angles.length < nAv) angles.push(rng.range(0, Math.PI * 2));
  angles.sort((a, b) => a - b);
  const av = [];
  for (const a of angles) if (!av.length || a - av[av.length - 1] > 0.45) av.push(a);
  if (av.length > 1 && (av[0] + Math.PI * 2) - av[av.length - 1] < 0.45) av.pop();
  const avs = av.length ? av : [0];

  const ringW = 0.55 + era * 0.05;
  const nRings = Math.max(2, Math.round(R / ringW));
  const radii = [];
  for (let k = 0; k <= nRings; k++) radii.push(R * Math.pow(k / nRings, 0.92));
  const plazaR = radii[1] * 0.8;
  const wallFrac = c._wallFrac ??= rng.range(0.5, 0.75);
  const wallR = c.buildings.muraille ? Math.min(R, Math.max(radii[1] * 1.6, R * wallFrac)) : 0;
  // l'ancienne enceinte marque la limite entre vieille ville organique et extensions planifiées
  const oldCore = wallR || R * 0.55;

  const bs = 0.075 + era * 0.01;
  const mk = () => [new Path2D(), new Path2D(), new Path2D()];
  const roofs = { base: mk(), noble: mk(), poor: mk(), ind: mk() };
  const special = new Path2D(), specialDark = new Path2D(), ridge = new Path2D(), shadow = new Path2D(), shadowTall = new Path2D();
  const parks = new Path2D(), trees = new Path2D(), plaza = new Path2D(), stalls = [new Path2D(), new Path2D(), new Path2D()];
  const fields = [new Path2D(), new Path2D(), new Path2D(), new Path2D()], orchards = new Path2D();
  const piers = new Path2D(), boats = new Path2D(), sails = new Path2D(), chimneys = new Path2D(), smoke = new Path2D(), bridges = new Path2D();
  const grounds = {};
  const groundOf = t => grounds[t] || (grounds[t] = new Path2D());
  const wards = [];
  let nb = 0;

  const addBuilding = (group, x, y, w, h, a, tall = 1) => {
    const v = rng.int(0, 2);
    rect(roofs[group][v], x, y, w, h, a);
    // demi-toit sombre (pan à l'ombre) + faîtage
    const c0 = Math.cos(a), s0 = Math.sin(a);
    const rx = c0 * h / 4, ry = s0 * h / 4;
    rect(ridge, x + rx, y + ry, w, h / 2, a);
    const sh = 0.035 * tall;
    rect(tall > 2 ? shadowTall : shadow, x + sh, y + sh * 1.2, w, h, a);
    nb++;
  };
  ground0();
  function ground0() {
    const g = groundOf('centre');
    polySector(g, 0.001, radii[1] + 0.02, 0, Math.PI * 2);
  }

  const hasPort = !!c.buildings.port, hasUni = !!c.buildings.universite, hasInd = !!(c.buildings.usine || c.buildings.manufacture);
  const nameFor = (type, a) => {
    if (type === 'faubourg') return `Faubourg ${['Est', 'Sud', 'Ouest', 'Nord'][Math.round(((a + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 2)) % 4]}`;
    return WARD_TYPES[type].name;
  };

  for (let k = 1; k < nRings; k++) {
    const r0 = radii[k], r1 = radii[k + 1];
    const f = k / nRings;
    for (let s = 0; s < avs.length; s++) {
      const a0 = avs[s], a1 = s + 1 < avs.length ? avs[s + 1] : avs[0] + Math.PI * 2;
      const span = a1 - a0, rm = (r0 + r1) / 2;
      const pieces = Math.max(1, Math.round(span * rm / 1.4));
      for (let p = 0; p < pieces; p++) {
        const w0 = a0 + span * p / pieces, w1 = a0 + span * (p + 1) / pieces;
        const am = (w0 + w1) / 2;
        const [mx, my] = P(am, rm);
        if (water(mx, my)) continue;
        const [ox, oy] = P(am, r1 + 0.5);
        const nearWater = water(ox, oy);
        const outside = r0 > oldCore;
        const planned = era >= 3 && outside;
        let type;
        if (nearWater && hasPort && rng.chance(0.7)) type = 'port';
        else if (outside && era >= 4 && hasInd && rng.chance(0.3)) type = 'industriel';
        else if (outside && era >= 5 && f < 0.75 && rng.chance(0.35)) type = 'affaires';
        else if (planned) type = 'neuf';
        else if (wallR && outside) type = 'faubourg';
        else if (f < 0.3) type = rng.pick(['noble', 'temple', 'marchand', 'noble']);
        else if (f < 0.6) type = rng.pick(['marchand', 'artisan', 'artisan', 'populaire', hasUni ? 'universite' : 'artisan']);
        else type = rng.pick(['populaire', 'populaire', 'artisan']);
        if (rng.chance(0.06) && type !== 'port') type = 'parc';
        const ward = { type, name: nameFor(type, am), x: mx, y: my };
        wards.push(ward);
        const sG = 0.05 / rm;
        polySector(groundOf(type), r0 - 0.01, r1 + 0.03, w0 - sG, w1 + sG);
        if (type === 'parc') {
          polySector(parks, r0 + 0.06, r1 - 0.06, w0 + 0.06 / rm, w1 - 0.06 / rm);
          for (let q = 0; q < span * rm * (r1 - r0) * 18 / pieces; q++) {
            const [tx, ty] = P(rng.range(w0 + 0.1 / rm, w1 - 0.1 / rm), rng.range(r0 + 0.1, r1 - 0.1));
            trees.moveTo(tx + 0.06, ty); trees.arc(tx, ty, rng.range(0.04, 0.075), 0, Math.PI * 2);
          }
          continue;
        }
        const group = type === 'noble' || type === 'temple' || type === 'universite' || type === 'affaires' ? 'noble' : type === 'populaire' || type === 'faubourg' ? 'poor' : type === 'industriel' ? 'ind' : 'base';
        const fill = WARD_TYPES[type].fill;
        const streetR = 0.07, streetA = 0.11;
        if (type === 'neuf' || type === 'affaires') {
          // damier : îlots fermés avec cour (style haussmannien), tours au centre des affaires
          const Bk = 0.4 + era * 0.03, th = Bk * 0.22;
          for (let r = r0 + streetR + Bk / 2; r < r1 - streetR; r += Bk + 0.08) {
            const da = (Bk + 0.08) / r;
            for (let a = w0 + streetA / r + da / 2; a < w1 - streetA / r; a += da) {
              const [x, y] = P(a, r);
              if (water(x, y) || (c.river && riverAt(x, y))) continue;
              const [x2, y2] = P(a, r + 0.05);
              const ang = Math.atan2(y2 - y, x2 - x) - Math.PI / 2;
              if (type === 'affaires' && rng.chance(0.55)) { addBuilding('noble', x, y, Bk * 0.6, Bk * 0.6, ang, 4); continue; }
              if (rng.chance(0.08)) { // square arboré
                for (let q = 0; q < 4; q++) { const tx = x + rng.range(-Bk / 3, Bk / 3), ty = y + rng.range(-Bk / 3, Bk / 3); trees.moveTo(tx + 0.05, ty); trees.arc(tx, ty, 0.05, 0, Math.PI * 2); }
                continue;
              }
              const cA = Math.cos(ang), sA = Math.sin(ang), tx = -sA, ty = cA, h = (Bk - th) / 2;
              addBuilding(group, x + cA * h, y + sA * h, Bk, th, ang);
              addBuilding(group, x - cA * h, y - sA * h, Bk, th, ang);
              addBuilding(group, x + tx * h, y + ty * h, th, Bk - 2 * th, ang);
              addBuilding(group, x - tx * h, y - ty * h, th, Bk - 2 * th, ang);
            }
          }
          continue;
        }
        const big = type === 'industriel' ? 2.4 : type === 'noble' ? 1.7 : (era >= 5 ? 1.5 : 1);
        const step = bs * big * 1.25;
        for (let r = r0 + streetR + step / 2; r < r1 - streetR; r += step) {
          const da = step / r;
          for (let a = w0 + streetA / r + da / 2; a < w1 - streetA / r; a += da) {
            if (rng.next() > fill) continue;
            const [x, y] = P(a + rng.range(-0.15, 0.15) * da, r + rng.range(-0.1, 0.1) * step);
            if (water(x, y) || (c.river && riverAt(x, y))) continue;
            const [x2, y2] = P(a, r + 0.05);
            const ang = Math.atan2(y2 - y, x2 - x) - Math.PI / 2 + rng.range(-0.08, 0.08);
            const w = step * rng.range(0.65, 0.95), h = step * rng.range(0.55, 0.85);
            addBuilding(group, x, y, w, h, ang, type === 'industriel' ? 1.5 : 1);
            if (type === 'industriel' && rng.chance(0.14)) {
              chimneys.moveTo(x + bs * 0.3, y); chimneys.arc(x, y, bs * 0.3, 0, Math.PI * 2);
              for (let q = 1; q <= 3; q++) { const sx = x + q * 0.07, sy = y - q * 0.09, sr = 0.04 + q * 0.025; smoke.moveTo(sx + sr, sy); smoke.arc(sx, sy, sr, 0, Math.PI * 2); }
            }
          }
        }
        if (type === 'port') {
          for (let q = 0; q < 3; q++) {
            const a = w0 + (w1 - w0) * (q + 0.5) / 3;
            const [x0, y0] = P(a, r1);
            const dx = Math.cos(a), dy = Math.sin(a);
            if (!water(x0 + dx * 0.4, y0 + dy * 0.4)) continue;
            rect(piers, x0 + dx * 0.35, y0 + dy * 0.35, 0.07, 0.7, a + Math.PI / 2);
            if (rng.chance(0.8)) {
              const bx = x0 + dx * 0.5 + -dy * 0.14, by = y0 + dy * 0.5 + dx * 0.14;
              if (water(bx, by)) { boat(boats, bx, by, a, 0.09 + era * 0.01); if (era < 4) { sails.moveTo(bx + 0.05, by); sails.arc(bx, by, 0.05, 0, Math.PI * 2); } }
            }
          }
        }
      }
    }
  }

  // ---- cœur de ville : place, palais, monuments ----
  const a0 = avs[0];
  plaza.moveTo(cx + plazaR, cy); plaza.arc(cx, cy, plazaR, 0, Math.PI * 2);
  // palais (cour intérieure)
  const pr = plazaR * 0.45;
  const px = cx + Math.cos(a0 + Math.PI) * plazaR * 0.35, py = cy + Math.sin(a0 + Math.PI) * plazaR * 0.35;
  rect(special, px, py, pr * 1.3, pr, a0);
  rect(specialDark, px, py, pr * 0.6, pr * 0.45, a0);
  rect(shadow, px + 0.04, py + 0.05, pr * 1.3, pr, a0);
  // lieu de culte
  if (c.buildings.temple || era >= 2) {
    const ta = a0 + 1.6, tr = plazaR * 0.55;
    const tx = cx + Math.cos(ta) * tr, ty = cy + Math.sin(ta) * tr, sz = plazaR * 0.32;
    if (era <= 1) { rect(special, tx, ty, sz * 1.4, sz * 0.8, ta); for (let q = -2; q <= 2; q++) { const qx = tx + Math.cos(ta + Math.PI / 2) * q * sz * 0.28, qy = ty + Math.sin(ta + Math.PI / 2) * q * sz * 0.28; specialDark.moveTo(qx + 0.02, qy); specialDark.arc(qx, qy, 0.02, 0, Math.PI * 2); } }
    else { rect(special, tx, ty, sz * 1.8, sz * 0.5, ta); rect(special, tx + Math.cos(ta) * sz * 0.3, ty + Math.sin(ta) * sz * 0.3, sz * 0.5, sz * 1.3, ta); if (era >= 3) { specialDark.moveTo(tx + sz * 0.3, ty); specialDark.arc(tx, ty, sz * 0.3, 0, Math.PI * 2); } }
    rect(shadow, tx + 0.04, ty + 0.05, sz * 1.8, sz * 0.6, ta);
  }
  // marché : étals colorés
  if (c.buildings.marche) {
    const ma = a0 - 1.4;
    for (let q = 0; q < 14; q++) {
      const rr = plazaR * rng.range(0.2, 0.8), aa = ma + rng.range(-0.5, 0.5);
      const sx = cx + Math.cos(aa) * rr, sy = cy + Math.sin(aa) * rr;
      rect(stalls[q % 3], sx, sy, 0.05, 0.05, aa);
    }
  }
  // université : cloître
  if (hasUni) {
    const ua = a0 + 3, ur = radii[Math.min(2, nRings - 1)] * 0.9;
    const ux = cx + Math.cos(ua) * ur, uy = cy + Math.sin(ua) * ur, us = 0.32;
    rect(special, ux, uy, us, us, ua); rect(specialDark, ux, uy, us * 0.55, us * 0.55, ua);
  }
  // monuments (événement de l'architecte)
  for (let q = 0; q < (c.monument || 0); q++) {
    const ma = a0 + 0.8 + q * 1.3, mr = plazaR * 0.75;
    const mx = cx + Math.cos(ma) * mr, my = cy + Math.sin(ma) * mr;
    star(special, mx, my, 0.12, 0.05, 8);
    rect(shadowTall, mx + 0.08, my + 0.1, 0.06, 0.2, 0.6);
  }

  // ---- avenues (sinueuses) et ponts ----
  const avenues = new Path2D();
  for (const a of avs) {
    let first = true;
    let wasRiver = false, bStart = null;
    for (let r = plazaR * 0.9; r <= R * 1.08; r += 0.08) {
      const [x, y] = P(a, r);
      first ? avenues.moveTo(x, y) : avenues.lineTo(x, y); first = false;
      const ix = Math.floor(x), iy = Math.floor(y);
      const onRiver = !!T.river[iy * W + ix] && riverAt(x, y);
      if (onRiver && !wasRiver) bStart = [x, y];
      if (!onRiver && wasRiver && bStart) { bridges.moveTo(bStart[0], bStart[1]); bridges.lineTo(x, y); }
      wasRiver = onRiver;
    }
  }

  // ---- champs (préindustriel) : parcelles irrégulières, vergers ----
  if (era < 5) {
    const fr0 = R * 1.08, fr1 = R * 1.08 + 0.9 + R * 0.4;
    let a = 0;
    while (a < Math.PI * 2) {
      const da = rng.range(0.12, 0.3) / Math.max(1, fr0 * 0.4);
      let r = fr0;
      while (r < fr1) {
        const dr = rng.range(0.22, 0.45);
        const am = a + da / 2, rm = r + dr / 2;
        const [x, y] = P(am, rm);
        const bb = cellB(x, y);
        if (!isWaterBiome(bb) && bb !== B.MOUNTAIN && bb !== B.SNOW && bb !== B.FOREST && bb !== B.JUNGLE && bb !== B.TAIGA && !rng.chance(0.2)) {
          if (rng.chance(0.1)) { for (let q = 0; q < 6; q++) { const [ox, oy] = P(a + da * rng.next(), r + dr * rng.next()); orchards.moveTo(ox + 0.04, oy); orchards.arc(ox, oy, 0.04, 0, Math.PI * 2); } }
          else polySector(fields[rng.int(0, 3)], r + 0.02, r + dr - 0.02, a + 0.02 / r, a + da - 0.02 / r);
        }
        r += dr;
      }
      a += da;
    }
  }

  // ---- enceinte : murailles médiévales, bastions en étoile (Renaissance), boulevards (après) ----
  let wall = null, towers = null, boulevard = null;
  if (wallR) {
    if (era >= 4) {
      boulevard = new Path2D();
      polySector(boulevard, wallR - 0.06, wallR + 0.06, 0, Math.PI * 2);
      for (let q = 0; q < wallR * 30; q++) { const a = q / (wallR * 30) * Math.PI * 2; for (const dr of [-0.09, 0.09]) { const [tx, ty] = P(a, wallR + dr); if (!water(tx, ty)) { trees.moveTo(tx + 0.035, ty); trees.arc(tx, ty, 0.035, 0, Math.PI * 2); } } }
    } else {
      wall = new Path2D(); towers = new Path2D();
      const star3 = era === 3;
      const segs = star3 ? Math.max(5, Math.round(wallR * 2.2)) * 2 : Math.max(10, Math.round(wallR * 5));
      const pts = [];
      for (let s = 0; s < segs; s++) {
        const a = s / segs * Math.PI * 2;
        const r = star3 ? wallR * (s % 2 ? 1 : 1.22) : wallR * (1 + rng.range(-0.03, 0.03));
        const [x, y] = P(a, r);
        pts.push([x, y, a, water(x, y)]);
      }
      for (let s = 0; s < segs; s++) {
        const p = pts[s], q = pts[(s + 1) % segs];
        if (p[3] && q[3]) continue;
        const am = p[2] + Math.PI / segs;
        const gate = avs.some(a => Math.abs(((am - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.07);
        if (!gate) { wall.moveTo(p[0], p[1]); wall.lineTo(q[0], q[1]); }
        if (!p[3] && (!star3 || s % 2 === 0)) { const tr = 0.07 + era * 0.01; towers.moveTo(p[0] + tr, p[1]); towers.arc(p[0], p[1], tr, 0, Math.PI * 2); }
      }
    }
  }
  return { key: planKey(c, era), R, cx, cy, roofs, ridge, shadow, shadowTall, special, specialDark, parks, trees, plaza, stalls, grounds, fields, orchards, piers, boats, sails, chimneys, smoke, bridges, avenues, wall, towers, boulevard, wards, pal, era, buildings: nb };
}

function rect(path, x, y, w, h, a) {
  const c = Math.cos(a), s = Math.sin(a);
  const hw = w / 2, hh = h / 2;
  const tx = -s, ty = c, rx = c, ry = s;
  path.moveTo(x + tx * hw + rx * hh, y + ty * hw + ry * hh);
  path.lineTo(x - tx * hw + rx * hh, y - ty * hw + ry * hh);
  path.lineTo(x - tx * hw - rx * hh, y - ty * hw - ry * hh);
  path.lineTo(x + tx * hw - rx * hh, y + ty * hw - ry * hh);
  path.closePath();
}
function boat(path, x, y, a, L) {
  const c = Math.cos(a + Math.PI / 2), s = Math.sin(a + Math.PI / 2);
  path.moveTo(x + c * L, y + s * L);
  path.quadraticCurveTo(x - s * L * 0.45, y + c * L * 0.45, x - c * L, y - s * L);
  path.quadraticCurveTo(x + s * L * 0.45, y - c * L * 0.45, x + c * L, y + s * L);
}
function star(path, x, y, r1, r2, n) {
  for (let k = 0; k <= n * 2; k++) { const a = k / (n * 2) * Math.PI * 2, r = k % 2 ? r2 : r1; const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; k ? path.lineTo(px, py) : path.moveTo(px, py); }
  path.closePath();
}

const FIELD_COLORS = ['rgba(196,170,96,0.45)', 'rgba(150,160,84,0.42)', 'rgba(170,140,96,0.38)', 'rgba(184,180,110,0.42)'];

export function drawCityPlan(ctx, plan, scale, alpha) {
  const p = plan.pal, lw = 1 / scale;
  ctx.save();
  ctx.globalAlpha = alpha;
  plan.fields.forEach((f, k) => { ctx.fillStyle = FIELD_COLORS[k]; ctx.fill(f); });
  ctx.strokeStyle = 'rgba(90,70,40,0.22)'; ctx.lineWidth = lw * 0.6; for (const f of plan.fields) ctx.stroke(f);
  ctx.fillStyle = 'rgba(90,120,60,0.8)'; ctx.fill(plan.orchards);
  for (const [t, g] of Object.entries(plan.grounds)) {
    const k = GROUND_TINT[t] || [1, 1, 1];
    ctx.fillStyle = rgb([p.ground[0] * k[0], p.ground[1] * k[1], p.ground[2] * k[2]], 0.92); ctx.fill(g);
  }
  ctx.fillStyle = rgb([p.ground[0] * 1.03, p.ground[1] * 1.02, p.ground[2] * 0.98]); ctx.fill(plan.plaza);
  ctx.strokeStyle = 'rgba(120,100,70,0.5)'; ctx.lineWidth = Math.max(lw, 0.01); ctx.stroke(plan.plaza);
  ctx.strokeStyle = rgb([p.ground[0] * 0.9, p.ground[1] * 0.88, p.ground[2] * 0.82]); ctx.lineWidth = 0.13; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.stroke(plan.avenues);
  if (plan.boulevard) { ctx.fillStyle = rgb([p.ground[0] * 0.9, p.ground[1] * 0.88, p.ground[2] * 0.84]); ctx.fill(plan.boulevard); }
  ctx.fillStyle = 'rgba(112,150,82,0.85)'; ctx.fill(plan.parks);
  ctx.fillStyle = 'rgba(110,80,52,0.95)'; ctx.fill(plan.piers);
  // ombres portées
  ctx.fillStyle = 'rgba(40,30,20,0.22)'; ctx.fill(plan.shadow);
  ctx.fillStyle = 'rgba(40,30,20,0.3)'; ctx.fill(plan.shadowTall);
  for (const k of ['poor', 'base', 'ind', 'noble']) for (let v = 0; v < 3; v++) { ctx.fillStyle = rgb(p[k][v]); ctx.fill(plan.roofs[k][v]); }
  ctx.fillStyle = 'rgba(30,20,10,0.16)'; ctx.fill(plan.ridge);
  if (scale > 60) { ctx.strokeStyle = 'rgba(50,35,25,0.45)'; ctx.lineWidth = Math.min(0.01, lw * 0.7); for (const k of ['poor', 'base', 'ind', 'noble']) for (let v = 0; v < 3; v++) ctx.stroke(plan.roofs[k][v]); }
  ctx.fillStyle = 'rgb(236,226,200)'; ctx.fill(plan.special);
  ctx.lineWidth = Math.max(lw * 1.2, 0.015); ctx.strokeStyle = 'rgba(40,30,20,0.9)'; ctx.stroke(plan.special);
  ctx.fillStyle = 'rgb(150,128,96)'; ctx.fill(plan.specialDark); ctx.stroke(plan.specialDark);
  ['rgb(190,60,50)', 'rgb(60,100,160)', 'rgb(220,180,70)'].forEach((c, k) => { ctx.fillStyle = c; ctx.fill(plan.stalls[k]); });
  ctx.fillStyle = 'rgb(84,116,64)'; ctx.fill(plan.trees);
  ctx.strokeStyle = 'rgba(40,60,30,0.6)'; ctx.lineWidth = Math.min(0.012, lw); ctx.stroke(plan.trees);
  ctx.fillStyle = 'rgb(70,64,62)'; ctx.fill(plan.chimneys);
  ctx.fillStyle = 'rgba(150,150,150,0.35)'; ctx.fill(plan.smoke);
  ctx.fillStyle = 'rgb(96,66,40)'; ctx.fill(plan.boats);
  ctx.fillStyle = 'rgba(250,246,232,0.95)'; ctx.fill(plan.sails);
  if (plan.wall) {
    ctx.strokeStyle = 'rgba(70,60,50,0.95)'; ctx.lineWidth = 0.1 + plan.era * 0.012; ctx.stroke(plan.wall);
    ctx.strokeStyle = 'rgba(206,196,176,0.9)'; ctx.lineWidth = 0.04; ctx.stroke(plan.wall);
    ctx.fillStyle = 'rgb(120,110,96)'; ctx.fill(plan.towers);
    ctx.strokeStyle = 'rgba(50,40,30,0.9)'; ctx.lineWidth = Math.max(lw, 0.012); ctx.stroke(plan.towers);
  }
  ctx.restore();
}

// ponts dessinés après les rivières
export function drawCityBridges(ctx, plan, alpha) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.lineCap = 'butt';
  ctx.strokeStyle = 'rgba(60,45,30,0.9)'; ctx.lineWidth = 0.2; ctx.stroke(plan.bridges);
  ctx.strokeStyle = 'rgb(214,200,170)'; ctx.lineWidth = 0.14; ctx.stroke(plan.bridges);
  ctx.restore();
}
