// Aléatoire déterministe + bruit de Perlin
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  constructor(seed) { this.r = mulberry32(seed >>> 0); }
  next() { return this.r(); }
  range(a, b) { return a + (b - a) * this.r(); }
  int(a, b) { return a + Math.floor(this.r() * (b - a + 1)); }
  pick(a) { return a[Math.floor(this.r() * a.length)]; }
  chance(p) { return this.r() < p; }
  gauss() {
    let u = 0, v = 0;
    while (!u) u = this.r();
    while (!v) v = this.r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.r() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}

export function hash2(a, b) {
  let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

// décalage pseudo-aléatoire stable dans [-0.5, 0.5]
export function jit(i, k) { return (hash2(i, k) % 10000) / 10000 - 0.5; }

export function makeNoise(seed) {
  const rng = new RNG(seed);
  const perm = [...Array(256).keys()];
  rng.shuffle(perm);
  const p = new Uint8Array(512);
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const gx = new Float32Array(256), gy = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const a = rng.next() * Math.PI * 2;
    gx[i] = Math.cos(a); gy[i] = Math.sin(a);
  }
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  function g(ix, iy, dx, dy) { const h = p[ix + p[iy]]; return gx[h] * dx + gy[h] * dy; }
  function noise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const X = xi & 255, Y = yi & 255;
    const n00 = g(X, Y, xf, yf), n10 = g(X + 1, Y, xf - 1, yf);
    const n01 = g(X, Y + 1, xf, yf - 1), n11 = g(X + 1, Y + 1, xf - 1, yf - 1);
    const u = fade(xf), v = fade(yf);
    const a = n00 + (n10 - n00) * u, b = n01 + (n11 - n01) * u;
    return a + (b - a) * v;
  }
  function fbm(x, y, oct = 5) {
    let s = 0, a = 1, f = 1, n = 0;
    for (let o = 0; o < oct; o++) { s += a * noise(x * f, y * f); n += a; a *= 0.5; f *= 2; }
    return (s / n) * 1.5;
  }
  function ridge(x, y, oct = 5) {
    let s = 0, a = 0.5, f = 1, n = 0;
    for (let o = 0; o < oct; o++) {
      let v = Math.max(0, 1 - Math.abs(noise(x * f, y * f) * 1.6));
      v *= v; s += v * a; n += a; a *= 0.5; f *= 2;
    }
    return s / n;
  }
  return { noise, fbm, ridge };
}
