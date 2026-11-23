// Événements à choix : un conseiller de la cour expose un dilemme, le joueur tranche.
import { ERAS, BUILDINGS } from './world.js';

const clamp = v => Math.max(0, Math.min(1, v));
function bump(n, role, d) {
  const p = n.parties.find(x => x.role === role);
  if (!p) return;
  p.support = Math.max(0.02, p.support + d);
  const tot = n.parties.reduce((s, x) => s + x.support, 0);
  for (const x of n.parties) x.support /= tot;
}
const stab = (n, d) => { n.stability = clamp(n.stability + d); };
const legit = (n, d) => { n.legitimacy = clamp(n.legitimacy + d); };
const pick = (w, arr) => arr[Math.floor(w.rng.next() * arr.length)];
const cur = n => ERAS[n.era].currency;

export const CHOICES = [
  {
    id: 'budget', role: 'argentier',
    when: (w, n) => n.debt > n.gdp * 1.2,
    setup: (w, n) => ({ debt: Math.round(n.debt) }),
    title: () => 'Les créanciers s\'impatientent',
    text: (c, w, n) => `La dette atteint ${c.debt} ${cur(n)}, plus que la richesse produite en un an. Les banquiers exigent des garanties.`,
    options: [
      { label: 'Plan d\'austérité', hint: () => 'budgets réduits, −concorde', apply: (c, w, n) => { for (const k in n.budget) n.budget[k] = Math.max(0, n.budget[k] - 1); stab(n, -0.06); bump(n, 'peuple', 0.04); return 'La cour se serre la ceinture ; le peuple aussi.'; } },
      { label: 'Lever un impôt exceptionnel', hint: () => '+trésor, −concorde', apply: (c, w, n) => { const g = c.debt * 0.25; n.treasury += g; stab(n, -0.08); return 'Un impôt exceptionnel renfloue les caisses.'; } },
      { label: 'Faire tourner la planche à billets', hint: () => 'dette −40 %, inflation ++', apply: (c, w, n) => { n.debt *= 0.6; n.inflation += 12; bump(n, 'commerce', -0.04); return 'La monnaie est dévaluée : la dette fond, les prix flambent.'; } },
    ],
  },
  {
    id: 'minorite', role: 'pretre',
    when: (w, n) => (n.minority || 0) > 0.2 && w.faiths,
    setup: (w, n) => { const c = w.citiesOf(n).filter(x => x.faith !== n.faith).sort((a, b) => b.pop - a.pop)[0]; return { city: c, faith: c && w.faiths[c.faith] }; },
    title: c => `Les fidèles de ${c.faith.name} à ${c.city.name}`,
    text: (c, w, n) => `${c.city.name} prie selon ${c.faith.name} et non selon la religion officielle (${w.faiths[n.faith].name}). Le clergé réclame des mesures.`,
    options: [
      { label: 'Édit de tolérance', hint: () => '+concorde, −religion', apply: (c, w, n) => { stab(n, 0.05); bump(n, 'religion', -0.04); bump(n, 'commerce', 0.02); return 'Un édit garantit la liberté de culte.'; } },
      { label: 'Missions de conversion', hint: (c, w, n) => `−50 ${cur(n)}, conversion probable`, apply: (c, w, n) => { n.treasury -= 50; if (w.rng.chance(0.6)) { c.city.faith = n.faith; w.faithVersion++; return `${c.city.name} se convertit.`; } return 'Les missionnaires sont chassés.'; } },
      { label: 'Persécutions', hint: () => 'conversion forcée, −population, −concorde', apply: (c, w, n) => { c.city.faith = n.faith; c.city.pop *= 0.85; w.faithVersion++; stab(n, -0.07); bump(n, 'religion', 0.04); return `Les fidèles de ${c.faith.name} fuient ${c.city.name}.`; } },
    ],
  },
  {
    id: 'famine', role: 'argentier',
    when: (w, n) => n.shortage > 0.15 || w.citiesOf(n).some(c => c.shortage > 0.2),
    setup: (w, n) => ({ city: w.citiesOf(n).sort((a, b) => b.shortage - a.shortage)[0] }),
    title: c => `Les greniers de ${c.city.name} sont vides`,
    text: (c, w, n) => `Le prix du blé a triplé sur le marché de ${c.city.name}. Les mères font la queue dès l'aube et l'on murmure contre le palais. Que faisons-nous ?`,
    options: [
      { label: 'Ouvrir les greniers de l\'État', hint: (c, w, n) => `−${Math.round(40 + c.city.pop / 400)} ${cur(n)}, +concorde, blé distribué`, apply: (c, w, n) => { n.treasury -= 40 + c.city.pop / 400; c.city.stock[0] += c.city.pop / 400; c.city.shortage = 0; stab(n, 0.06); bump(n, 'peuple', 0.03); return 'Les greniers sont ouverts : la foule acclame le souverain.'; } },
      { label: 'Taxer les spéculateurs', hint: () => '+trésor, −marchands, concorde incertaine', apply: (c, w, n) => { n.treasury += 30 + c.city.pop / 600; bump(n, 'commerce', -0.04); stab(n, w.rng.chance(0.5) ? 0.03 : -0.04); return 'Les accapareurs sont mis à l\'amende.'; } },
      { label: 'Laisser faire le marché', hint: () => '−concorde', apply: (c, w, n) => { stab(n, -0.05); bump(n, 'commerce', 0.02); return 'Le palais reste muet. La colère gronde.'; } },
    ],
  },
  {
    id: 'revolte', role: 'marechal',
    when: (w, n) => n.stability < 0.5 && w.citiesOf(n).length > 1,
    setup: (w, n) => { const cap = w.cities[n.capital]; return { city: w.citiesOf(n).filter(c => c.id !== n.capital).sort((a, b) => w.dist(b, cap) - w.dist(a, cap))[0] }; },
    title: c => `Émeutes à ${c.city.name}`,
    text: c => `Des paysans armés de fourches ont pris la place du marché de ${c.city.name}. Ils réclament moins d'impôts et la tête du percepteur.`,
    options: [
      { label: 'Envoyer la troupe', hint: () => '−10 % armée, +ordre, −peuple', apply: (c, w, n) => { n.army *= 0.9; stab(n, 0.05); bump(n, 'peuple', -0.04); bump(n, 'militaire', 0.03); return `La révolte de ${c.city.name} est écrasée.`; } },
      { label: 'Baisser les impôts', hint: () => 'impôts −3 points, +concorde', apply: (c, w, n) => { n.tax = Math.max(0, n.tax - 0.03); stab(n, 0.08); bump(n, 'peuple', 0.03); return 'Le souverain entend la plainte : les impôts baissent.'; } },
      { label: 'Ignorer', hint: () => 'risque de sécession', apply: (c, w, n) => { stab(n, -0.07); return 'Le palais ignore les émeutiers.'; } },
    ],
  },
  {
    id: 'architecte', role: 'chancelier',
    when: (w, n) => n.treasury > 120,
    setup: (w, n) => ({ city: w.cities[n.capital], cost: Math.round(100 + n.era * 60) }),
    title: c => `Un architecte rêve de ${c.city.name}`,
    text: (c, w, n) => `Un architecte présente les plans d'${['un forum de marbre', 'un grand temple', 'une cathédrale', 'un palais à coupole', 'une gare monumentale', 'une tour de verre'][n.era]} pour ${c.city.name}. « Votre nom traversera les siècles », promet-il.`,
    options: [
      { label: 'Financer les travaux', hint: (c, w, n) => `−${c.cost} ${cur(n)}, +légitimité, +rayonnement`, apply: (c, w, n) => { n.treasury -= c.cost; legit(n, 0.12); stab(n, 0.03); n.tech += 15; c.city.K *= 1.05; c.city.monument = (c.city.monument || 0) + 1; return `Les travaux commencent à ${c.city.name}.`; } },
      { label: 'Trop cher', hint: () => 'rien', apply: () => 'L\'architecte repart avec ses plans.' },
    ],
  },
  {
    id: 'prophete', role: 'pretre',
    when: () => true,
    setup: (w, n) => ({ city: pick(w, w.citiesOf(n)) }),
    title: c => `Un prophète à ${c.city.name}`,
    text: c => `Un ermite descendu des collines prêche à ${c.city.name}. Il annonce la fin des temps et les foules le suivent.`,
    options: [
      { label: 'L\'accueillir à la cour', hint: () => '+religion, +concorde, peut fonder une religion', apply: (c, w, n) => { bump(n, 'religion', 0.05); bump(n, 'tradition', -0.02); stab(n, 0.04); if (w.faiths && w.rng.chance(0.35)) { const f = w.newFaith(c.city); c.city.faith = f.id; w.log('foi', { w: 7, nations: [n.id], city: c.city.id, title: `Naissance de ${f.name}`, text: `Le prophète de ${c.city.name} fonde ${f.name}.` }); return `Ses disciples fondent ${f.name} !`; } return 'Le prophète siège désormais au conseil.'; } },
      { label: 'Le bannir', hint: () => '−religion, +tradition', apply: (c, w, n) => { bump(n, 'religion', -0.04); bump(n, 'tradition', 0.03); stab(n, -0.02); return 'Le prophète est chassé de la ville.'; } },
      { label: 'Le faire taire discrètement', hint: () => 'risqué', apply: (c, w, n) => { if (w.rng.chance(0.5)) { stab(n, -0.08); legit(n, -0.08); return 'Le scandale éclate : on accuse le palais.'; } return 'Le prophète a disparu. Personne ne pose de questions.'; } },
    ],
  },
  {
    id: 'guerre', role: 'marechal',
    when: (w, n) => [...n.neighbors].some(id => w.nations[id].alive && (n.rel[id] ?? 0) < -15 && !w.atWar(n.id, id)) && !w.warsOf(n.id).length,
    setup: (w, n) => ({ foe: w.nations[[...n.neighbors].filter(id => w.nations[id].alive && !w.atWar(n.id, id)).sort((a, b) => (n.rel[a] ?? 0) - (n.rel[b] ?? 0))[0]] }),
    title: c => `Le maréchal lorgne sur ${c.foe.name}`,
    text: (c, w, n) => `« Leurs garnisons sont faibles (${Math.round(c.foe.army * 10).toLocaleString('fr')} hommes contre nos ${Math.round(n.army * 10).toLocaleString('fr')}). Un mot de vous et nous marchons sur ${w.cities[c.foe.capital].name}. »`,
    options: [
      { label: 'Déclarer la guerre', hint: () => 'les armées se mettent en marche', apply: (c, w, n) => { w.declareWar(n.id, c.foe.id); bump(n, 'militaire', 0.04); return `Guerre contre ${c.foe.name} !`; } },
      { label: 'Fortifier la frontière', hint: (c, w, n) => `−60 ${cur(n)}, +20 % armée`, apply: (c, w, n) => { n.treasury -= 60; n.army *= 1.2; return 'Les forts de la frontière sont renforcés.'; } },
      { label: 'Refuser', hint: () => '−militaires, +relations', apply: (c, w, n) => { bump(n, 'militaire', -0.04); n.rel[c.foe.id] = (n.rel[c.foe.id] ?? 0) + 15; c.foe.rel[n.id] = (c.foe.rel[n.id] ?? 0) + 15; return 'Le maréchal range ses cartes, vexé.'; } },
    ],
  },
  {
    id: 'comptoir', role: 'chancelier',
    when: (w, n) => [...n.neighbors].some(id => w.nations[id].alive && !(n.pacts?.has(id)) && !w.atWar(n.id, id)),
    setup: (w, n) => ({ other: w.nations[pick(w, [...n.neighbors].filter(id => w.nations[id].alive && !(n.pacts?.has(id)) && !w.atWar(n.id, id)))] }),
    title: c => `Des marchands de ${c.other.name} demandent un comptoir`,
    text: c => `Une guilde de ${c.other.name} propose d'ouvrir un comptoir dans nos murs, en échange d'exemptions de taxes.`,
    options: [
      { label: 'Signer un traité de commerce', hint: () => '+commerce, +relations, −tradition', apply: (c, w, n) => { n.pacts = n.pacts || new Set(); c.other.pacts = c.other.pacts || new Set(); n.pacts.add(c.other.id); c.other.pacts.add(n.id); n.rel[c.other.id] = (n.rel[c.other.id] ?? 0) + 20; c.other.rel[n.id] = (c.other.rel[n.id] ?? 0) + 20; bump(n, 'commerce', 0.04); bump(n, 'tradition', -0.02); return `Traité de commerce avec ${c.other.name}.`; } },
      { label: 'Refuser', hint: () => '+tradition, −relations', apply: (c, w, n) => { bump(n, 'tradition', 0.03); n.rel[c.other.id] = (n.rel[c.other.id] ?? 0) - 10; return 'Les marchands étrangers repartent bredouilles.'; } },
    ],
  },
  {
    id: 'savant', role: 'chancelier',
    when: (w, n) => n.era >= 1,
    setup: (w, n) => ({ city: w.citiesOf(n).sort((a, b) => b.pop - a.pop)[0], cost: 80 + n.era * 40 }),
    title: c => `Un savant de ${c.city.name} demande audience`,
    text: (c, w, n) => `Il prétend pouvoir ${['mesurer la Terre avec un bâton', 'canaliser les eaux de la ville', 'améliorer les moulins', 'imprimer les livres par milliers', 'faire rouler des voitures sans chevaux', 'faire penser des machines'][n.era]}. Il lui faut des fonds.`,
    options: [
      { label: 'Financer ses recherches', hint: (c, w, n) => `−${c.cost} ${cur(n)}, +savoir`, apply: (c, w, n) => { n.treasury -= c.cost; n.tech += 30 + n.era * 10; return 'Les recherches avancent à grands pas.'; } },
      { label: 'Le congédier', hint: () => 'rien', apply: () => 'Le savant part chercher fortune ailleurs.' },
    ],
  },
  {
    id: 'peste', role: 'pretre',
    when: (w, n) => n.era < 4 && w.citiesOf(n).some(c => c.coastal),
    setup: (w, n) => ({ city: pick(w, w.citiesOf(n).filter(c => c.coastal)) }),
    title: c => `Un navire suspect à ${c.city.name}`,
    text: c => `Un navire venu de loin a jeté l'ancre à ${c.city.name}. Plusieurs marins sont pris de fièvre. Les marchands veulent décharger la cargaison.`,
    options: [
      { label: 'Quarantaine stricte', hint: () => '−commerce cette année, population sauve', apply: (c, w, n) => { c.city.tradeEMA *= 0.5; bump(n, 'commerce', -0.03); return `${c.city.name} est mise en quarantaine.`; } },
      { label: 'Laisser décharger', hint: () => '+trésor, risque d\'épidémie', apply: (c, w, n) => { n.treasury += 40; if (w.rng.chance(0.55)) { for (const x of w.citiesOf(n)) x.pop *= 0.85; stab(n, -0.08); return 'La peste se répand depuis le port !'; } return 'Fausse alerte : la cargaison enrichit la ville.'; } },
    ],
  },
  {
    id: 'mariage', role: 'chancelier',
    when: (w, n) => ['Royaume', 'Empire'].includes(n.regime) && w.nations.some(o => o.alive && o !== n && ['Royaume', 'Empire'].includes(o.regime) && !w.atWar(n.id, o.id)),
    setup: (w, n) => ({ other: pick(w, w.nations.filter(o => o.alive && o !== n && ['Royaume', 'Empire'].includes(o.regime) && !w.atWar(n.id, o.id))) }),
    title: c => `Une alliance matrimoniale avec ${c.other.name}`,
    text: (c, w, n) => `La maison ${c.other.leader.dynasty} propose d'unir ses enfants à ceux de la maison ${n.leader.dynasty}.`,
    options: [
      { label: 'Accepter le mariage', hint: () => '+40 relations, +légitimité', apply: (c, w, n) => { n.rel[c.other.id] = (n.rel[c.other.id] ?? 0) + 40; c.other.rel[n.id] = (c.other.rel[n.id] ?? 0) + 40; legit(n, 0.06); return `Les maisons ${n.leader.dynasty} et ${c.other.leader.dynasty} sont unies.`; } },
      { label: 'Décliner poliment', hint: () => '−relations', apply: (c, w, n) => { n.rel[c.other.id] = (n.rel[c.other.id] ?? 0) - 10; return 'La proposition est déclinée.'; } },
    ],
  },
  {
    id: 'greve', role: 'chancelier',
    when: (w, n) => n.era >= 4,
    setup: (w, n) => ({ city: w.citiesOf(n).sort((a, b) => b.pop - a.pop)[0] }),
    title: c => `Grève générale à ${c.city.name}`,
    text: c => `Les ouvriers des usines de ${c.city.name} ont cessé le travail. Ils exigent la journée de huit heures.`,
    options: [
      { label: 'Céder aux grévistes', hint: () => '+socialistes, +concorde, −trésor', apply: (c, w, n) => { n.treasury -= 80; bump(n, 'peuple', 0.05); stab(n, 0.06); return 'La journée de huit heures est votée.'; } },
      { label: 'Briser la grève', hint: () => '+nationalistes, −concorde', apply: (c, w, n) => { bump(n, 'militaire', 0.04); bump(n, 'peuple', 0.03); stab(n, -0.08); return 'La police disperse les piquets de grève.'; } },
    ],
  },
  {
    id: 'corruption', role: 'argentier',
    when: (w, n) => n.treasury > 300,
    setup: (w, n) => ({ sum: Math.round(n.treasury * 0.15) }),
    title: () => 'Des comptes qui ne tombent pas juste',
    text: (c, w, n) => `Le grand argentier a découvert qu'environ ${c.sum} ${cur(n)} se sont évaporés des caisses. Les soupçons se portent sur de hauts dignitaires.`,
    options: [
      { label: 'Ouvrir une enquête publique', hint: () => '−tradition, +légitimité', apply: (c, w, n) => { bump(n, 'tradition', -0.04); legit(n, 0.08); n.treasury += c.sum * 0.5; return 'Plusieurs dignitaires sont jugés et condamnés.'; } },
      { label: 'Étouffer l\'affaire', hint: (c, w, n) => `−${c.sum} ${cur(n)}, +tradition`, apply: (c, w, n) => { n.treasury -= c.sum; bump(n, 'tradition', 0.03); return 'L\'affaire est classée.'; } },
    ],
  },
  {
    id: 'expedition', role: 'chancelier',
    when: (w, n) => w.citiesOf(n).some(c => c.buildings.port) && n.treasury > 80,
    setup: (w, n) => ({ city: w.citiesOf(n).find(c => c.buildings.port) }),
    title: c => `Une expédition au départ de ${c.city.name}`,
    text: c => `Un capitaine audacieux veut cingler vers l'horizon depuis ${c.city.name}. Il jure de revenir chargé d'épices et de cartes nouvelles.`,
    options: [
      { label: 'Armer trois navires', hint: (c, w, n) => `−80 ${cur(n)}, gain incertain`, apply: (c, w, n) => { n.treasury -= 80; if (w.rng.chance(0.6)) { const g = Math.round(100 + w.rng.next() * 250); n.treasury += g; n.tech += 10; return `L'expédition revient triomphante : +${g} ${cur(n)} !`; } return 'Les navires ne sont jamais revenus.'; } },
      { label: 'Refuser', hint: () => 'rien', apply: () => 'Le capitaine boit son dépit sur le port.' },
    ],
  },
];

export function rollChoice(world, n) {
  const ok = CHOICES.filter(e => { try { return e.when(world, n); } catch (_) { return false; } });
  if (!ok.length) return null;
  const ev = ok[Math.floor(world.rng.next() * ok.length)];
  const ctx = ev.setup(world, n);
  if (Object.values(ctx).some(v => v == null)) return null;
  const adv = n.court.find(m => m.role === ev.role);
  return { ev, ctx, nid: n.id, adv };
}

export function resolveChoice(world, choice, k) {
  const n = world.nations[choice.nid];
  const opt = choice.ev.options[k];
  const res = opt.apply(choice.ctx, world, n);
  world.log('decision', { w: 5, nations: [n.id], title: choice.ev.title(choice.ctx, world, n), text: `Décision : ${opt.label.toLowerCase()}. ${res}`, body: `${choice.ev.text(choice.ctx, world, n)} Le souverain a tranché : ${opt.label.toLowerCase()}. ${res}` });
  world.pendingChoice = null;
  return res;
}
