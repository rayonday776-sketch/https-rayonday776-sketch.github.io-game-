// Systèmes approfondis, portés du mod EcoPol : cycle économique à 6 phases, budget de l'État par postes,
// dette et emprunts, inflation et banque centrale, religions qui se diffusent, schismes, alliances.
import * as NM from './names.js';

export const PHASES = [
  { name: 'Boom', color: '#2f9e44', act: 1.15 },
  { name: 'Expansion', color: '#82b84a', act: 1.05 },
  { name: 'Reprise', color: '#3d7fd6', act: 0.97 },
  { name: 'Stagnation', color: '#c9a227', act: 0.94 },
  { name: 'Récession', color: '#d9711c', act: 0.85 },
  { name: 'Dépression', color: '#c0262a', act: 0.72 },
];
const isBad = p => p >= 4;

export const BUDGET = {
  armee: { name: 'Armée', levels: ['Démobilisée', 'Réduite', 'Normale', 'Mobilisée'] },
  chantiers: { name: 'Grands chantiers', levels: ['Aucun', 'Modestes', 'Ambitieux', 'Pharaoniques'] },
  social: { name: 'Aide aux pauvres', levels: ['Aucune', 'Aumônes', 'Assistance', 'Providence'] },
  cour: { name: 'Cour et clergé', levels: ['Austère', 'Modeste', 'Fastueuse', 'Somptuaire'] },
};
const ARMY_SIZE = [0.35, 0.7, 1, 1.4], ARMY_PAY = [0.6, 0.85, 1, 1.25];

const FAITH_KINDS = [
  ['Culte', 'des Ancêtres'], ['Panthéon', ''], ['Mystères', ''], ['Voie', ''], ['Église', ''], ['Foi', ''],
];
const FAITH_COLORS = ['#b03a2e', '#2e6fb0', '#c8a12a', '#5c9e3c', '#8a4fb0', '#2aa1a1', '#c0662a', '#6b6b6b', '#b04f7f', '#3c5c9e'];

export function installSystems(World) {
  const P = World.prototype;

  // ---------- initialisation ----------
  P.initSystems = function () {
    for (const n of this.nations) this.initNationSystems(n);
    this.initFaiths();
  };
  P.initNationSystems = function (n) {
    n.budget = n.budget || { armee: 2, chantiers: 1, social: 1, cour: 1 };
    n.phase = n.phase ?? 1; n.phaseSince = n.phaseSince ?? this.year;
    n.gdp = n.gdp || 0; n.gdpHist = n.gdpHist || []; n.growth = n.growth || 0; n.organic = n.organic || 0;
    n.debt = n.debt || 0; n.rate = n.rate ?? 6; n.inflation = n.inflation ?? 1; n.priceLevel = n.priceLevel || 1;
    n.cbank = n.cbank || false; n.cyc = n.cyc ?? this.rng.range(0, Math.PI * 2); n.cycSpeed = n.cycSpeed ?? this.rng.range(0.55, 0.9);
    n.borrowed = n.borrowed || 0; n.allies = n.allies || new Set(); n.expenseDetail = n.expenseDetail || {};
  };

  // ---------- religions ----------
  P.newFaith = function (city, name, parent) {
    const r = this.rng, id = this.faiths.length;
    const cul = city.culture;
    const root = NM.word(cul, r, 2);
    const era = this.nations[city.nation]?.era ?? 0;
    let nm = name;
    if (!nm) {
      const k = era <= 0 ? r.pick([0, 1, 2]) : era <= 2 ? r.pick([2, 3, 4]) : r.pick([4, 5, 3]);
      const [a, b] = FAITH_KINDS[k];
      nm = b ? `${a} ${b} de ${city.name}` : `${a} ${root.charAt(0).toUpperCase() + root.slice(1)}${['ienne', 'ite', 'ique'][r.int(0, 2)]}`;
    }
    const f = { id, name: nm, color: FAITH_COLORS[id % FAITH_COLORS.length], holy: city.id, founded: this.year, parent: parent ?? null };
    this.faiths.push(f);
    this.faithVersion = (this.faithVersion || 0) + 1;
    return f;
  };
  P.initFaiths = function () {
    this.faiths = [];
    const caps = this.nations.map(n => this.cities[n.capital]);
    const K = Math.min(caps.length, 4 + this.rng.int(0, 1));
    const holy = [caps[this.rng.int(0, caps.length - 1)]];
    while (holy.length < K) { // points les plus éloignés
      let best = null, bd = -1;
      for (const c of caps) { const d = Math.min(...holy.map(h => this.dist(h, c))); if (d > bd) { bd = d; best = c; } }
      holy.push(best);
    }
    for (const h of holy) this.newFaith(h);
    for (const n of this.nations) {
      const cap = this.cities[n.capital];
      let bf = 0, bd = Infinity;
      this.faiths.forEach((f, k) => { const d = this.dist(cap, this.cities[f.holy]); if (d < bd) { bd = d; bf = k; } });
      n.faith = bf;
    }
    for (const c of this.cities) c.faith = this.nations[c.nation].faith;
  };
  P.spreadFaiths = function () {
    const r = this.rng;
    for (const rd of this.roads) {
      const a = this.cities[rd.a], b = this.cities[rd.b];
      if (!a.alive || !b.alive || a.faith === b.faith) continue;
      for (const [s, d] of [[a, b], [b, a]]) {
        const ns = this.nations[s.nation], nd = this.nations[d.nation];
        let p = 0.035 * Math.sqrt(s.pop) / Math.sqrt(d.pop) * (s.buildings.temple ? 1.5 : 1) * (nd.faith === s.faith ? 2.2 : 1) * (d.buildings.temple && nd.faith === d.faith ? 0.5 : 1);
        if (this.faiths[s.faith].holy === s.id) p *= 1.5;
        if (r.chance(Math.min(0.25, p))) { d.faith = s.faith; this.faithVersion++; break; }
      }
    }
    for (const c of this.cities) {
      if (!c.alive) continue;
      const n = this.nations[c.nation];
      if (c.faith !== n.faith && r.chance(c.buildings.temple ? 0.07 : 0.025)) { c.faith = n.faith; this.faithVersion++; }
    }
    // schisme
    for (const n of this.nations) {
      if (!n.alive || !r.chance(0.003 * (1 + n.era) * (n.stability < 0.5 ? 2 : 1))) continue;
      const cs = this.citiesOf(n); if (cs.length < 2) continue;
      const c = r.pick(cs);
      const old = this.faiths[c.faith];
      const f = this.newFaith(c, `${['Réforme', 'Hérésie', 'Schisme', 'Renouveau'][r.int(0, 3)]} de ${c.name}`, old.id);
      c.faith = f.id;
      this.log('schisme', { w: 6, nations: [n.id], city: c.id, title: `Schisme à ${c.name}`, text: `À ${c.name}, des prédicateurs rompent avec ${old.name} : naissance de ${f.name}.`, body: `Contestant l'autorité des prêtres de ${old.name}, les fidèles de ${c.name} fondent ${f.name}. Le feu de la dispute gagne déjà les routes voisines.` });
    }
  };
  P.faithBreakdown = function (n) {
    const m = new Map();
    for (const c of this.citiesOf(n)) m.set(c.faith, (m.get(c.faith) || 0) + c.pop);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  P.adoptFaith = function (n, fid) {
    if (n.faith === fid) return;
    const old = this.faiths[n.faith];
    n.faith = fid; n.legitimacy = Math.max(0, n.legitimacy - 0.15); n.stability = Math.max(0, n.stability - 0.05);
    this.faithVersion++;
    this.log('conversion', { w: 7, nations: [n.id], title: `${n.name} change de religion`, text: `${n.name} abandonne ${old.name} et adopte ${this.faiths[fid].name}.`, body: `Par décret, ${this.faiths[fid].name} devient la religion officielle de ${n.name}. Les prêtres de ${old.name} protestent.` });
  };

  // ---------- économie mensuelle ----------
  P.econMonthly = function (n, cs, pop, base, income, armyTarget) {
    const B = n.budget, era = n.era, pk = pop / 1000;
    const act = PHASES[n.phase].act;
    income *= act;
    const nb = cs.reduce((s, c) => s + Object.keys(c.buildings).length, 0);
    const d = {
      armee: n.army * 0.004 * (1 + era * 0.3) * ARMY_PAY[B.armee],
      chantiers: pk * 0.03 * B.chantiers * (1 + era * 0.3),
      social: pk * 0.025 * B.social * (1 + era * 0.4),
      cour: cs.length * 0.06 * B.cour * (1 + era * 0.3),
      admin: cs.length * 0.12 * (1 + era * 0.5) + nb * 0.08 * (1 + era * 0.3),
      interets: n.debt * (n.rate + 2) / 1200,
    };
    if (n.leader.traits.includes('prodigue')) d.cour += income * 0.2;
    d.gaspillage = Math.max(0, n.treasury - Math.max(300, income * 60)) * 0.02;
    const expense = Object.values(d).reduce((s, v) => s + v, 0);
    n.expenseDetail = d; n.income = income; n.expense = expense;
    n.treasury += income - expense;
    if (n.treasury < 0) { const loan = -n.treasury + 15; n.debt += loan; n.treasury += loan; n.borrowed += loan; }
    else if (n.treasury > 250 && n.debt > 0) { const pay = Math.min(n.debt, (n.treasury - 250) * 0.15); n.debt -= pay; n.treasury -= pay; }
    return armyTarget * ARMY_SIZE[B.armee];
  };
  // apport à la stabilité (cible) des systèmes
  P.systemsStability = function (n, cs) {
    const B = n.budget;
    let t = B.social * 0.025 + B.cour * 0.012 - (B.armee === 3 ? 0.02 : 0) - (B.armee === 0 ? 0.03 : 0);
    t += [0.04, 0.02, 0, -0.01, -0.04, -0.08][n.phase];
    if (n.inflation > 10) t -= Math.min(0.15, (n.inflation - 10) * 0.006);
    const ratio = n.debt / Math.max(1, n.gdp);
    if (ratio > 1.5) t -= Math.min(0.12, (ratio - 1.5) * 0.04);
    // minorités religieuses
    let minor = 0, tot = 0;
    for (const c of cs) { tot += c.pop; if (c.faith !== n.faith) minor += c.pop; }
    n.minority = tot ? minor / tot : 0;
    t -= n.minority * 0.1;
    n.legitimacy = Math.min(1, n.legitimacy + B.cour * 0.0015);
    return t;
  };

  // ---------- économie annuelle : PIB, cycle, inflation, banque centrale, dette ----------
  P.econYearly = function (n, cs) {
    const r = this.rng;
    const act = PHASES[n.phase].act;
    const real = cs.reduce((s, c) => s + c.pop / 1000 * (0.5 + 0.25 * n.era) + c.tradeEMA * 12, 0) * act;
    const prev = n.gdp || real;
    n.gdp = real;
    n.gdpHist.push(real); if (n.gdpHist.length > 60) n.gdpHist.shift();
    const raw = (real / prev - 1) * 100;
    // croissance organique (sans l'effet du cycle lui-même) + oscillateur des affaires + chocs
    n.cyc += n.cycSpeed;
    let g = ((1 + raw / 100) / (act / (n.lastAct || act)) - 1) * 100;
    n.lastAct = act;
    g += Math.sin(n.cyc) * 4.5 + r.gauss() * 2 - Math.max(0, n.rate - 6) * 0.5 + n.budget.chantiers * 0.4;
    if (n.shortage > 0.2) g -= 4;
    if (this.warsOf(n.id).length) g -= 1.5;
    const rawG = g;
    g = (g + n.organic) / 2; n.organic = rawG;
    n.growth = g;
    const prevP = n.phase; let next;
    if (g >= 9 && n.inflation < 30) next = 0;
    else if (g >= 2) next = isBad(prevP) || (prevP === 2 && g < 6) ? 2 : 1;
    else if (g > -3) next = isBad(prevP) ? 2 : 3;
    else if (g > -12) next = prevP === 5 && g > -6 ? 5 : 4;
    else next = 5;
    if (next === 4 && prevP === 4 && g < -6) next = 5;
    if (this.year - (n.bubbleYear ?? -1e9) <= 1 && !isBad(next)) next = 4;
    const drastic = rawG <= -12 || rawG >= 14 || this.year - (n.bubbleYear ?? -1e9) <= 1;
    if (next !== prevP && this.year - n.phaseSince < 3 && !drastic) next = prevP;
    // bulle spéculative après un long boom
    if (prevP <= 1 && this.year - n.phaseSince >= 3 && n.era >= 2 && r.chance(0.12)) {
      next = 4; n.bubbleYear = this.year;
      const cap = this.cities[n.capital];
      this.log('krach', { w: 8, nations: [n.id], title: `Krach à ${cap.name} !`, text: `La bulle spéculative éclate à ${cap.name} : ${n.name} plonge en récession.`, body: `Après des années d'euphorie, les cours s'effondrent sur la place de ${cap.name}. Banqueroutes en chaîne, ateliers fermés : ${n.name} entre en récession.` });
    }
    if (next !== prevP) {
      n.phase = next; n.phaseSince = this.year;
      if (next === 5) this.log('depression', { w: 7, nations: [n.id], title: `${n.name} sombre dans la dépression`, text: `${n.name} entre en dépression économique.`, body: `Chômage, faillites et misère : l'économie de ${n.name} s'effondre (${g.toFixed(1)} % de croissance).` });
      else if (next === 0) this.log('boom', { w: 5, nations: [n.id], title: `L'âge d'or des affaires en ${n.name}`, text: `${n.name} connaît un boom économique.`, body: `Les comptoirs regorgent, les chantiers se multiplient : ${n.name} affiche ${g.toFixed(1)} % de croissance.` });
      else if (n.id === this.player) this.log('phase', { w: 3, nations: [n.id], text: `L'économie de ${n.name} passe en phase : ${PHASES[next].name}.` });
    }
    // inflation : cycle, monétisation des emprunts, taux, disettes
    let target = 1.5 + (n.phase <= 1 ? 2.5 : n.phase >= 4 ? -1.5 : 0) + Math.min(18, n.borrowed / Math.max(1, n.gdp) * 30) + n.shortage * 6;
    if (n.cbank) target += (6 - n.rate) * 0.7;
    n.inflation += (target - n.inflation) * 0.5 + r.gauss() * 0.7;
    n.inflation = Math.max(-5, Math.min(80, n.inflation));
    n.priceLevel *= 1 + n.inflation / 100;
    n.borrowed = 0;
    // banque centrale
    if (n.era >= 3 && !n.cbank) {
      n.cbank = true;
      this.log('banque', { w: 4, nations: [n.id], title: `Fondation de la Banque de ${n.name}`, text: `${n.name} se dote d'une banque centrale.`, body: `Une banque centrale émettra désormais la monnaie de ${n.name} et fixera le taux directeur.` });
    }
    if (n.cbank && !(n.id === this.player && n.manualRate)) {
      const rec = Math.max(0, Math.min(20, 4 + 0.6 * (n.inflation - 2) + 0.25 * (g - 2)));
      n.rate += (rec - n.rate) * 0.5;
    }
    // faillite souveraine
    if (n.debt > Math.max(200, n.gdp * 4)) {
      const owed = Math.round(n.debt);
      n.debt = 0; n.legitimacy = Math.max(0, n.legitimacy - 0.3); n.stability = Math.max(0, n.stability - 0.2);
      n.phase = 5; n.phaseSince = this.year;
      for (const o of this.nations) if (o !== n) o.rel[n.id] = (o.rel[n.id] ?? 0) - 15;
      this.log('faillite', { w: 9, nations: [n.id], title: `${n.name} fait défaut sur sa dette !`, text: `${n.name} répudie ${owed} de dette : faillite de l'État.`, body: `Incapable d'honorer ses créanciers, le trésor de ${n.name} suspend ses paiements. Les banquiers étrangers jurent qu'on ne les y reprendra plus.` });
    }
  };

  // ---------- alliances ----------
  P.allianceAI = function (n) {
    const r = this.rng;
    for (const id of [...n.allies]) {
      const o = this.nations[id];
      if (!o.alive || (n.rel[id] ?? 0) < 0) { n.allies.delete(id); o.allies?.delete(n.id); if (o.alive && n.id !== this.player) this.log('rupture', { w: 4, nations: [n.id, id], text: `L'alliance entre ${n.name} et ${o.name} est rompue.` }); }
    }
    if (n.id === this.player && !n.auto) return;
    for (const o of this.nations) {
      if (!o.alive || o === n || n.allies.has(o.id) || o.id === this.player || this.atWar(n.id, o.id)) continue;
      const rel = n.rel[o.id] ?? 0;
      if ((rel > 45 && o.faith === n.faith) || rel > 65) if (r.chance(0.12)) this.makeAlliance(n.id, o.id);
    }
  };
  P.makeAlliance = function (a, b) {
    const A = this.nations[a], Bn = this.nations[b];
    A.allies.add(b); Bn.allies.add(a);
    A.rel[b] = Math.min(100, (A.rel[b] ?? 0) + 10); Bn.rel[a] = Math.min(100, (Bn.rel[a] ?? 0) + 10);
    this.log('alliance', { w: 5, nations: [a, b], title: `Alliance entre ${A.name} et ${Bn.name}`, text: `${A.name} et ${Bn.name} concluent une alliance défensive.` });
  };
  P.proposeAlliance = function (a, b) {
    const A = this.nations[a], Bn = this.nations[b];
    const rel = Bn.rel[a] ?? 0;
    if (this.atWar(a, b) || rel < 30) return false;
    if (rel > 60 || (A.faith === Bn.faith && rel > 35) || this.rng.chance(0.25)) { this.makeAlliance(a, b); return true; }
    return false;
  };
  P.callAllies = function (aggressor, victim) {
    const V = this.nations[victim];
    for (const id of [...V.allies]) {
      const x = this.nations[id];
      if (!x.alive || id === aggressor || this.atWar(id, aggressor)) continue;
      if (id === this.player && !x.auto) { this.log('appel', { w: 8, nations: [id, victim, aggressor], title: `${V.name} appelle à l'aide !`, text: `Votre allié ${V.name} est attaqué par ${this.nations[aggressor].name}. Honorerez-vous l'alliance ?` }); continue; }
      if (this.rng.chance(0.8)) { this.declareWar(id, aggressor, true); this.log('honneur', { w: 6, nations: [id, victim], text: `${x.name} honore son alliance et entre en guerre aux côtés de ${V.name}.` }); }
      else { x.allies.delete(victim); V.allies.delete(id); this.log('trahison', { w: 6, nations: [id, victim], text: `${x.name} abandonne son allié ${V.name} : l'alliance est rompue.` }); }
    }
  };

  // ---------- ordres du joueur à ses armées ----------
  P.orderUnit = function (w, side, cityId) {
    const u = w.units[side];
    u.order = cityId;
    u._last = u.path ? u.path[Math.floor(u.pos)] : u._last;
    u.state = 'march';
    this.planUnit(w, side);
    return !!u.path;
  };
}
