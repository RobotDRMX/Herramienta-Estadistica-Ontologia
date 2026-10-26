// Pruebas de hipótesis (Llinás Solano, Cap. 3 y 6): diferencia de medias, varianza, cociente de varianzas y correlación.
// Procedimiento de las plantillas: datos → hipótesis → estadístico → punto crítico → decisión → conclusión.
// La decisión se toma por región crítica; el valor P se muestra aparte.

import { normalizar, tokenizar, detectarListas } from "./texto.js";
import { interpretar as interpretarIC } from "./roles.js";
import { normalCdf, tCdf, chi2Cdf, fCdf, zCrit, tCrit, chi2Crit, fCrit } from "./dist.js";
import { resumen } from "./ic.js";
import { ajuste, interpretarRegresion, nombresVariables } from "./regresion.js";
import { extraerAsignaciones } from "./simbolos.js";
import { f, dv, fp, num, pctTxt } from "./formato.js";

export const TIPOS_PH = {
  ph_media: "Prueba de hipótesis para una media",
  ph_pareadas: "Prueba de hipótesis para la diferencia de medias (datos pareados)",
  ph_dif_medias: "Prueba de hipótesis para la diferencia de medias",
  ph_proporcion: "Prueba de hipótesis para una proporción",
  ph_dif_proporciones: "Prueba de hipótesis para la diferencia de proporciones",
  ph_varianza: "Prueba de hipótesis para la varianza",
  ph_cociente: "Prueba de hipótesis para el cociente de varianzas",
  ph_correlacion: "Prueba de hipótesis para la correlación",
  ph_pendiente: "Prueba de hipótesis para la pendiente (regresión lineal simple)"
};
export const ETIQ_PH = {
  alfa: "α (nivel de significancia)", d0: "d₀ (diferencia hipotética)", sigma0sq: "σ₀² (varianza hipotética)", rho0: "ρ₀ (correlación hipotética)",
  r: "r (correlación muestral)", ssq: "s² (varianza muestral)", crudosx: "datos x", crudosy: "datos y",
  p0: "p₀ (proporción hipotética)", mu0: "μ₀ (media hipotética)", beta10: "β₁ hipotética (0 si no se dice)", beta00: "β₀ hipotético (0 si no se dice)",
  b1: "b₁ (pendiente muestral)", seb1: "error típico de b₁", b0: "b₀ (intercepto muestral)", seb0: "error típico de b₀"
};

const NOMBRE_COLA = { der: "cola a la derecha", izq: "cola a la izquierda", dos: "dos colas" };
const aNum = s => parseFloat(String(s).replace(/[−–]/g, "-").replace(",", "."));
const NUM = "([-−–]?\\d+(?:[.,]\\d+)?)";
const enBlanco = (txt, rangos) => { let t = txt; for (const [a, b] of rangos) if (a != null) t = t.slice(0, a) + " ".repeat(b - a) + t.slice(b); return t; };

/* ---------------- detección ---------------- */
const FUERTES = /hipotesis|\bpruebe|\bprobar|prueba (?:de|para)|contraste|evidencia|es posible concluir|se puede concluir|determinese|determine si|determinar si|rechaz|\bho\b|\bh0\b|\bh1\b|significativ[oa]|distint[oa] de cero/;
const NIVEL = /significancia|significacion|\balfa\b|α|nivel del? \d/;
const DIRECCION = /¿|mayor|menor|mejor|peor|supera|excede|diferente|distint|igual|cambi|aument|disminu|reduc|difier|afirm|sostien|asegur|garantiz/;

/**
 * ¿El enunciado pide contrastar una afirmación (y no un intervalo, una estimación o una probabilidad)?
 * Un nivel α junto a una afirmación o pregunta («¿mejoró?», «es mayor que…») también cuenta como prueba.
 */
export function esHipotesis(texto) {
  const s = señalesPrueba(texto);
  return s.prueba && !s.intervalo;
}

/**
 * Señales del enunciado: `fuerte` (pruebe, hipótesis, evidencia, rechazar…), `prueba` (fuerte, o un nivel α con una
 * afirmación o pregunta) e `intervalo` (pide explícitamente un intervalo de confianza).
 */
export function señalesPrueba(texto) {
  const n = normalizar(texto);
  const fuerte = FUERTES.test(n);
  return {
    fuerte,
    // pide contrastar sin lugar a dudas (para decidir si hay que preguntar cuando también pide un intervalo)
    explicita: /hipotesis|\bpruebe\b|\bprobar (?:si|que|la)|contraste|rechaz|\bh0\b|\bho\b|\bh1\b/.test(n),
    prueba: fuerte || (NIVEL.test(n) && DIRECCION.test(n) && !/estim|intervalo/.test(n)),
    intervalo: /construya un intervalo|calcule un intervalo|intervalo de confianza|intervalo del? \d|limites? de confianza/.test(n)
  };
}

const oraciones = n => n.split(/(?<=[.?!])\s+/);
const RE_CLAIM = /determine si|determinese|determinar si|conclu|evidencia|pruebe|probar|prueba|verifi|sugier|afirm|sostien|hipotesis|se desea saber|se quiere saber|es posible|existe|hay\b/;
/** Oración que contiene la afirmación a contrastar (la última que la anuncia). */
function claimDe(n) {
  const ss = oraciones(n), c = ss.filter(s => RE_CLAIM.test(s)), q = ss.filter(s => s.includes("?"));
  return c.length ? c[c.length - 1] : q.length ? q[q.length - 1] : n;
}

/** Parámetro del que habla la afirmación: el que aparece primero (V = varianza, M = media, P = proporción). */
function objetivoDe(n) {
  const pos = (zona, re) => { const i = zona.search(re); return i < 0 ? Infinity : i; };
  const en = zona => {
    const p = { V: pos(zona, /varianza|desviacion|sigma|σ/), M: pos(zona, /\bmedi[ao]s?\b|promedio|\bmedio\b/), P: pos(zona, /proporcion|porcentaje|\btasa|fraccion|\bmitad\b|\d\s*%|por ciento/) };
    const m = Math.min(p.V, p.M, p.P);
    return m === Infinity ? null : Object.keys(p).find(k => p[k] === m);
  };
  return en(claimDe(n)) ?? en(n);
}

const PAREADO = /paread|emparejad|antes\s+y\s+despues|mismos?\s+(?:sujetos?|individuos?|pacientes?|atletas?|corredores?|personas?|trabajadores?)|cada\s+(?:sujeto|persona|paciente|atleta|trabajador)/;

function detectarTipo(n, original) {
  // la pendiente o el intercepto de una regresión (antes que la correlación: ambas comparten vocabulario)
  if (/pendiente|intercepto|ordenada al origen|(?<![a-z\d_])b\s*_?\s*[01](?!\d)|beta\s*_?\s*[01]|β\s*_?\s*[01]/.test(n) && /regresion|recta|lineal|pendiente|intercepto/.test(n)) return { tipo: "ph_pendiente" };
  if (/correlacion|\brho\b|ρ/.test(n)) return { tipo: "ph_correlacion" };
  const al = extraerAlfa(n);   // «nivel de significancia del 5 %» no habla del parámetro: se aparta antes de buscarlo
  const objetivo = objetivoDe(al ? enBlanco(n, [al.rango]) : n);
  if (objetivo === "V") {
    const dos = /cociente|razon (?:de|entre)|(?:dos|ambas)\s+(?:poblaciones|varianzas|muestras)|varianzas poblacionales|(?:σ|sigma)\s*1|\bn\s*1\b|segunda muestra|otra muestra|muestra independiente|otro tipo|segundo tipo|primer tipo/.test(n);
    return { tipo: dos ? "ph_cociente" : "ph_varianza" };
  }
  if (objetivo === "P") {
    const d = interpretarIC(original, "ic_dif_proporciones").datos;
    const dos = d.n1 !== undefined && d.n2 !== undefined;
    return { tipo: dos ? "ph_dif_proporciones" : "ph_proporcion" };
  }
  if (objetivo === "M" || objetivo === null) {
    const base2 = interpretarIC(original, "ic_dif_medias").datos;
    const listas2 = base2.crudos1 && base2.crudos2;
    if (PAREADO.test(n) || (listas2 && base2.crudos1.length === base2.crudos2.length && !/independiente/.test(n))) return { tipo: "ph_pareadas" };
    if ((base2.n1 !== undefined && base2.n2 !== undefined) || listas2) return { tipo: "ph_dif_medias" };
    const base1 = interpretarIC(original, "ic_media").datos;
    if (base1.crudos || (base1.n !== undefined && base1.xbar !== undefined)) return { tipo: "ph_media" };
    return { tipo: null, motivo: "este enunciado: no encontré los datos de la muestra (n, media y desviación, o los datos crudos)" };
  }
  return { tipo: null, motivo: "este tipo de prueba" };
}

/* ---------------- nivel de significancia, valor hipotético, cola ---------------- */
function extraerAlfa(n) {
  const res = [
    new RegExp(`(?:nivel\\s+(?:de\\s+)?(?:significancia|significacion)|significancia|significacion|alfa|α)\\s*(?:de|del|es|=|:)?\\s*(?:de\\s+)?${NUM}\\s*(%|por ciento)?`),
    new RegExp(`nivel\\s+(?:de|del)\\s+${NUM}\\s*(%|por ciento)?`),
    new RegExp(`${NUM}\\s*(%|por ciento)\\s+de\\s+(?:nivel\\s+de\\s+)?significancia`)
  ];
  for (const re of res) {
    const m = n.match(re);
    if (!m) continue;
    let v = aNum(m[1]);
    if (m[2] || v >= 1) v /= 100;
    if (v > 0 && v < 0.5) return { valor: v, rango: [m.index, m.index + m[0].length], texto: m[0].trim() };
  }
  return null;
}

const COMPARADORES = "(?:no\\s+supera(?:r)?|no\\s+excede(?:r)?|no\\s+exceda|supera(?:r)?|excede(?:r)?|exceda|mayor(?:es)?\\s+(?:que|a|de)|menor(?:es)?\\s+(?:que|a|de)|inferior\\s+(?:a|que)|superior\\s+(?:a|que)|igual\\s+(?:a|que)|distinta?\\s+de|diferente\\s+de|difiere\\s+de|a lo sumo|al menos|por lo menos|como maximo|como minimo|mas de|menos de|no pasa de|por encima de|por debajo de)";

/** Valor que aparece tras un comparador («no supera el 4 %», «σ² = 4», «mayor que 0,5»). */
function valorHipotetico(n, { simbolos = "(?:sigma|σ)\\s*(?:\\^?\\s*2|²)?", rango = null, excluir = [] } = {}) {
  const cands = [];
  const re1 = new RegExp(`${simbolos}\\s*(=|<|>|≤|≥)\\s*${NUM}`, "g");
  for (const m of n.matchAll(re1)) cands.push({ m, v: aNum(m[2]), ini: m.index, fin: m.index + m[0].length, cuad: /\^\s*2|²/.test(m[0]) });
  const re2 = new RegExp(`${COMPARADORES}\\s+(?:el\\s+|la\\s+|de\\s+)?(?:valor\\s+de\\s+)?${NUM}\\s*(%)?`, "g");
  for (const m of n.matchAll(re2)) cands.push({ m, v: aNum(m[1]), ini: m.index, fin: m.index + m[0].length, cuad: null, pct: Boolean(m[2]) });
  // «el fabricante asegura que la desviación es de 2 g»: valor afirmado sin comparador
  for (const o of oraciones(n)) {
    if (!/asegur|afirm|sostien|garantiz|especific|se supone/.test(o) || /muestra/.test(o)) continue;
    const m = o.match(new RegExp(`(?:es|sea|son)\\s+(?:de\\s+)?${NUM}`));
    if (m) { const ini = n.indexOf(o) + m.index; cands.push({ m, v: aNum(m[1]), ini, fin: ini + m[0].length, cuad: null }); }
  }
  const ok = cands.filter(c => (!rango || (c.v >= rango[0] && c.v <= rango[1])) && !excluir.includes(c.v));
  if (!ok.length) return null;
  // preferir una oración que no hable de la muestra
  const habla = c => /muestra/.test(oraciones(n).find(s => n.indexOf(s) <= c.ini && c.ini < n.indexOf(s) + s.length) ?? "");
  const sinMuestra = ok.find(c => !habla(c));
  const c = sinMuestra ?? ok[0];
  // el mismo valor puede repetirse en la afirmación y en la pregunta: todas esas apariciones se quitan de los datos
  const rangos = ok.filter(o => o.v === c.v && (o === c || !habla(o))).map(o => [o.ini, o.fin]);
  return { valor: c.v, rango: [c.ini, c.fin], rangos, cuad: c.cuad, pct: Boolean(c.pct), texto: n.slice(c.ini, c.fin) };
}

/** Dirección de H₁ según cómo está redactada la afirmación (queda editable en pantalla). */
export function detectarCola(claim, tipo) {
  const c = claim;
  if (/no\s+(?:supera|excede|exceda|sobrepasa|pasa de)|a lo sumo|como maximo|no\s+(?:es|sea)\s+mayor/.test(c)) return "der";
  if (/al menos|por lo menos|como minimo/.test(c)) return tipo === "ph_correlacion" ? "der" : "izq";
  if (/no\s+(?:es|sea)\s+menor|no baja/.test(c)) return "izq";
  if (tipo === "ph_correlacion" || tipo === "ph_pendiente") {
    if (/positiv|directa/.test(c)) return "der";
    if (/negativ|inversa/.test(c)) return "izq";
  }
  if (/diferent|distint|difier|\bigual|cambi|\bvari[ao]\b|no es lo mismo/.test(c)) return "dos";
  if (/mayor|supera|excede|exceda|superior|aument|increment|crece|mejor|por encima|\bmas\b/.test(c)) return "der";
  if (/menor|inferior|disminu|reduc|baja|\bmenos\b|peor|por debajo/.test(c)) return "izq";
  return "dos";
}

/** Sintagma del parámetro: «la varianza en el porcentaje de impurezas de unas remesas…». */
function sujetoDe(n, original, claim) {
  const re = /((?:el|la|los|las)\s+(?:[a-z]+\s+){0,3}?(?:medi[oa]|promedio|proporcion|porcentaje|varianza|desviacion(?:\s+estandar|\s+tipica)?)\s+(?:de|del|en)\s+[^,.;?]+?)(?=\s+(?:es|son|sea|sean|supera|excede|exceda|no|difiere|difieren|cambi\w*|varia|aument\w+|disminuy\w+|mayor|menor|inferior|superior|igual|diferente|distint\w+)\b|[,.;?]|$)/;
  for (const zona of [claim, n]) {
    const m = zona.match(re);
    if (m) {
      const ini = n.indexOf(zona) + m.index;
      return original.slice(ini, ini + m[1].length).replace(/\s+/g, " ").trim().replace(/^[A-ZÁÉÍÓÚÑ]/, c => c.toLowerCase());
    }
  }
  return null;
}

/* ---------------- interpretación ---------------- */
const sinSoporte = motivo => ({ tipo: null, soportado: false, datos: {}, evidencias: [], notas: [`Todavía no resuelvo ${motivo}. Por ahora están disponibles: diferencia de medias, varianza, cociente de varianzas y correlación (y la regresión lineal simple).`], faltantes: [], opciones: {} });

export function interpretarHipotesis(textoOriginal, forzarTipo = null) {
  const original = textoOriginal, n = normalizar(original);
  const det = forzarTipo ? { tipo: forzarTipo } : detectarTipo(n, original);
  if (!det.tipo) return sinSoporte(det.motivo);
  const tipo = det.tipo;
  const claim = claimDe(n);
  const notas = [], datos = {};
  let evidencias = [];
  // la dirección puede venir en la pregunta («¿es mayor?») o en la afirmación que se contrasta («el rector afirma que…»)
  const afirma = oraciones(n).filter(s => /afirm|sostien|asegur|garantiz|sospech|cree que|supone|quiere (?:probar|demostrar)/.test(s));
  const opciones = { cola: detectarCola([claim, ...afirma].join(" "), tipo) };

  const al = extraerAlfa(n);
  const rangos = al ? [al.rango] : [];
  if (al) { datos.alfa = al.valor; evidencias.push({ simbolo: "alfa", valor: al.valor, frase: original.slice(Math.max(0, al.rango[0] - 20), al.rango[1] + 20).replace(/\s+/g, " ").trim(), texto: al.texto }); }
  const ev = (simbolo, valor, r, texto) => evidencias.push({ simbolo, valor, frase: original.slice(Math.max(0, r[0] - 25), Math.min(original.length, r[1] + 25)).replace(/\s+/g, " ").trim(), texto: texto ?? n.slice(r[0], r[1]).trim() });

  const A = extraerAsignaciones(n).map;                       // asignaciones explícitas «símbolo = valor»
  const aFrac = (v, pct) => (pct || v > 1 ? v / 100 : v);     // 8 %, 8 o 0,08 → 0,08
  const copiar = (base, claves) => {
    for (const k of claves) if (base.datos[k] !== undefined) datos[k] = base.datos[k];
    evidencias = [...evidencias, ...base.evidencias.filter(e => e.simbolo !== "confianza")];
    if (datos.alfa === undefined && base.datos.confianza) datos.alfa = Math.round((1 - base.datos.confianza) * 1e6) / 1e6;
    notas.push(...base.notas);
  };
  const quitar = r => { if (r) for (const par of Array.isArray(r[0]) ? r : [r]) rangos.push(par); };

  if (tipo === "ph_proporcion") {
    let p0 = null;
    if (A.p0) { p0 = aFrac(A.p0.valor, A.p0.pct); quitar([A.p0.ini, A.p0.fin]); ev("p0", p0, [A.p0.ini, A.p0.fin]); }
    else {
      const h = valorHipotetico(n, { simbolos: "(?<![a-z_])p\\s*_?\\s*0?", rango: [0, 100] });
      const mitad = n.match(/\bla mitad\b|\bmitad\b/);
      if (h) { p0 = aFrac(h.valor, h.pct); quitar(h.rangos); ev("p0", p0, h.rango, h.texto); }
      else if (mitad) { p0 = 0.5; quitar([mitad.index, mitad.index + mitad[0].length]); ev("p0", 0.5, [mitad.index, mitad.index + mitad[0].length], mitad[0]); notas.push("«La mitad» se leyó como p₀ = 0,5."); }
    }
    if (p0 !== null) datos.p0 = p0;
    copiar(interpretarIC(enBlanco(original, rangos), "ic_proporcion"), ["n", "x", "p"]);
  } else if (tipo === "ph_dif_proporciones") {
    if (A.d0) datos.d0 = aFrac(A.d0.valor, A.d0.pct);
    copiar(interpretarIC(enBlanco(original, rangos), "ic_dif_proporciones"), ["n1", "n2", "x1", "x2", "p1", "p2"]);
  } else if (tipo === "ph_media") {
    let h = A.mu0 ? { valor: A.mu0.valor, rango: [A.mu0.ini, A.mu0.fin], rangos: [[A.mu0.ini, A.mu0.fin]], texto: A.mu0.texto } : valorHipotetico(n, { simbolos: "(?:mu|μ)\\s*_?\\s*0?" });
    if (h) { datos.mu0 = h.valor; quitar(h.rangos); ev("mu0", h.valor, h.rango, h.texto); }
    copiar(interpretarIC(enBlanco(original, rangos), "ic_media"), ["n", "xbar", "s", "sigma", "crudos"]);
    opciones.normal = /normal/.test(n);
  } else if (tipo === "ph_pareadas") {
    if (A.d0) datos.d0 = A.d0.valor;
    copiar(interpretarIC(enBlanco(original, rangos), "ic_pareadas"), ["n", "dbar", "sd", "crudos1", "crudos2"]);
    if (!datos.crudos1 && datos.n === undefined) {
      // «antes … y después …» pegado en una sola lista: la primera mitad es la primera medición
      const ls = detectarListas(n, tokenizar(n));
      if (ls.length === 1 && ls[0].valores.length >= 6 && ls[0].valores.length % 2 === 0) {
        const v = ls[0].valores, m = v.length / 2;
        datos.crudos1 = v.slice(0, m); datos.crudos2 = v.slice(m);
        ev("crudos1", datos.crudos1, [ls[0].ini, ls[0].fin], `${m} datos`); ev("crudos2", datos.crudos2, [ls[0].ini, ls[0].fin], `${m} datos`);
        notas.push(`Partí la lista de ${v.length} datos en dos mitades de ${m}: la primera mitad es la primera medición y la segunda mitad, la segunda. Corrígelo abajo si no es así.`);
      }
    }
    notas.push("En datos pareados la diferencia es dᵢ = (primera medición) − (segunda medición); la dirección de H₁ se refiere a esa diferencia.");
  } else if (tipo === "ph_pendiente") {
    const resto = enBlanco(original, rangos), nn = normalizar(resto);
    const rl = interpretarRegresion(resto);
    if (rl.datos.crudosx) {
      datos.crudosx = rl.datos.crudosx; datos.crudosy = rl.datos.crudosy;
      evidencias.push(...rl.evidencias); Object.assign(opciones, rl.opciones);
    } else {
      const S = extraerAsignaciones(nn).map;
      const queInter = /intercepto|ordenada/.test(claim) && !/pendiente/.test(claim);
      const mn = nn.match(/\bn\s*=\s*(\d+)|muestra\s+(?:aleatoria\s+)?de\s+(\d+)|(\d+)\s+(?:pares|puntos|observaciones|parejas|datos|mediciones)/);
      if (S.n) { datos.n = S.n.valor; ev("n", S.n.valor, [S.n.ini, S.n.fin]); }
      else if (mn) { datos.n = Number(mn[1] ?? mn[2] ?? mn[3]); ev("n", datos.n, [mn.index, mn.index + mn[0].length]); }
      const coef = queInter ? "0" : "1";
      const b = S["b" + coef] ?? (() => { const m = nn.match(new RegExp(`(?:pendiente|intercepto|ordenada)(?:\\s+(?:estimada|muestral|de la recta))?\\s*(?:=|:|de|es|fue)\\s*${NUM}`)); return m ? { valor: aNum(m[1]), ini: m.index, fin: m.index + m[0].length } : null; })();
      if (b) { datos["b" + coef] = b.valor; ev("b" + coef, b.valor, [b.ini, b.fin]); }
      const se = nn.match(new RegExp(`(?:error\\s+(?:tipico|estandar)|desviacion\\s+estandar)\\s*(?:de\\s+(?:la\\s+)?(?:pendiente|b\\s*_?\\s*[01]|intercepto|ordenada)\\s*)?(?:=|:|es|de|fue)?\\s*${NUM}`))
        ?? nn.match(new RegExp(`(?:\\bse|\\bee)\\s*\\(\\s*b\\s*_?\\s*[01]\\s*\\)\\s*(?:=|:)\\s*${NUM}`));
      if (se) { datos["seb" + coef] = aNum(se[1]); ev("seb" + coef, aNum(se[1]), [se.index, se.index + se[0].length]); }
      const h0 = S["beta" + coef]; if (h0) datos["beta" + coef + "0"] = h0.valor;
    }
    if (rl.opciones?.nombreX) opciones.sujeto = `${rl.opciones.nombreX} y ${rl.opciones.nombreY}`;
  } else if (tipo === "ph_dif_medias") {
    const base = interpretarIC(enBlanco(original, rangos), "ic_dif_medias");
    Object.assign(datos, base.datos); delete datos.confianza;
    if (datos.alfa === undefined && base.datos.confianza) datos.alfa = Math.round((1 - base.datos.confianza) * 1e6) / 1e6;
    evidencias = [...evidencias, ...base.evidencias.filter(e => e.simbolo !== "confianza")];
    notas.push(...base.notas);
    if (base.opciones.varianzasIguales !== undefined) opciones.varianzasIguales = base.opciones.varianzasIguales;
    opciones.normal = base.opciones.normal;
    const m = n.match(new RegExp(`(?:mu|μ)\\s*1\\s*[-−–]\\s*(?:mu|μ)\\s*2\\s*(?:=|<|>|≤|≥)\\s*${NUM}`));
    if (m) datos.d0 = aNum(m[1]);
  } else if (tipo === "ph_varianza") {
    const h = valorHipotetico(n);
    let resto = enBlanco(original, rangos);
    if (h) {
      const esDesv = /desviacion|(?:sigma|σ)(?!\s*(?:\^?\s*2|²))/.test(claim) && !/varianza|\^\s*2|²/.test(claim);
      datos.sigma0sq = esDesv ? h.valor ** 2 : h.valor;
      if (esDesv) notas.push(`La afirmación es sobre la desviación (σ₀ = ${num(h.valor)}); la prueba usa la varianza σ₀² = ${num(h.valor ** 2)}.`);
      ev("sigma0sq", datos.sigma0sq, h.rango, h.texto);
      resto = enBlanco(resto, h.rangos);
    }
    const base = interpretarIC(resto, "ic_varianza");
    const d = base.datos;
    if (d.crudos) datos.crudos = d.crudos;
    if (d.n !== undefined) datos.n = d.n;
    if (d.s !== undefined) datos.s = d.s;
    if (d.s2 !== undefined) datos.ssq = d.s2;
    evidencias = [...evidencias, ...base.evidencias.filter(e => e.simbolo !== "confianza").map(e => (e.simbolo === "s2" ? { ...e, simbolo: "ssq" } : e))];
    if (datos.alfa === undefined && d.confianza) datos.alfa = Math.round((1 - d.confianza) * 1e6) / 1e6;
    notas.push(...base.notas);
    opciones.normal = /normal/.test(n);
  } else if (tipo === "ph_cociente") {
    const base = interpretarIC(enBlanco(original, rangos), "ic_cociente");
    const d = base.datos;
    for (const k of ["n1", "n2", "s1", "s2", "s1sq", "s2sq"]) if (d[k] !== undefined) datos[k] = d[k];
    evidencias = [...evidencias, ...base.evidencias.filter(e => e.simbolo !== "confianza")];
    if (datos.alfa === undefined && d.confianza) datos.alfa = Math.round((1 - d.confianza) * 1e6) / 1e6;
    notas.push(...base.notas);
  } else if (tipo === "ph_correlacion") {
    const resto0 = enBlanco(original, rangos);
    const rl = interpretarRegresion(resto0);
    if (rl.datos.crudosx) {
      datos.crudosx = rl.datos.crudosx; datos.crudosy = rl.datos.crudosy;
      evidencias.push(...rl.evidencias); notas.push(...rl.notas.filter(x => !/No encontré/.test(x)));
    } else {
      const nn = normalizar(resto0), usados = [...rangos];
      const mr = nn.match(new RegExp(`(?:coeficiente\\s+de\\s+correlacion(?:\\s+[a-z]+){0,3}?|(?<![a-z])r(?![a-z]))\\s*(?:=|es|de|fue|igual a|resulto|:)?\\s*${NUM}`));
      if (mr && Math.abs(aNum(mr[1])) <= 1) { datos.r = aNum(mr[1]); const r0 = mr.index; usados.push([r0, r0 + mr[0].length]); ev("r", datos.r, [r0, r0 + mr[0].length]); }
      const mn = nn.match(/\bn\s*=\s*(\d+)|muestra\s+(?:aleatoria\s+)?de\s+(\d+)|(\d+)\s+(?:pares|paises|observaciones|parejas|casos|individuos|estudiantes|personas|sujetos|empresas|ciudades|datos|plantas|mediciones)/);
      if (mn) { datos.n = Number(mn[1] ?? mn[2] ?? mn[3]); ev("n", datos.n, [mn.index, mn.index + mn[0].length]); }
      const mrho = valorHipotetico(enBlanco(nn, usados), { simbolos: "(?:rho|ρ)", rango: [-1, 1] });
      if (mrho) { datos.rho0 = mrho.valor; ev("rho0", mrho.valor, mrho.rango, mrho.texto); }
      if (datos.n === undefined) {
        const toks = tokenizar(enBlanco(nn, usados)).filter(t => t.entero && !t.pct && !t.palabra && t.valor >= 4);
        if (toks[0]) { datos.n = toks[0].valor; ev("n", datos.n, [toks[0].ini, toks[0].fin]); notas.push("Supuse que el primer entero libre es n; verifícalo."); }
      }
    }
    if (datos.rho0 === undefined) {
      const mrho = valorHipotetico(enBlanco(n, rangos), { simbolos: "(?:rho|ρ)", rango: [-1, 1], excluir: datos.r !== undefined ? [datos.r] : [] });
      if (mrho) { datos.rho0 = mrho.valor; ev("rho0", mrho.valor, mrho.rango, mrho.texto); }
    }
    const nv = nombresVariables(n, original);
    if (nv) opciones.sujeto = `${nv.x} y ${nv.y}`;
    if (datos.alfa === undefined) notas.push("No encontré el nivel de significancia α; escríbelo abajo.");
  }

  if (["ph_varianza", "ph_media", "ph_proporcion"].includes(tipo)) { const s = sujetoDe(n, original, claim); if (s) opciones.sujeto = s; }
  if (datos.alfa === undefined && !notas.some(x => /α/.test(x))) notas.push("No encontré el nivel de significancia α; escríbelo abajo.");
  notas.push(`Dirección de la prueba: ${NOMBRE_COLA[opciones.cola]} (según cómo está redactada la afirmación). Puedes cambiarla abajo.`);
  return { tipo, soportado: true, datos, consultas: undefined, evidencias, notas, faltantes: faltantesPH(tipo, datos), opciones, texto: original };
}

/* ---------------- datos requeridos ---------------- */
const falta = (d, ...ks) => ks.filter(k => d[k] === undefined || Number.isNaN(d[k]));
const unaDe = (d, ...ks) => (ks.some(k => d[k] !== undefined) ? [] : [ks[0]]);
const REQUERIDOS_PH = {
  ph_dif_medias: d => [...falta(d, "alfa"), ...(d.crudos1 && d.crudos2 ? [] : [...falta(d, "n1", "n2", "x1", "x2"), ...unaDe(d, "s1", "sigma1"), ...unaDe(d, "s2", "sigma2")])],
  ph_varianza: d => [...falta(d, "alfa", "sigma0sq"), ...(d.crudos ? [] : [...falta(d, "n"), ...unaDe(d, "s", "ssq")])],
  ph_cociente: d => [...falta(d, "alfa", "n1", "n2"), ...unaDe(d, "s1sq", "s1"), ...unaDe(d, "s2sq", "s2")],
  ph_correlacion: d => [...falta(d, "alfa"), ...(d.crudosx && d.crudosy ? [] : falta(d, "n", "r"))],
  ph_proporcion: d => [...falta(d, "alfa", "n", "p0"), ...unaDe(d, "x", "p")],
  ph_dif_proporciones: d => [...falta(d, "alfa", "n1", "n2"), ...unaDe(d, "x1", "p1"), ...unaDe(d, "x2", "p2")],
  ph_media: d => [...falta(d, "alfa", "mu0"), ...(d.crudos ? [] : [...falta(d, "n", "xbar"), ...unaDe(d, "s", "sigma")])],
  ph_pareadas: d => [...falta(d, "alfa"), ...(d.crudos1 && d.crudos2 ? [] : falta(d, "n", "dbar", "sd"))],
  ph_pendiente: d => [...falta(d, "alfa"), ...(d.crudosx && d.crudosy ? [] : d.b0 !== undefined && d.b1 === undefined ? falta(d, "n", "b0", "seb0") : falta(d, "n", "b1", "seb1"))]
};
export const faltantesPH = (tipo, d) => REQUERIDOS_PH[tipo](d);

/* ---------------- cálculo ---------------- */
const B = { z: "Z", t: "t", chi2: "\\chi^2", f: "F" };
const BT = { z: "Z", t: "t", chi2: "χ²", f: "F" };

const critico = (fam, cola, alfa, gl, gl2) => {
  const a = cola === "dos" ? alfa / 2 : alfa;
  if (fam === "z" || fam === "t") { const c = fam === "z" ? zCrit(a) : tCrit(a, gl); return { lo: cola === "der" ? null : -c, hi: cola === "izq" ? null : c, a }; }
  const inv = (p) => (fam === "chi2" ? chi2Crit(p, gl) : fCrit(p, gl, gl2));
  return { lo: cola === "der" ? null : inv(1 - a), hi: cola === "izq" ? null : inv(a), a };
};
const cdfDe = (fam, x, gl, gl2) => (fam === "z" ? normalCdf(x) : fam === "t" ? tCdf(x, gl) : fam === "chi2" ? chi2Cdf(x, gl) : fCdf(x, gl, gl2));

/** Frases de los tipos de una o dos poblaciones con la misma estructura (media, proporción, varianza). */
const dosPoblaciones = (sing, plur, cola) => ({
  h0: { dos: `${plur} de las dos poblaciones son iguales`, der: `${sing} de la población 1 no es mayor que la de la población 2`, izq: `${sing} de la población 1 no es menor que la de la población 2` }[cola],
  h1: { dos: `${plur} de las dos poblaciones son diferentes`, der: `${sing} de la población 1 es mayor que la de la población 2`, izq: `${sing} de la población 1 es menor que la de la población 2` }[cola]
});

/** Frases de H₀ y H₁ de proporciones, una media, datos pareados y pendiente (undefined si el tipo no es de estos). */
function frasesNuevas(tipo, cola, d, o, cmp) {
  if (tipo === "ph_proporcion") { const S = o.sujeto ?? "la proporción poblacional p", v = num(d.p0); return { h0: `${S} ${cmp[0]} ${v}`, h1: `${S} ${cmp[1]} ${v}` }; }
  if (tipo === "ph_media") { const S = o.sujeto ?? "la media poblacional", v = num(d.mu0); return { h0: `${S} ${cmp[0]} ${v}`, h1: `${S} ${cmp[1]} ${v}` }; }
  if (tipo === "ph_dif_proporciones") {
    const d0 = d.d0 ?? 0;
    if (d0 === 0) return dosPoblaciones("la proporción", "las proporciones", cola);
    const S = "la diferencia entre las proporciones (población 1 menos población 2)"; return { h0: `${S} ${cmp[0]} ${num(d0)}`, h1: `${S} ${cmp[1]} ${num(d0)}` };
  }
  if (tipo === "ph_pareadas") {
    const d0 = d.d0 ?? 0;
    if (d0 === 0) return {
      h0: { dos: "las dos mediciones tienen la misma media (no hay diferencia promedio)", der: "la media de la primera medición no es mayor que la de la segunda", izq: "la media de la primera medición no es menor que la de la segunda" }[cola],
      h1: { dos: "las medias de las dos mediciones son diferentes", der: "la media de la primera medición es mayor que la de la segunda", izq: "la media de la primera medición es menor que la de la segunda" }[cola]
    };
    const S = "la diferencia media entre las dos mediciones"; return { h0: `${S} ${cmp[0]} ${num(d0)}`, h1: `${S} ${cmp[1]} ${num(d0)}` };
  }
  if (tipo === "ph_pendiente") {
    const inter = d.b1 === undefined && d.b0 !== undefined && !d.crudosx, h0v = inter ? d.beta00 ?? 0 : d.beta10 ?? 0;
    const par = o.sujeto ?? "x e y";
    if (inter) { const S = "el intercepto poblacional β₀"; return { h0: `${S} ${cmp[0]} ${num(h0v)}`, h1: `${S} ${cmp[1]} ${num(h0v)}` }; }
    if (h0v === 0) return {
      h0: { dos: `no hay relación lineal entre ${par} (β₁ = 0)`, der: `no hay relación lineal positiva entre ${par} (β₁ ≤ 0)`, izq: `no hay relación lineal negativa entre ${par} (β₁ ≥ 0)` }[cola],
      h1: { dos: `existe relación lineal entre ${par} (β₁ ≠ 0)`, der: `existe relación lineal positiva entre ${par} (β₁ > 0)`, izq: `existe relación lineal negativa entre ${par} (β₁ < 0)` }[cola]
    };
    const S = "la pendiente poblacional β₁"; return { h0: `${S} ${cmp[0]} ${num(h0v)}`, h1: `${S} ${cmp[1]} ${num(h0v)}` };
  }
  return undefined;
}

/** Frases de H₀ y H₁ en palabras (editables con opciones.contextoH0 / contextoH1). */
function frases(tipo, cola, d, o) {
  const cmp = { dos: ["es igual a", "es diferente de"], der: ["no es mayor que", "es mayor que"], izq: ["no es menor que", "es menor que"] }[cola];
  const nuevo = frasesNuevas(tipo, cola, d, o, cmp);
  if (nuevo) return { h0: o.contextoH0 || nuevo.h0, h1: o.contextoH1 || nuevo.h1 };
  let h0, h1;
  if (tipo === "ph_varianza") { const S = o.sujeto ?? "la varianza poblacional", v = num(d.sigma0sq); h0 = `${S} ${cmp[0]} ${v}`; h1 = `${S} ${cmp[1]} ${v}`; }
  else if (tipo === "ph_dif_medias") {
    const d0 = d.d0 ?? 0;
    if (d0 === 0) { h0 = { dos: "las medias de las dos poblaciones son iguales", der: "la media de la población 1 no es mayor que la de la población 2", izq: "la media de la población 1 no es menor que la de la población 2" }[cola]; h1 = { dos: "las medias de las dos poblaciones son diferentes", der: "la media de la población 1 es mayor que la de la población 2", izq: "la media de la población 1 es menor que la de la población 2" }[cola]; }
    else { const S = "la diferencia entre las medias (población 1 menos población 2)"; h0 = `${S} ${cmp[0]} ${num(d0)}`; h1 = `${S} ${cmp[1]} ${num(d0)}`; }
  } else if (tipo === "ph_cociente") {
    h0 = { dos: "las varianzas de las dos poblaciones son iguales", der: "la varianza de la población 1 no es mayor que la de la población 2", izq: "la varianza de la población 1 no es menor que la de la población 2" }[cola];
    h1 = { dos: "las varianzas de las dos poblaciones son diferentes", der: "la varianza de la población 1 es mayor que la de la población 2", izq: "la varianza de la población 1 es menor que la de la población 2" }[cola];
  } else {
    const rho0 = d.rho0 ?? 0, par = o.sujeto ?? "las dos variables";
    if (rho0 === 0) {
      h0 = { dos: `no existe correlación lineal entre ${par}`, der: `no existe correlación lineal positiva entre ${par}`, izq: `no existe correlación lineal negativa entre ${par}` }[cola];
      h1 = { dos: `existe correlación lineal entre ${par}`, der: `existe correlación lineal positiva entre ${par}`, izq: `existe correlación lineal negativa entre ${par}` }[cola];
    } else { const S = "la correlación poblacional ρ"; h0 = `${S} ${cmp[0]} ${num(rho0)}`; h1 = `${S} ${cmp[1]} ${num(rho0)}`; }
  }
  return { h0: o.contextoH0 || h0, h1: o.contextoH1 || h1 };
}

const motorDifMedias = (d, o) => {
  let { n1, n2, x1, x2, s1, s2 } = d;
  const pasosDatos = [];
  if (Array.isArray(d.crudos1) && Array.isArray(d.crudos2)) {
    const r1 = resumen(d.crudos1), r2 = resumen(d.crudos2);
    ({ n: n1, xbar: x1, s: s1 } = r1); ({ n: n2, xbar: x2, s: s2 } = r2);
    pasosDatos.push({ titulo: "Calcular x̄ y s de cada muestra", lineas: [`n_1=${n1},\\ \\bar{x}_1=${f(x1)},\\ s_1=${f(s1)}`, `n_2=${n2},\\ \\bar{x}_2=${f(x2)},\\ s_2=${f(s2)}`] });
  }
  for (const [k, v] of Object.entries({ n1, n2, x1, x2 })) if (v === undefined || Number.isNaN(v)) throw new Error(`Faltan datos: ${k}`);
  const conocidas = d.sigma1 !== undefined && d.sigma2 !== undefined;
  const v1 = conocidas ? d.sigma1 ** 2 : s1 ** 2, v2 = conocidas ? d.sigma2 ** 2 : s2 ** 2;
  if ([v1, v2].some(Number.isNaN)) throw new Error("Faltan datos: s₁ y s₂ (o σ₁ y σ₂)");
  const d0 = d.d0 ?? 0, dif = x1 - x2;
  const sg = conocidas ? "\\sigma" : "s";
  pasosDatos.push({ titulo: "Datos", lineas: [
    `n_1=${dv(n1)},\\ \\bar{x}_1=${dv(x1)},\\ ${sg}_1=${dv(Math.sqrt(v1))}`,
    `n_2=${dv(n2)},\\ \\bar{x}_2=${dv(x2)},\\ ${sg}_2=${dv(Math.sqrt(v2))}`,
    `d_0=${dv(d0)}`] });
  const M = { tema: TIPOS_PH.ph_dif_medias, param: "\\mu_1-\\mu_2", v0: dv(d0), pasosDatos, pasosEst: [], supuestos: ["Muestras independientes", "Poblaciones normales (o n₁, n₂ ≥ 30)"] };
  if (conocidas || (n1 >= 30 && n2 >= 30)) {
    const ee = Math.sqrt(v1 / n1 + v2 / n2), z = (dif - d0) / ee;
    Object.assign(M, { tabla: "C.3 (Z)", fam: "z", est: z, gl: null, gl2: null,
      formula: `Z = \\dfrac{(\\bar{x}_1-\\bar{x}_2)-d_0}{\\sqrt{${sg}_1^2/n_1+${sg}_2^2/n_2}}`,
      textoDist: conocidas ? "Varianzas poblacionales conocidas: se usa Z." : "Ambas muestras son grandes (n ≥ 30): se usa Z con s₁² y s₂².",
      linEst: [`Z = \\dfrac{(${f(x1)}-${f(x2)})-${f(d0)}}{\\sqrt{\\dfrac{${f(v1)}}{${n1}}+\\dfrac{${f(v2)}}{${n2}}}} = \\dfrac{${f(dif - d0)}}{${f(ee, 5)}} = ${f(z)}`] });
  } else if (o.varianzasIguales === true) {
    const gl = n1 + n2 - 2, sp2 = ((n1 - 1) * v1 + (n2 - 1) * v2) / gl, ee = Math.sqrt(sp2 / n1 + sp2 / n2), t = (dif - d0) / ee;
    M.pasosEst.push({ titulo: "Varianza combinada", lineas: [`s_p^2 = \\dfrac{(n_1-1)s_1^2+(n_2-1)s_2^2}{n_1+n_2-2} = \\dfrac{(${n1}-1)(${f(v1)})+(${n2}-1)(${f(v2)})}{${n1}+${n2}-2} = ${f(sp2)}`, `\\nu = n_1+n_2-2 = ${gl}`] });
    Object.assign(M, { tabla: "t de Student", fam: "t", est: t, gl, gl2: null,
      formula: "t = \\dfrac{(\\bar{x}_1-\\bar{x}_2)-d_0}{\\sqrt{s_p^2/n_1+s_p^2/n_2}}",
      textoDist: "Muestras pequeñas, varianzas desconocidas pero iguales: t de Student con n₁ + n₂ − 2 grados de libertad.",
      linEst: [`t = \\dfrac{(${f(x1)}-${f(x2)})-${f(d0)}}{\\sqrt{\\dfrac{${f(sp2)}}{${n1}}+\\dfrac{${f(sp2)}}{${n2}}}} = ${f(t)}`] });
  } else if (o.varianzasIguales === false) {
    const a = v1 / n1, b = v2 / n2, gl = Math.round((a + b) ** 2 / (a ** 2 / (n1 - 1) + b ** 2 / (n2 - 1))), t = (dif - d0) / Math.sqrt(a + b);
    M.pasosEst.push({ titulo: "Grados de libertad (Welch)", lineas: [`\\nu = \\dfrac{(s_1^2/n_1+s_2^2/n_2)^2}{\\frac{(s_1^2/n_1)^2}{n_1-1}+\\frac{(s_2^2/n_2)^2}{n_2-1}} \\approx ${gl}`] });
    Object.assign(M, { tabla: "t de Student", fam: "t", est: t, gl, gl2: null,
      formula: "t = \\dfrac{(\\bar{x}_1-\\bar{x}_2)-d_0}{\\sqrt{s_1^2/n_1+s_2^2/n_2}}",
      textoDist: "Muestras pequeñas, varianzas desconocidas y distintas: t de Student con grados de libertad aproximados (Welch).",
      linEst: [`t = \\dfrac{(${f(x1)}-${f(x2)})-${f(d0)}}{\\sqrt{\\dfrac{${f(v1)}}{${n1}}+\\dfrac{${f(v2)}}{${n2}}}} = ${f(t)}`] });
  } else {
    const e = new Error("Muestras pequeñas: ¿se puede suponer que las varianzas poblacionales son iguales?");
    e.pregunta = { clave: "varianzasIguales", opciones: [{ etiqueta: "Sí, iguales", valor: true }, { etiqueta: "No, distintas", valor: false }] };
    throw e;
  }
  return M;
};

const motorVarianza = d => {
  let { n, s, ssq } = d;
  const pasosDatos = [];
  if (Array.isArray(d.crudos) && d.crudos.length > 1) { const r = resumen(d.crudos); n = r.n; ssq = r.s2; pasosDatos.push({ titulo: "Calcular s² a partir de los datos", lineas: [`n = ${n},\\quad s^2 = ${f(ssq)}`] }); }
  if (ssq === undefined && s !== undefined) ssq = s * s;
  if (n === undefined || ssq === undefined) throw new Error("Faltan datos: n y s²");
  const gl = n - 1, s0 = d.sigma0sq, x2 = gl * ssq / s0;
  pasosDatos.push({ titulo: "Datos", lineas: [`n = ${dv(n)},\\quad s^2 = ${dv(ssq)},\\quad \\sigma_0^2 = ${dv(s0)},\\quad \\nu = n-1 = ${gl}`] });
  return { tema: TIPOS_PH.ph_varianza, tabla: "χ² (Tabla C.4)", fam: "chi2", est: x2, gl, gl2: null, param: "\\sigma^2", v0: dv(s0), pasosDatos, pasosEst: [],
    formula: "\\chi^2 = \\dfrac{(n-1)s^2}{\\sigma_0^2}", supuestos: ["Población normal"], textoDist: "La población es normal: la varianza muestral sigue una χ² con n − 1 grados de libertad.",
    linEst: [`\\chi^2 = \\dfrac{(${n}-1)(${f(ssq)})}{${f(s0)}} = ${f(x2)}`] };
};

const motorCociente = d => {
  const v1 = d.s1sq ?? d.s1 ** 2, v2 = d.s2sq ?? d.s2 ** 2;
  if ([v1, v2].some(Number.isNaN)) throw new Error("Faltan datos: s₁² y s₂²");
  const g1 = d.n1 - 1, g2 = d.n2 - 1, F = v1 / v2;
  return { tema: TIPOS_PH.ph_cociente, tabla: "F (Tabla C.6)", fam: "f", est: F, gl: g1, gl2: g2, param: "\\sigma_1^2", param2: "\\sigma_2^2", v0: null,
    pasosDatos: [{ titulo: "Datos", lineas: [`n_1 = ${dv(d.n1)},\\ s_1^2 = ${dv(v1)}\\qquad n_2 = ${dv(d.n2)},\\ s_2^2 = ${dv(v2)}`, `\\nu_1 = n_1-1 = ${g1},\\quad \\nu_2 = n_2-1 = ${g2}`] }], pasosEst: [],
    formula: "F = \\dfrac{s_1^2}{s_2^2}", supuestos: ["Ambas poblaciones normales", "Muestras independientes"], textoDist: "Poblaciones normales e independientes: el cociente de varianzas muestrales sigue una F con (n₁ − 1, n₂ − 1) grados de libertad.",
    linEst: [`F = \\dfrac{s_1^2}{s_2^2} = \\dfrac{${f(v1)}}{${f(v2)}} = ${f(F)}`] };
};

const motorCorrelacion = d => {
  let { n, r } = d;
  const pasosDatos = [];
  if (Array.isArray(d.crudosx) && Array.isArray(d.crudosy)) {
    const a = ajuste(d.crudosx, d.crudosy); n = a.n; r = a.r;
    pasosDatos.push({ titulo: "Calcular r a partir de los datos", lineas: [`r = \\dfrac{S_{xy}}{\\sqrt{S_{xx}S_{yy}}} = \\dfrac{${f(a.Sxy)}}{\\sqrt{(${f(a.Sxx)})(${f(a.Syy)})}} = ${f(r)}`] });
  }
  if (n === undefined || r === undefined) throw new Error("Faltan datos: n y r");
  if (!(Math.abs(r) < 1)) throw new Error("r debe estar entre −1 y 1 (sin ser ±1)");
  const rho0 = d.rho0 ?? 0;
  if (!(Math.abs(rho0) < 1)) throw new Error("ρ₀ debe estar entre −1 y 1");
  pasosDatos.push({ titulo: "Datos", lineas: [`n = ${dv(n)},\\quad r = ${dv(r)},\\quad \\rho_0 = ${dv(rho0)}`] });
  const M = { tema: TIPOS_PH.ph_correlacion, param: "\\rho", v0: dv(rho0), pasosDatos, pasosEst: [], supuestos: ["La población de pares (x, y) es binormal"] };
  if (rho0 === 0) {
    if (n < 3) throw new Error("Se necesitan al menos 3 pares");
    const gl = n - 2, t = r * Math.sqrt(gl) / Math.sqrt(1 - r * r);
    Object.assign(M, { tabla: "t (ρ₀ = 0)", fam: "t", est: t, gl, gl2: null, formula: "t = \\dfrac{r\\sqrt{n-2}}{\\sqrt{1-r^2}},\\quad \\nu = n-2",
      textoDist: "Para ρ₀ = 0 el estadístico sigue una t de Student con n − 2 grados de libertad.",
      linEst: [`t = \\dfrac{(${f(r)})\\sqrt{${n}-2}}{\\sqrt{1-(${f(r)})^2}} = ${f(t)},\\qquad \\nu = ${gl}`] });
  } else {
    if (n < 4) throw new Error("Se necesitan al menos 4 pares");
    const z = Math.sqrt(n - 3) / 2 * Math.log(((1 + r) * (1 - rho0)) / ((1 - r) * (1 + rho0)));
    Object.assign(M, { tabla: "Z de Fisher (ρ₀ ≠ 0)", fam: "z", est: z, gl: null, gl2: null, formula: "Z = \\dfrac{\\sqrt{n-3}}{2}\\ln\\dfrac{(1+r)(1-\\rho_0)}{(1-r)(1+\\rho_0)}",
      textoDist: "Para ρ₀ ≠ 0 se usa la transformación de Fisher: Z es aproximadamente normal estándar.",
      linEst: [`Z = \\dfrac{\\sqrt{${n}-3}}{2}\\ln\\dfrac{(1+${f(r)})(1-${f(rho0)})}{(1-${f(r)})(1+${f(rho0)})} = ${f(z)}`] });
  }
  return M;
};

const motorProporcion = d => {
  const { n, x, p0 } = d;
  const p = d.p ?? (x !== undefined && n ? x / n : undefined);
  if (n === undefined || p === undefined) throw new Error("Faltan datos: n y x (o p̂)");
  if (!(p0 > 0 && p0 < 1)) throw new Error("La proporción hipotética p₀ debe estar entre 0 y 1 (por ejemplo 0,5 o 50 %)");
  const ee = Math.sqrt(p0 * (1 - p0) / n), z = (p - p0) / ee, ok = n * p0 >= 5 && n * (1 - p0) >= 5;
  return { tema: TIPOS_PH.ph_proporcion, tabla: "C.3 (Z)", fam: "z", est: z, gl: null, gl2: null, param: "p", v0: dv(p0), pasosEst: [],
    pasosDatos: [{ titulo: "Datos", lineas: [x !== undefined ? `n = ${dv(n)},\\ x = ${dv(x)} \\Rightarrow \\hat{p} = \\dfrac{x}{n} = ${f(p)}` : `n = ${dv(n)},\\ \\hat{p} = ${dv(p)}`, `p_0 = ${dv(p0)}`] }],
    formula: "Z = \\dfrac{\\hat{p}-p_0}{\\sqrt{p_0(1-p_0)/n}}", supuestos: ["n p₀ ≥ 5 y n(1−p₀) ≥ 5"],
    textoDist: ok ? "n p₀ ≥ 5 y n(1−p₀) ≥ 5: p̂ es aproximadamente normal, se usa Z." : "⚠ No se cumplen n p₀ ≥ 5 y n(1−p₀) ≥ 5: la aproximación normal no es fiable.",
    linEst: [`Z = \\dfrac{${f(p)}-${f(p0)}}{\\sqrt{\\dfrac{${f(p0)}(1-${f(p0)})}{${n}}}} = \\dfrac{${f(p - p0)}}{${f(ee, 5)}} = ${f(z)}`] };
};

const motorDifProporciones = d => {
  const { n1, n2 } = d;
  if (n1 === undefined || n2 === undefined) throw new Error("Faltan datos: n₁ y n₂");
  const p1 = d.p1 ?? d.x1 / n1, p2 = d.p2 ?? d.x2 / n2, d0 = d.d0 ?? 0;
  if ([p1, p2].some(Number.isNaN)) throw new Error("Faltan datos: x₁ y x₂ (o p̂₁ y p̂₂)");
  const pasosEst = [], dif = p1 - p2;
  let ee, linEst, formula, textoDist;
  if (d0 === 0) {
    const pb = (n1 * p1 + n2 * p2) / (n1 + n2);
    ee = Math.sqrt(pb * (1 - pb) * (1 / n1 + 1 / n2));
    pasosEst.push({ titulo: "Proporción combinada", lineas: [`\\bar{p} = \\dfrac{n_1\\hat{p}_1+n_2\\hat{p}_2}{n_1+n_2} = \\dfrac{${n1}(${f(p1)})+${n2}(${f(p2)})}{${n1}+${n2}} = ${f(pb)}`] });
    formula = "Z = \\dfrac{\\hat{p}_1-\\hat{p}_2}{\\sqrt{\\bar{p}(1-\\bar{p})\\left(\\frac{1}{n_1}+\\frac{1}{n_2}\\right)}}";
    textoDist = "Con H₀: p₁ = p₂ se usa la proporción combinada p̄ en el error estándar; Z es aproximadamente normal.";
    linEst = [`Z = \\dfrac{${f(p1)}-${f(p2)}}{\\sqrt{${f(pb)}(1-${f(pb)})\\left(\\frac{1}{${n1}}+\\frac{1}{${n2}}\\right)}} = \\dfrac{${f(dif)}}{${f(ee, 5)}} = ${f(dif / ee)}`];
  } else {
    ee = Math.sqrt(p1 * (1 - p1) / n1 + p2 * (1 - p2) / n2);
    formula = "Z = \\dfrac{(\\hat{p}_1-\\hat{p}_2)-d_0}{\\sqrt{\\hat{p}_1\\hat{q}_1/n_1+\\hat{p}_2\\hat{q}_2/n_2}}";
    textoDist = "Con una diferencia hipotética d₀ ≠ 0 no se combinan las proporciones; Z es aproximadamente normal.";
    linEst = [`Z = \\dfrac{(${f(p1)}-${f(p2)})-${f(d0)}}{${f(ee, 5)}} = ${f((dif - d0) / ee)}`];
  }
  return { tema: TIPOS_PH.ph_dif_proporciones, tabla: "C.3 (Z)", fam: "z", est: (dif - d0) / ee, gl: null, gl2: null, param: "p_1-p_2", v0: dv(d0), pasosEst,
    pasosDatos: [{ titulo: "Datos", lineas: [`n_1 = ${dv(n1)},\\ ${d.x1 !== undefined ? `x_1 = ${dv(d.x1)} \\Rightarrow ` : ""}\\hat{p}_1 = ${f(p1)}`, `n_2 = ${dv(n2)},\\ ${d.x2 !== undefined ? `x_2 = ${dv(d.x2)} \\Rightarrow ` : ""}\\hat{p}_2 = ${f(p2)}`, `d_0 = ${dv(d0)}`] }],
    formula, supuestos: ["Muestras independientes", "n₁p̂₁, n₁q̂₁, n₂p̂₂, n₂q̂₂ ≥ 5"], textoDist, linEst };
};

const motorMedia = d => {
  let { n, xbar, s } = d;
  const pasosDatos = [];
  if (Array.isArray(d.crudos) && d.crudos.length > 1) {
    const r = resumen(d.crudos); n = r.n; xbar = r.xbar; s = r.s;
    pasosDatos.push({ titulo: "Calcular x̄ y s a partir de los datos", lineas: [`n = ${n},\\quad \\bar{x} = ${f(xbar)},\\quad s = ${f(s)}`] });
  }
  const conocida = d.sigma !== undefined && d.sigma !== null, sd = conocida ? d.sigma : s, mu0 = d.mu0;
  if (n === undefined || xbar === undefined || sd === undefined || Number.isNaN(sd)) throw new Error("Faltan datos: n, x̄ y σ (o s)");
  const sg = conocida ? "\\sigma" : "s", usaZ = conocida || n >= 30, ee = sd / Math.sqrt(n), est = (xbar - mu0) / ee, gl = usaZ ? null : n - 1;
  pasosDatos.push({ titulo: "Datos", lineas: [`n = ${dv(n)},\\ \\bar{x} = ${dv(xbar)},\\ ${sg} = ${dv(sd)},\\ \\mu_0 = ${dv(mu0)}`] });
  return { tema: TIPOS_PH.ph_media, tabla: usaZ ? "C.3 (Z)" : "t de Student", fam: usaZ ? "z" : "t", est, gl, gl2: null, param: "\\mu", v0: dv(mu0), pasosDatos, pasosEst: [],
    formula: `${usaZ ? "Z" : "t"} = \\dfrac{\\bar{x}-\\mu_0}{${sg}/\\sqrt{n}}`, supuestos: conocida || n >= 30 ? ["Muestra grande (n ≥ 30) o σ conocida"] : ["Población normal, σ desconocida y n < 30"],
    textoDist: conocida ? "σ es conocida: se usa Z." : n >= 30 ? "σ es desconocida pero n ≥ 30: s sustituye a σ y se usa Z." : `σ es desconocida y n < 30: se usa la t de Student con n − 1 = ${n - 1} grados de libertad.`,
    linEst: [`${usaZ ? "Z" : "t"} = \\dfrac{${f(xbar)}-${f(mu0)}}{${f(sd)}/\\sqrt{${n}}} = \\dfrac{${f(xbar - mu0)}}{${f(ee, 5)}} = ${f(est)}`] };
};

const motorPareadas = d => {
  let { n, dbar, sd } = d;
  const pasosDatos = [], d0 = d.d0 ?? 0;
  if (Array.isArray(d.crudos1) && Array.isArray(d.crudos2)) {
    if (d.crudos1.length !== d.crudos2.length) throw new Error(`Los datos pareados deben tener la misma cantidad de valores (hay ${d.crudos1.length} y ${d.crudos2.length})`);
    const dif = d.crudos1.map((v, i) => v - d.crudos2[i]), r = resumen(dif);
    n = r.n; dbar = r.xbar; sd = r.s;
    pasosDatos.push({ titulo: "Diferencias dᵢ = primera − segunda medición", texto: dif.map(v => num(v)).join("; "), lineas: [`n = ${n},\\quad \\bar{d} = \\dfrac{\\sum d_i}{n} = ${f(dbar)},\\quad s_d = \\sqrt{\\dfrac{\\sum (d_i-\\bar{d})^2}{n-1}} = ${f(sd)}`] });
  }
  if (n === undefined || dbar === undefined || sd === undefined) throw new Error("Faltan datos: n, d̄ y s_d (o las dos listas de datos)");
  const gl = n - 1, ee = sd / Math.sqrt(n), t = (dbar - d0) / ee;
  pasosDatos.push({ titulo: "Datos", lineas: [`n = ${dv(n)},\\ \\bar{d} = ${dv(dbar)},\\ s_d = ${dv(sd)},\\ d_0 = ${dv(d0)}`] });
  return { tema: TIPOS_PH.ph_pareadas, tabla: "t de Student", fam: "t", est: t, gl, gl2: null, param: "\\mu_D", v0: dv(d0), pasosDatos, pasosEst: [],
    formula: "t = \\dfrac{\\bar{d}-d_0}{s_d/\\sqrt{n}},\\quad \\nu = n-1", supuestos: ["Datos pareados", "Las diferencias siguen una distribución normal"],
    textoDist: `Datos pareados: se trabaja con las diferencias y se usa la t de Student con n − 1 = ${gl} grados de libertad.`,
    linEst: [`t = \\dfrac{${f(dbar)}-${f(d0)}}{${f(sd)}/\\sqrt{${n}}} = \\dfrac{${f(dbar - d0)}}{${f(ee, 5)}} = ${f(t)}`] };
};

const motorPendiente = (d, o) => {
  let { n, b1, seb1, b0, seb0 } = d;
  const pasosDatos = [];
  if (Array.isArray(d.crudosx) && Array.isArray(d.crudosy)) {
    if (d.crudosx.length !== d.crudosy.length) throw new Error(`x tiene ${d.crudosx.length} datos e y tiene ${d.crudosy.length}: deben ser pares`);
    const a = ajuste(d.crudosx, d.crudosy);
    n = a.n; b1 = a.b1; seb1 = a.seB1; b0 = a.b0; seb0 = a.seB0;
    pasosDatos.push({ titulo: "Ajustar la recta y su error típico", lineas: [
      `b_1 = \\dfrac{S_{xy}}{S_{xx}} = \\dfrac{${f(a.Sxy)}}{${f(a.Sxx)}} = ${f(b1)},\\qquad b_0 = \\bar{y}-b_1\\bar{x} = ${f(b0)}`,
      `s_e = \\sqrt{\\dfrac{SCE}{n-2}} = ${f(a.se)},\\qquad s(b_1) = \\dfrac{s_e}{\\sqrt{S_{xx}}} = ${f(seb1)},\\qquad s(b_0) = s_e\\sqrt{\\dfrac{1}{n}+\\dfrac{\\bar{x}^2}{S_{xx}}} = ${f(seb0)}`] });
  }
  const inter = o.coef === "intercepto" || (d.b1 === undefined && d.b0 !== undefined && !d.crudosx);
  const b = inter ? b0 : b1, se = inter ? seb0 : seb1, h0 = inter ? d.beta00 ?? 0 : d.beta10 ?? 0, nom = inter ? "0" : "1";
  if (n === undefined || b === undefined || se === undefined) throw new Error(`Faltan datos: n, b${inter ? "₀" : "₁"} y su error típico (o las listas x e y)`);
  if (!(se > 0)) throw new Error("El error típico debe ser positivo");
  const gl = n - 2, t = (b - h0) / se, tc = tCrit(d.alfa / 2, gl);
  pasosDatos.push({ titulo: "Datos", lineas: [`n = ${dv(n)},\\ b_${nom} = ${dv(b)},\\ s(b_${nom}) = ${dv(se)},\\ \\beta_${nom}^{\\,0} = ${dv(h0)},\\ \\nu = n-2 = ${gl}`] });
  return { tema: TIPOS_PH.ph_pendiente, tabla: "t de Student", fam: "t", est: t, gl, gl2: null, param: `\\beta_${nom}`, v0: dv(h0), pasosDatos, pasosEst: [],
    formula: `t = \\dfrac{b_${nom}-\\beta_${nom}^{\\,0}}{s(b_${nom})},\\quad \\nu = n-2`, supuestos: ["Relación lineal; errores independientes, normales y de varianza constante"],
    textoDist: `Para ${inter ? "el intercepto" : "la pendiente"} el estadístico sigue una t de Student con n − 2 = ${gl} grados de libertad.`,
    linEst: [`t = \\dfrac{${f(b)}-${f(h0)}}{${f(se)}} = ${f(t)}`],
    pasosExtra: [{ titulo: `Intervalo de confianza para β${inter ? "₀" : "₁"} (dato extra)`, lineas: [`b_${nom} \\pm t_{\\alpha/2}\\,s(b_${nom}) = ${f(b)} \\pm ${f(tc)}\\cdot ${f(se)}`, `${f(b - tc * se)} < \\beta_${nom} < ${f(b + tc * se)}`] }] };
};

const MOTORES = {
  ph_proporcion: motorProporcion, ph_dif_proporciones: motorDifProporciones, ph_media: motorMedia, ph_pareadas: motorPareadas, ph_pendiente: motorPendiente, ph_dif_medias: motorDifMedias, ph_varianza: motorVarianza, ph_cociente: motorCociente, ph_correlacion: motorCorrelacion };

export function resolverHipotesis(tipo, d, o = {}) {
  const faltan = faltantesPH(tipo, d);
  if (faltan.length) throw new Error(`Faltan datos: ${faltan.join(", ")}`);
  const alfa = d.alfa;
  if (!(alfa > 0 && alfa < 1)) throw new Error("El nivel de significancia α debe estar entre 0 y 1");
  const cola = o.cola ?? "dos";
  const M = MOTORES[tipo](d, o);
  const { fam, est, gl, gl2 } = M, b = B[fam], bt = BT[fam];
  const args = fam === "z" ? "" : fam === "f" ? `(${gl},${gl2})` : `(${gl})`;
  const argsT = fam === "z" ? "" : fam === "f" ? `; ${gl}, ${gl2}` : `; ${gl}`;
  const c = critico(fam, cola, alfa, gl, gl2);
  const rechaza = (c.lo != null && est <= c.lo) || (c.hi != null && est >= c.hi);
  const { h0, h1 } = frases(tipo, cola, d, o);

  /* hipótesis en símbolos */
  const P = M.param, V = M.v0;
  const dosPar = tipo === "ph_cociente";
  const sym = { dos: ["=", "\\ne"], der: ["\\le", ">"], izq: ["\\ge", "<"] }[cola];
  const lH = dosPar ? [`H_0:\\ \\sigma_1^2 ${sym[0]}\\ \\sigma_2^2`, `H_1:\\ \\sigma_1^2 ${sym[1]}\\ \\sigma_2^2`] : [`H_0:\\ ${P} ${sym[0]} ${V}`, `H_1:\\ ${P} ${sym[1]} ${V}`];

  /* etiquetas de los valores críticos */
  const etq = a => `${b}_{${f(a)}}${args}`;
  const lineasCrit = [`\\alpha = ${dv(alfa)}${cola === "dos" ? `\\ \\Rightarrow\\ \\alpha/2 = ${f(alfa / 2)}` : ""}`];
  const pm = fam === "z" || fam === "t";
  if (cola === "der") lineasCrit.push(`${etq(alfa)} = ${f(c.hi)}`);
  else if (cola === "izq") lineasCrit.push(pm ? `-${etq(alfa)} = ${f(c.lo)}` : `${etq(1 - alfa)} = ${f(c.lo)}`);
  else lineasCrit.push(pm ? `\\pm ${etq(alfa / 2)} = \\pm ${f(c.hi)}` : `${etq(1 - alfa / 2)} = ${f(c.lo)},\\qquad ${etq(alfa / 2)} = ${f(c.hi)}`);
  if (fam === "f" && c.lo != null) lineasCrit.push(`F_{${f(cola === "dos" ? 1 - alfa / 2 : 1 - alfa)}}(${gl},${gl2}) = \\dfrac{1}{F_{${f(c.a)}}(${gl2},${gl})} = ${f(c.lo)}`);
  const regla = { der: `Se rechaza H₀ si ${bt} ≥ ${bt}α.`, izq: pm ? `Se rechaza H₀ si ${bt} ≤ −${bt}α.` : `Se rechaza H₀ si ${bt} ≤ ${bt}₁₋α.`, dos: pm ? `Se rechaza H₀ si ${bt} ≤ −${bt}α/2 o ${bt} ≥ ${bt}α/2.` : `Se rechaza H₀ si ${bt} ≤ ${bt}₁₋α/2 o ${bt} ≥ ${bt}α/2.` }[cola];

  /* decisión */
  const E = `${b}`;
  const critTxt = (v, a, bajo) => (pm ? `${bajo ? "-" : ""}${bt}(${num(a)}${argsT}) = ${num(v)}` : `${bt}(${num(bajo ? 1 - a : a)}${argsT}) = ${num(v)}`);
  let lineaDec, comp;
  if (cola === "der") {
    lineaDec = `${E} = ${f(est)} ${rechaza ? "\\ge" : "<"} ${f(c.hi)}`;
    comp = `${bt} = ${num(est)} ${rechaza ? "es mayor que" : "es menor que"} ${critTxt(c.hi, c.a, false)}`;
  } else if (cola === "izq") {
    lineaDec = `${E} = ${f(est)} ${rechaza ? "\\le" : ">"} ${f(c.lo)}`;
    comp = `${bt} = ${num(est)} ${rechaza ? "es menor que" : "es mayor que"} ${critTxt(c.lo, c.a, true)}`;
  } else if (est <= c.lo) { lineaDec = `${E} = ${f(est)} \\le ${f(c.lo)}`; comp = `${bt} = ${num(est)} es menor que ${critTxt(c.lo, c.a, true)}`; }
  else if (est >= c.hi) { lineaDec = `${E} = ${f(est)} \\ge ${f(c.hi)}`; comp = `${bt} = ${num(est)} es mayor que ${critTxt(c.hi, c.a, false)}`; }
  else { lineaDec = `${f(c.lo)} < ${E} = ${f(est)} < ${f(c.hi)}`; comp = `${bt} = ${num(est)} queda entre ${num(c.lo)} y ${num(c.hi)} (fuera de la región crítica)`; }
  const decTxt = rechaza ? "Se rechaza H₀" : "No se rechaza H₀";

  /* valor P */
  const F0 = cdfDe(fam, est, gl, gl2);
  const valorP = cola === "der" ? 1 - F0 : cola === "izq" ? F0 : 2 * Math.min(F0, 1 - F0);
  const tailTex = cola === "der" ? `P(${b} \\ge ${f(est)})` : cola === "izq" ? `P(${b} \\le ${f(est)})` : pm ? `2\\,P(${b} \\ge ${f(Math.abs(est))})` : `2\\min\\{P(${b} \\le ${f(est)}),\\,P(${b} \\ge ${f(est)})\\}`;

  const pasos = [
    ...M.pasosDatos,
    { titulo: "Hipótesis", lineas: lH, texto: `H₀: ${h0}. H₁: ${h1}. Prueba de ${NOMBRE_COLA[cola]}.` },
    { titulo: "Estadístico de prueba", texto: M.textoDist, lineas: [M.formula] },
    ...M.pasosEst,
    { titulo: "Cálculo del estadístico", lineas: M.linEst },
    { titulo: "Punto crítico (región crítica)", lineas: lineasCrit, texto: `${M.tabla}. ${regla}` },
    { titulo: "Decisión", lineas: [`${lineaDec}\\ \\Rightarrow\\ \\text{${decTxt.replace("H₀", "}H_0\\text{")}}`] },
    { titulo: "Valor P (como dato extra)", lineas: [`\\text{Valor }P = ${tailTex} ${fp(valorP)}`], texto: `La decisión se toma con la región crítica; el valor P ${valorP < alfa ? "es menor" : "no es menor"} que α = ${num(alfa)}, lo que ${valorP < alfa === rechaza ? "confirma" : "(por redondeo) no coincide con"} la decisión.` },
    ...(M.pasosExtra ?? [])
  ];

  const conclusion = `Para una prueba al nivel del ${pctTxt(alfa)}, como ${comp}, ${rechaza ? "se rechaza H₀" : "no se rechaza H₀"}, es decir, ${rechaza ? h1 : h0}.`;
  const lim = pm ? (() => { const m = Math.max(Math.abs(c.lo ?? 0), Math.abs(c.hi ?? 0), Math.abs(est)); return [-m, m]; })() : [c.lo ?? 0, Math.max(c.hi ?? 0, est)];
  return {
    id: tipo, tema: M.tema, tabla: M.tabla, formula: M.formula, supuestos: M.supuestos, pasos,
    resultados: [{ etq: "", tex: `${E} = ${f(est)}\\ \\Rightarrow\\ \\text{${decTxt.replace("H₀", "}H_0\\text{")}}`, texto: `${bt} = ${num(est)}; ${decTxt}` }],
    advertencias: [],
    prueba: { h0, h1, cola, estadistico: { simbolo: bt, valor: est, gl, gl2 }, criticos: [c.lo, c.hi].filter(v => v != null), rechaza, valorP },
    grafica: { familia: fam, gl, gl2, lim, prueba: { id: tipo, cola, lo: c.lo, hi: c.hi, est, simbolo: bt, alfa } },
    extra: { gl, gl2, est },
    conclusion
  };
}

/** Las frases automáticas de H₀ y H₁ (para mostrarlas como sugerencia en el editor). */
export const frasesHipotesis = (tipo, d, o = {}) => frases(tipo, o.cola ?? "dos", d, o);
