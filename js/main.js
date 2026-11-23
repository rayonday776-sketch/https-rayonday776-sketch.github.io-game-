// Point d'entrée : boucle de jeu, interface, interactions
import { World, ERAS, GOODS, BUILDINGS, TRAITS, TEMPLE_NAMES, fmtYear } from './world.js';
import { Renderer } from './render.js';
import { BIOME_NAMES } from './terrain.js';
import { features, drawPortrait } from './portrait.js';
import { buildIssue, renderIssue, paintEngraving } from './gazette.js';
import { cityRadius } from './city.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = n => Math.round(n).toLocaleString('fr');
const DAYS_PER_SEC = [0, 15, 60, 240, 720];

let world, renderer;
const ui = { selCity: null, selNation: null, speed: 0, mode: 'pick', lastUi: 0, featCache: new Map(), lastYear: null };

function seedFromUrl() {
  const s = +new URLSearchParams(location.search).get('seed');
  return s || Math.floor(Math.random() * 1e6);
}

function newWorld(seed) {
  $('introMsg').textContent = 'Génération du continent…';
  $('intro').hidden = false;
  setTimeout(() => {
    world = new World(seed);
    $('seed').value = seed;
    if (!renderer) renderer = new Renderer($('map'), world); else renderer.setWorld(world);
    ui.selCity = null; ui.selNation = null; ui.mode = 'pick'; ui.lastYear = world.year; setSpeed(0);
    $('left').hidden = true; $('right').hidden = true; $('ticker').innerHTML = '';
    $('introMsg').innerHTML = `<b>${world.nations.length} peuples</b> s'éveillent en ${fmtYear(world.year)}.<br>Cliquez sur une nation pour la gouverner.`;
    try { history.replaceState(null, '', `?seed=${seed}`); } catch (e) { /* ignore */ }
  }, 30);
}

function choosePlayer(nid) {
  world.player = nid;
  ui.mode = 'play';
  $('intro').hidden = true;
  $('left').hidden = false;
  const n = world.nations[nid];
  toast(`Vous gouvernez ${n.name}. Que votre règne soit long !`);
  setSpeed(1);
  refreshUi(true);
}

function setSpeed(s) {
  ui.speed = s;
  for (const b of document.querySelectorAll('#speeds button')) b.classList.toggle('on', +b.dataset.s === s);
}

function toast(msg, ms = 3500) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(t._h); t._h = setTimeout(() => { t.hidden = true; }, ms);
}

function feats(n) {
  const key = n.leader.seed;
  if (!ui.featCache.has(key)) ui.featCache.set(key, features(n.leader, n.culture));
  return ui.featCache.get(key);
}

// ---------- panneaux ----------
function leaderHtml(n) {
  const L = n.leader;
  return `<h2>${esc(world.leaderTitle(n))} ${esc(world.leaderFull(n))}</h2>
    <div class="sub">${REG(n)} · ${L.age} ans · ${L.party ? `parti ${esc(L.party)}` : `maison ${esc(L.dynasty)}`} · depuis ${fmtYear(L.since)}</div>
    <div class="traits">${L.traits.map(t => `<span>${TRAITS[t]}</span>`).join('')}</div>`;
}
const REG = n => `${n.regime} de ${esc(n.name)}`;

function nationHtml(n, mine) {
  const cs = world.citiesOf(n);
  const pop = cs.reduce((s, c) => s + c.pop, 0);
  const cur = ERAS[n.era].currency;
  const wars = world.warsOf(n.id).map(w => world.nations[w.a === n.id ? w.b : w.a].name);
  const nextEra = ERAS[n.era + 1];
  let h = `<h3>${esc(n.name)}</h3><div class="kv">
    <span>Ère</span><span>${ERAS[n.era].name}${nextEra ? ` <small>(${Math.round((n.tech - ERAS[n.era].tech) / (nextEra.tech - ERAS[n.era].tech) * 100)} % → ${nextEra.name})</small>` : ''}</span>
    <span>Population</span><span>${fmt(pop)}</span>
    <span>Villes</span><span>${cs.length}</span>
    <span>Trésor</span><span>${fmt(n.treasury)} ${cur} <small class="${n.income - n.expense >= 0 ? 'up' : 'down'}">(${n.income - n.expense >= 0 ? '+' : ''}${(n.income - n.expense).toFixed(1)}/mois)</small></span>
    <span>Armée</span><span>${fmt(n.army * 10)} hommes</span>
    <span>Guerres</span><span>${wars.length ? wars.map(esc).join(', ') : 'aucune'}</span>
  </div>
  <div class="small">Concorde ${Math.round(n.stability * 100)} %</div><div class="bar"><i style="width:${n.stability * 100}%;background:${n.stability < 0.3 ? '#8e2a1c' : '#5a4630'}"></i></div>
  <div class="small">Légitimité ${Math.round(n.legitimacy * 100)} %</div><div class="bar"><i style="width:${n.legitimacy * 100}%"></i></div>
  <h3>Forces politiques</h3>
  ${[...n.parties].sort((a, b) => b.support - a.support).map(p => `<div class="party"><span>${esc(p.name)}</span><span>${Math.round(p.support * 100)} %</span><div class="bar"><i style="width:${p.support * 100}%"></i></div></div>`).join('')}`;
  if (mine) {
    const cc = world.colonyCost(n);
    h += `<h3>Gouvernement</h3>
    <div class="small">Impôts : <b id="taxv">${Math.round(n.tax * 100)} %</b></div>
    <input type="range" id="tax" min="0" max="40" value="${Math.round(n.tax * 100)}">
    <div class="actions">
      <button class="btn" data-act="colony" ${n.treasury < cc ? 'disabled' : ''}>Fonder une colonie (${cc})</button>
      <button class="btn" data-act="capital">Voir la capitale</button>
      <button class="btn" data-act="auto">${n.auto ? '✔ ' : ''}Conseil automatique</button>
    </div>`;
  }
  return h;
}

function cityHtml(c) {
  const n = world.nations[c.nation];
  const mine = c.nation === world.player;
  const cur = ERAS[n.era].currency;
  const bl = Object.keys(BUILDINGS).map(k => {
    const b = BUILDINGS[k];
    const nm = k === 'temple' ? TEMPLE_NAMES[n.era] : b.name;
    if (c.buildings[k]) return `<li>✔ ${nm} <small>(${fmtYear(c.buildings[k])})</small></li>`;
    if (!mine) return '';
    const why = world.canBuild(c, k);
    if (why && why.startsWith('requiert')) return '';
    if (why === 'ville non côtière') return '';
    return `<li><button class="btn" data-build="${k}" ${why ? 'disabled' : ''} title="${esc(b.desc)}">${nm} — ${b.cost(c)} ${cur}</button></li>`;
  }).join('');
  const goods = GOODS.map((g, k) => `<tr><td>${g.name}</td><td>${c.stock[k].toFixed(1)}</td><td class="${c.price[k] > g.base * 1.2 ? 'down' : c.price[k] < g.base * 0.8 ? 'up' : ''}">${c.price[k].toFixed(2)}</td></tr>`).join('');
  const roads = [...(world.adj.get(c.id) || [])].map(o => esc(world.cities[o].name)).join(', ');
  const isCap = n.capital === c.id;
  return `<h2>${isCap ? '♛ ' : ''}${esc(c.name)}</h2>
    <div class="sub">${isCap ? 'Capitale' : 'Ville'} de ${esc(n.name)} · fondée en ${fmtYear(c.founded)}</div>
    <div class="kv">
      <span>Population</span><span>${fmt(c.pop)} <small>(capacité ${fmt(c.K)})</small></span>
      <span>Site</span><span>${[c.coastal && 'côtier', c.river && 'fluvial'].filter(Boolean).join(', ') || 'intérieur'}</span>
      <span>Commerce</span><span>${c.tradeEMA.toFixed(2)} ${cur}/mois</span>
      <span>Routes</span><span>${roads || 'aucune'}</span>
      ${c.shortage > 0.05 ? `<span>Famine</span><span class="down">${Math.round(c.shortage * 100)} %</span>` : ''}
    </div>
    <h3>Édifices</h3><ul style="list-style:none;padding:0;margin:0">${bl || '<li><i>aucun</i></li>'}</ul>
    <h3>Marché</h3><table class="goods"><tr><th>Denrée</th><th>Stock</th><th>Prix</th></tr>${goods}</table>
    <div class="actions">
      <button class="btn" data-act="zoomcity">🔍 Visiter la ville</button>
      ${mine ? `<button class="btn" data-act="road">Tracer une route…</button>` : ''}
    </div>
    ${!mine && world.player >= 0 ? diploHtml(n) : ''}`;
}

function diploHtml(n) {
  const me = world.nations[world.player];
  const rel = Math.round(me.rel[n.id] ?? 0);
  const war = world.atWar(me.id, n.id);
  const pact = me.pacts?.has(n.id);
  return `<h3>Diplomatie avec ${esc(n.name)}</h3>
    <div class="kv"><span>Dirigeant</span><span>${esc(world.leaderTitle(n))} ${esc(world.leaderFull(n))}</span><span>Régime</span><span>${n.regime}</span><span>Relations</span><span class="${rel < 0 ? 'down' : 'up'}">${rel > 0 ? '+' : ''}${rel}</span><span>Armée</span><span>${fmt(n.army * 10)}</span></div>
    <div class="actions">
      ${war ? `<button class="btn" data-dip="peace" data-n="${n.id}">Proposer la paix</button>` : `<button class="btn danger" data-dip="war" data-n="${n.id}">Déclarer la guerre</button>`}
      ${!war && !pact ? `<button class="btn" data-dip="pact" data-n="${n.id}">Traité de commerce</button>` : ''}
      ${pact ? '<span class="small">✔ Traité de commerce</span>' : ''}
    </div>`;
}

function showRight(html) { $('rightBody').innerHTML = html; $('right').hidden = false; }

function refreshUi(force) {
  if (!world) return;
  $('date').textContent = world.dateStr();
  const me = world.nations[world.player];
  $('era').textContent = me ? `${ERAS[me.era].name}` : 'Choisissez une nation';
  if (me) {
    const cur = ERAS[me.era].currency;
    $('stats').innerHTML = `<span style="color:rgb(${me.color})">■</span> <b>${esc(me.name)}</b><span>💰 ${fmt(me.treasury)} ${cur}</span><span>👥 ${fmt(me.pop || 0)}</span><span>⚖ ${Math.round(me.stability * 100)} %</span>`;
    $('leader').innerHTML = leaderHtml(me);
    // ne pas recréer le curseur pendant qu'on le manipule
    if (force || !document.activeElement || document.activeElement.id !== 'tax') $('nation').innerHTML = nationHtml(me, true);
  }
  if (!$('right').hidden) {
    if (ui.selCity != null) showRight(cityHtml(world.cities[ui.selCity]));
    else if (ui.selNation != null) { const n = world.nations[ui.selNation]; showRight(`<h2>${esc(n.name)}</h2>${leaderHtml(n)}${nationHtml(n, false)}${world.player >= 0 && n.id !== world.player ? diploHtml(n) : ''}`); }
  }
  // fil d'actualité
  const evs = world.events.slice(-6).reverse();
  $('ticker').innerHTML = evs.map(e => `<div class="${e.nations.includes(world.player) ? 'mine' : ''}"><span class="y">${fmtYear(e.y)}</span>${esc(e.text)}</div>`).join('');
}

// ---------- gazette ----------
function openGazette(i) {
  if (!world.gazettes.length) { toast('Aucune édition pour l\'instant : la première paraîtra en janvier.'); return; }
  const list = $('gzList');
  list.innerHTML = world.gazettes.map((g, k) => `<option value="${k}">${esc(g.name)} — ${fmtYear(g.year)}</option>`).join('');
  const k = i ?? world.gazettes.length - 1;
  list.value = k;
  const issue = world.gazettes[k];
  $('gzBody').innerHTML = renderIssue(issue);
  paintEngraving($('gzBody'), issue);
  $('gazette').hidden = false;
  $('btnGazette').classList.remove('flash');
}

// ---------- boucle ----------
let last = performance.now(), acc = 0, t0 = performance.now();
function frame(now) {
  const dt = Math.min(0.25, (now - last) / 1000); last = now;
  if (world) {
    if (ui.speed > 0 && ui.mode === 'play' && $('gazette').hidden) {
      acc += dt * DAYS_PER_SEC[ui.speed];
      let steps = 0;
      while (acc >= 1 && steps < 1000) { world.stepDay(); acc -= 1; steps++; }
      handleNewEvents();
      if (world.year !== ui.lastYear) newYear();
    }
    renderer.draw(ui);
    // portrait animé
    const me = world.nations[world.player];
    if (me && !$('left').hidden) {
      const cv = $('portrait'), ctx = cv.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
      drawPortrait(ctx, me.leader, feats(me), { nationColor: me.color, era: me.era, regime: me.regime, mood: (me.stability - 0.5) * 2 }, (now - t0) / 1000, cv.width, cv.height);
    }
    if (now - ui.lastUi > 300) { ui.lastUi = now; refreshUi(); }
  }
  requestAnimationFrame(frame);
}

function handleNewEvents() {
  const evs = world.newEvents.splice(0);
  for (const e of evs) {
    if (world.player >= 0 && e.nations.includes(world.player) && e.w >= 9) {
      setSpeed(0);
      toast(e.title || e.text, 6000);
    }
  }
}

function newYear() {
  const prev = ui.lastYear;
  ui.lastYear = world.year;
  if (world.player < 0 || !world.nations[world.player].alive) return;
  const issue = buildIssue(world, world.player, prev);
  world.gazettes.push(issue);
  if (world.gazettes.length > 200) world.gazettes.shift();
  if ($('gzAuto').checked && ui.speed <= 2) openGazette();
  else $('btnGazette').classList.add('flash');
}

// ---------- interactions ----------
function pickAt(sx, sy) {
  const [wx, wy] = renderer.toWorld(sx, sy);
  let best = null, bd = Infinity;
  for (const c of world.cities) {
    if (!c.alive) continue;
    const d = Math.hypot(c.x + 0.5 - wx, c.y + 0.5 - wy) * renderer.cam.scale;
    const r = Math.max(12, cityRadius(c.pop) * renderer.cam.scale);
    if (d < r && d < bd) { bd = d; best = c; }
  }
  const ix = Math.floor(wx), iy = Math.floor(wy);
  const inside = ix >= 0 && iy >= 0 && ix < world.W && iy < world.H;
  const cell = inside ? iy * world.W + ix : -1;
  return { city: best, cell, nation: cell >= 0 ? world.cellNation[cell] : -1 };
}

function onClick(sx, sy) {
  const p = pickAt(sx, sy);
  if (ui.mode === 'pick') {
    const nid = p.city ? p.city.nation : p.nation;
    if (nid >= 0) choosePlayer(nid);
    return;
  }
  if (ui.mode === 'road') {
    ui.mode = 'play';
    $('map').style.cursor = '';
    if (p.city && ui.roadFrom != null) {
      const a = world.cities[ui.roadFrom], b = p.city, me = world.nations[world.player];
      const cost = Math.round(20 + world.dist(a, b) * 4);
      if (me.treasury < cost) { toast(`Il faut ${cost} pour cette route.`); return; }
      if (world.atWar(me.id, b.nation)) { toast('Impossible : vous êtes en guerre avec ce pays.'); return; }
      const r = world.buildRoad(a, b, false);
      if (r) { me.treasury -= cost; toast(`Route ${a.name} – ${b.name} construite (${cost}).`); }
      else toast('Aucun tracé possible (déjà reliées, mer ou trop loin).');
      refreshUi(true);
    }
    return;
  }
  if (p.city) { ui.selCity = p.city.id; ui.selNation = null; $('right').hidden = false; refreshUi(true); }
  else if (p.nation >= 0) { ui.selCity = null; ui.selNation = p.nation; $('right').hidden = false; refreshUi(true); }
  else { ui.selCity = null; ui.selNation = null; $('right').hidden = true; }
}

function flyTo(x, y, scale) {
  const c = renderer.cam, sx = c.x, sy = c.y, ss = c.scale, t0 = performance.now();
  const step = now => {
    const t = Math.min(1, (now - t0) / 700), e = t * t * (3 - 2 * t);
    c.x = sx + (x - sx) * e; c.y = sy + (y - sy) * e; c.scale = Math.exp(Math.log(ss) + (Math.log(scale) - Math.log(ss)) * e);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function setupInput() {
  const cv = $('map');
  const ptrs = new Map();
  let drag = null, pinch = null, moved = false;
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    moved = false;
    if (ptrs.size === 1) drag = { x: e.clientX, y: e.clientY };
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) }; drag = null; }
  });
  cv.addEventListener('pointermove', e => {
    if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch && ptrs.size === 2) {
      const [a, b] = [...ptrs.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      renderer.zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, d / pinch.d); pinch.d = d; moved = true; return;
    }
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) { moved = true; cv.classList.add('drag'); }
      renderer.cam.x -= dx / renderer.cam.scale; renderer.cam.y -= dy / renderer.cam.scale;
      drag = { x: e.clientX, y: e.clientY };
      $('tooltip').hidden = true;
      return;
    }
    if (world && e.pointerType === 'mouse') hover(e.clientX, e.clientY);
  });
  const up = e => {
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (ptrs.size === 0) { if (drag && !moved && world) onClick(e.clientX, e.clientY); drag = null; cv.classList.remove('drag'); }
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('pointerleave', () => { $('tooltip').hidden = true; });
  cv.addEventListener('wheel', e => { e.preventDefault(); renderer.zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });

  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Space') { e.preventDefault(); setSpeed(ui.speed ? 0 : 1); }
    else if (/^Digit[0-4]$/.test(e.code)) setSpeed(+e.code.slice(5));
    else if (e.key === '+' || e.key === '=') renderer.zoomAt(innerWidth / 2, innerHeight / 2, 1.4);
    else if (e.key === '-') renderer.zoomAt(innerWidth / 2, innerHeight / 2, 1 / 1.4);
    else if (e.key === 'Escape') { $('gazette').hidden = true; $('right').hidden = true; ui.selCity = null; }
  });

  $('speeds').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setSpeed(+b.dataset.s); });
  $('btnGazette').onclick = () => openGazette();
  $('gzClose').onclick = () => { $('gazette').hidden = true; };
  $('gzList').onchange = e => openGazette(+e.target.value);
  $('btnNew').onclick = () => newWorld(Math.floor(Math.random() * 1e6));
  $('regen').onclick = () => newWorld(+$('seed').value || Math.floor(Math.random() * 1e6));
  $('closeRight').onclick = () => { $('right').hidden = true; ui.selCity = null; ui.selNation = null; };

  document.body.addEventListener('input', e => {
    if (e.target.id === 'tax') { const n = world.nations[world.player]; n.tax = +e.target.value / 100; $('taxv').textContent = `${e.target.value} %`; }
  });
  document.body.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || !world) return;
    const me = world.nations[world.player];
    if (b.dataset.build) {
      const c = world.cities[ui.selCity];
      const err = world.build(c, b.dataset.build);
      toast(err ? `Impossible : ${err}` : `Chantier lancé à ${c.name}.`);
      refreshUi(true);
    } else if (b.dataset.act === 'colony') {
      const r = world.foundColony(me);
      if (typeof r === 'string') toast(`Impossible : ${r}`);
      else { toast(`Fondation de ${r.name} !`); ui.selCity = r.id; $('right').hidden = false; flyTo(r.x + 0.5, r.y + 0.5, Math.max(renderer.cam.scale, 14)); }
      refreshUi(true);
    } else if (b.dataset.act === 'capital') {
      const c = world.cities[me.capital]; ui.selCity = c.id; $('right').hidden = false; flyTo(c.x + 0.5, c.y + 0.5, 50); refreshUi(true);
    } else if (b.dataset.act === 'auto') {
      me.auto = !me.auto; toast(me.auto ? 'Le conseil gouverne en votre nom (constructions, colonies, diplomatie).' : 'Vous reprenez les rênes.'); refreshUi(true);
    } else if (b.dataset.act === 'zoomcity') {
      const c = world.cities[ui.selCity]; flyTo(c.x + 0.5, c.y + 0.5, Math.max(60, 260 / cityRadius(c.pop)));
    } else if (b.dataset.act === 'road') {
      ui.mode = 'road'; ui.roadFrom = ui.selCity; $('map').style.cursor = 'crosshair'; toast('Cliquez la ville de destination.');
    } else if (b.dataset.dip) {
      const nid = +b.dataset.n;
      if (b.dataset.dip === 'war') { if (confirm(`Déclarer la guerre à ${world.nations[nid].name} ?`)) world.declareWar(world.player, nid); }
      else if (b.dataset.dip === 'peace') toast(world.offerPeace(world.player, nid) ? 'La paix est signée.' : 'Votre offre de paix est rejetée.');
      else if (b.dataset.dip === 'pact') toast(world.proposePact(world.player, nid) ? 'Traité de commerce signé.' : 'Ils refusent : relations trop mauvaises.');
      refreshUi(true);
    }
  });
}

function hover(sx, sy) {
  const p = pickAt(sx, sy), tt = $('tooltip');
  if (p.cell < 0) { tt.hidden = true; return; }
  const parts = [];
  if (p.city) parts.push(`<b>${esc(p.city.name)}</b> · ${fmt(p.city.pop)} hab.`);
  if (p.nation >= 0) parts.push(esc(world.nations[p.nation].name));
  parts.push(BIOME_NAMES[world.T.biome[p.cell]] + (world.T.river[p.cell] ? ' · fleuve' : ''));
  tt.innerHTML = parts.join(' — ');
  tt.style.left = `${sx + 14}px`; tt.style.top = `${sy + 12}px`; tt.hidden = false;
}

window.addEventListener('resize', () => { if (renderer) renderer.minScale = Math.min(innerWidth / world.W, innerHeight / world.H) * 0.8; });
setupInput();
newWorld(seedFromUrl());
requestAnimationFrame(frame);
// accès console pour le débogage
window.__game = { get world() { return world; }, get renderer() { return renderer; }, ui, choosePlayer, setSpeed, openGazette, flyTo };
