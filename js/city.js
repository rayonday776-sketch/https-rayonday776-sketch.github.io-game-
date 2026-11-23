// Plan procédural d'une ville : anneaux de croissance, avenues, quartiers typés, bâtiments, murailles, champs.
// Unités = cases de la carte. Le plan est recalculé quand la ville franchit un palier de population, d'ère ou de bâtiments.
import { RNG } from './rng.js';
import { B, isWaterBiome } from './terrain.js';

export const cityRadius = pop => 0.16 * Math.pow(Math.max(100, pop), 0.31);

export const WARD_TYPES = {
  centre: { name: 'Cœur de ville', fill: 1.0 },
  noble: { name: 'Quartier noble', fill: 0.6 },
  marchand: { name: 'Quartier marchand', fill: 0.95 },
  artisan: { name: 'Quartier des artisans', fill: 0.9 },
  populaire: { name: 'Quartier populaire', fill: 1.0 },
  port: { name: 'Quartier du port', fill: 0.8 },
  temple: { name: 'Quartier du temple', fill: 0.6 },
  faubourg: { name: 'Faubourg', fill: 0.55 },
  industriel: { name: 'Quartier industriel', fill: 0.85 },
  parc: { name: 'Jardins', fill: 0 },
  universite: { name: 'Quartier latin', fill: 0.7 },
};

// palette de toits par ère
const ROOFS = [
  { base: [196, 118, 82], noble: [214, 168, 120], poor: [168, 112, 80], ind: [150, 130, 110], ground: [226, 208, 166] },
  { base: [192, 112, 78], noble: [226, 196, 150], poor: [160, 108, 78], ind: [150, 130, 110], ground: [226, 210, 170] },
  { base: [150, 108, 84], noble: [126, 124, 132], poor: [128, 96, 72], ind: [120, 110, 100], ground: [214, 198, 160] },
  { base: [178, 96, 72], noble: [110, 116, 130], poor: [140, 100, 80], ind: [120, 105, 95], ground: [218, 204, 166] },
  { base: [138, 80, 64], noble: [112, 112, 122], poor: [120, 84, 66], ind: [92, 90, 94], ground: [196, 186, 160] },
  { base: [170, 168, 170], noble: [132, 156, 178], poor: [150, 146, 142], ind: [112, 112, 118], ground: [200, 198, 190] },
];
export const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

export function planKey(c, era) {
  const rings = Math.round(Math.log2(Math.max(100, c.pop)) * 2);
  return `${rings}|${era}|${Object.keys(c.buildings).sort().join(',')}|${c.wallR}`;
}

export function buildCityPlan(c, world, era) {
  const T = world.T, W = T.W;
  const rng = new RNG(c.seed);
  const cx = c.x + 0.5, cy = c.y + 0.5;
  const R = cityRadius(c.pop);
  const pal = ROOFS[era];
  const water = (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= W || iy >= T.H) return true;
    const b = T.biome[iy * W + ix];
    return isWaterBiome(b);
  };
  const riverAt = (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    const i = iy * W + ix;
    if (!T.river[i]) return false;
    // la rivière passe près du centre de la case → on laisse un couloir étroit
    const dx = x - (ix + 0.5), dy = y - (iy + 0.5);
    return dx * dx + dy * dy < 0.12;
  };

  // avenues : vers les villes reliées par la route + quelques axes aléatoires
  const angles = [];
  const adj = world.adj.get(c.id);
  if (adj) for (const o of adj) { const oc = world.cities[o]; angles.push(Math.atan2(oc.y - c.y, oc.x - c.x)); }
  const nAv = Math.min(8, 4 + Math.floor(R / 2));
  while (angles.length < nAv) angles.push(rng.range(0, Math.PI * 2));
  angles.sort((a, b) => a - b);
  // fusionner les axes trop proches
  const av = [];
  for (const a of angles) if (!av.length || a - av[av.length - 1] > 0.45) av.push(a);
  if (av.length > 1 && (av[0] + Math.PI * 2) - av[av.length - 1] < 0.45) av.pop();

  const ringW = 0.55 + era * 0.05;
  const nRings = Math.max(2, Math.round(R / ringW));
  const radii = [];
  for (let k = 0; k <= nRings; k++) radii.push(R * Math.pow(k / nRings, 0.92) + (k ? 0 : 0));
  const plazaR = radii[1] * 0.75;
  const wallR = c.buildings.muraille ? Math.min(R, Math.max(radii[1] * 1.5, R * (c._wallFrac ??= rng.range(0.55, 0.8)))) : 0;

  const bs = 0.075 + era * 0.012; // taille des bâtiments
  const roofs = { base: new Path2D(), noble: new Path2D(), poor: new Path2D(), ind: new Path2D(), special: new Path2D() };
  const parks = new Path2D(), ground = new Path2D(), fields = [new Path2D(), new Path2D()], piers = new Path2D(), chimneys = new Path2D();
  const wards = [];
  let nb = 0;

  // sol urbain (rues) : construit quartier par quartier pour ne pas déborder sur l'eau
  ground.moveTo(cx + radii[1], cy); ground.arc(cx, cy, radii[1], 0, Math.PI * 2);

  const avs = av.length ? av : [0];
  const hasPort = !!c.buildings.port, hasUni = !!c.buildings.universite, hasInd = !!(c.buildings.usine || c.buildings.manufacture);
  const nameFor = (type, a) => {
    const base = WARD_TYPES[type].name;
    if (type === 'faubourg') return `Faubourg ${['Nord', 'Est', 'Sud', 'Ouest'][Math.round(((a + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 2)) % 4]}`;
    return base;
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
        const mx = cx + Math.cos(am) * rm, my = cy + Math.sin(am) * rm;
        if (water(mx, my)) continue;
        sector(ground, cx, cy, r0 - 0.01, r1 + 0.03, w0 - 0.02 / rm, w1 + 0.02 / rm);
        // type de quartier
        let type;
        const nearWater = water(cx + Math.cos(am) * (r1 + 0.5), cy + Math.sin(am) * (r1 + 0.5));
        const outside = wallR && r0 > wallR;
        if (nearWater && hasPort && rng.chance(0.7)) type = 'port';
        else if (outside) type = (era >= 4 && hasInd && rng.chance(0.35)) ? 'industriel' : 'faubourg';
        else if (f < 0.3) type = rng.pick(['noble', 'temple', 'marchand', 'noble']);
        else if (f < 0.6) type = rng.pick(['marchand', 'artisan', 'artisan', 'populaire', hasUni ? 'universite' : 'artisan']);
        else type = (era >= 4 && hasInd && rng.chance(0.3)) ? 'industriel' : rng.pick(['populaire', 'populaire', 'artisan']);
        if (rng.chance(0.05) && type !== 'port') type = 'parc';
        const ward = { type, a0: w0, a1: w1, r0, r1, name: nameFor(type, am), x: mx, y: my };
        wards.push(ward);
        if (type === 'parc') {
          sector(parks, cx, cy, r0 + 0.06, r1 - 0.06, w0 + 0.06 / rm, w1 - 0.06 / rm);
          continue;
        }
        const roof = type === 'noble' || type === 'temple' || type === 'universite' ? roofs.noble : type === 'populaire' || type === 'faubourg' ? roofs.poor : type === 'industriel' ? roofs.ind : roofs.base;
        const fill = WARD_TYPES[type].fill * (era >= 5 ? 0.85 : 1);
        const big = type === 'industriel' ? 2.2 : type === 'noble' ? 1.6 : (era >= 5 ? 1.5 : 1);
        const step = bs * big * 1.25;
        const streetR = 0.07, streetA = 0.11;
        for (let r = r0 + streetR + step / 2; r < r1 - streetR; r += step) {
          const da = step / r;
          for (let a = w0 + streetA / r + da / 2; a < w1 - streetA / r; a += da) {
            if (rng.next() > fill) continue;
            const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
            if (water(x, y) || (c.river && riverAt(x, y))) continue;
            const w = step * rng.range(0.6, 0.9), h = step * rng.range(0.55, 0.85);
            rect(roof, x, y, w, h, a);
            nb++;
            if (type === 'industriel' && rng.chance(0.15)) { chimneys.moveTo(x + bs * 0.35, y); chimneys.arc(x, y, bs * 0.35, 0, Math.PI * 2); }
          }
        }
        if (type === 'port') {
          for (let q = 0; q < 3; q++) {
            const a = w0 + (w1 - w0) * (q + 0.5) / 3;
            const x0 = cx + Math.cos(a) * r1, y0 = cy + Math.sin(a) * r1;
            if (!water(x0 + Math.cos(a) * 0.4, y0 + Math.sin(a) * 0.4)) continue;
            rect(piers, x0 + Math.cos(a) * 0.35, y0 + Math.sin(a) * 0.35, 0.08, 0.7, a + Math.PI / 2);
          }
        }
      }
    }
  }
  // édifices centraux
  const special = roofs.special;
  rect(special, cx, cy, plazaR * 0.55, plazaR * 0.55, avs[0]); // palais / forum
  if (c.buildings.temple) {
    const a = avs[0] + 0.9, r = plazaR * 0.75;
    rect(special, cx + Math.cos(a) * r, cy + Math.sin(a) * r, plazaR * 0.4, plazaR * 0.28, a);
  }
  // champs autour de la ville (préindustriel) : parcelles en lanières
  if (era < 5) {
    const fr0 = R * 1.06, fr1 = R * 1.06 + 0.9 + R * 0.35;
    const nA = Math.round(fr1 * 5);
    for (let s = 0; s < nA; s++) {
      const a0 = (s / nA) * Math.PI * 2, a1 = ((s + 1) / nA) * Math.PI * 2;
      for (let r = fr0; r < fr1; r += 0.35) {
        const am = (a0 + a1) / 2, rm = r + 0.17;
        const x = cx + Math.cos(am) * rm, y = cy + Math.sin(am) * rm;
        if (water(x, y) || rng.chance(0.25)) continue;
        const ix = Math.floor(x), iy = Math.floor(y), bb = T.biome[iy * W + ix];
        if (bb === B.MOUNTAIN || bb === B.SNOW || bb === B.FOREST || bb === B.JUNGLE) continue;
        sector(fields[(s + Math.round(r * 3)) % 2], cx, cy, r + 0.02, r + 0.33, a0 + 0.02 / r, a1 - 0.02 / r);
      }
    }
  }
  // muraille : polygone irrégulier + tours + portes sur les avenues
  let wall = null, towers = null;
  if (wallR) {
    wall = new Path2D(); towers = new Path2D();
    const segs = Math.max(10, Math.round(wallR * 5));
    const pts = [];
    for (let s = 0; s < segs; s++) {
      const a = s / segs * Math.PI * 2;
      const r = wallR * (1 + rng.range(-0.04, 0.04));
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      pts.push([x, y, a, water(x, y)]);
    }
    for (let s = 0; s < segs; s++) {
      const p = pts[s], q = pts[(s + 1) % segs];
      if (p[3] && q[3]) continue;
      const am = (p[2] + (s + 1 === segs ? p[2] + (Math.PI * 2 / segs) : q[2])) / 2;
      const gate = avs.some(a => Math.abs(((am - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.08);
      if (!gate) { wall.moveTo(p[0], p[1]); wall.lineTo(q[0], q[1]); }
      if (!p[3]) rect(towers, p[0], p[1], 0.13 + era * 0.01, 0.13 + era * 0.01, p[2]);
    }
  }
  return { key: planKey(c, era), R, cx, cy, roofs, parks, ground, fields, piers, chimneys, wall, towers, plazaR, wards, avenues: avs, pal, era, buildings: nb };
}

function rect(path, x, y, w, h, a) {
  const c = Math.cos(a), s = Math.sin(a);
  const hw = w / 2, hh = h / 2;
  // w le long de la tangente, h radial
  const tx = -s, ty = c, rx = c, ry = s;
  path.moveTo(x + tx * hw + rx * hh, y + ty * hw + ry * hh);
  path.lineTo(x - tx * hw + rx * hh, y - ty * hw + ry * hh);
  path.lineTo(x - tx * hw - rx * hh, y - ty * hw - ry * hh);
  path.lineTo(x + tx * hw - rx * hh, y + ty * hw - ry * hh);
  path.closePath();
}
function sector(path, cx, cy, r0, r1, a0, a1) {
  if (a1 <= a0 || r1 <= r0) return;
  path.moveTo(cx + Math.cos(a0) * r0, cy + Math.sin(a0) * r0);
  path.arc(cx, cy, r1, a0, a1);
  path.arc(cx, cy, r0, a1, a0, true);
  path.closePath();
}

export function drawCityPlan(ctx, plan, scale, alpha) {
  const p = plan.pal, lw = 1 / scale;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(176,150,90,0.35)'; ctx.fill(plan.fields[0]);
  ctx.fillStyle = 'rgba(150,150,80,0.32)'; ctx.fill(plan.fields[1]);
  ctx.strokeStyle = 'rgba(90,70,40,0.25)'; ctx.lineWidth = lw * 0.6; ctx.stroke(plan.fields[0]); ctx.stroke(plan.fields[1]);
  ctx.fillStyle = rgb(p.ground, 0.85); ctx.fill(plan.ground);
  // avenues
  ctx.strokeStyle = rgb([p.ground[0] * 0.92, p.ground[1] * 0.9, p.ground[2] * 0.85]);
  ctx.lineWidth = 0.14;
  ctx.beginPath();
  for (const a of plan.avenues) { ctx.moveTo(plan.cx, plan.cy); ctx.lineTo(plan.cx + Math.cos(a) * plan.R * 1.05, plan.cy + Math.sin(a) * plan.R * 1.05); }
  ctx.stroke();
  ctx.fillStyle = 'rgba(110,150,80,0.75)'; ctx.fill(plan.parks);
  ctx.fillStyle = 'rgba(120,90,60,0.9)'; ctx.fill(plan.piers);
  ctx.strokeStyle = 'rgba(50,35,25,0.65)'; ctx.lineWidth = Math.min(0.012, lw * 0.8);
  for (const k of ['poor', 'base', 'ind', 'noble']) { ctx.fillStyle = rgb(p[k]); ctx.fill(plan.roofs[k]); if (scale > 60) ctx.stroke(plan.roofs[k]); }
  ctx.fillStyle = 'rgb(232,222,196)'; ctx.fill(plan.roofs.special);
  ctx.lineWidth = Math.max(lw * 1.2, 0.02); ctx.strokeStyle = 'rgba(40,30,20,0.9)'; ctx.stroke(plan.roofs.special);
  ctx.fillStyle = 'rgba(60,55,55,0.9)'; ctx.fill(plan.chimneys);
  if (plan.wall) {
    ctx.strokeStyle = 'rgba(70,60,50,0.95)'; ctx.lineWidth = 0.09 + plan.era * 0.01; ctx.lineCap = 'round';
    ctx.stroke(plan.wall);
    ctx.strokeStyle = 'rgba(200,190,170,0.9)'; ctx.lineWidth = 0.035; ctx.stroke(plan.wall);
    ctx.fillStyle = 'rgba(90,80,70,1)'; ctx.fill(plan.towers);
  }
  ctx.restore();
}
