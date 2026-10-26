// Gráficas de los resultados: la curva de la distribución con el área sombreada y los valores críticos,
// dibujadas en SVG con la apariencia de matplotlib (Python) y de los gráficos base de R.
// Cada lenguaje usa su propia paleta para reconocerlas de un vistazo. También genera el script equivalente.

import { normalPdf, tPdf, chi2Pdf, fPdf, chi2Inv, fInv } from "./dist.js";

export const PALETAS = {
  python: { nombre: "Python · matplotlib", curva: "#0000ff", zona: "#add8e6", zonaOp: 0.8, critico: "#ff0000", ejes: "#000000", grid: "#b0b0b0", acento: "#2563eb" },
  statgraphics: { nombre: "Statgraphics", curva: "#cc0000", zona: "#3366cc", zonaOp: 0.5, critico: "#006600", ejes: "#000000", grid: "#c0c0c0", acento: "#b45309" },
  r: { nombre: "R · gráficos base", curva: "#0f766e", zona: "#2dd4bf", zonaOp: 0.35, critico: "#c2410c", ejes: "#000000", grid: "#cbd5e1", acento: "#0f766e" }
};

const fx = (v, d = 4) => (Math.round(v * 10 ** d) / 10 ** d).toFixed(d);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ---------- modelo de la distribución a dibujar ---------- */
function modelo(spec) {
  const { familia, gl, gl2, lim = [] } = spec;
  if (familia === "z") {
    const R = Math.max(4, Math.abs(lim[1]) + 1);
    return { pdf: x => normalPdf(x), xmin: -R, xmax: R, xlab: "Valores Z", titulo: "Distribución Normal estándar (Z)" };
  }
  if (familia === "t") {
    const R = Math.max(4.5, Math.abs(lim[1]) + 1.2);
    return { pdf: x => tPdf(x, gl), xmin: -R, xmax: R, xlab: "Valores t", titulo: `Distribución t-Student (gl = ${gl})` };
  }
  if (familia === "chi2") {
    return { pdf: x => chi2Pdf(x, gl), xmin: 0, xmax: Math.max(chi2Inv(0.999, gl), lim[1] * 1.3), xlab: "Valores X²", titulo: `Distribución Chi-Cuadrado (gl = ${gl})` };
  }
  if (familia === "f") {
    return { pdf: x => fPdf(x, gl, gl2), xmin: 0, xmax: Math.min(Math.max(fInv(0.995, gl, gl2), lim[1] * 1.35), lim[1] * 2.2), xlab: "Valores F", titulo: `Distribución F (gl1 = ${gl}, gl2 = ${gl2})` };
  }
  throw new Error("Familia de gráfica desconocida");
}

/* ---------- ejes ---------- */
function ticks(min, max, aprox = 8) {
  const paso0 = (max - min) / aprox, mag = 10 ** Math.floor(Math.log10(paso0));
  const paso = [1, 2, 2.5, 5, 10].map(m => m * mag).find(p => p >= paso0) ?? mag * 10;
  const dec = Math.max(0, -Math.floor(Math.log10(paso)) + (paso % 1 !== 0 && String(paso).split(".")[1]?.length > Math.max(0, -Math.floor(Math.log10(paso))) ? 1 : 0));
  const out = [];
  for (let v = Math.ceil(min / paso - 1e-9) * paso; v <= max + 1e-9; v += paso) out.push(Number(v.toFixed(10)));
  return { vals: out, dec: Math.min(dec, 4) };
}

/* ---------- dibujo SVG ---------- */
const W = 720, H = 470;

function dibujar(o) {
  const py = o.lang === "python", sg = o.lang === "statgraphics", P = PALETAS[o.lang];
  const m = { l: py || sg ? 104 : 92, r: 26, t: 60, b: 68 };
  const pw = W - m.l - m.r, ph = H - m.t - m.b;

  // muestreo de la curva
  const N = 500, xs = Array.from({ length: N + 1 }, (_, i) => o.xmin + (o.xmax - o.xmin) * i / N);
  const ys = xs.map(x => o.pdf(x)).map(y => (Number.isFinite(y) ? y : 0));
  let ymaxD = Math.max(...ys.slice(2)); if (!(ymaxD > 0)) ymaxD = 1;
  ymaxD = Math.min(ymaxD, 1000);
  const ylo = -0.04 * ymaxD, yhi = ymaxD * 1.05;
  const X = x => m.l + (x - o.xmin) / (o.xmax - o.xmin) * pw;
  const Y = y => m.t + ph - (Math.min(y, yhi) - ylo) / (yhi - ylo) * ph;
  const f = n => n.toFixed(2);
  const hat = t => (/̂/.test(t) ? ' font-family="Arial, Helvetica, sans-serif"' : "");

  const tx = ticks(o.xmin, o.xmax), ty = ticks(0, ymaxD, py ? 8 : 5);
  const menos = v => (py ? String(v).replace("-", "−") : v);
  const lab = (v, dec) => menos(v.toFixed(dec));

  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${py ? "'DejaVu Sans', Verdana, Arial, sans-serif" : sg ? "Arial, Helvetica, sans-serif" : "Helvetica, Arial, sans-serif"}" role="img" aria-label="${esc(o.titulo)}">`;
  s += `<rect width="${W}" height="${H}" fill="${sg ? "#ece9d8" : "#ffffff"}"/>`;
  if (sg) s += `<rect x="1" y="1" width="${W - 2}" height="${H - 2}" fill="none" stroke="#808080" stroke-width="2"/>`;
  s += `<defs><clipPath id="c${o.lang}${o.id}"><rect x="${m.l}" y="${m.t}" width="${pw}" height="${ph}"/></clipPath></defs>`;

  // rejilla
  const dash = py ? "" : sg ? ' stroke-dasharray="1 3"' : ' stroke-dasharray="2 4"';
  for (const v of tx.vals) s += `<line x1="${f(X(v))}" y1="${m.t}" x2="${f(X(v))}" y2="${m.t + ph}" stroke="${P.grid}" stroke-width="${py ? 1 : 1}"${dash}/>`;
  for (const v of ty.vals) s += `<line x1="${m.l}" y1="${f(Y(v))}" x2="${m.l + pw}" y2="${f(Y(v))}" stroke="${P.grid}" stroke-width="1"${dash}/>`;

  if (sg) s += `<rect x="${m.l}" y="${m.t}" width="${pw}" height="${ph}" fill="#ffffff"/>`;
  // rejilla se redibuja sobre el fondo blanco del área de trazado
  if (sg) { for (const v of tx.vals) s += `<line x1="${f(X(v))}" y1="${m.t}" x2="${f(X(v))}" y2="${m.t + ph}" stroke="${P.grid}" stroke-dasharray="1 3"/>`; for (const v of ty.vals) s += `<line x1="${m.l}" y1="${f(Y(v))}" x2="${m.l + pw}" y2="${f(Y(v))}" stroke="${P.grid}" stroke-dasharray="1 3"/>`; }
  s += `<g clip-path="url(#c${o.lang}${o.id})">`;
  // zonas sombreadas
  for (const z of o.zonas ?? []) {
    const a = Math.max(z.a, o.xmin), b = Math.min(z.b, o.xmax);
    if (!(b > a)) continue;
    const pts = [];
    const K = 160;
    for (let i = 0; i <= K; i++) { const x = a + (b - a) * i / K; pts.push(`${f(X(x))},${f(Y(o.pdf(x)))}`); }
    s += `<polygon points="${f(X(a))},${f(Y(0))} ${pts.join(" ")} ${f(X(b))},${f(Y(0))}" fill="${P.zona}" fill-opacity="${P.zonaOp}"/>`;
  }
  // curva
  s += `<polyline fill="none" stroke="${P.curva}" stroke-width="${py ? 4 : sg ? 2.5 : 3.5}" stroke-linejoin="round" points="${xs.map((x, i) => `${f(X(x))},${f(Y(ys[i]))}`).join(" ")}"/>`;
  // líneas críticas
  for (const l of o.lineas ?? []) s += `<line x1="${f(X(l.x))}" y1="${m.t}" x2="${f(X(l.x))}" y2="${m.t + ph}" stroke="${l.est ? P.ejes : P.critico}" stroke-width="${l.est ? 3 : 2.6}"${l.est ? "" : ` stroke-dasharray="${py ? "9 5" : "10 6"}"`}/>`;
  s += `</g>`;

  // etiquetas de las líneas
  const crits = (o.lineas ?? []).filter(l => !l.est);
  for (const l of o.lineas ?? []) {
    const x = X(l.x), txt = esc(l.etq);
    if (l.est) {
      const der = x > m.l + pw * 0.7;
      s += `<text x="${f(x + (der ? -8 : 8))}" y="${m.t + 24}"${hat(l.etq)} fill="#111" font-size="18" font-weight="bold" text-anchor="${der ? "end" : "start"}">${txt}</text>`;
      continue;
    }
    const izq = crits.indexOf(l) === 0 && crits.length > 1;
    if (py || sg) s += `<text x="${f(x + (izq ? -6 : 6))}" y="${f(Y(0.02 * ymaxD) + 5)}" fill="${P.critico}" font-size="18" text-anchor="${izq ? "end" : "start"}">${txt}</text>`;
    else s += `<text x="${f(x)}" y="${m.t + 20}" fill="${P.critico}" font-size="18" font-weight="bold" text-anchor="${izq ? "end" : "start"}" dx="${izq ? -6 : 6}">${txt}</text>`;
  }

  // marco y marcas
  s += `<rect x="${m.l}" y="${m.t}" width="${pw}" height="${ph}" fill="none" stroke="${P.ejes}" stroke-width="${py ? 1.4 : 1.6}"/>`;
  for (const v of tx.vals) {
    s += `<line x1="${f(X(v))}" y1="${m.t + ph}" x2="${f(X(v))}" y2="${m.t + ph + 7}" stroke="${P.ejes}" stroke-width="1.4"/>`;
    s += `<text x="${f(X(v))}" y="${m.t + ph + 29}" font-size="19" text-anchor="middle" fill="#111">${lab(v, tx.dec)}</text>`;
  }
  for (const v of ty.vals) {
    s += `<line x1="${m.l - 7}" y1="${f(Y(v))}" x2="${m.l}" y2="${f(Y(v))}" stroke="${P.ejes}" stroke-width="1.4"/>`;
    if (py || sg) s += `<text x="${m.l - 12}" y="${f(Y(v) + 5)}" font-size="19" text-anchor="end" fill="#111">${lab(v, ty.dec)}</text>`;
    else s += `<text transform="translate(${m.l - 14} ${f(Y(v))}) rotate(-90)" font-size="19" text-anchor="middle" fill="#111">${lab(v, ty.dec)}</text>`;
  }

  // títulos
  s += `<text x="${m.l + pw / 2}" y="${py ? 38 : 40}"${hat(o.titulo)} font-size="${py ? 24 : sg ? 21 : 25}" ${py ? "" : 'font-weight="bold"'} text-anchor="middle" fill="#111">${esc(o.titulo)}</text>`;
  s += `<text x="${m.l + pw / 2}" y="${H - 16}"${hat(o.xlab)} font-size="20" text-anchor="middle" fill="#111">${esc(o.xlab)}</text>`;
  s += `<text transform="translate(26 ${m.t + ph / 2}) rotate(-90)" font-size="20" text-anchor="middle" fill="#111">Densidad</text>`;

  // leyenda (estilo matplotlib)
  if (py && o.leyenda) {
    const w = 34 + o.leyenda.length * 9.6 + 26, x0 = m.l + pw - w - 10, y0 = m.t + 10;
    s += `<rect x="${f(x0)}" y="${y0}" width="${f(w)}" height="38" rx="4" fill="#fff" fill-opacity="0.85" stroke="#cccccc"/>`;
    s += `<rect x="${f(x0 + 10)}" y="${y0 + 12}" width="28" height="14" fill="${P.zona}" fill-opacity="${P.zonaOp}" stroke="${P.zona}"/>`;
    s += `<text x="${f(x0 + 48)}" y="${y0 + 26}" font-size="18" fill="#111">${esc(o.leyenda)}</text>`;
  } else if (sg && o.leyenda) {
    const w = 40 + o.leyenda.length * 9.2, x0 = m.l + pw - w - 10, y0 = m.t + 10;
    s += `<rect x="${f(x0)}" y="${y0}" width="${f(w)}" height="30" fill="#ffffe1" stroke="#000"/>`;
    s += `<rect x="${f(x0 + 8)}" y="${y0 + 9}" width="16" height="12" fill="${P.zona}" fill-opacity="${P.zonaOp}" stroke="${P.zona}"/>`;
    s += `<text x="${f(x0 + 32)}" y="${y0 + 21}" font-size="16" fill="#000">${esc(o.leyenda)}</text>`;
  } else if (!py && o.leyenda) {
    s += `<rect x="${m.l + pw - 16 - o.leyenda.length * 9.6}" y="${m.t + 40}" width="${14 + o.leyenda.length * 9.6}" height="30" rx="3" fill="#fff" fill-opacity="0.9" stroke="${P.curva}"/>`;
    s += `<text x="${m.l + pw - 22}" y="${m.t + 61}" font-size="18" text-anchor="end" fill="${P.curva}" font-weight="bold">${esc(o.leyenda)}</text>`;
  }
  return s + `</svg>`;
}

/* ---------- figuras por tipo de resultado ---------- */
export function figuras(spec, lang) {
  if (!spec) return [];
  if (spec.familia === "muestral") return figurasMuestrales(spec, lang);
  if (spec.familia === "dispersion") return [{ titulo: "Diagrama de dispersión y recta ajustada", svg: dibujarDispersion({ lang, ...spec }) }];
  if (spec.prueba) return figurasPrueba(spec, lang);
  const md = modelo(spec);
  const [lo, hi] = spec.lim;
  const lineas = [{ x: lo, etq: (lo < 0 ? "" : "") + fx(lo) }, { x: hi, etq: fx(hi) }];
  const svg = dibujar({ lang, id: 0, ...md, zonas: [{ a: lo, b: hi }], lineas, leyenda: `${Math.round(spec.conf * 10000) / 100}% de confianza` });
  return [{ titulo: md.titulo, svg }];
}

/** Curva del estadístico con las regiones de rechazo sombreadas y el valor calculado marcado. */
function figurasPrueba(spec, lang) {
  const md = modelo(spec), { lo, hi, est, simbolo, alfa } = spec.prueba;
  const zonas = [];
  if (lo != null) zonas.push({ a: md.xmin, b: lo });
  if (hi != null) zonas.push({ a: hi, b: md.xmax });
  const lineas = [lo, hi].filter(v => v != null).map(v => ({ x: v, etq: fx(v) }));
  lineas.push({ x: est, etq: `${simbolo} = ${fx(est)}`, est: true });
  const svg = dibujar({ lang, id: 0, ...md, zonas, lineas, leyenda: `Región de rechazo (α = ${Math.round(alfa * 10000) / 100}%)` });
  return [{ titulo: md.titulo, svg }];
}

/** Diagrama de dispersión con la recta de mínimos cuadrados (regresión lineal simple). */
function dibujarDispersion(o) {
  const py = o.lang === "python", sg = o.lang === "statgraphics", P = PALETAS[o.lang];
  const m = { l: py || sg ? 104 : 92, r: 26, t: 60, b: 68 };
  const pw = W - m.l - m.r, ph = H - m.t - m.b;
  const xv = [...o.x, ...(Number.isFinite(o.x0) ? [o.x0] : [])];
  const dx = (Math.max(...xv) - Math.min(...xv)) * 0.06 || 1;
  const xmin = Math.min(...xv) - dx, xmax = Math.max(...xv) + dx;
  const yv = [...o.y, o.b0 + o.b1 * xmin, o.b0 + o.b1 * xmax, ...(Number.isFinite(o.pred) ? [o.pred] : [])];
  const dy = (Math.max(...yv) - Math.min(...yv)) * 0.06 || 1;
  const ymin = Math.min(...yv) - dy, ymax = Math.max(...yv) + dy;
  const X = v => m.l + (v - xmin) / (xmax - xmin) * pw, Y = v => m.t + ph - (v - ymin) / (ymax - ymin) * ph;
  const f = n => n.toFixed(2);
  const tx = ticks(xmin, xmax), ty = ticks(ymin, ymax);
  const menos = v => (py ? String(v).replace("-", "−") : v);
  const dash = py ? "" : sg ? ' stroke-dasharray="1 3"' : ' stroke-dasharray="2 4"';
  const titulo = "Diagrama de dispersión y recta ajustada";
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${py ? "'DejaVu Sans', Verdana, Arial, sans-serif" : sg ? "Arial, Helvetica, sans-serif" : "Helvetica, Arial, sans-serif"}" role="img" aria-label="${esc(titulo)}">`;
  s += `<rect width="${W}" height="${H}" fill="${sg ? "#ece9d8" : "#ffffff"}"/>`;
  if (sg) s += `<rect x="1" y="1" width="${W - 2}" height="${H - 2}" fill="none" stroke="#808080" stroke-width="2"/><rect x="${m.l}" y="${m.t}" width="${pw}" height="${ph}" fill="#ffffff"/>`;
  for (const v of tx.vals) s += `<line x1="${f(X(v))}" y1="${m.t}" x2="${f(X(v))}" y2="${m.t + ph}" stroke="${P.grid}" stroke-width="1"${dash}/>`;
  for (const v of ty.vals) s += `<line x1="${m.l}" y1="${f(Y(v))}" x2="${m.l + pw}" y2="${f(Y(v))}" stroke="${P.grid}" stroke-width="1"${dash}/>`;
  s += `<g clip-path="url(#cd${o.lang})"><defs><clipPath id="cd${o.lang}"><rect x="${m.l}" y="${m.t}" width="${pw}" height="${ph}"/></clipPath></defs>`;
  s += `<line x1="${f(X(xmin))}" y1="${f(Y(o.b0 + o.b1 * xmin))}" x2="${f(X(xmax))}" y2="${f(Y(o.b0 + o.b1 * xmax))}" stroke="${P.critico}" stroke-width="3"/>`;
  o.x.forEach((v, i) => { s += `<circle cx="${f(X(v))}" cy="${f(Y(o.y[i]))}" r="5.5" fill="${P.curva}" fill-opacity="0.85" stroke="#fff" stroke-width="1"/>`; });
  if (Number.isFinite(o.x0) && Number.isFinite(o.pred)) s += `<rect x="${f(X(o.x0) - 7)}" y="${f(Y(o.pred) - 7)}" width="14" height="14" fill="#111" transform="rotate(45 ${f(X(o.x0))} ${f(Y(o.pred))})"/>`;
  s += `</g><rect x="${m.l}" y="${m.t}" width="${pw}" height="${ph}" fill="none" stroke="${P.ejes}" stroke-width="${py ? 1.4 : 1.6}"/>`;
  for (const v of tx.vals) {
    s += `<line x1="${f(X(v))}" y1="${m.t + ph}" x2="${f(X(v))}" y2="${m.t + ph + 7}" stroke="${P.ejes}" stroke-width="1.4"/><text x="${f(X(v))}" y="${m.t + ph + 29}" font-size="19" text-anchor="middle" fill="#111">${menos(v.toFixed(tx.dec))}</text>`;
  }
  for (const v of ty.vals) {
    s += `<line x1="${m.l - 7}" y1="${f(Y(v))}" x2="${m.l}" y2="${f(Y(v))}" stroke="${P.ejes}" stroke-width="1.4"/>`;
    s += py || sg ? `<text x="${m.l - 12}" y="${f(Y(v) + 5)}" font-size="19" text-anchor="end" fill="#111">${menos(v.toFixed(ty.dec))}</text>`
      : `<text transform="translate(${m.l - 14} ${f(Y(v))}) rotate(-90)" font-size="19" text-anchor="middle" fill="#111">${menos(v.toFixed(ty.dec))}</text>`;
  }
  s += `<text x="${m.l + pw / 2}" y="${py ? 38 : 40}" font-size="${py ? 24 : sg ? 21 : 25}" ${py ? "" : 'font-weight="bold"'} text-anchor="middle" fill="#111">${esc(titulo)}</text>`;
  s += `<text x="${m.l + pw / 2}" y="${H - 16}" font-size="20" text-anchor="middle" fill="#111">${esc(o.nombreX)}</text>`;
  s += `<text transform="translate(26 ${m.t + ph / 2}) rotate(-90)" font-size="20" text-anchor="middle" fill="#111">${esc(o.nombreY)}</text>`;
  const eq = `ŷ = ${fx(o.b0, 3)} ${o.b1 >= 0 ? "+" : "−"} ${fx(Math.abs(o.b1), 3)} x   (r = ${fx(o.r, 3)}, R² = ${fx(o.r2, 3)})`;
  s += `<rect x="${m.l + 10}" y="${m.t + 10}" width="${eq.length * 9.4 + 16}" height="30" rx="3" fill="#fff" fill-opacity="0.9" stroke="${P.critico}"/><text x="${m.l + 18}" y="${m.t + 31}" font-family="Arial, Helvetica, sans-serif" font-size="17" fill="#111">${esc(eq)}</text>`;
  return s + "</svg>";
}

function figurasMuestrales(spec, lang) {
  const { mu, sd, simbolo, consultas } = spec;
  const out = [];
  const lista = consultas.length ? consultas : [{ op: null }];
  lista.forEach((c, i) => {
    const pts = [mu - 4 * sd, mu + 4 * sd, c.a, c.b].filter(Number.isFinite);
    const xmin = Math.min(...pts) - (c.op ? 0.4 * sd : 0), xmax = Math.max(...pts) + (c.op ? 0.4 * sd : 0);
    const pdf = x => normalPdf(x, mu, sd);
    let zonas = [], lineas = [], titulo = `Distribución muestral de ${simbolo} ~ N(${fx(mu, 3)}; ${fx(sd, 4)})`, leyenda;
    if (c.op === "menor") { zonas = [{ a: xmin, b: c.a }]; lineas = [{ x: c.a, etq: String(c.a) }]; titulo = `${c.etq ? c.etq + " " : ""}P(${simbolo} < ${c.a})`; }
    if (c.op === "mayor") { zonas = [{ a: c.a, b: xmax }]; lineas = [{ x: c.a, etq: String(c.a) }]; titulo = `${c.etq ? c.etq + " " : ""}P(${simbolo} > ${c.a})`; }
    if (c.op === "entre") { zonas = [{ a: c.a, b: c.b }]; lineas = [{ x: c.a, etq: String(c.a) }, { x: c.b, etq: String(c.b) }]; titulo = `${c.etq ? c.etq + " " : ""}P(${c.a} < ${simbolo} < ${c.b})`; }
    if (c.op) leyenda = `P = ${fx(c.prob, 4)}`;
    out.push({ titulo, svg: dibujar({ lang, id: i, pdf, xmin, xmax, xlab: `Valores de ${simbolo}`, titulo, zonas, lineas, leyenda }) });
  });
  return out;
}

/* ---------- descarga ---------- */
export function descargarPNG(svg, nombre) {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  const img = new Image();
  img.onload = () => {
    const c = document.createElement("canvas");
    c.width = W * 2; c.height = H * 2;
    const g = c.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    c.toBlob(b => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b); a.download = nombre; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
  };
  img.src = url;
}

/* ---------- script equivalente (mismo estilo que tus scripts) ---------- */
const num = v => String(Math.round(v * 1e6) / 1e6);

export function codigo(spec, lang) {
  if (lang === "statgraphics") return codigoStatgraphics(spec);
  if (spec.familia === "muestral") return codigoMuestral(spec, lang);
  if (spec.familia === "dispersion") return codigoDispersion(spec, lang);
  if (spec.prueba) return codigoPrueba(spec, lang);
  const md = modelo(spec), P = PALETAS[lang];
  const { familia, gl, gl2, conf } = spec;
  const [lo, hi] = spec.lim;
  const pct = `${Math.round(conf * 10000) / 100}% de confianza`;
  if (lang === "python") {
    const crit = {
      z: `crit = stats.norm.ppf(1 - alpha_medio)\nli, ls = -crit, crit`,
      t: `gl = ${gl}\ncrit = stats.t.ppf(1 - alpha_medio, gl)\nli, ls = -crit, crit`,
      chi2: `gl = ${gl}\nli = stats.chi2.ppf(alpha_medio, gl)\nls = stats.chi2.ppf(1 - alpha_medio, gl)`,
      f: `gl1, gl2 = ${gl}, ${gl2}\nli = stats.f.ppf(alpha_medio, gl1, gl2)\nls = stats.f.ppf(1 - alpha_medio, gl1, gl2)`
    }[familia];
    const pdf = { z: "stats.norm.pdf(x)", t: "stats.t.pdf(x, gl)", chi2: "stats.chi2.pdf(x, gl)", f: "stats.f.pdf(x, gl1, gl2)" }[familia];
    return `import numpy as np
import matplotlib.pyplot as plt
from scipy import stats

confianza = ${conf}
alpha = 1 - confianza
alpha_medio = alpha / 2

${crit}
print("Valores críticos:", round(li, 4), round(ls, 4))

x = np.linspace(${num(md.xmin)}, ${num(md.xmax)}, 1000)
y = ${pdf}

plt.figure(figsize=(10, 6))
plt.plot(x, y, color="blue", linewidth=3)

x_central = np.linspace(li, ls, 500)
y_central = ${pdf.replace("(x", "(x_central")}
plt.fill_between(x_central, y_central, color="lightblue", alpha=0.8,
                 label="${pct}")

plt.axvline(li, color="red", linestyle="--", linewidth=2)
plt.axvline(ls, color="red", linestyle="--", linewidth=2)
plt.text(li, 0.02, f"{li:.4f}", color="red", ha="right")
plt.text(ls, 0.02, f"{ls:.4f}", color="red", ha="left")

plt.title("${md.titulo}")
plt.xlabel("${md.xlab}")
plt.ylabel("Densidad")
plt.grid(True)
plt.legend()
plt.savefig("grafica.png", dpi=150, bbox_inches="tight")
plt.show()
`;
  }
  const crit = {
    z: `crit <- qnorm(1 - alpha_medio)\nli <- -crit; ls <- crit`,
    t: `gl <- ${gl}\ncrit <- qt(1 - alpha_medio, df = gl)\nli <- -crit; ls <- crit`,
    chi2: `gl <- ${gl}\nli <- qchisq(alpha_medio, df = gl)\nls <- qchisq(1 - alpha_medio, df = gl)`,
    f: `gl1 <- ${gl}; gl2 <- ${gl2}\nli <- qf(alpha_medio, gl1, gl2)\nls <- qf(1 - alpha_medio, gl1, gl2)`
  }[familia];
  const pdf = { z: "dnorm(x)", t: "dt(x, df = gl)", chi2: "dchisq(x, df = gl)", f: "df(x, df1 = gl1, df2 = gl2)" }[familia];
  return `confianza <- ${conf}
alpha <- 1 - confianza
alpha_medio <- alpha / 2

${crit}
cat("Valores críticos:", round(li, 4), round(ls, 4), "\\n")

x <- seq(${num(md.xmin)}, ${num(md.xmax)}, length.out = 1000)
y <- ${pdf}

plot(x, y, type = "l", col = "${P.curva}", lwd = 3,
     main = "${md.titulo}",
     xlab = "${md.xlab}", ylab = "Densidad")
grid()

x_central <- seq(li, ls, length.out = 500)
y_central <- ${pdf.replace("(x", "(x_central")}
polygon(c(x_central, rev(x_central)), c(y_central, rep(0, length(y_central))),
        col = adjustcolor("${P.zona}", alpha.f = ${P.zonaOp}), border = NA)

abline(v = c(li, ls), col = "${P.critico}", lty = 2, lwd = 2)
text(c(li, ls), max(y) * 0.95, labels = round(c(li, ls), 4), col = "${P.critico}", pos = c(2, 4), font = 2)
`;
}

/** Script de una prueba de hipótesis: valores críticos, regiones de rechazo y estadístico calculado. */
function codigoPrueba(spec, lang) {
  const md = modelo(spec), P = PALETAS[lang];
  const { familia, gl, gl2 } = spec, { cola, est, alfa, simbolo } = spec.prueba;
  const py = lang === "python";
  const simetrica = familia === "z" || familia === "t";
  const cuant = p => (py
    ? { z: `stats.norm.ppf(${p})`, t: `stats.t.ppf(${p}, gl)`, chi2: `stats.chi2.ppf(${p}, gl)`, f: `stats.f.ppf(${p}, gl1, gl2)` }[familia]
    : { z: `qnorm(${p})`, t: `qt(${p}, df = gl)`, chi2: `qchisq(${p}, df = gl)`, f: `qf(${p}, gl1, gl2)` }[familia]);
  const gls = py
    ? (familia === "z" ? "" : familia === "f" ? `gl1, gl2 = ${gl}, ${gl2}\n` : `gl = ${gl}\n`)
    : (familia === "z" ? "" : familia === "f" ? `gl1 <- ${gl}; gl2 <- ${gl2}\n` : `gl <- ${gl}\n`);
  const A = cola === "dos" ? "alpha / 2" : "alpha";
  const crit = cola === "der" ? { hi: cuant(`1 - ${A}`) } : cola === "izq" ? { lo: cuant(A) } : simetrica ? { hi: cuant(`1 - ${A}`), lo: `-hi` } : { lo: cuant(A), hi: cuant(`1 - ${A}`) };
  const pdfE = py
    ? { z: "stats.norm.pdf(x)", t: "stats.t.pdf(x, gl)", chi2: "stats.chi2.pdf(x, gl)", f: "stats.f.pdf(x, gl1, gl2)" }[familia]
    : { z: "dnorm(x)", t: "dt(x, df = gl)", chi2: "dchisq(x, df = gl)", f: "df(x, df1 = gl1, df2 = gl2)" }[familia];
  const xmin = num(md.xmin), xmax = num(md.xmax);
  if (py) {
    return `import numpy as np
import matplotlib.pyplot as plt
from scipy import stats

alpha = ${alfa}
est = ${num(est)}   # ${simbolo} calculado
${gls}
${crit.hi ? `hi = ${crit.hi}\n` : "hi = None\n"}${crit.lo ? `lo = ${crit.lo}\n` : "lo = None\n"}print("Valores críticos:", lo, hi)
rechaza = (lo is not None and est <= lo) or (hi is not None and est >= hi)
print("Se rechaza H0" if rechaza else "No se rechaza H0")

pdf = lambda x: ${pdfE}
x = np.linspace(${xmin}, ${xmax}, 1000)

plt.figure(figsize=(10, 6))
plt.plot(x, pdf(x), color="blue", linewidth=3)
if lo is not None:
    xl = np.linspace(${xmin}, lo, 300)
    plt.fill_between(xl, pdf(xl), color="lightblue", alpha=0.8, label=f"Región de rechazo (α = {alpha})")
    plt.axvline(lo, color="red", linestyle="--", linewidth=2)
if hi is not None:
    xh = np.linspace(hi, ${xmax}, 300)
    plt.fill_between(xh, pdf(xh), color="lightblue", alpha=0.8, label=None if lo is not None else f"Región de rechazo (α = {alpha})")
    plt.axvline(hi, color="red", linestyle="--", linewidth=2)
plt.axvline(est, color="black", linewidth=2.5, label=f"${simbolo} = {est:.4f}")

plt.title("${md.titulo}")
plt.xlabel("${md.xlab}")
plt.ylabel("Densidad")
plt.grid(True)
plt.legend()
plt.savefig("grafica.png", dpi=150, bbox_inches="tight")
plt.show()
`;
  }
  return `alpha <- ${alfa}
est <- ${num(est)}   # ${simbolo} calculado
${gls}
${crit.hi ? `hi <- ${crit.hi}\n` : "hi <- NA\n"}${crit.lo ? `lo <- ${crit.lo}\n` : "lo <- NA\n"}cat("Valores críticos:", lo, hi, "\\n")
rechaza <- (!is.na(lo) && est <= lo) || (!is.na(hi) && est >= hi)
cat(if (rechaza) "Se rechaza H0" else "No se rechaza H0", "\\n")

x <- seq(${xmin}, ${xmax}, length.out = 1000)
y <- ${pdfE}
plot(x, y, type = "l", col = "${P.curva}", lwd = 3,
     main = "${md.titulo}",
     xlab = "${md.xlab}", ylab = "Densidad")
grid()

zona <- function(a, b) {
  xz <- seq(a, b, length.out = 300)
  yz <- with(list(x = xz), ${pdfE})
  polygon(c(xz, rev(xz)), c(yz, rep(0, length(yz))), col = adjustcolor("${P.zona}", alpha.f = ${P.zonaOp}), border = NA)
}
if (!is.na(lo)) zona(${xmin}, lo)
if (!is.na(hi)) zona(hi, ${xmax})
abline(v = c(lo, hi), col = "${P.critico}", lty = 2, lwd = 2)
abline(v = est, col = "black", lwd = 3)
`;
}

/** Script de regresión lineal simple: ajuste, ANOVA/coeficientes y diagrama de dispersión con la recta. */
function codigoDispersion(spec, lang) {
  const { x, y, nombreX, nombreY, x0 } = spec, P = PALETAS[lang];
  if (lang === "python") {
    return `import numpy as np
import matplotlib.pyplot as plt
from scipy import stats

x = np.array([${x.map(num).join(", ")}])
y = np.array([${y.map(num).join(", ")}])

res = stats.linregress(x, y)
print("Pendiente b1 =", round(res.slope, 4), "  Intercepto b0 =", round(res.intercept, 4))
print("r =", round(res.rvalue, 4), "  R^2 =", round(res.rvalue ** 2, 4))
print("Valor P de la pendiente =", res.pvalue)
${Number.isFinite(x0) ? `print("Predicción para x = ${num(x0)}:", round(res.intercept + res.slope * ${num(x0)}, 4))\n` : ""}
plt.figure(figsize=(10, 6))
plt.scatter(x, y, color="blue", s=50)
xs = np.linspace(x.min(), x.max(), 200)
plt.plot(xs, res.intercept + res.slope * xs, color="red", linewidth=3,
         label=f"y = {res.intercept:.3f} + {res.slope:.3f} x  (R² = {res.rvalue ** 2:.3f})")
plt.title("Diagrama de dispersión y recta ajustada")
plt.xlabel("${nombreX}")
plt.ylabel("${nombreY}")
plt.grid(True)
plt.legend()
plt.savefig("regresion.png", dpi=150, bbox_inches="tight")
plt.show()
`;
  }
  return `x <- c(${x.map(num).join(", ")})
y <- c(${y.map(num).join(", ")})

modelo <- lm(y ~ x)
print(summary(modelo))      # coeficientes, t, valor P, R^2 y F
print(anova(modelo))        # tabla ANOVA
cat("r =", round(cor(x, y), 4), "\\n")
${Number.isFinite(x0) ? `cat("Predicción para x = ${num(x0)}:", predict(modelo, data.frame(x = ${num(x0)})), "\\n")\n` : ""}
plot(x, y, pch = 19, col = "${P.curva}",
     main = "Diagrama de dispersión y recta ajustada",
     xlab = "${nombreX}", ylab = "${nombreY}")
grid()
abline(modelo, col = "${P.critico}", lwd = 3)
`;
}

function codigoMuestral(spec, lang) {
  const { mu, sd, simbolo, consultas } = spec;
  const bloques = (consultas.length ? consultas : []).map((c, i) => {
    const pts = [mu - 4 * sd, mu + 4 * sd, c.a, c.b].filter(Number.isFinite);
    const xmin = Math.min(...pts) - 0.4 * sd, xmax = Math.max(...pts) + 0.4 * sd;
    const tit = `${c.etq ? c.etq + " " : ""}${c.op === "entre" ? `P(${c.a} < ${simbolo} < ${c.b})` : `P(${simbolo} ${c.op === "menor" ? "<" : ">"} ${c.a})`}`;
    if (lang === "python") {
      const reg = c.op === "menor" ? `x_zona = np.linspace(${num(xmin)}, ${num(c.a)}, 400)` : c.op === "mayor" ? `x_zona = np.linspace(${num(c.a)}, ${num(xmax)}, 400)` : `x_zona = np.linspace(${num(c.a)}, ${num(c.b)}, 400)`;
      const p = c.op === "menor" ? `stats.norm.cdf(${num(c.a)}, mu, sd)` : c.op === "mayor" ? `1 - stats.norm.cdf(${num(c.a)}, mu, sd)` : `stats.norm.cdf(${num(c.b)}, mu, sd) - stats.norm.cdf(${num(c.a)}, mu, sd)`;
      return `# ${tit}
prob = ${p}
print("${tit} =", round(prob, 4))
x = np.linspace(${num(xmin)}, ${num(xmax)}, 1000)
plt.figure(figsize=(10, 6))
plt.plot(x, stats.norm.pdf(x, mu, sd), color="blue", linewidth=3)
${reg}
plt.fill_between(x_zona, stats.norm.pdf(x_zona, mu, sd), color="lightblue", alpha=0.8, label=f"P = {prob:.4f}")
${[c.a, c.b].filter(Number.isFinite).map(v => `plt.axvline(${num(v)}, color="red", linestyle="--", linewidth=2)`).join("\n")}
plt.title("${tit}")
plt.xlabel("Valores de ${simbolo}")
plt.ylabel("Densidad")
plt.grid(True)
plt.legend()
plt.show()
`;
    }
    const lo = c.op === "menor" ? num(xmin) : num(c.a), hi = c.op === "mayor" ? num(xmax) : num(c.op === "menor" ? c.a : c.b);
    const p = c.op === "menor" ? `pnorm(${num(c.a)}, mu, sd)` : c.op === "mayor" ? `1 - pnorm(${num(c.a)}, mu, sd)` : `pnorm(${num(c.b)}, mu, sd) - pnorm(${num(c.a)}, mu, sd)`;
    return `# ${tit}
prob <- ${p}
cat("${tit} =", round(prob, 4), "\\n")
x <- seq(${num(xmin)}, ${num(xmax)}, length.out = 1000)
plot(x, dnorm(x, mu, sd), type = "l", col = "#0f766e", lwd = 3, main = "${tit}", xlab = "Valores de ${simbolo}", ylab = "Densidad")
grid()
xz <- seq(${lo}, ${hi}, length.out = 400)
polygon(c(xz, rev(xz)), c(dnorm(xz, mu, sd), rep(0, length(xz))), col = adjustcolor("#2dd4bf", alpha.f = 0.35), border = NA)
abline(v = c(${[c.a, c.b].filter(Number.isFinite).map(num).join(", ")}), col = "#c2410c", lty = 2, lwd = 2)
`;
  });
  const cab = lang === "python"
    ? `import numpy as np\nimport matplotlib.pyplot as plt\nfrom scipy import stats\n\nmu = ${num(mu)}\nsd = ${num(sd)}   # error estándar\n\n`
    : `mu <- ${num(mu)}\nsd <- ${num(sd)}   # error estándar\n\n`;
  return cab + (bloques.length ? bloques.join("\n") : "# Agrega una probabilidad por calcular para generar la gráfica.\n");
}

/* Statgraphics es de menús, no de scripts: en lugar de código se da la ruta para reproducir la gráfica. */
function codigoStatgraphics(spec) {
  if (spec.familia === "muestral") {
    return `1. Describir > Distribuciones de Probabilidad > Distribuciones de Probabilidad
2. Distribución: Normal. Media = ${num(spec.mu)}; Desv. típica = ${num(spec.sd)} (error estándar)
3. Opciones de Tabla: marca "Cola inferior / superior" y escribe los valores de ${spec.simbolo}
4. Opciones Gráficas: "Función de Densidad" con sombreado del área pedida
`;
  }
  if (spec.familia === "dispersion") {
    return `1. Relacionar > Un Factor > Regresión Simple
2. Y (variable dependiente): ${spec.nombreY};  X (variable independiente): ${spec.nombreX}
3. Resultados: Modelo ajustado y = ${num(spec.b0)} ${spec.b1 >= 0 ? "+" : "−"} ${num(Math.abs(spec.b1))} x;  r = ${num(spec.r)};  R² = ${num(spec.r2)}
4. Opciones Gráficas: "Gráfico del Modelo Ajustado" (dispersión con la recta)
5. Tablas: "Análisis de Varianza" y "Coeficientes" (t y valor P de b₀ y b₁)
${Number.isFinite(spec.x0) ? `6. Pronósticos: x = ${num(spec.x0)} → ŷ = ${num(spec.pred)}\n` : ""}`;
  }
  if (spec.prueba) {
    const { id, cola, lo, hi, est, simbolo, alfa } = spec.prueba;
    const alt = { dos: "≠ (no igual)", der: "> (mayor que)", izq: "< (menor que)" }[cola];
    const menu = {
      ph_dif_medias: "Comparar > Dos Muestras > Comparación de Dos Muestras > Opciones de Análisis (Hipótesis nula = diferencia hipotética)",
      ph_varianza: "Describir > Datos Numéricos > Análisis de Una Variable > Pruebas de Hipótesis > Desviación Estándar (Hipótesis nula = σ₀)",
      ph_cociente: "Comparar > Dos Muestras > Comparación de Dos Muestras > Comparación de Desviaciones Estándar (razón = 1)",
      ph_correlacion: "Relacionar > Un Factor > Regresión Simple > Tabla de Correlación"
    }[id] ?? "Describir > Distribuciones de Probabilidad > Distribuciones de Probabilidad";
    const crits = [lo, hi].filter(v => v != null).map(num).join(" y ");
    return `1. ${menu}
2. Hipótesis alternativa: ${alt};  nivel de significancia α = ${num(alfa)}
3. Distribución del estadístico: ${{ z: "Normal estándar", t: `t de Student (gl = ${spec.gl})`, chi2: `Chi-cuadrado (gl = ${spec.gl})`, f: `F (gl1 = ${spec.gl}, gl2 = ${spec.gl2})` }[spec.familia]}
4. Opciones de Tabla: "Valores Críticos" → ${crits};  estadístico calculado ${simbolo} = ${num(est)}
5. Opciones Gráficas: "Función de Densidad" con sombreado de la región de rechazo
`;
  }
  const nombre = { z: "Normal (media 0, desv. 1)", t: `t de Student (gl = ${spec.gl})`, chi2: `Chi-cuadrado (gl = ${spec.gl})`, f: `F (gl1 = ${spec.gl}, gl2 = ${spec.gl2})` }[spec.familia];
  const [lo, hi] = spec.lim;
  return `1. Describir > Distribuciones de Probabilidad > Distribuciones de Probabilidad
2. Distribución: ${nombre}
3. Opciones de Tabla: "Valores Críticos" con probabilidades ${num((1 - spec.conf) / 2)} y ${num(1 - (1 - spec.conf) / 2)}
4. Opciones Gráficas: "Función de Densidad" con sombreado central
5. Valores críticos obtenidos: ${num(lo)} y ${num(hi)}
`;
}
