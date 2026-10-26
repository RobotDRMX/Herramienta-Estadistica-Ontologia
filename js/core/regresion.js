// Regresión lineal simple y correlación (Cap. 6): ajuste por mínimos cuadrados, r, R², ANOVA y t de los coeficientes.
// Resultado igual al de los demás motores (pasos + resultados), más una tabla opcional por paso.

import { normalizar, tokenizar, detectarListas } from "./texto.js";
import { tCdf, fCdf, tCrit } from "./dist.js";
import { f, dv, num } from "./formato.js";

export const TIPOS_RL = { rl_simple: "Regresión lineal simple y correlación" };
export const ETIQ_RL = { crudosx: "datos x (variable independiente)", crudosy: "datos y (variable dependiente)", x0: "x₀ (valor a predecir)" };

/** Ajuste de mínimos cuadrados y todo lo que cuelga de él. */
export function ajuste(x, y) {
  const n = x.length;
  if (n !== y.length) throw new Error("x e y deben tener la misma cantidad de datos");
  if (n < 3) throw new Error("Se necesitan al menos 3 pares de datos");
  const sum = a => a.reduce((p, q) => p + q, 0);
  const sx = sum(x), sy = sum(y), sxx = sum(x.map(v => v * v)), syy = sum(y.map(v => v * v)), sxy = sum(x.map((v, i) => v * y[i]));
  const xbar = sx / n, ybar = sy / n;
  const Sxx = sxx - n * xbar ** 2, Syy = syy - n * ybar ** 2, Sxy = sxy - n * xbar * ybar;
  if (!(Sxx > 0)) throw new Error("Todos los valores de x son iguales: no hay recta de ajuste");
  const b1 = Sxy / Sxx, b0 = ybar - b1 * xbar;
  const r = Syy > 0 ? Sxy / Math.sqrt(Sxx * Syy) : 0, r2 = r * r;
  const SCR = b1 * Sxy, SCE = Math.max(Syy - SCR, 0), gl = n - 2, MCE = SCE / gl, se = Math.sqrt(MCE);
  const seB1 = se / Math.sqrt(Sxx), seB0 = se * Math.sqrt(1 / n + xbar ** 2 / Sxx);
  const t1 = b1 / seB1, t0 = b0 / seB0, F = MCE > 0 ? SCR / MCE : Infinity;
  const pT = t => 2 * (1 - tCdf(Math.abs(t), gl));
  const tc = tCrit(0.025, gl);
  return {
    n, sx, sy, sxx, syy, sxy, xbar, ybar, Sxx, Syy, Sxy, b0, b1, r, r2, r2aj: 1 - (1 - r2) * (n - 1) / gl,
    SCR, SCE, SCT: Syy, gl, MCE, se, seB1, seB0, t1, t0, F, pB1: pT(t1), pB0: pT(t0), pF: Number.isFinite(F) ? 1 - fCdf(F, 1, gl) : 0,
    ic1: [b1 - tc * seB1, b1 + tc * seB1], ic0: [b0 - tc * seB0, b0 + tc * seB0], tc
  };
}

export const fuerza = r => { const a = Math.abs(r); return a >= 0.9 ? "muy fuerte" : a >= 0.7 ? "fuerte" : a >= 0.5 ? "moderada" : a >= 0.3 ? "débil" : "muy débil"; };

/* ---------------- interpretación ---------------- */
export function esRegresion(texto) {
  const n = normalizar(texto);
  if (/intervalo de confianza|hipotesis|significancia|pruebe|contraste/.test(n)) return false;
  const hayListas = detectarListas(n, tokenizar(n)).length > 0;
  return /regresion|minimos cuadrados|recta (?:de )?(?:ajuste|regresion|estimad)|ajuste lineal|bondad de ajuste|coeficiente de determinacion/.test(n) ||
    (hayListas && /correlacion/.test(n));
}

const NUMS = "(-?\\d+(?:[.,]\\d+)?)";
const aNum = s => parseFloat(String(s).replace(",", "."));
const limpiaNombre = s => s.replace(/^(?:la|el|los|las|una?|de)\s+/, "").replace(/\s+/g, " ").trim();

/** Nombres de las variables: «entre A y B», «predecir Y a partir de X». */
export function nombresVariables(n, original) {
  const orig = (ini, fin) => original.slice(ini, fin);
  let m = n.match(/(?:predecir|prediga|estimar|estime|explicar|explique)\s+(?:la |el |los |las )?(.+?)\s+(?:a partir de|en funcion de|segun|con base en)\s+(?:la |el |los |las )?(.+?)(?=[.,;:?]|\s+(?:para|si|con|use|utilice)\b|$)/);
  if (m) return { y: limpiaNombre(orig(m.index + m[0].indexOf(m[1]), m.index + m[0].indexOf(m[1]) + m[1].length)), x: limpiaNombre(m[2]) };
  m = n.match(/(?:relacion|asociacion|correlacion|regresion)\s+(?:lineal\s+)?entre\s+(?:la |el |los |las )?(.+?)\s+y\s+(?:la |el |los |las )?(.+?)(?=[.,;:?]|\s+(?:para|con|en|si|segun|utilic|use|dado|donde|se|los datos|a partir)\b|$)/);
  if (m) return { x: limpiaNombre(m[1]), y: limpiaNombre(m[2]) };
  return null;
}

export function interpretarRegresion(textoOriginal) {
  const original = textoOriginal, n = normalizar(original);
  const toks = tokenizar(n), listas = detectarListas(n, toks);
  const datos = {}, evidencias = [], notas = [];
  const ev = (simbolo, valor, tok, texto) => evidencias.push({ simbolo, valor, frase: original.slice(Math.max(0, tok.ini - 28), Math.min(original.length, tok.fin + 28)).replace(/\s+/g, " ").trim(), texto: texto ?? tok.texto });

  if (listas.length >= 2) {
    // una lista para x y otra para y (si hay 4 bloques, la tabla viene partida en dos)
    const [a, b] = listas.length === 4 ? [[...listas[0].valores, ...listas[2].valores], [...listas[1].valores, ...listas[3].valores]] : [listas[0].valores, listas[1].valores];
    datos.crudosx = a; datos.crudosy = b;
    ev("crudosx", a, listas[0].toks[0], `${a.length} datos`); ev("crudosy", b, listas[1].toks[0], `${b.length} datos`);
  } else if (listas.length === 1 && listas[0].valores.length >= 6 && listas[0].valores.length % 2 === 0) {
    // una sola lista: pares (x, y) intercalados, como se copia una tabla de dos columnas
    const v = listas[0].valores;
    datos.crudosx = v.filter((_, i) => i % 2 === 0); datos.crudosy = v.filter((_, i) => i % 2 === 1);
    ev("crudosx", datos.crudosx, listas[0].toks[0], `${datos.crudosx.length} datos`); ev("crudosy", datos.crudosy, listas[0].toks[0], `${datos.crudosy.length} datos`);
    notas.push("Los datos venían en una sola lista: los tomé como pares (x, y) en filas consecutivas. Si x e y están en columnas separadas, corrígelos abajo.");
  }

  // valor a predecir
  const enLista = t => t.lista;
  const x0 = (() => {
    const sentencias = [...n.matchAll(/[^.?!]+[.?!]?/g)].filter(s => /predic|pronostic|estim(?:e|ar)\s+(?:el|la|los|las)?\s*\w+[^.?!]*(?:cuando|para|si)|cuando\s+x\s*=|si\s+x\s*=/.test(s[0]));
    for (const s of sentencias) {
      const t = toks.filter(t => !enLista(t) && !t.palabra && t.ini >= s.index && t.fin <= s.index + s[0].length).pop();
      if (t) return t;
    }
    return null;
  })();
  if (x0) { datos.x0 = x0.valor; ev("x0", x0.valor, x0); }

  const opciones = {};
  const nv = nombresVariables(n, original);
  if (nv) { opciones.nombreX = nv.x; opciones.nombreY = nv.y; }
  if (!datos.crudosx) notas.push("No encontré las dos listas de datos (x e y). Pégalas en el enunciado o escríbelas abajo.");
  return { tipo: "rl_simple", soportado: true, datos, consultas: undefined, evidencias, notas, faltantes: faltantesRL(datos), opciones, texto: original };
}

export const faltantesRL = d => ["crudosx", "crudosy"].filter(k => !Array.isArray(d[k]) || d[k].length < 3);

/* ---------------- cálculo ---------------- */
const tabla = (cab, filas) => ({ cab, filas });

export function resolverRegresion(d, o = {}) {
  const faltan = faltantesRL(d);
  if (faltan.length) throw new Error("Faltan datos: listas x e y (mínimo 3 pares)");
  const x = d.crudosx, y = d.crudosy;
  if (x.length !== y.length) throw new Error(`x tiene ${x.length} datos e y tiene ${y.length}: deben ser pares`);
  const a = ajuste(x, y);
  const NX = o.nombreX || "x", NY = o.nombreY || "y";
  const rect = `\\hat{y} = ${f(a.b0)} ${a.b1 >= 0 ? "+" : "-"} ${f(Math.abs(a.b1))}\\,x`;
  const MAXF = 40;
  const filasX = x.slice(0, MAXF).map((v, i) => [num(v), num(y[i]), num(v * v), num(v * y[i])]);
  const pasos = [];

  pasos.push({ titulo: "Datos y sumas", texto: `n = ${a.n} pares (x, y)${x.length > MAXF ? `; se muestran los primeros ${MAXF}` : ""}.`,
    tabla: tabla(["x", "y", "x²", "x·y"], [...filasX, ...(x.length > MAXF ? [["…", "…", "…", "…"]] : []), ["Σ x = " + num(a.sx), "Σ y = " + num(a.sy), "Σ x² = " + num(a.sxx), "Σ xy = " + num(a.sxy)]]),
    lineas: [`n = ${dv(a.n)},\\quad \\bar{x} = \\dfrac{\\sum x}{n} = ${f(a.xbar)},\\quad \\bar{y} = \\dfrac{\\sum y}{n} = ${f(a.ybar)}`] });
  pasos.push({ titulo: "Sumas de cuadrados y productos", lineas: [
    `S_{xx} = \\sum x^2 - n\\bar{x}^2 = ${f(a.sxx)} - ${dv(a.n)}(${f(a.xbar)})^2 = ${f(a.Sxx)}`,
    `S_{yy} = \\sum y^2 - n\\bar{y}^2 = ${f(a.syy)} - ${dv(a.n)}(${f(a.ybar)})^2 = ${f(a.Syy)}`,
    `S_{xy} = \\sum xy - n\\bar{x}\\bar{y} = ${f(a.sxy)} - ${dv(a.n)}(${f(a.xbar)})(${f(a.ybar)}) = ${f(a.Sxy)}`] });
  pasos.push({ titulo: "Pendiente e intercepto (mínimos cuadrados)", lineas: [
    `b_1 = \\dfrac{S_{xy}}{S_{xx}} = \\dfrac{${f(a.Sxy)}}{${f(a.Sxx)}} = ${f(a.b1)}`,
    `b_0 = \\bar{y} - b_1\\bar{x} = ${f(a.ybar)} - (${f(a.b1)})(${f(a.xbar)}) = ${f(a.b0)}`, rect] });
  const sube = a.b1 >= 0 ? "aumenta" : "disminuye";
  pasos.push({ titulo: "Interpretación de la recta", texto:
    `Por cada unidad que aumenta ${NX}, ${NY} ${sube} en promedio ${num(Math.abs(a.b1))} unidades. ` +
    `Cuando ${NX} es 0, ${NY} es en promedio ${num(a.b0)}${a.xbar - Math.sqrt(a.Sxx / a.n) > 0 && Math.min(...x) > 0 ? " (extrapolación: x = 0 queda fuera del rango de los datos, puede no tener sentido práctico)" : ""}.` });
  pasos.push({ titulo: "Coeficiente de correlación y de determinación", lineas: [
    `r = \\dfrac{S_{xy}}{\\sqrt{S_{xx}S_{yy}}} = \\dfrac{${f(a.Sxy)}}{\\sqrt{(${f(a.Sxx)})(${f(a.Syy)})}} = ${f(a.r)}`,
    `R^2 = r^2 = ${f(a.r2)}`], texto:
    `Correlación lineal ${a.r >= 0 ? "directa (positiva)" : "inversa (negativa)"} ${fuerza(a.r)}. El modelo explica el ${num(a.r2 * 100, 2)} % de la variabilidad de ${NY}.` });
  pasos.push({ titulo: "Análisis de varianza (ANOVA)", lineas: [`SCR = b_1 S_{xy} = ${f(a.SCR)},\\quad SCE = S_{yy} - SCR = ${f(a.SCE)},\\quad s_e = \\sqrt{\\dfrac{SCE}{n-2}} = ${f(a.se)}`],
    tabla: tabla(["Fuente", "gl", "Suma de cuadrados", "Cuadrado medio", "F", "Valor P"], [
      ["Regresión", "1", num(a.SCR), num(a.SCR), num(a.F), a.pF < 0.0001 ? "< 0,0001" : num(a.pF)],
      ["Residuos", String(a.gl), num(a.SCE), num(a.MCE), "", ""],
      ["Total", String(a.n - 1), num(a.SCT), "", "", ""]]) });
  pasos.push({ titulo: "Inferencia sobre los coeficientes", texto: `t con n − 2 = ${a.gl} grados de libertad; el intervalo es al 95 %.`,
    tabla: tabla(["", "Coeficiente", "Error típico", "t", "Valor P", "Inferior 95 %", "Superior 95 %"], [
      ["Intercepto (b₀)", num(a.b0), num(a.seB0), num(a.t0), a.pB0 < 0.0001 ? "< 0,0001" : num(a.pB0), num(a.ic0[0]), num(a.ic0[1])],
      ["Pendiente (b₁)", num(a.b1), num(a.seB1), num(a.t1), a.pB1 < 0.0001 ? "< 0,0001" : num(a.pB1), num(a.ic1[0]), num(a.ic1[1])]]) });
  const resultados = [{ etq: "", tex: rect, texto: `ŷ = ${num(a.b0)} ${a.b1 >= 0 ? "+" : "−"} ${num(Math.abs(a.b1))}x` },
    { etq: "", tex: `r = ${f(a.r)},\\qquad R^2 = ${f(a.r2)}`, texto: `r = ${num(a.r)}; R² = ${num(a.r2)}` }];

  let pred = null;
  if (Number.isFinite(d.x0)) {
    pred = a.b0 + a.b1 * d.x0;
    const fuera = d.x0 < Math.min(...x) || d.x0 > Math.max(...x);
    pasos.push({ titulo: "Predicción", lineas: [`\\hat{y}(${dv(d.x0)}) = ${f(a.b0)} ${a.b1 >= 0 ? "+" : "-"} ${f(Math.abs(a.b1))}(${dv(d.x0)}) = ${f(pred)}`],
      texto: fuera ? "⚠ x₀ queda fuera del rango de los datos: es una extrapolación y puede ser poco confiable." : "" });
    resultados.push({ etq: "", tex: `\\hat{y}(${f(d.x0)}) = ${f(pred)}`, texto: `ŷ(${num(d.x0)}) = ${num(pred)}` });
  }

  const sig = a.pB1 < 0.05;
  return {
    id: "rl_simple", tema: TIPOS_RL.rl_simple, tabla: "Cap. 6",
    formula: "\\hat{y} = b_0 + b_1 x,\\quad b_1 = \\dfrac{S_{xy}}{S_{xx}},\\quad b_0 = \\bar{y} - b_1\\bar{x},\\quad r = \\dfrac{S_{xy}}{\\sqrt{S_{xx}S_{yy}}}",
    supuestos: ["Relación lineal entre x e y", "Errores independientes, normales y de varianza constante"],
    pasos, resultados, advertencias: [],
    grafica: { familia: "dispersion", x, y, b0: a.b0, b1: a.b1, r: a.r, r2: a.r2, nombreX: NX, nombreY: NY, x0: d.x0, pred },
    extra: a,
    conclusion: `La recta de regresión es ŷ = ${num(a.b0)} ${a.b1 >= 0 ? "+" : "−"} ${num(Math.abs(a.b1))}x. Por cada unidad que aumenta ${NX}, ${NY} ${sube} en promedio ${num(Math.abs(a.b1))}. ` +
      `r = ${num(a.r)} (${a.r >= 0 ? "directa" : "inversa"} ${fuerza(a.r)}) y R² = ${num(a.r2)}: el modelo explica el ${num(a.r2 * 100, 2)} % de la variabilidad. ` +
      `La pendiente ${sig ? "es" : "no es"} significativa al 5 % (valor P ${a.pB1 < 0.0001 ? "< 0,0001" : "= " + num(a.pB1)}).` + (pred !== null ? ` Predicción: ŷ(${num(d.x0)}) = ${num(pred)}.` : "")
  };
}
