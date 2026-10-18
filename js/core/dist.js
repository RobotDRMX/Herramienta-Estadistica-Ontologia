// Distribuciones de probabilidad sin dependencias (normal, t, χ², F).
// Precisión ~1e-10: suficiente para tablas de 4 decimales.

const EPS = 1e-14;

export function lnGamma(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (const cj of c) ser += cj / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

// Gamma incompleta regularizada P(a, x)
function gammaP(a, x) {
  if (x <= 0) return 0;
  if (x < a + 1) {
    let ap = a, sum = 1 / a, del = sum;
    for (let n = 0; n < 500; n++) { ap++; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * EPS) break; }
    return sum * Math.exp(-x + a * Math.log(x) - lnGamma(a));
  }
  let b = x + 1 - a, c = 1 / 1e-300, d = 1 / b, h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a); b += 2;
    d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d; const del = d * c; h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h;
}

// Beta incompleta regularizada I_x(a, b)
function betaI(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  const cf = (x, a, b) => {
    let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    d = 1 / d; let h = d;
    for (let m = 1; m <= 500; m++) {
      const m2 = 2 * m;
      let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300;
      c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300;
      c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300;
      d = 1 / d; const del = d * c; h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  };
  return x < (a + 1) / (a + b + 2) ? bt * cf(x, a, b) / a : 1 - bt * cf(1 - x, b, a) / b;
}

// CDFs
export const normalCdf = z => z >= 0 ? 0.5 * (1 + gammaP(0.5, z * z / 2)) : 0.5 * (1 - gammaP(0.5, z * z / 2));
export const tCdf = (t, v) => {
  const x = v / (v + t * t), p = 0.5 * betaI(x, v / 2, 0.5);
  return t > 0 ? 1 - p : p;
};
export const chi2Cdf = (x, k) => gammaP(k / 2, x / 2);
export const fCdf = (x, d1, d2) => x <= 0 ? 0 : betaI(d1 * x / (d1 * x + d2), d1 / 2, d2 / 2);

// Inversa genérica por bisección sobre una CDF creciente
function inversa(cdf, p, lo, hi) {
  while (cdf(hi) < p) { lo = hi; hi *= 2; }
  while (cdf(lo) > p) { hi = lo; lo = lo < 0 ? lo * 2 : lo / 2 - 1; }
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    cdf(mid) < p ? (lo = mid) : (hi = mid);
    if (hi - lo < 1e-13 * Math.max(1, Math.abs(mid))) break;
  }
  return (lo + hi) / 2;
}

// Cuantiles (p = área a la IZQUIERDA)
export const normalInv = p => inversa(normalCdf, p, -10, 10);
export const tInv = (p, v) => inversa(t => tCdf(t, v), p, -10, 10);
export const chi2Inv = (p, k) => inversa(x => chi2Cdf(x, k), p, 0, Math.max(10, 4 * k));
export const fInv = (p, d1, d2) => inversa(x => fCdf(x, d1, d2), p, 0, 10);

// Valores críticos con área `a` a la DERECHA (notación de las tablas del libro)
export const zCrit = a => normalInv(1 - a);
export const tCrit = (a, v) => tInv(1 - a, v);
export const chi2Crit = (a, k) => chi2Inv(1 - a, k);
export const fCrit = (a, d1, d2) => fInv(1 - a, d1, d2);

// Densidades (para graficar)
export const normalPdf = (x, mu = 0, sd = 1) => Math.exp(-0.5 * ((x - mu) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI));
export const tPdf = (x, v) => Math.exp(lnGamma((v + 1) / 2) - lnGamma(v / 2)) / Math.sqrt(v * Math.PI) * (1 + x * x / v) ** (-(v + 1) / 2);
export const chi2Pdf = (x, k) => (x <= 0 ? (k === 2 ? 0.5 : 0) : Math.exp((k / 2 - 1) * Math.log(x) - x / 2 - (k / 2) * Math.log(2) - lnGamma(k / 2)));
export const fPdf = (x, d1, d2) => (x <= 0 ? 0 : Math.exp(0.5 * (d1 * Math.log(d1 * x) + d2 * Math.log(d2) - (d1 + d2) * Math.log(d1 * x + d2)) - Math.log(x) - (lnGamma(d1 / 2) + lnGamma(d2 / 2) - lnGamma((d1 + d2) / 2))));
