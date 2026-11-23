// Gazette annuelle : la forme évolue avec l'ère (annales gravées → chronique manuscrite → journal imprimé → quotidien moderne)
import { ERAS, GOODS, fmtYear } from './world.js';
import { features, drawPortrait } from './portrait.js';

const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

function masthead(n, capital, era) {
  const cap = capital.name;
  return [
    `Annales de ${n.name}`, `Tablettes de ${cap}`, `Chronique du royaume de ${n.name}`,
    `La Gazette de ${cap}`, `Le Petit ${cap}ois`, `${cap} Matin`,
  ][era];
}
const STYLE = ['antique', 'antique', 'manuscrit', 'gazette', 'journal', 'moderne'];
const ADS = [
  ['Amphores de premier choix', 'chez Maître {n}, près du forum.'],
  ['Bains publics rénovés', 'eau chaude tous les jours de marché.'],
  ['Reliques authentiques', 'certifiées par l\'abbaye de {c}.'],
  ['Imprimerie {n} & fils', 'almanachs, bibles et pamphlets.'],
  ['Pilules du Docteur {n}', 'contre la fatigue et la mélancolie.'],
  ['Le nouveau téléviseur {n}', 'l\'Histoire en direct dans votre salon.'],
];

export function buildIssue(world, nid, year) {
  const n = world.nations[nid];
  const capital = world.cities[n.capital];
  const evs = world.events.filter(e => e.y === year || (e.y === year - 1 && e.m >= 11));
  const score = e => e.w * (e.nations.includes(nid) ? 2.2 : 1) * (e.type === 'election' && !e.nations.includes(nid) ? 0.2 : 1) * (e.type === 'famine' && !e.nations.includes(nid) ? 0.3 : 1);
  const sorted = [...evs].sort((a, b) => score(b) - score(a));
  const mine = sorted.filter(e => e.nations.includes(nid));
  const world_ = sorted.filter(e => !e.nations.includes(nid) && e.w >= 5).slice(0, 4);
  const head = sorted[0];
  const issue = {
    year, nid, era: n.era, name: masthead(n, capital, n.era), style: STYLE[n.era],
    head: head ? { title: head.title || head.text, body: head.body || head.text, type: head.type, nations: head.nations } : { title: `Une année paisible en ${n.name}`, body: `Rien de notable ne vient troubler la quiétude de ${capital.name}. Les récoltes sont rentrées, les marchés sont calmes.` },
    local: mine.filter(e => e !== head).slice(0, 5).map(e => ({ title: e.title || null, text: e.body || e.text })),
    world: world_.filter(e => e !== head).map(e => ({ title: e.title || null, text: e.text })),
    obit: evs.find(e => e.type === 'mort' && e.nations[0] === nid)?.obit || null,
    stats: {
      pop: Math.round(world.citiesOf(n).reduce((s, c) => s + c.pop, 0)),
      treasury: Math.round(n.treasury), stability: Math.round(n.stability * 100),
      prices: GOODS.map((g, k) => [g.name, capital.price[k]]),
      currency: ERAS[n.era].currency,
    },
    leader: { L: JSON.parse(JSON.stringify(n.leader)), title: world.leaderTitle(n), full: world.leaderFull(n), color: n.color, era: n.era, regime: n.regime, culture: n.culture, mood: (n.stability - 0.5) * 2 },
    ad: ADS[n.era], adName: world.cities[(((year * 7 + nid) % world.cities.length) + world.cities.length) % world.cities.length].name,
    nationName: n.name, capital: capital.name, issueNo: year - n.founded + 1,
  };
  return issue;
}

export function renderIssue(issue) {
  const L = issue.leader;
  const dateLine = `${issue.era <= 1 ? 'An' : 'Année'} ${fmtYear(issue.year)} — ${issue.era <= 2 ? `Rouleau n° ${issue.issueNo}` : `N° ${issue.issueNo}`} — ${issue.era <= 2 ? `Lu sur la place de ${esc(issue.capital)}` : `Prix : 1 ${issue.stats.currency.replace(/s$/, '')}`}`;
  const drop = t => issue.era === 2 ? `<span class="drop">${esc(t[0])}</span>${esc(t.slice(1))}` : esc(t);
  const art = a => `<article>${a.title ? `<h4>${esc(a.title)}</h4>` : ''}<p>${esc(a.text)}</p></article>`;
  const prices = issue.stats.prices.map(([g, p]) => `<tr><td>${esc(g)}</td><td>${p.toFixed(2)}</td></tr>`).join('');
  const ad = issue.ad ? `<div class="ad"><b>${esc(issue.ad[0].replace('{n}', issue.adName))}</b><br>${esc(issue.ad[1].replace('{n}', issue.adName).replace('{c}', issue.adName))}</div>` : '';
  return `
  <div class="paper ${issue.style}">
    <div class="mast">${esc(issue.name)}</div>
    <div class="dateline">${dateLine}</div>
    <h2 class="headline">${esc(issue.head.title)}</h2>
    <div class="lead">
      <figure><canvas class="engraving" width="200" height="250"></canvas><figcaption>${esc(L.title)} ${esc(L.full)}</figcaption></figure>
      <p class="leadtext">${drop(issue.head.body)}</p>
    </div>
    <div class="cols">
      <section><h3>${issue.era <= 1 ? 'Faits du royaume' : 'Nouvelles du pays'}</h3>${issue.local.length ? issue.local.map(art).join('') : '<p><i>Rien à signaler.</i></p>'}</section>
      <section><h3>${issue.era <= 1 ? 'Rumeurs des terres lointaines' : 'Échos du monde'}</h3>${issue.world.length ? issue.world.map(art).join('') : '<p><i>Les routes sont silencieuses.</i></p>'}</section>
      <section class="side">
        <h3>Marché de ${esc(issue.capital)}</h3>
        <table class="prices"><tr><th>Denrée</th><th>${esc(issue.stats.currency)}</th></tr>${prices}</table>
        <h3>Le royaume en chiffres</h3>
        <p>Population : <b>${issue.stats.pop.toLocaleString('fr')}</b><br>Trésor : <b>${issue.stats.treasury.toLocaleString('fr')}</b> ${esc(issue.stats.currency)}<br>Concorde : <b>${issue.stats.stability} %</b></p>
        ${issue.obit ? `<div class="obit"><h3>Nécrologie</h3><p>${esc(issue.obit.title)} ${esc(issue.obit.name)}, ${issue.obit.age} ans, après ${issue.obit.reign} années de règne.</p></div>` : ''}
        ${ad}
      </section>
    </div>
  </div>`;
}

export function paintEngraving(root, issue) {
  const cv = root.querySelector('canvas.engraving');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const L = issue.leader;
  drawPortrait(ctx, L.L, features(L.L, L.culture), { nationColor: L.color, era: L.era, regime: L.regime, mood: L.mood, sepia: true }, 0.3, cv.width, cv.height);
}
