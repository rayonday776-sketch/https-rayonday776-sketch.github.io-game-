// Générateur de noms par culture (chaque culture a sa propre phonétique)
const ONSETS = ['b', 'c', 'd', 'f', 'g', 'h', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'z', 'th', 'ch', 'sh', 'gr', 'br', 'tr', 'kr', 'dr', 'st', 'ph', 'x', 'qu', 'j', 'w', 'y', 'sk', 'kh', 'gw', 'vl'];
const VOWELS = ['a', 'e', 'i', 'o', 'u', 'ae', 'ia', 'io', 'ou', 'ei', 'au', 'y', 'é', 'aa', 'ui', 'eo'];
const CODAS = ['n', 'r', 's', 'l', 'm', 'th', 'nd', 'rk', 'x', 'st', 'ck', 'ng', 'sh', 'z', 'rn'];
const CITY_SUF = ['ia', 'on', 'um', 'heim', 'grad', 'ar', 'is', 'polis', 'kar', 'dun', 'burg', 'ora', 'an', 'esh', 'abad', 'or', 'ac', 'enne', 'stad', 'ova', 'ium', 'mar', 'ford', 'ica', 'ène', 'tal'];
const NAT_SUF = ['ia', 'ar', 'ie', 'eth', 'and', 'ium', 'istan', 'ore', 'anie', 'ène', 'ylie', 'arie', 'onie'];

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const clean = s => s.replace(/(.)\1\1+/g, '$1$1').replace(/^(.)\1/, '$1');

export function makeCulture(rng) {
  const pickN = (arr, n) => rng.shuffle([...arr]).slice(0, n);
  return {
    onset: pickN(ONSETS, rng.int(8, 13)),
    vow: pickN(VOWELS, rng.int(4, 7)),
    coda: pickN(CODAS, rng.int(2, 5)),
    citySuf: pickN(CITY_SUF, 4),
    natSuf: pickN(NAT_SUF, 2),
    codaP: rng.range(0.15, 0.45),
    id: rng.int(0, 1e9),
  };
}

export function word(c, rng, syl) {
  let s = '';
  for (let i = 0; i < syl; i++) {
    if (i === 0 || rng.chance(0.85)) s += rng.pick(c.onset);
    s += rng.pick(c.vow);
    if (rng.chance(c.codaP)) s += rng.pick(c.coda);
  }
  return clean(s);
}

export function cityName(c, rng) {
  let w = word(c, rng, rng.int(1, 2));
  if (w.length < 4 || rng.chance(0.5)) w += rng.pick(c.citySuf);
  return cap(clean(w));
}
export function nationName(c, rng) { return cap(clean(word(c, rng, rng.int(1, 2)) + rng.pick(c.natSuf))); }
export function personName(c, rng, female) {
  let w = word(c, rng, rng.int(2, 3));
  if (female) w = w.replace(/[^aeiouyé]+$/, '') + rng.pick(['a', 'e', 'ia', 'ine', 'ys']);
  else if (rng.chance(0.35)) w += rng.pick(['us', 'or', 'an', 'ric', 'mir', 'os', 'ald']);
  return cap(clean(w));
}
export function dynastyName(c, rng) { return cap(clean(word(c, rng, 2) + rng.pick(['ides', 'ing', 'ov', 'ar', 'ien', 'ez', 'son', 'ii']))); }

// petite variation d'une culture (pour les nations qui font sécession)
export function driftCulture(c, rng) {
  const n = JSON.parse(JSON.stringify(c));
  n.onset[rng.int(0, n.onset.length - 1)] = rng.pick(ONSETS);
  n.citySuf[rng.int(0, 3)] = rng.pick(CITY_SUF);
  n.natSuf[0] = rng.pick(NAT_SUF);
  n.id = rng.int(0, 1e9);
  return n;
}

export const ROMAN = n => {
  const map = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let s = ''; for (const [v, r] of map) while (n >= v) { s += r; n -= v; } return s;
};
