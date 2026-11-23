// Portraits procéduraux animés des dirigeants (respiration, clignement, regard, humeur, âge, tenue selon l'ère et le régime)
import { RNG } from './rng.js';

const SKINS = [[247, 214, 186], [236, 196, 160], [222, 176, 136], [198, 146, 104], [164, 112, 76], [120, 82, 56], [92, 62, 44]];
const HAIRS = [[30, 22, 18], [58, 38, 24], [96, 64, 36], [140, 96, 52], [186, 140, 80], [216, 184, 120], [120, 50, 28]];
const EYES = [[70, 50, 30], [90, 120, 150], [80, 110, 70], [50, 40, 30], [110, 90, 60]];

export function features(L, culture) {
  const r = new RNG(L.seed);
  const cr = new RNG(culture?.id || 1);
  const skinBase = cr.int(0, SKINS.length - 1);
  const skin = SKINS[Math.max(0, Math.min(SKINS.length - 1, skinBase + r.int(-1, 1)))];
  return {
    skin, hair: HAIRS[Math.min(HAIRS.length - 1, Math.max(0, cr.int(0, 3) + r.int(-1, 3)))], eye: r.pick(EYES),
    faceW: r.range(0.88, 1.1), jaw: r.range(0.82, 1.15), eyeS: r.range(0.85, 1.15), eyeY: r.range(-1.5, 1.5), eyeGap: r.range(-1, 1.5),
    noseL: r.range(0.8, 1.3), noseW: r.range(0.8, 1.3), mouthW: r.range(0.8, 1.2), lips: r.range(0.6, 1.3), brow: r.range(0.7, 1.4),
    hairStyle: r.int(0, 4), beard: L.female ? -1 : r.int(-1, 4), ear: r.range(0.85, 1.15), cheek: r.chance(0.5), mole: r.chance(0.15) ? [r.range(-10, 10), r.range(-5, 10)] : null,
    phase: r.range(0, 100), scar: !L.female && r.chance(0.12),
  };
}

const mix = (a, b, t) => a.map((v, k) => Math.round(v + (b[k] - v) * t));
const css = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const shadeC = (c, f) => c.map(v => Math.max(0, Math.min(255, Math.round(v * f))));

// dessine dans une boîte (w × h) ; le repère interne fait 100 × 125
export function drawPortrait(ctx, L, F, opt, t, w, h) {
  const { nationColor = [150, 60, 50], era = 0, regime = 'Royaume', mood = 0, sepia = false } = opt;
  ctx.save();
  ctx.scale(w / 100, h / 125);
  // fond
  const bg = ctx.createRadialGradient(50, 50, 10, 50, 60, 80);
  bg.addColorStop(0, css(shadeC(nationColor, 0.9))); bg.addColorStop(1, css(shadeC(nationColor, 0.35)));
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 100, 125);

  const tt = t + F.phase;
  const breath = Math.sin(tt * 1.5) * 0.9;
  const sway = Math.sin(tt * 0.45) * 0.8 + Math.sin(tt * 0.23) * 0.5;
  const tilt = Math.sin(tt * 0.31) * 0.025;
  const age = L.age;
  const gray = Math.max(0, Math.min(1, (age - 42) / 30));
  const hairC = mix(F.hair, [205, 205, 200], gray);
  const skin = F.skin;

  // corps / vêtements
  ctx.save(); ctx.translate(0, breath * 0.6);
  drawClothes(ctx, era, regime, nationColor, L, F);
  ctx.restore();

  // tête
  ctx.save();
  const hx = 50 + sway, hy = 52 + breath * 0.35;
  ctx.translate(hx, hy); ctx.rotate(tilt);
  const fw = 19 * F.faceW, fh = 25;
  // cou
  ctx.fillStyle = css(shadeC(skin, 0.86));
  ctx.fillRect(-7.5 * F.jaw, 14, 15 * F.jaw, 22);
  // cheveux arrière (longs)
  if (L.female || F.hairStyle === 4) {
    ctx.fillStyle = css(hairC);
    ctx.beginPath(); ctx.ellipse(0, 4, fw + 5, fh + (L.female ? 12 : 4), 0, 0, Math.PI * 2); ctx.fill();
  }
  // oreilles
  ctx.fillStyle = css(shadeC(skin, 0.93));
  for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sx * (fw + 0.5), 2, 3.4 * F.ear, 5.5 * F.ear, 0, 0, Math.PI * 2); ctx.fill(); }
  // visage
  ctx.beginPath();
  ctx.moveTo(-fw, -6);
  ctx.bezierCurveTo(-fw, -fh - 4, fw, -fh - 4, fw, -6);
  ctx.bezierCurveTo(fw, 10, 9 * F.jaw, fh, 0, fh + 1);
  ctx.bezierCurveTo(-9 * F.jaw, fh, -fw, 10, -fw, -6);
  const fg = ctx.createLinearGradient(-fw, 0, fw, 0);
  fg.addColorStop(0, css(shadeC(skin, 0.88))); fg.addColorStop(0.45, css(skin)); fg.addColorStop(1, css(shadeC(skin, 0.82)));
  ctx.fillStyle = fg; ctx.fill();
  ctx.strokeStyle = css(shadeC(skin, 0.6), 0.6); ctx.lineWidth = 0.6; ctx.stroke();
  if (F.cheek) { ctx.fillStyle = 'rgba(220,110,100,0.13)'; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(sx * 10, 8, 5, 0, Math.PI * 2); ctx.fill(); } }

  // yeux
  const blinkP = (tt * 0.8) % 4.2;
  const blink = blinkP < 0.12 ? 1 - Math.abs(blinkP - 0.06) / 0.06 : 0;
  const gk = Math.floor(tt / 2.6);
  const gx = Math.sin(gk * 12.9898) * 1.1, gy = Math.cos(gk * 7.233) * 0.5;
  const ey = -2 + F.eyeY, ex = 7.5 + F.eyeGap;
  for (const sx of [-1, 1]) {
    ctx.save(); ctx.translate(sx * ex, ey);
    const es = F.eyeS;
    ctx.beginPath(); ctx.ellipse(0, 0, 4.4 * es, 2.5 * es * (1 - blink * 0.95), 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgb(246,242,236)'; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = css(F.eye); ctx.beginPath(); ctx.arc(gx, gy, 1.9 * es, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgb(20,15,12)'; ctx.beginPath(); ctx.arc(gx, gy, 0.9 * es, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(gx + 0.6, gy - 0.6, 0.45, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // paupière supérieure
    ctx.strokeStyle = 'rgba(40,25,20,0.85)'; ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.ellipse(0, 0, 4.4 * es, 2.5 * es * (1 - blink * 0.95), 0, Math.PI, Math.PI * 2); ctx.stroke();
    if (age > 45) { ctx.strokeStyle = 'rgba(90,60,45,0.4)'; ctx.lineWidth = 0.4; ctx.beginPath(); ctx.arc(0, 1.5, 4, 0.2, Math.PI - 0.2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(sx * 5, -0.5); ctx.lineTo(sx * 7, -1.5); ctx.moveTo(sx * 5, 0.5); ctx.lineTo(sx * 7, 0.8); ctx.stroke(); }
    ctx.restore();
  }
  // sourcils (humeur)
  ctx.strokeStyle = css(shadeC(hairC, 0.8)); ctx.lineWidth = 1.3 * F.brow; ctx.lineCap = 'round';
  for (const sx of [-1, 1]) {
    const inner = -6.5 + F.eyeY - mood * 0.8 + (mood < -0.3 ? 1.5 : 0), outer = -6.8 + F.eyeY + mood * 0.4;
    ctx.beginPath(); ctx.moveTo(sx * (ex - 4), inner); ctx.quadraticCurveTo(sx * ex, -8.5 + F.eyeY, sx * (ex + 4.5), outer); ctx.stroke();
  }
  // nez
  ctx.strokeStyle = css(shadeC(skin, 0.62)); ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(-0.6, 0); ctx.quadraticCurveTo(-2.2 * F.noseW, 7 * F.noseL, -2.6 * F.noseW, 8.5 * F.noseL); ctx.quadraticCurveTo(0, 10 * F.noseL, 2.6 * F.noseW, 8.5 * F.noseL); ctx.stroke();
  // bouche
  const my = 15 + (F.noseL - 1) * 2, mw = 6 * F.mouthW;
  const talk = 0;
  ctx.strokeStyle = 'rgba(110,50,45,0.9)'; ctx.lineWidth = 1.1 * F.lips;
  ctx.beginPath(); ctx.moveTo(-mw, my - mood * 1.2); ctx.quadraticCurveTo(0, my + mood * 3 + talk, mw, my - mood * 1.2); ctx.stroke();
  if (age > 50) { ctx.strokeStyle = 'rgba(90,60,45,0.35)'; ctx.lineWidth = 0.5; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sx * 4, 9); ctx.quadraticCurveTo(sx * 8.5, 13, sx * 8, 17); ctx.stroke(); } ctx.beginPath(); ctx.moveTo(-6, -13); ctx.lineTo(6, -13); ctx.moveTo(-4, -15.5); ctx.lineTo(4, -15.5); ctx.stroke(); }
  if (F.mole) { ctx.fillStyle = 'rgba(70,40,30,0.8)'; ctx.beginPath(); ctx.arc(F.mole[0], F.mole[1], 0.7, 0, Math.PI * 2); ctx.fill(); }
  if (F.scar) { ctx.strokeStyle = 'rgba(150,70,60,0.6)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(9, -8); ctx.lineTo(13, 6); ctx.stroke(); }
  // barbe
  if (F.beard >= 0 && !(era >= 5 && F.beard > 1)) {
    ctx.fillStyle = css(hairC, 0.95);
    if (F.beard >= 1) {
      ctx.beginPath(); ctx.moveTo(-fw + 1, 2);
      ctx.bezierCurveTo(-fw, 18, -8, fh + 6 + F.beard * 2, 0, fh + 6 + F.beard * 2.5);
      ctx.bezierCurveTo(8, fh + 6 + F.beard * 2, fw, 18, fw - 1, 2);
      ctx.bezierCurveTo(fw - 4, 12, 6, 12, 0, 12.5); ctx.bezierCurveTo(-6, 12, -fw + 4, 12, -fw + 1, 2);
      ctx.fill();
      // bouche visible
      ctx.strokeStyle = 'rgba(110,50,45,0.9)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-mw * 0.8, my - mood); ctx.quadraticCurveTo(0, my + mood * 2.5, mw * 0.8, my - mood); ctx.stroke();
    }
    // moustache
    ctx.beginPath(); ctx.moveTo(0, my - 3.2); ctx.quadraticCurveTo(-5, my - 4.5, -mw - 1.5, my - 0.5); ctx.quadraticCurveTo(-4, my - 2.2, 0, my - 2);
    ctx.quadraticCurveTo(4, my - 2.2, mw + 1.5, my - 0.5); ctx.quadraticCurveTo(5, my - 4.5, 0, my - 3.2); ctx.fill();
  }
  // cheveux avant
  drawHair(ctx, F, L, hairC, fw, fh, age, era);
  // couvre-chef
  drawHeadwear(ctx, era, regime, L, fw, fh, nationColor);
  ctx.restore();

  // cadre
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgb(176,138,64)'; ctx.strokeRect(1.5, 1.5, 97, 122);
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgb(90,64,24)'; ctx.strokeRect(4, 4, 92, 117);
  ctx.restore();
  if (sepia) {
    const id = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height), d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const g = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
      const v = g > 150 ? 235 : g > 105 ? 175 : g > 65 ? 110 : 50; // gravure : niveaux posterisés
      d[i] = v * 1.0; d[i + 1] = v * 0.93; d[i + 2] = v * 0.8;
    }
    ctx.putImageData(id, 0, 0);
  }
}

function drawHair(ctx, F, L, c, fw, fh, age, era) {
  ctx.fillStyle = css(c);
  const bald = !L.female && age > 55 && F.hairStyle === 0;
  ctx.beginPath();
  if (bald) {
    ctx.moveTo(-fw - 1, 0); ctx.quadraticCurveTo(-fw - 1, -8, -fw + 2, -12); ctx.lineTo(-fw + 4, -6); ctx.closePath();
    ctx.moveTo(fw + 1, 0); ctx.quadraticCurveTo(fw + 1, -8, fw - 2, -12); ctx.lineTo(fw - 4, -6); ctx.closePath();
    ctx.fill(); return;
  }
  const st = F.hairStyle;
  ctx.moveTo(-fw - 1.5, 2);
  ctx.bezierCurveTo(-fw - 4, -fh - 6, fw + 4, -fh - 6, fw + 1.5, 2);
  if (L.female) {
    ctx.bezierCurveTo(fw - 1, -10, 6, -fh + 2, 0, -fh + 4);
    ctx.bezierCurveTo(-6, -fh + 2, -fw + 1, -10, -fw - 1.5, 2);
  } else if (st === 1) { // frange
    ctx.lineTo(fw - 2, -10); ctx.lineTo(8, -14); ctx.lineTo(3, -12); ctx.lineTo(-2, -15); ctx.lineTo(-7, -12.5); ctx.lineTo(-fw + 2, -11);
  } else if (st === 2) { // raie sur le côté
    ctx.lineTo(fw - 1, -12); ctx.quadraticCurveTo(4, -17, -6, -16); ctx.quadraticCurveTo(-fw + 1, -14, -fw - 1.5, 2);
  } else if (st === 3) { // bouclés
    for (let k = 0; k <= 8; k++) { const a = Math.PI + k / 8 * Math.PI; ctx.arc(Math.cos(a) * (fw + 1), -6 + Math.sin(a) * (fh - 2), 3.2, 0, Math.PI * 2); }
  } else {
    ctx.lineTo(fw - 1.5, -11); ctx.quadraticCurveTo(0, -19, -fw + 1.5, -11);
  }
  ctx.closePath(); ctx.fill();
  if (L.female && era <= 3) { ctx.beginPath(); ctx.arc(0, -fh - 5, 7, 0, Math.PI * 2); ctx.fill(); } // chignon
}

function drawHeadwear(ctx, era, regime, L, fw, fh, col) {
  const gold = 'rgb(222,180,70)', goldD = 'rgb(140,100,30)';
  const hered = ['Royaume', 'Empire', 'Chefferie'].includes(regime);
  ctx.lineWidth = 0.7; ctx.strokeStyle = goldD;
  if (regime === 'Chefferie') { // diadème de plumes
    ctx.fillStyle = 'rgb(150,90,50)'; ctx.fillRect(-fw, -fh + 3, fw * 2, 4);
    for (let k = -2; k <= 2; k++) { ctx.save(); ctx.translate(k * 5, -fh + 3); ctx.rotate(k * 0.18); ctx.fillStyle = k % 2 ? 'rgb(200,60,40)' : 'rgb(240,230,210)'; ctx.beginPath(); ctx.ellipse(0, -8, 2.3, 9, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    return;
  }
  if (regime === 'Théocratie') {
    ctx.fillStyle = 'rgb(245,240,228)';
    ctx.beginPath(); ctx.moveTo(-fw + 2, -fh + 6); ctx.lineTo(-fw + 5, -fh - 16); ctx.lineTo(0, -fh - 24); ctx.lineTo(fw - 5, -fh - 16); ctx.lineTo(fw - 2, -fh + 6); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = gold; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, -fh - 20); ctx.lineTo(0, -fh + 4); ctx.moveTo(-5, -fh - 8); ctx.lineTo(5, -fh - 8); ctx.stroke();
    return;
  }
  if (era <= 1 && hered) { // couronne de laurier
    ctx.fillStyle = 'rgb(120,150,60)';
    for (let k = 0; k < 9; k++) { const a = Math.PI * 1.05 + k / 8 * Math.PI * 0.9; const x = Math.cos(a) * (fw + 1), y = -6 + Math.sin(a) * (fh - 4); ctx.beginPath(); ctx.ellipse(x, y, 1.6, 3.4, a + Math.PI / 2, 0, Math.PI * 2); ctx.fill(); }
    if (regime === 'Empire') { ctx.fillStyle = gold; ctx.beginPath(); ctx.arc(0, -fh + 1, 2, 0, Math.PI * 2); ctx.fill(); }
    return;
  }
  if (hered && era <= 4) { // couronne
    const top = -fh - (regime === 'Empire' ? 14 : 10), base = -fh + 3;
    ctx.fillStyle = gold;
    ctx.beginPath(); ctx.moveTo(-fw + 1, base);
    const pts = 5;
    for (let k = 0; k <= pts * 2; k++) { const x = -fw + 1 + (2 * fw - 2) * k / (pts * 2); ctx.lineTo(x, k % 2 ? base - 5 : top); }
    ctx.lineTo(fw - 1, base); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgb(180,30,40)'; for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.arc(k * 7, base - 2.5, 1.4, 0, Math.PI * 2); ctx.fill(); }
    if (regime === 'Empire') { ctx.fillStyle = css(col); ctx.beginPath(); ctx.ellipse(0, top + 6, fw - 4, 6, 0, Math.PI, 0); ctx.fill(); }
    return;
  }
  if (regime === 'Dictature' && era >= 4) { // casquette militaire
    ctx.fillStyle = 'rgb(60,66,58)';
    ctx.beginPath(); ctx.ellipse(0, -fh + 2, fw + 4, 9, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = 'rgb(30,30,30)'; ctx.beginPath(); ctx.ellipse(2, -fh + 3, fw + 2, 3, 0, 0, Math.PI); ctx.fill();
    ctx.fillStyle = gold; ctx.beginPath(); ctx.arc(0, -fh - 3, 2.3, 0, Math.PI * 2); ctx.fill();
    return;
  }
  if (era === 3 && !hered && !L.female) { // béret Renaissance
    ctx.fillStyle = 'rgb(40,30,40)'; ctx.beginPath(); ctx.ellipse(-3, -fh + 1, fw + 3, 7, -0.15, Math.PI, 0); ctx.fill();
  }
}

function drawClothes(ctx, era, regime, col, L, F) {
  const c = css(col), cd = css(shadeC(col, 0.6));
  const hered = ['Royaume', 'Empire', 'Chefferie'].includes(regime);
  ctx.lineWidth = 0.8; ctx.strokeStyle = 'rgba(30,20,15,0.6)';
  const body = () => { ctx.beginPath(); ctx.moveTo(8, 125); ctx.bezierCurveTo(10, 95, 24, 88, 50, 86); ctx.bezierCurveTo(76, 88, 90, 95, 92, 125); ctx.closePath(); };
  if (era <= 1) { // toge / tunique
    body(); ctx.fillStyle = regime === 'Chefferie' ? 'rgb(150,110,70)' : 'rgb(238,230,214)'; ctx.fill(); ctx.stroke();
    ctx.fillStyle = regime === 'Empire' || hered ? 'rgb(120,40,90)' : c;
    ctx.beginPath(); ctx.moveTo(22, 92); ctx.lineTo(34, 88); ctx.lineTo(78, 125); ctx.lineTo(60, 125); ctx.closePath(); ctx.fill();
    if (regime === 'Chefferie') { ctx.fillStyle = 'rgb(240,230,200)'; for (let k = 0; k < 7; k++) { ctx.beginPath(); ctx.ellipse(36 + k * 4.5, 92 + Math.sin(k / 6 * Math.PI) * 5, 1.2, 3, 0, 0, Math.PI * 2); ctx.fill(); } }
    ctx.fillStyle = 'rgb(222,180,70)'; ctx.beginPath(); ctx.arc(30, 92, 2.5, 0, Math.PI * 2); ctx.fill();
    return;
  }
  if (era === 2) { // médiéval : tunique + manteau d'hermine pour les monarques
    body(); ctx.fillStyle = c; ctx.fill(); ctx.stroke();
    if (hered) {
      ctx.fillStyle = 'rgb(246,244,236)';
      ctx.beginPath(); ctx.moveTo(10, 125); ctx.bezierCurveTo(14, 96, 30, 90, 40, 89); ctx.lineTo(44, 125); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(90, 125); ctx.bezierCurveTo(86, 96, 70, 90, 60, 89); ctx.lineTo(56, 125); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgb(20,20,20)'; for (let k = 0; k < 10; k++) { ctx.fillRect(14 + (k % 3) * 9 + (k > 4 ? 58 : 0), 100 + Math.floor(k / 3) * 7, 1.4, 3); }
    }
    ctx.fillStyle = 'rgb(222,180,70)'; ctx.beginPath(); ctx.moveTo(40, 90); ctx.quadraticCurveTo(50, 104, 60, 90); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgb(222,180,70)'; ctx.stroke();
    return;
  }
  if (era === 3) { // Renaissance : pourpoint + fraise
    body(); ctx.fillStyle = cd; ctx.fill(); ctx.stroke();
    ctx.fillStyle = c; ctx.fillRect(42, 90, 16, 35);
    ctx.fillStyle = 'rgb(250,248,240)'; ctx.strokeStyle = 'rgba(120,110,100,0.7)';
    for (let k = 0; k < 14; k++) { const a = Math.PI * 0.05 + k / 13 * Math.PI * 0.9; ctx.beginPath(); ctx.ellipse(50 + Math.cos(a) * 15, 86 + Math.sin(a) * 4 - 2, 3, 5, a, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    return;
  }
  if (era === 4 || regime === 'Dictature') { // uniforme / redingote
    const military = hered || regime === 'Dictature' || regime === 'Empire';
    body(); ctx.fillStyle = military ? 'rgb(40,50,80)' : 'rgb(35,32,30)'; ctx.fill(); ctx.stroke();
    if (regime === 'Dictature' && era >= 5) { ctx.fillStyle = 'rgb(66,72,60)'; body(); ctx.fill(); }
    ctx.fillStyle = 'rgb(245,242,235)'; ctx.beginPath(); ctx.moveTo(43, 87); ctx.lineTo(50, 104); ctx.lineTo(57, 87); ctx.closePath(); ctx.fill();
    if (military) {
      ctx.fillStyle = 'rgb(222,180,70)';
      for (const sx of [1, -1]) { ctx.beginPath(); ctx.ellipse(50 + sx * 30, 94, 9, 3.5, sx * 0.25, 0, Math.PI * 2); ctx.fill(); }
      for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(50, 108 + k * 5, 1.2, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(30, 95); ctx.lineTo(70, 122); ctx.lineTo(66, 125); ctx.lineTo(26, 98); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgb(200,60,50)'; ctx.fillRect(62, 104, 4, 6); ctx.fillStyle = 'rgb(222,180,70)'; ctx.beginPath(); ctx.arc(64, 112, 2, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = 'rgb(30,28,28)'; ctx.beginPath(); ctx.moveTo(46, 90); ctx.lineTo(54, 90); ctx.lineTo(52, 95); ctx.lineTo(48, 95); ctx.closePath(); ctx.fill();
    }
    return;
  }
  // moderne : costume + cravate / tailleur
  body(); ctx.fillStyle = L.female ? css(shadeC(col, 0.5)) : 'rgb(46,50,62)'; ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgb(246,246,246)'; ctx.beginPath(); ctx.moveTo(42, 87); ctx.lineTo(50, 108); ctx.lineTo(58, 87); ctx.closePath(); ctx.fill();
  if (!L.female) { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(48.5, 90); ctx.lineTo(51.5, 90); ctx.lineTo(53, 110); ctx.lineTo(50, 114); ctx.lineTo(47, 110); ctx.closePath(); ctx.fill(); }
  else { ctx.fillStyle = 'rgb(240,240,240)'; for (let k = 0; k < 7; k++) { ctx.beginPath(); ctx.arc(40 + k * 3.3, 89 + Math.sin(k / 6 * Math.PI) * 4, 1.3, 0, Math.PI * 2); ctx.fill(); } }
  ctx.fillStyle = c; ctx.beginPath(); ctx.arc(32, 100, 1.8, 0, Math.PI * 2); ctx.fill(); // pin's national
}
