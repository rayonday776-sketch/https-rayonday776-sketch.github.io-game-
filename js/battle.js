// Batailles tactiques : terrain, commandants, choix de stratégie (pierre-feuille-ciseaux pondéré),
// résolution, et mise en scène animée sur canvas.
import { B } from './terrain.js';
import { RNG } from './rng.js';

export const STRATS = {
  charge: { name: 'Charge frontale', era: 0, desc: 'Tout jeter dans l\'assaut. Écrase le harcèlement, se brise sur une ligne retranchée.' },
  defense: { name: 'Ligne retranchée', era: 0, desc: 'Tenir le terrain. Brise les charges, vulnérable aux manœuvres de flanc.' },
  flanc: { name: 'Manœuvre de flanc', era: 0, desc: 'Déborder l\'ennemi par les ailes. Bat les lignes figées, exposée au harcèlement.' },
  harcelement: { name: 'Harcèlement', era: 0, desc: 'Escarmouches et embuscades. Pertes réduites des deux côtés ; piège les manœuvres.' },
  artillerie: { name: 'Barrage d\'artillerie', era: 3, desc: 'Écraser l\'ennemi sous le feu avant l\'assaut. Redoutable contre les lignes, lent face aux manœuvres.' },
  retraite: { name: 'Retraite ordonnée', era: 0, desc: 'Refuser le combat : peu de pertes, mais le terrain est cédé.' },
};
const BEATS = {
  charge: { harcelement: 0.3, defense: -0.3, flanc: 0.05, artillerie: -0.1 },
  defense: { charge: 0.3, flanc: -0.3, artillerie: -0.25 },
  flanc: { defense: 0.3, harcelement: -0.3, artillerie: 0.25 },
  harcelement: { flanc: 0.3, charge: -0.3, artillerie: 0.1 },
  artillerie: { defense: 0.25, charge: 0.2, flanc: -0.25 },
  retraite: {},
};
export const TERRAINS = {
  plaine: { name: 'Plaine dégagée', mod: { charge: 0.1, flanc: 0.12, artillerie: 0.1, harcelement: -0.1 } },
  collines: { name: 'Collines', mod: { defense: 0.2, charge: -0.1, artillerie: 0.1 } },
  montagne: { name: 'Défilé de montagne', mod: { defense: 0.3, charge: -0.25, flanc: -0.15, harcelement: 0.15 } },
  foret: { name: 'Forêt épaisse', mod: { harcelement: 0.25, charge: -0.15, artillerie: -0.2, flanc: 0.05 } },
  riviere: { name: 'Gué d\'une rivière', mod: { charge: -0.2, defense: 0.2, flanc: -0.05 } },
  marais: { name: 'Marécages', mod: { charge: -0.25, harcelement: 0.15, artillerie: -0.1 } },
  desert: { name: 'Désert', mod: { flanc: 0.15, defense: -0.05 } },
};
const CMD = { conquerant: { charge: 0.12 }, prudent: { defense: 0.12, retraite: 0.1 }, sage: { flanc: 0.1, artillerie: 0.08 }, cruel: { charge: 0.06, harcelement: 0.06 }, batisseur: { defense: 0.06, artillerie: 0.08 }, marchand: {}, pieux: { defense: 0.05 }, prodigue: { charge: 0.04 } };

export function terrainAt(world, x, y) {
  const T = world.T, i = Math.floor(y) * world.W + Math.floor(x);
  if (T.river[i] || T.nearRiver[i]) return 'riviere';
  const b = T.biome[i];
  if (b === B.MOUNTAIN || b === B.SNOW) return 'montagne';
  if (b === B.HILLS) return 'collines';
  if (b === B.FOREST || b === B.JUNGLE || b === B.TAIGA) return 'foret';
  if (b === B.SWAMP) return 'marais';
  if (b === B.DESERT) return 'desert';
  return 'plaine';
}
export const marshalOf = n => (n.court || []).find(m => m.role === 'marechal')?.L;

export function availableStrats(n) { return Object.keys(STRATS).filter(k => n.era >= STRATS[k].era); }

function modifier(n, s, o, terrain) {
  let m = (BEATS[s][o] || 0) + (TERRAINS[terrain].mod[s] || 0);
  const L = marshalOf(n);
  if (L) for (const t of L.traits) m += (CMD[t]?.[s] || 0);
  return m;
}

export function aiStrategy(world, n, foe, terrain, rng = world.rng) {
  const ks = availableStrats(n);
  const ratio = n.army / Math.max(1, foe.army);
  const w = ks.map(k => {
    let v = 1 + (TERRAINS[terrain].mod[k] || 0) * 4;
    if (k === 'retraite') v = ratio < 0.45 ? 2 : 0.15;
    if (k === 'defense' && ratio < 0.8) v += 0.6;
    if (k === 'charge' && ratio > 1.4) v += 0.6;
    return Math.max(0.05, v);
  });
  let r = rng.next() * w.reduce((s, v) => s + v, 0);
  for (let k = 0; k < ks.length; k++) { r -= w[k]; if (r <= 0) return ks[k]; }
  return ks[0];
}

// résultat d'un affrontement (pas d'effet de bord)
export function computeBattle(world, A, Bn, sA, sB, terrain, rng = world.rng) {
  const res = { sA, sB, terrain, armyA: A.army, armyB: Bn.army };
  if (sA === 'retraite' || sB === 'retraite') {
    const aRet = sA === 'retraite', bRet = sB === 'retraite';
    res.lossA = A.army * (aRet ? 0.03 : 0.01); res.lossB = Bn.army * (bRet ? 0.03 : 0.01);
    res.winA = !aRet || (aRet && bRet && rng.chance(0.5)); if (aRet && !bRet) res.winA = false;
    res.decisive = false; res.retreat = true;
    return res;
  }
  const pa = A.army * (1 + A.era * 0.25) * (1 + modifier(A, sA, sB, terrain)) * rng.range(0.8, 1.2);
  const pb = Bn.army * (1 + Bn.era * 0.25) * (1 + modifier(Bn, sB, sA, terrain)) * rng.range(0.8, 1.2);
  const ratio = pa / Math.max(1e-6, pb);
  res.winA = ratio > 1; res.ratio = ratio;
  const dom = Math.abs(Math.log(ratio));
  const soft = (sA === 'harcelement' || sB === 'harcelement') ? 0.55 : 1;
  const lossL = (0.12 + Math.min(0.2, dom * 0.25)) * soft, lossW = (0.05 + Math.max(0, 0.08 - dom * 0.06)) * soft;
  res.lossA = A.army * (res.winA ? lossW : lossL);
  res.lossB = Bn.army * (res.winA ? lossL : lossW);
  res.decisive = ratio > 1.6 || ratio < 1 / 1.6;
  return res;
}

// estimation des chances par stratégie (Monte-Carlo contre la doctrine adverse)
export function estimate(world, A, Bn, terrain) {
  const out = {};
  const rng = new RNG((world.day * 31 + A.id * 7) >>> 0);
  for (const s of availableStrats(A)) {
    let win = 0, loss = 0;
    for (let k = 0; k < 160; k++) {
      const sb = aiStrategy(world, Bn, A, terrain, rng);
      const r = computeBattle(world, A, Bn, s, sb, terrain, rng);
      if (r.winA) win++; loss += r.lossA;
    }
    out[s] = { win: win / 160, loss: loss / 160 };
  }
  return out;
}

// ---------- mise en scène ----------
const TERRAIN_BG = { plaine: '#c9c48a', collines: '#c4b07e', montagne: '#b7a68a', foret: '#8ea66e', riviere: '#c2c38c', marais: '#9fae84', desert: '#e3cf98' };

export function drawBattlefield(ctx, W, H, scene, t) {
  const { terrain, colA, colB, res, seed } = scene;
  const rng = new RNG(seed);
  ctx.fillStyle = TERRAIN_BG[terrain]; ctx.fillRect(0, 0, W, H);
  // grain
  for (let k = 0; k < 400; k++) { ctx.fillStyle = `rgba(80,60,30,${rng.range(0.03, 0.08)})`; ctx.fillRect(rng.next() * W, rng.next() * H, 2, 2); }
  if (terrain === 'riviere') { ctx.fillStyle = '#6f98b0'; ctx.beginPath(); ctx.moveTo(W * 0.47, 0); ctx.bezierCurveTo(W * 0.56, H * 0.3, W * 0.42, H * 0.7, W * 0.52, H); ctx.lineTo(W * 0.6, H); ctx.bezierCurveTo(W * 0.5, H * 0.7, W * 0.64, H * 0.3, W * 0.55, 0); ctx.fill(); ctx.fillStyle = '#d8c9a0'; ctx.fillRect(W * 0.46, H * 0.46, W * 0.12, H * 0.08); }
  const sym = (n, f) => { for (let k = 0; k < n; k++) f(rng.next() * W, rng.next() * H); };
  if (terrain === 'foret') sym(70, (x, y) => { ctx.fillStyle = '#5f8a4c'; ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.fill(); ctx.strokeStyle = '#3e5a30'; ctx.stroke(); });
  if (terrain === 'collines' || terrain === 'montagne') sym(terrain === 'montagne' ? 18 : 14, (x, y) => { ctx.strokeStyle = 'rgba(90,70,45,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); if (terrain === 'montagne') { ctx.moveTo(x - 26, y + 14); ctx.lineTo(x, y - 22); ctx.lineTo(x + 26, y + 14); ctx.fillStyle = '#cbbb9a'; ctx.fill(); } else ctx.arc(x, y + 10, 26, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); });
  if (terrain === 'marais') sym(40, (x, y) => { ctx.strokeStyle = '#4c6b48'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 3, y - 8); ctx.moveTo(x, y); ctx.lineTo(x + 3, y - 8); ctx.stroke(); ctx.fillStyle = 'rgba(100,140,150,0.4)'; ctx.fillRect(x - 10, y + 2, 20, 4); });
  if (terrain === 'desert') sym(16, (x, y) => { ctx.strokeStyle = 'rgba(150,110,60,0.5)'; ctx.beginPath(); ctx.arc(x, y, 30, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); });

  // phases : 0-1 déploiement, 1-3.2 manœuvres, 3.2-4.5 mêlée, >4.5 issue
  const lerp = (a, b, k) => a + (b - a) * Math.max(0, Math.min(1, k));
  const blocksFor = army => Math.max(4, Math.min(24, Math.round(Math.sqrt(army) * 1.1)));
  const drawArmy = (side, strat, army, loss, col) => {
    const n = blocksFor(army);
    const dir = side === 0 ? 1 : -1;
    const baseX = side === 0 ? W * 0.18 : W * 0.82;
    const lossFrac = res ? Math.min(0.9, loss / Math.max(1, army)) : 0;
    const killT = Math.max(0, Math.min(1, (t - 3.2) / 1.3));
    const cols = Math.ceil(n / 4);
    for (let k = 0; k < n; k++) {
      const row = k % 4, colI = Math.floor(k / 4);
      let x = baseX - dir * colI * 22, y = H * 0.32 + row * 34;
      const prog = Math.max(0, Math.min(1, (t - 1) / 2.2));
      const wing = row === 0 ? -1 : row === 3 ? 1 : 0;
      if (strat === 'charge') x += dir * lerp(0, W * 0.27, prog * prog);
      else if (strat === 'defense') x += dir * lerp(0, W * 0.06, prog);
      else if (strat === 'flanc') { x += dir * lerp(0, W * (wing ? 0.32 : 0.14), prog); y += wing * lerp(0, 70, prog) - wing * lerp(0, 40, Math.max(0, prog - 0.6) * 2.5); }
      else if (strat === 'harcelement') { x += dir * (lerp(0, W * 0.18, prog) + Math.sin(t * 5 + k) * 14); y += Math.cos(t * 4 + k * 1.7) * 10; }
      else if (strat === 'artillerie') x += dir * lerp(0, W * (row % 2 ? 0.04 : 0.16), Math.max(0, prog - 0.4) * 1.6);
      else if (strat === 'retraite') x -= dir * lerp(0, W * 0.12, prog);
      if (t > 3.2 && strat !== 'retraite') x += Math.sin(t * 20 + k) * 2;
      const dead = res && (k / n) < lossFrac * killT;
      const winner = res && ((side === 0) === res.winA);
      if (res && t > 4.6 && !winner && !res.retreat) x -= dir * (t - 4.6) * 60;
      ctx.globalAlpha = dead ? 0.15 : 1;
      // régiment : rectangle de petits soldats
      ctx.fillStyle = col;
      ctx.strokeStyle = 'rgba(30,20,10,0.8)'; ctx.lineWidth = 1;
      ctx.fillRect(x - 8, y - 10, 16, 20); ctx.strokeRect(x - 8, y - 10, 16, 20);
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; for (let q = 0; q < 6; q++) ctx.fillRect(x - 6 + (q % 3) * 5, y - 8 + Math.floor(q / 3) * 9, 2, 6);
      ctx.globalAlpha = 1;
    }
    if (strat === 'defense') { ctx.strokeStyle = 'rgba(70,45,20,0.9)'; ctx.lineWidth = 2; const sx = baseX + dir * (W * 0.06 + 18); for (let y = H * 0.26; y < H * 0.78; y += 9) { ctx.beginPath(); ctx.moveTo(sx, y); ctx.lineTo(sx + dir * 9, y - 5); ctx.stroke(); } }
    if (strat === 'artillerie' && t > 1.2 && t < 4.4) {
      for (let q = 0; q < 6; q++) {
        const ph = (t * 1.7 + q * 0.37) % 1;
        const sx = baseX + dir * 10, sy = H * 0.3 + q * 26;
        const ex = W / 2 + dir * W * 0.2 * (1 - ph) + dir * 30, ey = sy + Math.sin(q) * 20;
        ctx.fillStyle = `rgba(200,200,200,${0.6 * (1 - ph)})`; ctx.beginPath(); ctx.arc(sx, sy, 6 + ph * 10, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(40,30,20,0.8)'; ctx.beginPath(); ctx.arc(lerp(sx, W - ex + W * 0, ph), ey - Math.sin(ph * Math.PI) * 30, 2.5, 0, 7); ctx.fill();
      }
    }
  };
  drawArmy(0, scene.sA, scene.armyA, res ? res.lossA : 0, colA);
  drawArmy(1, scene.sB, scene.armyB, res ? res.lossB : 0, colB);
  // mêlée : poussière et éclairs
  if (res && t > 3 && t < 4.8 && !res.retreat) {
    for (let k = 0; k < 14; k++) {
      const x = W / 2 + Math.sin(t * 7 + k * 2.1) * 70, y = H * 0.3 + (k * 23) % (H * 0.45);
      ctx.fillStyle = `rgba(200,180,140,${0.25 + 0.2 * Math.sin(t * 9 + k)})`; ctx.beginPath(); ctx.arc(x, y, 14 + (k % 3) * 6, 0, 7); ctx.fill();
      if ((Math.floor(t * 12) + k) % 7 === 0) { ctx.fillStyle = 'rgba(255,240,180,0.9)'; ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill(); }
    }
  }
  // cartouche
  ctx.fillStyle = 'rgba(40,28,18,0.75)'; ctx.fillRect(0, H - 26, W, 26);
  ctx.fillStyle = '#f4e8cc'; ctx.font = '14px "IM Fell English", Georgia, serif'; ctx.textAlign = 'left';
  ctx.fillText(`${scene.nameA} — ${scene.sA ? STRATS[scene.sA].name : 'en attente d\'ordres'}`, 10, H - 9);
  ctx.textAlign = 'right';
  ctx.fillText(`${scene.sB && (t > 1 || res) ? STRATS[scene.sB].name : '???'} — ${scene.nameB}`, W - 10, H - 9);
  if (res && t > 4.7) {
    ctx.fillStyle = 'rgba(30,20,10,0.8)'; ctx.fillRect(W * 0.2, H * 0.08, W * 0.6, 44);
    ctx.fillStyle = res.winA ? '#ffe9a8' : '#ffb4a0'; ctx.font = 'bold 22px Cinzel, Georgia, serif'; ctx.textAlign = 'center';
    ctx.fillText(res.retreat ? (res.winA ? 'L\'ENNEMI SE RETIRE' : 'RETRAITE') : res.winA ? (res.decisive ? 'VICTOIRE ÉCRASANTE' : 'VICTOIRE') : (res.decisive ? 'DÉROUTE' : 'DÉFAITE'), W / 2, H * 0.08 + 30);
  }
}
