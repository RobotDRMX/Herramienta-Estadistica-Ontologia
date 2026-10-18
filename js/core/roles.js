// Interpretación de un enunciado en lenguaje natural -> tipo de problema + datos con su papel estadístico.
// 100 % determinista (sin IA). El modo "Con IA" puede refinar este resultado, pero nunca calcula.

import { normalizar, tokenizar, detectarListas, hayCorte, pistas } from "./texto.js";

export const TIPOS = {
  ic_media: "IC para la media",
  ic_proporcion: "IC para la proporción",
  ic_dif_proporciones: "IC para la diferencia de proporciones",
  ic_dif_medias: "IC para la diferencia de medias (independientes)",
  ic_pareadas: "IC para la diferencia de medias (datos pareados)",
  ic_varianza: "IC para la varianza / desviación",
  ic_cociente: "IC para el cociente de varianzas"
};

/* Datos que faltan para poder resolver, por tipo. Devuelve la lista de símbolos pendientes. */
const falta = (d, ...ks) => ks.filter(k => d[k] === undefined || Number.isNaN(d[k]));
const unaDe = (d, ...ks) => (ks.some(k => d[k] !== undefined) ? [] : [ks[0]]);

const REQUERIDOS = {
  ic_media: d => [...falta(d, "confianza"), ...(d.crudos ? [] : [...falta(d, "n", "xbar"), ...unaDe(d, "s", "sigma")])],
  ic_proporcion: d => [...falta(d, "confianza", "n"), ...unaDe(d, "x", "p")],
  ic_dif_proporciones: d => [...falta(d, "confianza", "n1", "n2"), ...unaDe(d, "x1", "p1"), ...unaDe(d, "x2", "p2")],
  ic_dif_medias: d => [...falta(d, "confianza"), ...(d.crudos1 && d.crudos2 ? [] : [...falta(d, "n1", "n2", "x1", "x2"), ...unaDe(d, "s1", "sigma1"), ...unaDe(d, "s2", "sigma2")])],
  ic_pareadas: d => [...falta(d, "confianza"), ...(d.crudos1 && d.crudos2 ? [] : falta(d, "n", "dbar", "sd"))],
  ic_varianza: d => [...falta(d, "confianza"), ...(d.crudos ? [] : [...falta(d, "n"), ...unaDe(d, "s", "s2")])],
  ic_cociente: d => [...falta(d, "confianza", "n1", "n2"), ...unaDe(d, "s1sq", "s1"), ...unaDe(d, "s2sq", "s2")]
};

export const ETIQUETAS = {
  confianza: "nivel de confianza (1−α)", n: "n (tamaño de muestra)", xbar: "x̄ (media muestral)", s: "s (desv. muestral)",
  sigma: "σ (desv. poblacional)", x: "x (éxitos)", p: "p̂ (proporción muestral)", n1: "n₁", n2: "n₂", x1: "x₁ (éxitos)", x2: "x₂ (éxitos)",
  p1: "p̂₁", p2: "p̂₂", s1: "s₁", s2: "s₂", sigma1: "σ₁", sigma2: "σ₂", s1sq: "s₁²", s2sq: "s₂²", dbar: "d̄ (media de diferencias)",
  sd: "s_d (desv. de las diferencias)", crudos: "datos", crudos1: "datos muestra 1", crudos2: "datos muestra 2"
};

/* ---------------- utilidades ---------------- */

const SIN_CONTAR = /sin\s+(?:hacer|realizar|efectuar)\s+(?:los\s+)?calculos/;
const UNIDADES = /^\s*(?:anos?|meses|dias?|horas?|minutos?|segundos?|kilos?|kilogramos?|kg|gramos?|kilometros?|km|metros?|centimetros?|cm|mm|mililitros?|ml|litros?|libras?|pesos|millones|miles|grados|puntos|escala)\b/;

/** Un ejercicio con incisos: conserva el preámbulo y solo los incisos que piden el intervalo. */
function filtrarIncisos(orig) {
  const partes = orig.split(/\(\s*[a-dA-D]\s*\)/);
  if (partes.length < 2) return orig;
  const [pre, ...resto] = partes;
  const buenos = resto.filter(p => /interval|confian|estim|calcul|constru/i.test(p) && !SIN_CONTAR.test(normalizar(p)));
  return buenos.length ? [pre, ...buenos].join(" ") : orig;
}

const frase = (orig, t) => orig.slice(Math.max(0, t.ini - 28), Math.min(orig.length, t.fin + 28)).replace(/\s+/g, " ").trim();

function sentenciaDe(n, pos) {
  let a = pos, b = pos;
  while (a > 0 && !/[.?!]\s/.test(n.slice(a - 2, a))) a--;
  while (b < n.length && !/[.?!](\s|$)/.test(n.slice(b, b + 2))) b++;
  return n.slice(a, b + 1);
}

/* ---------------- confianza / alfa ---------------- */

function extraerConfianza(n, toks, notas) {
  const cands = [];
  for (const t of toks) {
    if (t.palabra || t.lista) continue;
    const antes = n.slice(Math.max(0, t.ini - 30), t.ini), despues = n.slice(t.fin, t.fin + 40);
    const cerca = /(?:confia[a-z]*|intervalo)\s*(?:de|del|al|es|=|:|de un|en un|de al menos)?\s*$/.test(antes) || /^\s*\)?\s*(?:de\s+)?(?:nivel\s+de\s+|grado\s+de\s+)?confian/.test(despues);
    if (!cerca) continue;
    let v = null;
    if (t.pct && t.valor > 50 && t.valor <= 100) v = t.valor / 100;
    else if (!t.pct && t.valor > 0.5 && t.valor < 1) v = t.valor;
    else if (!t.pct && t.valor > 50 && t.valor <= 100) v = t.valor / 100;
    if (v !== null) cands.push({ v, t });
  }
  if (cands.length) {
    cands.forEach(c => (c.t.uso = "confianza"));
    if (cands.length > 1) notas.push(`Encontré varios niveles de confianza (${cands.map(c => c.t.texto).join(", ")}); usé el primero (${cands[0].t.texto}). Puedes cambiarlo.`);
    return { valor: cands[0].v, tok: cands[0].t };
  }
  // α / nivel de significancia
  for (const t of toks) {
    if (t.palabra || t.lista) continue;
    const antes = n.slice(Math.max(0, t.ini - 30), t.ini);
    if (/(significancia|significacion|alfa|α|riesgo de error|error tipo i)\s*(?:de|del|es|=|:)?\s*(?:de\s+)?$/.test(antes)) {
      const a = t.pct ? t.valor / 100 : t.valor;
      if (a > 0 && a < 0.5) { t.uso = "alfa"; return { valor: 1 - a, tok: t, deAlfa: true }; }
    }
  }
  return null;
}

/* ---------------- tipo de problema ---------------- */

// La petición: lo que viene después de «intervalo» (el punto decimal/de miles no termina la oración)
const RE_INTERVALO = /intervalo((?:[^.?!]|\.(?!\s|$))*)/;
const RE_ESTIMAR = /(?:estimar|estime|estimacion|limites?|cota)((?:[^.?!]|\.(?!\s|$))*)/;

function detectarTipo(n, toks, listas) {
  const m = n.match(RE_INTERVALO) ?? n.match(RE_ESTIMAR);
  const tgt = m ? m[1] : n;
  const hay = re => re.test(tgt);

  const dosIndices = /(?:μ|mu)\s*1.*(?:μ|mu)\s*2|\bx_\s*1.*\bx_\s*2|\bn\s*1\b.*\bn\s*2\b|(?<![a-z])s\s*1\s*=.*(?<![a-z])s\s*2\s*=/.test(n);
  const dosGrupos =
    hay(/diferencia/) || dosIndices || /\bvs\b|versus|otra muestra|segunda muestra|muestra independiente|muestras independientes|dos muestras|\bexperimental\b/.test(n) ||
    listas.length >= 2;
  const mismaLongitud = listas.length >= 2 && listas[0].valores.length === listas[1].valores.length;
  const pareado = /paread|emparejad|antes\s+y\s+despues|mismos?\s+(?:sujetos?|individuos?|trabajadores?|pacientes?|personas?)|cada\s+(?:sujeto|persona|trabajador)|parejas/.test(n) ||
    (mismaLongitud && !/independiente/.test(n));
  // ¿Qué parámetro se pide? Gana la palabra que aparece primero en la petición.
  const pos = re => { const i = tgt.search(re); return i < 0 ? Infinity : i; };
  const pV = pos(/varianza|desviacion|sigma|σ/), pM = pos(/\bmedias?\b|promedio|\bmedio\b/), pP = pos(/proporcion|porcentaje|fraccion|\btasa/);
  const obj = Math.min(pV, pM, pP) === Infinity ? null : pV <= Math.min(pM, pP) ? "V" : pM <= pP ? "M" : "P";
  const prop = obj === "P" || (obj === null && !listas.length && /proporcion|porcentaje|fraccion/.test(n));

  let tipo;
  if ((hay(/cociente|razon/) && /varianza|desviacion|sigma/.test(tgt + n)) || hay(/(?:σ|sigma)\s*1.{0,3}\/\s*(?:σ|sigma)\s*2/)) tipo = "ic_cociente";
  else if (obj === "V" && !hay(/diferencia/)) {
    const nSamples = (n.match(/\bn\s*[12ab]?\s*=|muestra\s+(?:aleatoria\s+)?(?:de|1|2)/g) || []).length;
    tipo = /\b(?:dos|ambas?)\b.*(?:varianza|poblacion)|\bs²\s*[12]|\bvarianzas\b/.test(n) && nSamples >= 2 ? "ic_cociente" : "ic_varianza";
  } else if (dosGrupos && prop) tipo = "ic_dif_proporciones";
  else if (dosGrupos && pareado) tipo = "ic_pareadas";
  else if (dosGrupos) tipo = "ic_dif_medias";
  else if (prop) tipo = "ic_proporcion";
  else {
    // sin pista en la petición: decidir por los datos
    const hayXdeN = /\d\s*(?:de|\/)\s*(?:\w+\s+)?\d/.test(n);
    const hayCuesMedia = /media|promedio|medio|desviacion|varianza/.test(n);
    tipo = (hayXdeN || (!hayCuesMedia && !listas.length)) ? "ic_proporcion" : "ic_media";
  }
  return { tipo, pideDesviacion: obj === "V" && hay(/desviacion|sigma|σ/) && !hay(/varianza/) };
}

/* ---------------- pistas léxicas ---------------- */

const aceptaN = t => t.entero && !t.pct && t.valor >= (t.palabra ? 3 : 2);

function pistasGenerales(n) {
  const cues = [];
  cues.push(...pistas(n, /\bn_?\s*([12ab])?\s*=/g, "n", { acepta: aceptaN }));
  cues.push(...pistas(n, /tamano(?:\s+de(?:\s+la)?\s+muestra)?(?:\s+de)?\s*/g, "n", { acepta: aceptaN }));
  cues.push(...pistas(n, /muestra[s]?\b(?:\s+aleatoria[s]?)?(?:\s+simple)?(?:\s+independiente)?(?:\s+de)?(?:\s+tamano)?(?:\s+de)?\s*/g, "n", { acepta: aceptaN }));
  const noPalabra = { acepta: t => !t.palabra };
  cues.push(...pistas(n, /\b(?:media|medio|promedio)\b(?!\s+(?:desconocid|poblacional))(?:\s+muestral|\s+de\s+la\s+muestra)?/g, "xbar", noPalabra));
  cues.push(...pistas(n, /\bx_\s*([12ab])?\s*=?/g, "xbar", noPalabra));
  cues.push(...pistas(n, /desviacion(?:\s+(?:tipica|estandar|poblacional))?(?:\s+muestral)?/g, "s", noPalabra));
  cues.push(...pistas(n, /(?<![a-z])(?:s|sigma|σ)\s*([12ab])?\s*=/g, "s", noPalabra));
  cues.push(...pistas(n, /varianza(?:\s+muestral)?|\bs²\s*([12ab])?\s*=?|\bs\^2\s*([12ab])?\s*=?/g, "var", noPalabra));
  return cues;
}

/** Asignación por cercanía; si la oración dice "respectivamente", en orden de aparición. */
function asignarPistas(n, toks, cues) {
  const cs = [...cues].sort((a, b) => a.ini - b.ini).map(c => ({ ...c, usada: false }));
  const out = [];
  for (const t of toks) {
    if (t.uso || t.lista) continue;
    const resp = /respectivamente/.test(n.slice(t.fin, t.fin + 70)) && !hayCorte(n, t.fin, t.fin + n.slice(t.fin, t.fin + 70).indexOf("respectivamente"));
    const validas = cs.filter(c => !c.usada && c.fin <= t.ini && t.ini - c.fin <= (c.rol === "n" ? 55 : resp ? 170 : 130) && !hayCorte(n, c.fin, t.ini) && (!c.acepta || c.acepta(t)));
    if (!validas.length) continue;
    const ultima = validas[validas.length - 1];
    // «muestra aleatoria de 9 …», «s²₁ = 176»: la pista pegada al número gana aunque la oración diga «respectivamente»
    const pegada = t.ini - ultima.fin <= 6;
    const c = resp && !pegada ? validas.find(v => v.rol !== "n") ?? validas[0] : ultima;
    c.usada = true; t.uso = c.rol;
    out.push({ rol: c.rol, grupo: c.grupo, tok: t, cue: c });
  }
  return out.sort((a, b) => a.tok.ini - b.tok.ini);
}

/** Reparte en grupos 1/2 según el índice explícito (n1, x2…) o el orden de aparición. */
function conGrupos(asig) {
  const cuenta = {};
  return asig.map(a => {
    cuenta[a.rol] = (cuenta[a.rol] ?? 0) + 1;
    return { ...a, grupo: a.grupo ?? Math.min(cuenta[a.rol], 2) };
  });
}

/* ---------------- llenado por tipo ---------------- */

/** Asigna un dato; si ya había uno (la primera pista manda) libera el número. */
function poner(ctx, simbolo, tok, valor = tok.valor, texto) {
  if (ctx.d[simbolo] !== undefined) { tok.uso = null; return false; }
  tok.uso = tok.uso ?? simbolo;
  ctx.d[simbolo] = valor;
  ctx.ev(simbolo, valor, tok, texto);
  return true;
}

const esUnidad = (n, t) => UNIDADES.test(n.slice(t.fin, t.fin + 20));

/** Enteros libres que parecen un tamaño de muestra («18 estudiantes», «veinte profesores»). */
const ETIQUETA_PREVIA = /(?:condicion|grupo|muestra|tabla|ejercicio|ciudad|colegio|universidad|escuela|distrital|par|numero|caso|tratamiento|marca|seccion|capitulo|pregunta|inciso|estrato|individuo|sujeto)\s+$/;
function candidatosN(n, toks) {
  return toks.filter(t => !t.uso && !t.lista && !t.pct && t.entero && t.valor >= 3 && !esUnidad(n, t) && !ETIQUETA_PREVIA.test(n.slice(Math.max(0, t.ini - 16), t.ini)) &&
    /^\s+[a-z]{4,}/.test(n.slice(t.fin, t.fin + 20)));
}

function xDeN(n, toks) {
  const res = [];
  const re = /(\d{1,3}(?:\.\d{3})+|\d+)\s*(?:de|\/)\s*(?:(?:los|las|estos|estas|esos|esas|sus)\s+)?(\d{1,3}(?:\.\d{3})+|\d+)(?![\d,])/g;
  for (const m of n.matchAll(re)) {
    const t1 = toks.find(t => t.ini === m.index && !t.uso);
    const t2 = toks.find(t => t.fin === m.index + m[0].length && !t.uso);
    if (t1 && t2 && t2.valor > t1.valor) res.push({ x: t1, n: t2, ini: m.index });
  }
  return res;
}

function listasDe(listas, ctx) {
  // Tablas partidas en dos bloques: [x1, y1, x2, y2] -> x = x1+x2, y = y1+y2
  if (listas.length === 4) return [[...listas[0].valores, ...listas[2].valores], [...listas[1].valores, ...listas[3].valores], listas[0].toks[0], listas[1].toks[0]];
  return [listas[0].valores, listas[1].valores, listas[0].toks[0], listas[1].toks[0]];
}

function llenarMedia(ctx) {
  const { n, toks, listas, d, ev } = ctx;
  if (listas.length) { d.crudos = listas[0].valores; ev("crudos", d.crudos, listas[0].toks[0], `${d.crudos.length} datos`); return; }
  const as = asignarPistas(n, toks, pistasGenerales(n));
  for (const a of as) {
    if (a.rol === "n") poner(ctx, "n", a.tok);
    else if (a.rol === "xbar") poner(ctx, "xbar", a.tok);
    else if (a.rol === "s") {
      const sent = sentenciaDe(n, a.tok.ini);
      const hayMuestraEnTexto = /muestr/.test(n);
      const cueTxt = n.slice(a.cue.ini, a.cue.fin);
      const sigma = !/desconocid/.test(sent) && (/poblacional/.test(cueTxt) || /se sabe|conocid|sigma|σ/.test(sent) || (hayMuestraEnTexto && !/muestr/.test(sent)));
      poner(ctx, sigma ? "sigma" : "s", a.tok);
    } else if (a.rol === "var") poner(ctx, "s", a.tok, Math.sqrt(a.tok.valor), `s² = ${a.tok.valor}`);
  }
  if (d.n === undefined) {
    const t = candidatosN(n, toks)[0] ?? toks.find(t => !t.uso && !t.lista && t.entero && !t.pct && t.valor >= 2 && !t.palabra && !esUnidad(n, t));
    if (t) { poner(ctx, "n", t); ctx.notas.push("Supuse que el primer entero libre es n; verifícalo."); }
  }
}

function llenarProporcion(ctx) {
  const { n, toks, d, ev } = ctx;
  const pares = xDeN(n, toks);
  if (pares.length) {
    const p = pares[0]; p.x.uso = "x"; p.n.uso = "n";
    d.x = p.x.valor; d.n = p.n.valor; ev("x", d.x, p.x); ev("n", d.n, p.n); return;
  }
  // «3 de cada 5», «cuatro de cada diez»: la fracción ya es la proporción
  const cada = n.match(/\b(\d+|uno|una|un|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+de\s+cada\s+(\d+|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|veinte|cien)\b/);
  if (cada) {
    const aNum = s => (/^\d+$/.test(s) ? Number(s) : { uno: 1, una: 1, un: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, veinte: 20, cien: 100 }[s]);
    const p = aNum(cada[1]) / aNum(cada[2]);
    const enRango = toks.filter(t => t.ini >= cada.index && t.fin <= cada.index + cada[0].length);
    enRango.forEach(t => (t.uso = "fraccion"));
    ctx.fraccion = { p, tok: enRango[0], texto: cada[0] };
  }
  for (const a of asignarPistas(n, toks, pistasGenerales(n).filter(c => c.rol === "n"))) poner(ctx, "n", a.tok);
  if (d.n === undefined) { const t = candidatosN(n, toks)[0]; if (t) poner(ctx, "n", t); }
  const libres = toks.filter(t => !t.uso && !t.lista && !t.palabra && !esUnidad(n, t));
  const nIni = toks.find(t => t.uso === "n")?.ini ?? -1;
  const cuentas = libres.filter(t => t.entero && !t.pct && (d.n === undefined || (t.valor <= d.n && t.valor !== d.n)));
  const cuenta = cuentas.find(t => t.ini > nIni) ?? cuentas[0];
  const pct = libres.find(t => t.pct || (!t.entero && t.valor > 1 && t.valor < 100));
  if (cuenta) poner(ctx, "x", cuenta);
  else if (pct) poner(ctx, "p", pct, pct.valor / 100, `${pct.texto}${pct.pct ? "" : " (leído como %)"}`);
  else if (ctx.fraccion && ctx.fraccion.tok) { d.p = ctx.fraccion.p; ev("p", d.p, ctx.fraccion.tok, ctx.fraccion.texto); }
}

function llenarDifProporciones(ctx) {
  const { n, toks, d, ev, notas } = ctx;
  const pares = xDeN(n, toks);
  if (pares.length >= 2) {
    [1, 2].forEach((g, i) => { const p = pares[i]; p.x.uso = "x" + g; p.n.uso = "n" + g; d["x" + g] = p.x.valor; d["n" + g] = p.n.valor; ev("x" + g, p.x.valor, p.x); ev("n" + g, p.n.valor, p.n); });
    return;
  }
  const libres = toks.filter(t => !t.uso && !t.lista && !t.palabra && !esUnidad(n, t));
  const pcts = libres.filter(t => t.pct || (!t.entero && t.valor > 1 && t.valor < 100));
  const enteros = libres.filter(t => t.entero && !t.pct);
  const mitad = /mitad/.test(n);

  if (pcts.length >= 2 && enteros.length >= 1) {
    const usados = new Set();
    pcts.slice(0, 2).forEach((pc, i) => {
      const g = i + 1;
      const cand = enteros.filter(e => !usados.has(e)).sort((a, b) => Math.abs(a.ini - pc.ini) - Math.abs(b.ini - pc.ini))[0];
      if (cand) { usados.add(cand); d["n" + g] = cand.valor; cand.uso = "n" + g; ev("n" + g, cand.valor, cand); }
      d["p" + g] = pc.valor / 100; pc.uso = "p" + g; ev("p" + g, d["p" + g], pc);
    });
    if (d.n2 === undefined && d.n1 !== undefined) { d.n2 = d.n1; notas.push("Supuse n₂ = n₁ (solo aparece un tamaño de muestra)."); }
    return;
  }
  if (mitad && enteros.length >= 3) {
    const [total, a, b] = enteros;
    d.n1 = d.n2 = total.valor / 2; d.x1 = a.valor; d.x2 = b.valor;
    [total, a, b].forEach((t, i) => (t.uso = ["n", "x1", "x2"][i]));
    ev("n1", d.n1, total, "mitad de " + total.texto); ev("n2", d.n2, total, "mitad de " + total.texto); ev("x1", d.x1, a); ev("x2", d.x2, b);
    notas.push(`Los ${total.valor} sujetos se reparten por mitades: n₁ = n₂ = ${d.n1}.`);
    return;
  }
  if (enteros.length >= 4) {
    const v = enteros.slice(0, 4);
    const disposiciones = [[0, 1, 2, 3], [1, 0, 3, 2], [0, 1, 3, 2], [0, 2, 1, 3]]; // [n1,x1,n2,x2]
    for (const [i1, i2, i3, i4] of disposiciones) {
      const [N1, X1, N2, X2] = [v[i1], v[i2], v[i3], v[i4]];
      if (X1.valor <= N1.valor && X2.valor <= N2.valor) {
        d.n1 = N1.valor; d.x1 = X1.valor; d.n2 = N2.valor; d.x2 = X2.valor;
        ev("n1", N1.valor, N1); ev("x1", X1.valor, X1); ev("n2", N2.valor, N2); ev("x2", X2.valor, X2);
        v.forEach(t => (t.uso = "dato"));
        // grupos que cuentan "lo contrario" (p. ej. «no tienen hábito» vs «tienen hábito»)
        const neg = t => /^\s*(?:\w+\s+){0,3}no\s+/.test(n.slice(t.fin, t.fin + 40)) || /\bno\s+(?:\w+\s+){0,2}$/.test(n.slice(Math.max(0, t.ini - 30), t.ini)) || /^\s*(?:\w+\s+){0,2}no\s/.test(n.slice(t.fin, t.fin + 30));
        const n1neg = neg(X1), n2neg = neg(X2);
        if (n1neg !== n2neg) {
          const g = n1neg ? 1 : 2;
          d["x" + g] = d["n" + g] - d["x" + g];
          notas.push(`Los dos grupos no cuentan lo mismo: usé el complemento en el grupo ${g} (x${g} = n${g} − dato = ${d["x" + g]}). Verifícalo.`);
        }
        return;
      }
    }
  }
}

/** Reparte las pistas (n, x̄, s, s²) en dos grupos y completa n con respaldos. */
function llenarDosGrupos(ctx, mapa) {
  const { n, toks } = ctx;
  const as = conGrupos(asignarPistas(n, toks, pistasGenerales(n)));
  const nTok = [];   // tamaños de muestra: se reparten por orden de aparición en el texto
  for (const a of as) {
    const g = a.grupo;
    if (a.rol === "n") { if (a.cue.grupo) poner(ctx, "n" + g, a.tok); else nTok.push(a.tok); }
    else if (a.rol === "xbar" && mapa.xbar) poner(ctx, "x" + g, a.tok);
    else if (a.rol === "s") mapa.s(g, a);
    else if (a.rol === "var") mapa.var(g, a);
  }
  // respaldo para n: «12 neumáticos de cada marca», «18 estudiantes…»
  const cada = n.match(/(\d+)\s+[a-z]+\s+de\s+cada\s+[a-z]+/);
  if (cada && !nTok.length && ctx.d.n1 === undefined && ctx.d.n2 === undefined) {
    const t = toks.find(t => t.ini === cada.index);
    if (t) { ctx.d.n1 = ctx.d.n2 = t.valor; ctx.ev("n1", t.valor, t); ctx.ev("n2", t.valor, t); t.uso = "n"; ctx.notas.push(`${t.valor} unidades de cada grupo: n₁ = n₂ = ${t.valor}.`); }
  }
  nTok.push(...candidatosN(n, toks));
  nTok.sort((a, b) => a.ini - b.ini);
  for (const g of [1, 2]) {
    if (ctx.d["n" + g] === undefined && nTok.length) poner(ctx, "n" + g, nTok.shift());
  }
}

function llenarDifMedias(ctx) {
  const { listas, d, ev } = ctx;
  if (listas.length >= 2) {
    const [a, b, ta, tb] = listasDe(listas, ctx);
    d.crudos1 = a; d.crudos2 = b; ev("crudos1", a, ta, `${a.length} datos`); ev("crudos2", b, tb, `${b.length} datos`);
    return;
  }
  llenarDosGrupos(ctx, {
    xbar: true,
    s: (g, a) => {
      const sent = sentenciaDe(ctx.n, a.tok.ini);
      const sigma = /conocid|sigma|σ/.test(sent) && !/desconocid/.test(sent);
      poner(ctx, (sigma ? "sigma" : "s") + g, a.tok);
    },
    var: (g, a) => poner(ctx, "s" + g, a.tok, Math.sqrt(a.tok.valor), `s² = ${a.tok.valor}`)
  });
}

function llenarPareadas(ctx) {
  const { n, toks, listas, d, ev } = ctx;
  if (listas.length >= 2) {
    const [a, b, ta, tb] = listasDe(listas, ctx);
    d.crudos1 = a; d.crudos2 = b; ev("crudos1", a, ta, `${a.length} datos`); ev("crudos2", b, tb, `${b.length} datos`);
    if (a.length !== b.length) ctx.notas.push("Los datos pareados deben tener la misma cantidad de valores en ambas listas.");
    return;
  }
  for (const a of asignarPistas(n, toks, pistasGenerales(n))) {
    if (a.rol === "n") poner(ctx, "n", a.tok);
    else if (a.rol === "xbar") poner(ctx, "dbar", a.tok);
    else if (a.rol === "s") poner(ctx, "sd", a.tok);
  }
}

function llenarVarianza(ctx) {
  const { n, toks, listas, d, ev } = ctx;
  if (listas.length) { d.crudos = listas[0].valores; ev("crudos", d.crudos, listas[0].toks[0], `${d.crudos.length} datos`); return; }
  for (const a of asignarPistas(n, toks, pistasGenerales(n))) {
    if (a.rol === "n") poner(ctx, "n", a.tok);
    else if (a.rol === "s") poner(ctx, "s", a.tok);
    else if (a.rol === "var") poner(ctx, "s2", a.tok);
  }
  if (d.n === undefined) { const t = candidatosN(n, toks)[0]; if (t) poner(ctx, "n", t); }
}

function llenarCociente(ctx) {
  llenarDosGrupos(ctx, {
    xbar: false,
    s: (g, a) => poner(ctx, "s" + g, a.tok),
    var: (g, a) => poner(ctx, "s" + g + "sq", a.tok)
  });
}

const LLENAR = {
  ic_media: llenarMedia, ic_proporcion: llenarProporcion, ic_dif_proporciones: llenarDifProporciones,
  ic_dif_medias: llenarDifMedias, ic_pareadas: llenarPareadas, ic_varianza: llenarVarianza, ic_cociente: llenarCociente
};

/* ---------------- API ---------------- */

export const faltantes = (tipo, d) => REQUERIDOS[tipo](d);

export function interpretar(textoOriginal, forzarTipo = null) {
  const orig = filtrarIncisos(textoOriginal);
  const n = normalizar(orig);
  const toks = tokenizar(n);
  const listas = detectarListas(n, toks);
  const notas = [], evidencias = [];
  const d = {};
  const ev = (simbolo, valor, tok, texto) => evidencias.push({ simbolo, valor, frase: frase(orig, tok), texto: texto ?? tok.texto });

  if (/contenido probabilistico|grado de confianza asociado|nivel de confianza asociado|calcule el (?:grado|nivel)|limites de tolerancia/.test(n)) {
    return { tipo: null, soportado: false, datos: d, evidencias, notas: ["Este tipo de ejercicio (calcular el nivel de confianza de un intervalo dado, límites de tolerancia, etc.) aún no está disponible."], faltantes: [], opciones: {} };
  }

  // «en escala de 1 a 100»: los extremos de una escala no son datos
  for (const m of n.matchAll(/escala[^.]{0,25}?(\d+(?:[.,]\d+)?)\s*(?:a|hasta|-)\s*(\d+(?:[.,]\d+)?)/g)) {
    const fin = m.index + m[0].length;
    toks.filter(t => t.ini >= m.index && t.fin <= fin).forEach(t => (t.uso = "escala"));
  }

  const conf = extraerConfianza(n, toks, notas);
  if (conf) {
    d.confianza = conf.valor;
    ev("confianza", conf.valor, conf.tok, conf.deAlfa ? `α = ${conf.tok.texto} → confianza ${conf.valor}` : conf.tok.texto);
  }

  const det = detectarTipo(n, toks, listas);
  const tipo = forzarTipo ?? det.tipo;

  const opciones = {
    normal: /normal|normalmente/.test(n),
    pideDesviacion: det.pideDesviacion
  };
  if (/varianzas?\s+(?:poblacionales\s+)?(?:son\s+)?(?:iguales|homogeneas)|misma\s+varianza|igual(?:es)?\s+varianza/.test(n)) opciones.varianzasIguales = true;
  else if (/varianzas?\s+(?:poblacionales\s+)?(?:son\s+)?(?:diferentes|distintas|desiguales|no\s+(?:son\s+)?iguales)/.test(n)) opciones.varianzasIguales = false;

  LLENAR[tipo]({ n, toks, listas, d, ev, notas });

  return { tipo, soportado: true, datos: d, evidencias, notas, faltantes: faltantes(tipo, d), opciones, texto: orig };
}
