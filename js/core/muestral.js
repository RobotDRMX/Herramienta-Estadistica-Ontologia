// Distribuciones muestrales (probabilidades). Todas se reducen a una normal:
//   media            x̄        ~ N(μ, σ/√n)
//   proporción       p̂        ~ N(p, √(p(1−p)/n))
//   dif. de medias   x̄₁−x̄₂   ~ N(μ₁−μ₂, √(σ₁²/n₁ + σ₂²/n₂))
//   dif. de prop.    p̂₁−p̂₂   ~ N(p₁−p₂, √(p₁q₁/n₁ + p₂q₂/n₂))
// Interpreta el enunciado (parámetros + consultas «menor que», «mayor que», «entre») y calcula.

import { normalizar, tokenizar } from "./texto.js";
import { interpretar as interpretarIC } from "./roles.js";
import { normalCdf } from "./dist.js";

export const TIPOS_DM = {
  dm_media: "Distribución muestral de la media (probabilidad)",
  dm_proporcion: "Distribución muestral de la proporción (probabilidad)",
  dm_dif_medias: "Distribución muestral de la diferencia de medias (probabilidad)",
  dm_dif_proporciones: "Distribución muestral de la diferencia de proporciones (probabilidad)"
};

/** ¿El enunciado pide una probabilidad en lugar de un intervalo? */
export function esMuestral(texto) {
  const n = normalizar(texto);
  return /probabilidad|(?<![a-z])p\s*\(/.test(n) && !/intervalo de confianza|intervalo del|intervalo de \d/.test(n);
}

const NUM = "(\\d+(?:[.,]\\d+)?)";
const aNum = s => parseFloat(String(s).replace(",", "."));
const MENOR = "(?:menor(?:es)?|inferior|debajo|menos|a lo sumo|como maximo|no (?:exceda|supere))";
const MAYOR = "(?:mayor(?:es)?|exceda|excede|excedan|exceder|supere|supera|superior|encima|mas|por lo menos|al menos|minimo)";
const MENOS_SIGNO = "[-−–]";

/** Extrae una consulta de un trozo de texto normalizado (off = posición del trozo en el texto completo). */
function consultaDe(parte, off = 0) {
  const rango = m => [off + m.index, off + m.index + m[0].length];
  let m = parte.match(new RegExp(`entre\\s+${NUM}\\s*(%)?\\s*y\\s+${NUM}\\s*(%)?`)) ??
          parte.match(new RegExp(`${NUM}\\s*(%)?\\s*<\\s*[a-z_]*\\s*<\\s*${NUM}\\s*(%)?`));
  if (m) return { op: "entre", a: aNum(m[1]), b: aNum(m[3]), pct: Boolean(m[2] || m[4]), rango: rango(m) };

  const cand = [];
  let x = parte.match(new RegExp(`${MENOR}\\D{0,25}?${NUM}\\s*(%)?`)) ?? parte.match(new RegExp(`<\\s*${NUM}\\s*(%)?`));
  if (x) cand.push({ op: "menor", a: aNum(x[1]), pct: Boolean(x[2]), pos: x.index, rango: rango(x) });
  x = parte.match(new RegExp(`${MAYOR}\\D{0,25}?${NUM}\\s*(%)?`)) ?? parte.match(new RegExp(`>\\s*${NUM}\\s*(%)?`));
  if (x) cand.push({ op: "mayor", a: aNum(x[1]), pct: Boolean(x[2]), pos: x.index, rango: rango(x) });
  // «al menos de un año más que…»: el valor es una palabra
  x = parte.match(/(?:al menos|por lo menos)\s+(?:de\s+)?(?:un|una|uno)\b/);
  if (x) cand.push({ op: "mayor", a: 1, pct: false, pos: x.index, rango: rango(x) });
  if (cand.length) { const c = cand.sort((p, q) => p.pos - q.pos)[0]; delete c.pos; return c; }

  // «tan grande o más de lo que aquí se anota»: el valor sale de los datos observados
  x = parte.match(/tan grande o (?:mas|mayor)|o mas de lo que/);
  if (x) return { op: "mayor", derivada: true, rango: rango(x) };
  return null;
}

const enBlanco = (txt, rangos) => {
  let t = txt;
  for (const [a, b] of rangos) t = t.slice(0, a) + " ".repeat(b - a) + t.slice(b);
  return t;
};

/** Los trozos del enunciado donde buscar consultas: uno por inciso (a), (b)… o el texto completo. */
function trozos(n) {
  const marcas = [...n.matchAll(/\(\s*([a-d])\s*\)/g)];
  if (!marcas.length) return [{ etq: "", ini: 0, txt: n }];
  return marcas.map((m, i) => {
    const ini = m.index + m[0].length, fin = i + 1 < marcas.length ? marcas[i + 1].index : n.length;
    return { etq: `(${m[1]})`, ini, txt: n.slice(ini, fin) };
  });
}

const PROP_PALABRAS = /proporcion|porcentaje|p\s*barra|fuman|fumador|defectuos|desempleo|efectiv|textiles/;
const MEDIA_PALABRAS = /media|promedio|duracion|\bx\s*barra|x_/;
const DOS_GRUPOS = /diferencia|p\s*barra\s*a|x\s*barra\s*a|x_\s*a\s*[-−–]|(?<![a-z])p_?a\s*[-−–]\s*p_?b|otra muestra|muestra aleatoria (?:simple )?independiente|mientras que|dos experimentos|dos muestras|\bvs\b/;

function detectarTipoDM(n) {
  const dos = DOS_GRUPOS.test(n);
  const hayPct = /\d\s*(?:%|por ciento)/.test(n);
  const prop = !MEDIA_PALABRAS.test(n) && (/proporcion|porcentaje|p\s*barra/.test(n) || (hayPct && PROP_PALABRAS.test(n)) || PROP_PALABRAS.test(n));
  if (dos) return prop ? "dm_dif_proporciones" : "dm_dif_medias";
  return prop ? "dm_proporcion" : "dm_media";
}

/* ---------------- interpretación ---------------- */
export function interpretarMuestral(textoOriginal, forzarTipo = null) {
  const original = textoOriginal;
  const n = normalizar(original);
  const notas = [];
  const tipo = forzarTipo ?? detectarTipoDM(n);

  // consultas (y los trozos de texto que las contienen, para no confundirlas con datos)
  const consultas = [], rangos = [];
  for (const t of trozos(n)) {
    const c = consultaDe(t.txt, t.ini);
    if (c) { consultas.push({ etq: t.etq, ...c }); rangos.push(c.rango); }
  }
  const sinConsulta = enBlanco(original, rangos);
  const nSin = normalizar(sinConsulta);

  const datos = {};
  let evidencias = [];

  if (tipo === "dm_media") {
    const base = interpretarIC(sinConsulta, "ic_media");
    evidencias = base.evidencias.filter(e => e.simbolo !== "confianza");
    const mu = base.datos.xbar, sigma = base.datos.sigma ?? base.datos.s;
    if (mu !== undefined) datos.mu = mu;
    if (sigma !== undefined) datos.sigma = sigma;
    if (base.datos.n !== undefined) datos.n = base.datos.n;
    evidencias.forEach(e => { if (e.simbolo === "xbar") e.simbolo = "mu"; if (e.simbolo === "s") e.simbolo = "sigma"; });
  } else if (tipo === "dm_proporcion") {
    const base = interpretarIC(sinConsulta, "ic_proporcion");
    evidencias = base.evidencias.filter(e => e.simbolo !== "confianza" && e.simbolo !== "x");
    const m = nSin.match(/(\d+(?:[.,]\d+)?)\s*(?:%|por ciento)/);
    if (m) datos.p = aNum(m[1]) / 100; else if (base.datos.p !== undefined) datos.p = base.datos.p;
    else { const d = nSin.match(/(?:proporcion|probabilidad|fraccion)[^.]{0,40}?\b(0[.,]\d+)/); if (d) datos.p = aNum(d[1]); }
    if (base.datos.n !== undefined) datos.n = base.datos.n;
  } else if (tipo === "dm_dif_medias") {
    const base = interpretarIC(sinConsulta, "ic_dif_medias");
    const d = base.datos;
    if (d.x1 !== undefined) datos.mu1 = d.x1;
    if (d.x2 !== undefined) datos.mu2 = d.x2;
    const sg1 = d.sigma1 ?? d.s1, sg2 = d.sigma2 ?? d.s2;
    if (sg1 !== undefined) datos.sigma1 = sg1;
    if (sg2 !== undefined) datos.sigma2 = sg2;
    if (d.n1 !== undefined) datos.n1 = d.n1;
    if (d.n2 !== undefined) datos.n2 = d.n2;
    // «n_A = n_B = 18»
    const iguales = nSin.match(/n_?\w?\s*=\s*n_?\w?\s*=\s*(\d+)/);
    if (iguales) { datos.n1 = datos.n1 ?? Number(iguales[1]); datos.n2 = datos.n2 ?? Number(iguales[1]); }
    if (datos.n1 !== undefined && datos.n2 === undefined && /ambas|las dos|los dos|cada una/.test(nSin)) datos.n2 = datos.n1;
    // una sola desviación «en ambas»
    if (datos.sigma1 !== undefined && datos.sigma2 === undefined && /ambas|las dos|los dos/.test(nSin)) { datos.sigma2 = datos.sigma1; notas.push("La desviación estándar se aplicó a las dos poblaciones («en ambas»)."); }
    // medias iguales sin valor: la diferencia esperada es 0
    if (datos.mu1 === undefined && datos.mu2 === undefined && /\bigual(?:es)?\b|iguales/.test(nSin)) { datos.mu1 = 0; datos.mu2 = 0; notas.push("«El tiempo medio es igual para los dos»: μ₁ = μ₂, así que μ₁ − μ₂ = 0."); }
    evidencias = base.evidencias.filter(e => e.simbolo !== "confianza").map(e => ({ ...e, simbolo: ({ x1: "mu1", x2: "mu2", s1: "sigma1", s2: "sigma2" })[e.simbolo] ?? e.simbolo }));
  } else if (tipo === "dm_dif_proporciones") {
    const toks = tokenizar(nSin).filter(t => !t.palabra);
    const props = toks.filter(t => t.pct || (!t.entero && t.valor > 0 && t.valor < 1));
    const enteros = toks.filter(t => t.entero && !t.pct && t.valor >= 2 && !props.includes(t));
    if (props.length >= 2) {
      datos.p1 = props[0].pct ? props[0].valor / 100 : props[0].valor;
      datos.p2 = props[1].pct ? props[1].valor / 100 : props[1].valor;
      if (enteros.length >= 2) { datos.n1 = enteros[0].valor; datos.n2 = enteros[1].valor; }
    } else if (props.length === 1) {
      // «la proporción es 0,70» para ambas poblaciones; las muestras traen x y n
      const p = props[0].pct ? props[0].valor / 100 : props[0].valor;
      datos.p1 = datos.p2 = p;
      notas.push(`Se supone p₁ = p₂ = ${p} (las dos drogas son igualmente efectivas).`);
      const base = interpretarIC(sinConsulta, "ic_dif_proporciones");
      const d = base.datos;
      if (d.n1 !== undefined && d.n2 !== undefined && d.x1 !== undefined && d.x2 !== undefined) {
        datos.n1 = d.n1; datos.n2 = d.n2;
        const obs = d.x1 / d.n1 - d.x2 / d.n2;
        notas.push(`Diferencia observada: ${d.x1}/${d.n1} − ${d.x2}/${d.n2} = ${Math.round(obs * 10000) / 10000}.`);
        for (const c of consultas) if (c.derivada) { c.a = Math.round(obs * 1e6) / 1e6; delete c.derivada; }
      }
    }
    evidencias = [];
  }

  // consultas sin valor (derivada que no se pudo calcular) se descartan
  for (let i = consultas.length - 1; i >= 0; i--) { if (consultas[i].derivada) consultas.splice(i, 1); }
  const esProp = tipo.includes("proporcion");
  for (const c of consultas) {
    delete c.rango;
    if (!esProp) continue;
    for (const k of ["a", "b"]) {
      if (c[k] === undefined) continue;
      if (c.pct) c[k] = c[k] / 100;
      else if (c[k] > 1 && tipo === "dm_proporcion" && datos.n) { notas.push(`En ${c.etq || "la consulta"}, ${c[k]} se tomó como número de casos: p̂ = ${c[k]}/${datos.n} (sin corrección por continuidad).`); c[k] = c[k] / datos.n; }
    }
    delete c.pct;
  }
  if (!consultas.length) notas.push("No encontré ninguna probabilidad por calcular («menor que», «mayor que», «entre»). Agrega una consulta abajo.");

  const opciones = { normal: /normal|normalmente/.test(n) };
  return { tipo, soportado: true, datos, consultas, evidencias, notas, faltantes: faltantesDM(tipo, datos), opciones, texto: original };
}

export const REQUERIDOS_DM = {
  dm_media: ["mu", "sigma", "n"],
  dm_proporcion: ["p", "n"],
  dm_dif_medias: ["mu1", "mu2", "sigma1", "sigma2", "n1", "n2"],
  dm_dif_proporciones: ["p1", "p2", "n1", "n2"]
};
export const faltantesDM = (tipo, d) => REQUERIDOS_DM[tipo].filter(k => d[k] === undefined || Number.isNaN(d[k]));

/* ---------------- cálculo ---------------- */
const f = (x, d = 4) => String(Math.round((x + Number.EPSILON) * 10 ** d) / 10 ** d).replace(".", "{,}");
const prob = p => (p > 0.99995 ? "\\approx 1" : p < 0.00005 ? "\\approx 0" : `= ${f(p, 4)}`);
const probTxt = p => (p > 0.99995 ? "≈ 1" : p < 0.00005 ? "≈ 0" : `= ${(Math.round(p * 10000) / 10000)}`);

const MODELOS = {
  dm_media: { v: "\\bar{X}", vt: "x̄", tema: "x̄", tabla: "C.1" },
  dm_proporcion: { v: "\\hat{p}", vt: "p̂", tabla: "C.2" },
  dm_dif_medias: { v: "\\bar{X}_1-\\bar{X}_2", vt: "x̄₁ − x̄₂", tabla: "C.3" },
  dm_dif_proporciones: { v: "\\hat{p}_1-\\hat{p}_2", vt: "p̂₁ − p̂₂", tabla: "C.4" }
};

export function resolverMuestral(tipo, d, opciones = {}, consultas = []) {
  const faltan = faltantesDM(tipo, d);
  if (faltan.length) throw new Error(`Faltan datos: ${faltan.join(", ")}`);
  const M = MODELOS[tipo], v = M.v;
  const pasos = [], advertencias = [];
  let centro, ee, formula, supuestos;

  if (tipo === "dm_media") {
    const { n } = d; ee = d.sigma / Math.sqrt(n); centro = d.mu;
    pasos.push({ titulo: "Datos", lineas: [`\\mu = ${f(d.mu)},\\quad \\sigma = ${f(d.sigma)},\\quad n = ${n}`] });
    const ok = n >= 30 || opciones.normal;
    pasos.push({ titulo: "Verificar el modelo", lineas: [], texto: ok ? (n >= 30 ? "n ≥ 30: por el teorema del límite central x̄ es aproximadamente normal." : "La población es normal: x̄ es normal para cualquier n.") : "⚠ n < 30 y no se dice que la población sea normal: con estos datos no se puede asegurar que x̄ sea normal." });
    if (!ok) advertencias.push("n < 30 sin población normal: la probabilidad calculada no está garantizada.");
    pasos.push({ titulo: "Distribución de la media muestral", lineas: [`\\mu_{\\bar{X}} = \\mu = ${f(d.mu)}`, `\\sigma_{\\bar{X}} = \\dfrac{\\sigma}{\\sqrt{n}} = \\dfrac{${f(d.sigma)}}{\\sqrt{${n}}} = ${f(ee, 5)}`, `\\bar{X} \\sim N(${f(centro)},\\ ${f(ee, 5)})`] });
    formula = "Z = \\dfrac{\\bar{X}-\\mu}{\\sigma/\\sqrt{n}}"; supuestos = ["Población normal, o n ≥ 30"];
  } else if (tipo === "dm_proporcion") {
    const { n } = d; ee = Math.sqrt(d.p * (1 - d.p) / n); centro = d.p;
    pasos.push({ titulo: "Datos", lineas: [`p = ${f(d.p)},\\quad n = ${n}`] });
    const ok = n * d.p >= 5 && n * (1 - d.p) >= 5;
    pasos.push({ titulo: "Verificar el modelo", lineas: [`np = ${f(n * d.p, 3)},\\quad n(1-p) = ${f(n * (1 - d.p), 3)}`], texto: ok ? "np ≥ 5 y n(1−p) ≥ 5: p̂ es aproximadamente normal." : "⚠ No se cumplen np ≥ 5 y n(1−p) ≥ 5: la aproximación normal no es fiable." });
    if (!ok) advertencias.push("No se cumple np ≥ 5 y n(1−p) ≥ 5.");
    pasos.push({ titulo: "Distribución de la proporción muestral", lineas: [`\\mu_{\\hat{p}} = p = ${f(d.p)}`, `\\sigma_{\\hat{p}} = \\sqrt{\\dfrac{p(1-p)}{n}} = \\sqrt{\\dfrac{${f(d.p)}\\cdot ${f(1 - d.p)}}{${n}}} = ${f(ee, 5)}`, `\\hat{p} \\sim N(${f(centro)},\\ ${f(ee, 5)})`] });
    formula = "Z = \\dfrac{\\hat{p}-p}{\\sqrt{p(1-p)/n}}"; supuestos = ["np ≥ 5 y n(1−p) ≥ 5"];
  } else if (tipo === "dm_dif_medias") {
    centro = d.mu1 - d.mu2; ee = Math.sqrt(d.sigma1 ** 2 / d.n1 + d.sigma2 ** 2 / d.n2);
    pasos.push({ titulo: "Datos", lineas: [`\\mu_1 = ${f(d.mu1)},\\ \\sigma_1 = ${f(d.sigma1)},\\ n_1 = ${d.n1}`, `\\mu_2 = ${f(d.mu2)},\\ \\sigma_2 = ${f(d.sigma2)},\\ n_2 = ${d.n2}`] });
    const ok = (d.n1 >= 30 && d.n2 >= 30) || opciones.normal;
    pasos.push({ titulo: "Verificar el modelo", lineas: [], texto: ok ? "Muestras independientes y poblaciones normales (o n₁, n₂ ≥ 30): la diferencia de medias es normal." : "⚠ Alguna muestra es pequeña y no se dice que las poblaciones sean normales." });
    if (!ok) advertencias.push("Muestras pequeñas sin poblaciones normales.");
    pasos.push({ titulo: "Distribución de la diferencia de medias", lineas: [
      `\\mu_{\\bar{X}_1-\\bar{X}_2} = \\mu_1-\\mu_2 = ${f(d.mu1)}-${f(d.mu2)} = ${f(centro)}`,
      `\\sigma_{\\bar{X}_1-\\bar{X}_2} = \\sqrt{\\dfrac{\\sigma_1^2}{n_1}+\\dfrac{\\sigma_2^2}{n_2}} = \\sqrt{\\dfrac{${f(d.sigma1 ** 2)}}{${d.n1}}+\\dfrac{${f(d.sigma2 ** 2)}}{${d.n2}}} = ${f(ee, 5)}`,
      `\\bar{X}_1-\\bar{X}_2 \\sim N(${f(centro)},\\ ${f(ee, 5)})`] });
    formula = "Z = \\dfrac{(\\bar{X}_1-\\bar{X}_2)-(\\mu_1-\\mu_2)}{\\sqrt{\\sigma_1^2/n_1+\\sigma_2^2/n_2}}"; supuestos = ["Muestras independientes", "Poblaciones normales, o n₁, n₂ ≥ 30"];
  } else {
    centro = d.p1 - d.p2; ee = Math.sqrt(d.p1 * (1 - d.p1) / d.n1 + d.p2 * (1 - d.p2) / d.n2);
    pasos.push({ titulo: "Datos", lineas: [`p_1 = ${f(d.p1)},\\ n_1 = ${d.n1}`, `p_2 = ${f(d.p2)},\\ n_2 = ${d.n2}`] });
    const ok = [[d.n1, d.p1], [d.n2, d.p2]].every(([n, p]) => n * p >= 5 && n * (1 - p) >= 5);
    pasos.push({ titulo: "Verificar el modelo", lineas: [`n_1p_1 = ${f(d.n1 * d.p1, 2)},\\ n_1q_1 = ${f(d.n1 * (1 - d.p1), 2)},\\ n_2p_2 = ${f(d.n2 * d.p2, 2)},\\ n_2q_2 = ${f(d.n2 * (1 - d.p2), 2)}`], texto: ok ? "Los cuatro productos son ≥ 5: la diferencia de proporciones es aproximadamente normal." : "⚠ Algún producto np o n(1−p) es menor que 5: la aproximación normal no es fiable." });
    if (!ok) advertencias.push("Algún producto np o n(1−p) es menor que 5.");
    pasos.push({ titulo: "Distribución de la diferencia de proporciones", lineas: [
      `\\mu_{\\hat{p}_1-\\hat{p}_2} = p_1-p_2 = ${f(d.p1)}-${f(d.p2)} = ${f(centro)}`,
      `\\sigma_{\\hat{p}_1-\\hat{p}_2} = \\sqrt{\\dfrac{p_1q_1}{n_1}+\\dfrac{p_2q_2}{n_2}} = \\sqrt{\\dfrac{${f(d.p1)}\\cdot ${f(1 - d.p1)}}{${d.n1}}+\\dfrac{${f(d.p2)}\\cdot ${f(1 - d.p2)}}{${d.n2}}} = ${f(ee, 5)}`,
      `\\hat{p}_1-\\hat{p}_2 \\sim N(${f(centro)},\\ ${f(ee, 5)})`] });
    formula = "Z = \\dfrac{(\\hat{p}_1-\\hat{p}_2)-(p_1-p_2)}{\\sqrt{p_1q_1/n_1+p_2q_2/n_2}}"; supuestos = ["Muestras independientes", "n₁p₁, n₁q₁, n₂p₂, n₂q₂ ≥ 5"];
  }

  const resultados = [];
  for (const c of consultas) {
    if (c.a === undefined || (c.op === "entre" && c.b === undefined)) continue;
    const z = x => (x - centro) / ee;
    let p, lineas, enunciado;
    if (c.op === "menor") {
      const zz = z(c.a); p = normalCdf(zz);
      enunciado = `P(${v} < ${f(c.a)})`;
      lineas = [`P(${v} < ${f(c.a)}) = P\\left(Z < \\dfrac{${f(c.a)}-${f(centro)}}{${f(ee, 5)}}\\right) = P(Z < ${f(zz)}) ${prob(p)}`];
    } else if (c.op === "mayor") {
      const zz = z(c.a); p = 1 - normalCdf(zz);
      enunciado = `P(${v} > ${f(c.a)})`;
      lineas = [`P(${v} > ${f(c.a)}) = P\\left(Z > \\dfrac{${f(c.a)}-${f(centro)}}{${f(ee, 5)}}\\right) = 1 - P(Z < ${f(zz)}) ${prob(p)}`];
    } else {
      const za = z(c.a), zb = z(c.b); p = normalCdf(zb) - normalCdf(za);
      enunciado = `P(${f(c.a)} < ${v} < ${f(c.b)})`;
      lineas = [`P(${f(c.a)} < ${v} < ${f(c.b)}) = P(${f(za)} < Z < ${f(zb)}) = P(Z < ${f(zb)}) - P(Z < ${f(za)}) ${prob(p)}`];
    }
    pasos.push({ titulo: `Probabilidad ${c.etq ?? ""}`.trim(), lineas });
    const num = x => String(x).replace(".", ",");
    const txt = c.op === "menor" ? `P(${M.vt} < ${num(c.a)})` : c.op === "mayor" ? `P(${M.vt} > ${num(c.a)})` : `P(${num(c.a)} < ${M.vt} < ${num(c.b)})`;
    resultados.push({ etq: c.etq ?? "", tex: `${enunciado} ${prob(p)}`, prob: p, texto: `${c.etq ? c.etq + " " : ""}${txt} ${probTxt(p)}` });
  }

  return {
    id: tipo, tema: TIPOS_DM[tipo], tabla: M.tabla, formula, supuestos,
    pasos, resultados, advertencias,
    grafica: { familia: "muestral", mu: centro, sd: ee, simbolo: M.vt, consultas: resultados.map((r, i) => ({ ...consultas.filter(c => c.a !== undefined)[i], prob: r.prob })) },
    extra: { centro, errorEstandar: ee },
    conclusion: resultados.length ? resultados.map(r => `${r.texto}.`).join(" ") : `${M.vt} ~ N(${centro}, ${Math.round(ee * 1e5) / 1e5}).`
  };
}
