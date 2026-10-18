// Utilidades de texto: normalización, números (con formato español), listas de datos y asignación por pistas.
// Todas las posiciones (ini/fin) valen tanto para el texto normalizado como para el original,
// porque la normalización conserva la longitud.

const MAPA = { á: "a", é: "e", í: "i", ó: "o", ú: "u", ü: "u", ñ: "n", "₁": "1", "₂": "2", "₃": "3" };

export function normalizar(s) {
  return s.normalize("NFC")
    .replace(/x̄/g, "x_").replace(/ȳ/g, "y_")
    .toLowerCase()
    .replace(/[áéíóúüñ₁₂₃]/g, c => MAPA[c]);
}

const PALABRAS = {
  dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
  trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
  veinte: 20, veintiun: 21, veintiuno: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90, cien: 100
};
const RE_PALABRA = new RegExp(`\\b(${Object.keys(PALABRAS).join("|")})\\b`, "g");
const RE_NUM = /(\d{1,3}(?:,\d{3})+(?:\.\d+)?(?!\d)|\d{1,3}(?:\.\d{3})+(?:,\d+)?(?!\d)|\d+(?:[.,]\d+)?)(\s*(?:%|por ciento))?/g;

/* «1,000» ¿es mil o 1,000? Con coma y exactamente tres cifras es ambiguo; se decide por el contexto. */
const UNIDADES_NO_MILES = /^(?:anos?|meses|dias?|horas?|minutos?|segundos?|kilos?|kilogramos?|kg|gramos?|kilometros?|km|metros?|centimetros?|cm|mm|mililitros?|ml|litros?|libras?|grados|puntos|con|desviacion|varianza|media|promedio|entre|segun|donde|mientras)$/;
function comaEsMiles(bruto, n, fin, hayPuntoDecimal) {
  if (bruto.includes(".") || (bruto.match(/,/g) || []).length > 1) return true;      // 1,234.5 · 1,234,567
  if (bruto.startsWith("0")) return false;                                           // 0,962
  if (hayPuntoDecimal) return true;                                                  // el texto usa punto decimal
  if (bruto.endsWith(",000")) return true;                                           // 1,000 · 3,000
  const sig = n.slice(fin, fin + 30).match(/^\s+([a-z]+)/)?.[1];
  if (!sig) return false;
  if (/^(?:pesos|dolares|euros|soles)$/.test(sig)) return true;
  return sig.length >= 5 && !UNIDADES_NO_MILES.test(sig);                            // «1,203 estudiantes»
}

/** Devuelve los números del texto normalizado, en orden. */
export function tokenizar(n) {
  const out = [];
  const hayPuntoDecimal = /(?<![\d,])\d+\.\d{1,2}(?!\d)|(?<![\d,])\d+\.\d{4,}/.test(n);
  for (const m of n.matchAll(RE_NUM)) {
    const bruto = m[1];
    const ini = m.index, fin = ini + m[0].length;
    const prev = ini > 0 ? n[ini - 1] : "";
    // "n1", "s2", "x_1": el dígito es un subíndice, no un dato
    if (/[a-z_μσα²^]/.test(prev) && /^\d$/.test(bruto)) continue;
    let valor, entero;
    if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(bruto) && comaEsMiles(bruto, n, fin, hayPuntoDecimal)) { valor = parseFloat(bruto.replace(/,/g, "")); entero = !bruto.includes("."); }
    else if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(bruto) && !bruto.startsWith("0")) { valor = parseFloat(bruto.replace(/\./g, "").replace(",", ".")); entero = !bruto.includes(","); }
    else { valor = parseFloat(bruto.replace(",", ".")); entero = !/[.,]/.test(bruto); }
    out.push({ valor, entero, pct: Boolean(m[2]), ini, fin, texto: m[0].trim(), palabra: false, lista: false, uso: null });
  }
  for (const m of n.matchAll(RE_PALABRA)) {
    out.push({ valor: PALABRAS[m[1]], entero: true, pct: false, ini: m.index, fin: m.index + m[0].length, texto: m[0], palabra: true, lista: false, uso: null });
  }
  return out.sort((a, b) => a.ini - b.ini);
}

/** Listas de ≥4 datos seguidos (datos crudos). Marca los tokens como `lista`. */
export function detectarListas(n, toks) {
  const reales = toks.filter(t => !t.palabra && !t.pct);
  const listas = [];
  let run = [];
  const cerrar = () => {
    // «Remedio 1 41 44 29…»: el 1 es una etiqueta de fila, no un dato
    const mediana = a => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
    if (run.length >= 5 && run[0].entero && run[0].valor < 10 && /[a-z]\s+$/.test(n.slice(0, run[0].ini)) && mediana(run.slice(1).map(t => t.valor)) >= 20) run = run.slice(1);
    if (run.length >= 4) {
      const v = run.map(t => t.valor);
      const consecutivos = v.every((x, i) => i === 0 || x === v[i - 1] + 1);   // "Par 1 2 3 4…" no es dato
      if (!consecutivos) { run.forEach(t => (t.lista = true)); listas.push({ toks: run, valores: v, ini: run[0].ini, fin: run[run.length - 1].fin }); }
    }
    run = [];
  };
  for (const t of reales) {
    if (run.length) {
      const sep = n.slice(run[run.length - 1].fin, t.ini);
      if (!/^(\s*[,;]\s*|\s+y\s+|\s+)$/.test(sep)) cerrar();
    }
    run.push(t);
  }
  cerrar();
  return listas;
}

/** ¿Hay un límite de oración entre a y b? (el punto decimal no cuenta) */
export function hayCorte(n, a, b) {
  return /[.?!;:](\s|$)/.test(n.slice(a, b));
}

/**
 * Asigna números a roles según las pistas (cues) que los preceden.
 * cues: [{rol, ini, fin, grupo?}]. Cada número libre se asigna a la pista pendiente más antigua
 * dentro de la ventana y de la misma oración.
 */
export function asignar(n, toks, cues, ventana = 55) {
  const cs = [...cues].sort((a, b) => a.ini - b.ini).map(c => ({ ...c, usada: false }));
  const salida = [];
  for (const t of toks) {
    if (t.uso || t.lista) continue;
    const c = cs.find(c => !c.usada && c.fin <= t.ini && t.ini - c.fin <= ventana && !hayCorte(n, c.fin, t.ini)
      && (!c.acepta || c.acepta(t)));
    if (!c) continue;
    c.usada = true; t.uso = c.rol;
    salida.push({ rol: c.rol, grupo: c.grupo ?? null, tok: t, cue: c });
  }
  return salida;
}

/** Busca todas las coincidencias de una regex como pistas con un rol. */
export function pistas(n, re, rol, extra = {}) {
  const out = [];
  for (const m of n.matchAll(re)) out.push({ rol, ini: m.index, fin: m.index + m[0].length, grupo: extra.grupo ?? (g => (g && /^[12ab]$/.test(g) ? ({ a: 1, b: 2 }[g] ?? Number(g)) : null))(m.slice(1).find(Boolean)), acepta: extra.acepta });
  return out;
}
