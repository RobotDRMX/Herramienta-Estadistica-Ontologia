// Motor de intervalos de confianza (Llinás Solano, Tablas C.5–C.8).
// Funciones puras: reciben datos por símbolo y devuelven un Resultado con pasos explicados (TeX).
//
// Resultado = { id, tema, tabla, formula, supuestos[], pasos[{titulo, lineas[]}],
//               intervalo:{inf, sup, simbolo}, extra?, conclusion }

import { zCrit, tCrit, chi2Crit, fCrit } from "./dist.js";

/* ---------- utilidades ---------- */
export const redondear = (x, d = 4) => Math.round((x + Number.EPSILON) * 10 ** d) / 10 ** d;
const f = (x, d = 4) => String(redondear(x, d)).replace(".", "{,}");   // TeX con coma decimal
const pct = c => `${redondear(c * 100, 2)}\\%`.replace(".", "{,}");

export function resumen(arr) {
  const n = arr.length, xbar = arr.reduce((a, b) => a + b, 0) / n;
  const s2 = arr.reduce((a, b) => a + (b - xbar) ** 2, 0) / (n - 1);
  return { n, xbar, s2, s: Math.sqrt(s2) };
}

function nivel(d) {
  const conf = d.confianza;
  if (!(conf > 0 && conf < 1)) throw new Error("Falta el nivel de confianza (por ejemplo 95 %).");
  const alfa = 1 - conf;
  return { conf, alfa, a2: alfa / 2 };
}

function exigir(d, ...claves) {
  const falta = claves.filter(k => d[k] === undefined || d[k] === null || Number.isNaN(d[k]));
  if (falta.length) throw new Error(`Faltan datos: ${falta.join(", ")}`);
}

const conclusion = (conf, que, inf, sup) =>
  `Con una confianza del ${pct(conf).replace("\\%", " %")}, ${que} está entre ${redondear(inf, 4)} y ${redondear(sup, 4)}.`;

function intervaloCero(inf, sup, a, b) {
  if (inf > 0) return ` Como el intervalo es positivo, ${a} es mayor que ${b}.`;
  if (sup < 0) return ` Como el intervalo es negativo, ${a} es menor que ${b}.`;
  return ` Como el intervalo contiene al cero, no hay evidencia suficiente de que ${a} y ${b} difieran.`;
}

/** Gráfica de una distribución simétrica (z o t) con el área central de confianza sombreada. */
const gSimetrica = (familia, gl, conf, a2, crit) => ({ familia, gl, conf, a2, lim: [-crit, crit] });

/* ---------- 1. Media poblacional (C.5) ---------- */
export function icMedia(d, o = {}) {
  const pasos = [];
  let { n, xbar, s } = d;
  const { conf, alfa, a2 } = nivel(d);

  if (Array.isArray(d.crudos) && d.crudos.length > 1) {
    const r = resumen(d.crudos);
    n = r.n; xbar = r.xbar; s = r.s;
    pasos.push({ titulo: "Calcular x̄ y s a partir de los datos", lineas: [
      `n = ${n}`,
      `\\bar{x} = \\dfrac{\\sum x_i}{n} = ${f(xbar, 4)}`,
      `s = \\sqrt{\\dfrac{\\sum (x_i-\\bar{x})^2}{n-1}} = ${f(s, 4)}`
    ]});
  }
  exigir({ n, xbar }, "n", "xbar");

  const sigmaConocida = d.sigma !== undefined && d.sigma !== null;
  const desv = sigmaConocida ? d.sigma : s;
  if (desv === undefined || Number.isNaN(desv)) throw new Error("Faltan datos: σ o s");
  const normal = Boolean(o.normal);

  let usaZ, letra, estad, crit, formula, gl = null;
  if (sigmaConocida) {
    usaZ = true; letra = normal ? "A" : "D";
    formula = "\\bar{x} \\pm z_{\\alpha/2}\\dfrac{\\sigma}{\\sqrt{n}}";
  } else if (n >= 30) {
    usaZ = true; letra = normal ? "B" : "E";
    formula = "\\bar{x} \\pm z_{\\alpha/2}\\dfrac{s}{\\sqrt{n}}";
  } else {
    usaZ = false; letra = "C"; gl = n - 1;
    formula = "\\bar{x} \\pm t_{\\alpha/2}\\dfrac{s}{\\sqrt{n}}";
  }

  pasos.push({ titulo: "Datos", lineas: [
    `n = ${n},\\quad \\bar{x} = ${f(xbar)},\\quad ${sigmaConocida ? "\\sigma" : "s"} = ${f(desv)}`,
    `1-\\alpha = ${f(conf)} \\Rightarrow \\alpha = ${f(alfa)},\\quad \\alpha/2 = ${f(a2)}`
  ]});

  const razon = sigmaConocida
    ? "σ es conocida, así que se usa la distribución normal (Z)."
    : n >= 30 ? "σ es desconocida pero n ≥ 30, así que s sustituye a σ y se usa Z."
      : "σ es desconocida y n < 30, así que se usa la t de Student con n − 1 grados de libertad.";
  pasos.push({ titulo: "Elegir la distribución", lineas: [], texto: razon });

  crit = usaZ ? zCrit(a2) : tCrit(a2, gl);
  pasos.push({ titulo: "Valor crítico", lineas: [
    usaZ ? `z_{${f(a2, 4)}} = ${f(crit)}` : `t_{${f(a2, 4)},\\,${gl}} = ${f(crit)}`
  ]});

  const error = crit * desv / Math.sqrt(n);
  const inf = xbar - error, sup = xbar + error;
  pasos.push({ titulo: "Error de estimación", lineas: [
    `E = ${usaZ ? "z" : "t"}_{\\alpha/2}\\dfrac{${sigmaConocida ? "\\sigma" : "s"}}{\\sqrt{n}} = ${f(crit)}\\cdot\\dfrac{${f(desv)}}{\\sqrt{${n}}} = ${f(error)}`
  ]});
  pasos.push({ titulo: "Intervalo", lineas: [
    `${f(xbar)} - ${f(error)} < \\mu < ${f(xbar)} + ${f(error)}`,
    `${f(inf)} < \\mu < ${f(sup)}`
  ]});

  return {
    id: "ic_media", tema: "Intervalo de confianza para la media poblacional",
    tabla: `C.5-${letra}`, formula,
    supuestos: sigmaConocida ? ["Población normal, σ conocida"] : n >= 30 ? ["Muestra grande (n ≥ 30)"] : ["Población normal, σ desconocida, n < 30"],
    pasos, intervalo: { inf, sup, simbolo: "\\mu" },
    grafica: gSimetrica(usaZ ? "z" : "t", gl, conf, a2, crit),
    extra: { n, xbar, s: desv, error, critico: crit, gl },
    conclusion: conclusion(conf, "la media poblacional μ", inf, sup)
  };
}

/* ---------- 2. Proporción (C.6-A) ---------- */
export function icProporcion(d) {
  const { conf, alfa, a2 } = nivel(d);
  let { n, x, p } = d;
  exigir({ n }, "n");
  if (p === undefined) { exigir({ x }, "x"); p = x / n; }
  const z = zCrit(a2);
  const ee = Math.sqrt(p * (1 - p) / n);
  const error = z * ee;
  const inf = p - error, sup = p + error;
  const cond = n >= 30 || (n * p >= 5 && n * (1 - p) >= 5);

  const pasos = [
    { titulo: "Datos", lineas: [
      x !== undefined ? `n = ${n},\\quad x = ${x} \\Rightarrow \\hat{p} = \\dfrac{x}{n} = ${f(p)}` : `n = ${n},\\quad \\hat{p} = ${f(p)}`,
      `1-\\alpha = ${f(conf)} \\Rightarrow \\alpha/2 = ${f(a2)}`
    ]},
    { titulo: "Verificar condiciones", lineas: [`n = ${n} ${n >= 30 ? "\\geq 30" : "<30"};\\; n\\hat{p} = ${f(n * p, 2)},\\; n(1-\\hat{p}) = ${f(n * (1 - p), 2)}`],
      texto: cond ? "Se cumple la condición para usar la aproximación normal." : "⚠ No se cumple la condición de muestra grande: el intervalo puede no ser confiable." },
    { titulo: "Valor crítico", lineas: [`z_{${f(a2)}} = ${f(z)}`] },
    { titulo: "Error estándar y error de estimación", lineas: [
      `\\sqrt{\\dfrac{\\hat{p}(1-\\hat{p})}{n}} = \\sqrt{\\dfrac{${f(p)}\\cdot ${f(1 - p)}}{${n}}} = ${f(ee, 5)}`,
      `E = ${f(z)}\\cdot ${f(ee, 5)} = ${f(error, 5)}`
    ]},
    { titulo: "Intervalo", lineas: [`${f(inf)} < p < ${f(sup)}`] }
  ];
  return {
    id: "ic_proporcion", tema: "Intervalo de confianza para la proporción poblacional", tabla: "C.6-A",
    formula: "\\hat{p} \\pm z_{\\alpha/2}\\sqrt{\\dfrac{\\hat{p}(1-\\hat{p})}{n}}",
    supuestos: ["n ≥ 30, o np ≥ 5 y n(1−p) ≥ 5"], pasos, intervalo: { inf, sup, simbolo: "p" },
    grafica: gSimetrica("z", null, conf, a2, z),
    extra: { p, n, errorEstandar: ee, error },
    conclusion: conclusion(conf, "la proporción poblacional p", inf, sup)
  };
}

/* ---------- 3. Diferencia de proporciones (C.6-B) ---------- */
export function icDifProporciones(d) {
  const { conf, a2 } = nivel(d);
  exigir(d, "n1", "n2");
  const p1 = d.p1 ?? d.x1 / d.n1, p2 = d.p2 ?? d.x2 / d.n2;
  if ([p1, p2].some(Number.isNaN)) throw new Error("Faltan datos: p̂₁ y p̂₂ (o x₁ y x₂)");
  const z = zCrit(a2);
  const ee = Math.sqrt(p1 * (1 - p1) / d.n1 + p2 * (1 - p2) / d.n2);
  const dif = p1 - p2, error = z * ee, inf = dif - error, sup = dif + error;
  const pasos = [
    { titulo: "Datos", lineas: [
      `n_1 = ${d.n1},\\; \\hat{p}_1 = ${f(p1)}\\qquad n_2 = ${d.n2},\\; \\hat{p}_2 = ${f(p2)}`,
      `1-\\alpha = ${f(conf)} \\Rightarrow \\alpha/2 = ${f(a2)}`
    ]},
    { titulo: "Valor crítico", lineas: [`z_{${f(a2)}} = ${f(z)}`] },
    { titulo: "Error estándar", lineas: [
      `\\sqrt{\\dfrac{\\hat{p}_1(1-\\hat{p}_1)}{n_1}+\\dfrac{\\hat{p}_2(1-\\hat{p}_2)}{n_2}} = ${f(ee, 5)}`,
      `E = ${f(z)}\\cdot ${f(ee, 5)} = ${f(error, 5)}`
    ]},
    { titulo: "Intervalo", lineas: [`(${f(p1)}-${f(p2)}) \\pm ${f(error, 5)}`, `${f(inf)} < p_1-p_2 < ${f(sup)}`] }
  ];
  return {
    id: "ic_dif_proporciones", tema: "Intervalo de confianza para la diferencia de dos proporciones", tabla: "C.6-B",
    formula: "(\\hat{p}_1-\\hat{p}_2) \\pm z_{\\alpha/2}\\sqrt{\\dfrac{\\hat{p}_1(1-\\hat{p}_1)}{n_1}+\\dfrac{\\hat{p}_2(1-\\hat{p}_2)}{n_2}}",
    supuestos: ["Muestras independientes", "n₁, n₂ ≥ 30, o los cuatro productos np y n(1−p) ≥ 5"],
    pasos, intervalo: { inf, sup, simbolo: "p_1-p_2" },
    grafica: gSimetrica("z", null, conf, a2, z),
    conclusion: conclusion(conf, "la diferencia p₁ − p₂", inf, sup) + intervaloCero(inf, sup, "p₁", "p₂")
  };
}

/* ---------- 4. Diferencia de medias (C.7) ---------- */
export function icDifMedias(d, o = {}) {
  const { conf, a2 } = nivel(d);
  let { n1, n2, x1, x2, s1, s2 } = d;
  const pasos = [];
  if (Array.isArray(d.crudos1) && Array.isArray(d.crudos2)) {
    const r1 = resumen(d.crudos1), r2 = resumen(d.crudos2);
    ({ n: n1, xbar: x1, s: s1 } = r1); ({ n: n2, xbar: x2, s: s2 } = r2);
    pasos.push({ titulo: "Calcular x̄ y s de cada muestra", lineas: [
      `n_1=${n1},\\ \\bar{x}_1=${f(x1)},\\ s_1=${f(s1)}`, `n_2=${n2},\\ \\bar{x}_2=${f(x2)},\\ s_2=${f(s2)}`] });
  }
  exigir({ n1, n2, x1, x2 }, "n1", "n2", "x1", "x2");
  const conocidas = d.sigma1 !== undefined && d.sigma2 !== undefined;
  const v1 = conocidas ? d.sigma1 ** 2 : s1 ** 2, v2 = conocidas ? d.sigma2 ** 2 : s2 ** 2;
  if ([v1, v2].some(Number.isNaN)) throw new Error("Faltan datos: s₁ y s₂ (o σ₁ y σ₂)");
  const dif = x1 - x2;
  pasos.push({ titulo: "Datos", lineas: [
    `n_1=${n1},\\ \\bar{x}_1=${f(x1)},\\ ${conocidas ? "\\sigma_1" : "s_1"}=${f(Math.sqrt(v1))}`,
    `n_2=${n2},\\ \\bar{x}_2=${f(x2)},\\ ${conocidas ? "\\sigma_2" : "s_2"}=${f(Math.sqrt(v2))}`,
    `1-\\alpha=${f(conf)} \\Rightarrow \\alpha/2=${f(a2)}`
  ]});

  let letra, formula, crit, ee, gl = null, razon, usaZ;
  if (conocidas || (n1 >= 30 && n2 >= 30)) {
    usaZ = true; letra = conocidas ? (o.normal ? "C" : "A") : "B";
    crit = zCrit(a2); ee = Math.sqrt(v1 / n1 + v2 / n2);
    formula = `(\\bar{x}_1-\\bar{x}_2) \\pm z_{\\alpha/2}\\sqrt{\\dfrac{${conocidas ? "\\sigma_1^2" : "s_1^2"}}{n_1}+\\dfrac{${conocidas ? "\\sigma_2^2" : "s_2^2"}}{n_2}}`;
    razon = conocidas ? "Las varianzas poblacionales son conocidas: se usa Z." : "Ambas muestras son grandes (n ≥ 30): se usa Z con s₁² y s₂².";
    pasos.push({ titulo: "Elegir la distribución", lineas: [], texto: razon });
    pasos.push({ titulo: "Valor crítico", lineas: [`z_{${f(a2)}} = ${f(crit)}`] });
    pasos.push({ titulo: "Error estándar", lineas: [`\\sqrt{\\dfrac{${f(v1)}}{${n1}}+\\dfrac{${f(v2)}}{${n2}}} = ${f(ee, 5)}`] });
  } else if (o.varianzasIguales === true) {
    usaZ = false; letra = "D"; gl = n1 + n2 - 2;
    const sp2 = ((n1 - 1) * v1 + (n2 - 1) * v2) / gl;
    crit = tCrit(a2, gl); ee = Math.sqrt(sp2 / n1 + sp2 / n2);
    formula = "(\\bar{x}_1-\\bar{x}_2) \\pm t_{\\alpha/2}\\sqrt{s_p^2\\left(\\dfrac{1}{n_1}+\\dfrac{1}{n_2}\\right)},\\quad s_p^2=\\dfrac{(n_1-1)s_1^2+(n_2-1)s_2^2}{n_1+n_2-2}";
    pasos.push({ titulo: "Elegir la distribución", lineas: [], texto: "Muestras pequeñas, varianzas desconocidas pero iguales: t de Student con n₁ + n₂ − 2 grados de libertad." });
    pasos.push({ titulo: "Varianza combinada", lineas: [
      `s_p^2 = \\dfrac{(${n1}-1)(${f(v1)})+(${n2}-1)(${f(v2)})}{${n1}+${n2}-2} = ${f(sp2)}`, `\\nu = n_1+n_2-2 = ${gl}`] });
    pasos.push({ titulo: "Valor crítico", lineas: [`t_{${f(a2)},\\,${gl}} = ${f(crit)}`] });
    pasos.push({ titulo: "Error estándar", lineas: [`\\sqrt{s_p^2\\left(\\dfrac{1}{${n1}}+\\dfrac{1}{${n2}}\\right)} = ${f(ee, 5)}`] });
  } else if (o.varianzasIguales === false) {
    usaZ = false; letra = "E";
    const a = v1 / n1, b = v2 / n2;
    gl = Math.round((a + b) ** 2 / (a ** 2 / (n1 - 1) + b ** 2 / (n2 - 1)));
    crit = tCrit(a2, gl); ee = Math.sqrt(a + b);
    formula = "(\\bar{x}_1-\\bar{x}_2) \\pm t_{\\alpha/2}\\sqrt{\\dfrac{s_1^2}{n_1}+\\dfrac{s_2^2}{n_2}},\\quad \\nu=\\dfrac{(s_1^2/n_1+s_2^2/n_2)^2}{\\frac{(s_1^2/n_1)^2}{n_1-1}+\\frac{(s_2^2/n_2)^2}{n_2-1}}";
    pasos.push({ titulo: "Elegir la distribución", lineas: [], texto: "Muestras pequeñas, varianzas desconocidas y distintas: t de Student con grados de libertad aproximados (Welch)." });
    pasos.push({ titulo: "Grados de libertad", lineas: [`\\nu = ${gl}\\ (\\text{redondeado al entero más cercano})`] });
    pasos.push({ titulo: "Valor crítico", lineas: [`t_{${f(a2)},\\,${gl}} = ${f(crit)}`] });
    pasos.push({ titulo: "Error estándar", lineas: [`\\sqrt{\\dfrac{${f(v1)}}{${n1}}+\\dfrac{${f(v2)}}{${n2}}} = ${f(ee, 5)}`] });
  } else {
    const e = new Error("Muestras pequeñas: ¿se puede suponer que las varianzas poblacionales son iguales?");
    e.pregunta = { clave: "varianzasIguales", opciones: [{ etiqueta: "Sí, iguales", valor: true }, { etiqueta: "No, distintas", valor: false }] };
    throw e;
  }
  const error = crit * ee, inf = dif - error, sup = dif + error;
  pasos.push({ titulo: "Intervalo", lineas: [`(${f(x1)}-${f(x2)}) \\pm ${f(crit)}\\cdot ${f(ee, 5)}`, `${f(inf)} < \\mu_1-\\mu_2 < ${f(sup)}`] });

  return {
    id: "ic_dif_medias", tema: "Intervalo de confianza para la diferencia de dos medias", tabla: `C.7-${letra}`, formula,
    supuestos: ["Muestras independientes"], pasos, intervalo: { inf, sup, simbolo: "\\mu_1-\\mu_2" },
    grafica: gSimetrica(usaZ ? "z" : "t", gl, conf, a2, crit),
    extra: { gl, critico: crit },
    conclusion: conclusion(conf, "la diferencia μ₁ − μ₂", inf, sup) + intervaloCero(inf, sup, "μ₁", "μ₂")
  };
}

/* ---------- 4b. Datos pareados (C.5-C sobre las diferencias) ---------- */
export function icPareadas(d) {
  const x = d.crudos1, y = d.crudos2;
  let dif = d.diferencias;
  if (!dif && Array.isArray(x) && Array.isArray(y) && x.length === y.length) dif = x.map((v, i) => v - y[i]);
  const r = icMedia({ confianza: d.confianza, ...(dif ? { crudos: dif } : { n: d.n, xbar: d.dbar, s: d.sd }) }, { normal: true });
  r.id = "ic_pareadas"; r.tema = "Intervalo de confianza para la diferencia de medias (datos pareados)";
  r.tabla = "C.5-C (sobre d)";
  r.formula = "\\bar{d} \\pm t_{\\alpha/2}\\dfrac{s_d}{\\sqrt{n}}";
  r.supuestos = ["Datos pareados", "Las diferencias siguen una distribución normal"];
  r.intervalo.simbolo = "\\mu_D";
  r.conclusion = conclusion(d.confianza, "la diferencia promedio μ_D", r.intervalo.inf, r.intervalo.sup) + intervaloCero(r.intervalo.inf, r.intervalo.sup, "la primera medición", "la segunda");
  return r;
}

/* ---------- 5. Varianza (C.8-A) ---------- */
export function icVarianza(d, o = {}) {
  const { conf, a2 } = nivel(d);
  let { n, s, s2 } = d;
  const pasos = [];
  if (Array.isArray(d.crudos) && d.crudos.length > 1) {
    const r = resumen(d.crudos); n = r.n; s = r.s; s2 = r.s2;
    pasos.push({ titulo: "Calcular s² a partir de los datos", lineas: [`n=${n},\\quad s^2 = ${f(s2)}`] });
  }
  if (s2 === undefined && s !== undefined) s2 = s * s;
  exigir({ n, s2 }, "n", "s2");
  const gl = n - 1;
  const cUp = chi2Crit(a2, gl), cLow = chi2Crit(1 - a2, gl);
  const inf = gl * s2 / cUp, sup = gl * s2 / cLow;
  pasos.push({ titulo: "Datos", lineas: [`n=${n},\\quad s^2=${f(s2)},\\quad \\nu=n-1=${gl}`, `1-\\alpha=${f(conf)} \\Rightarrow \\alpha/2=${f(a2)}`] });
  pasos.push({ titulo: "Valores críticos χ²", lineas: [`\\chi^2_{${f(a2)},\\,${gl}} = ${f(cUp)},\\qquad \\chi^2_{${f(1 - a2)},\\,${gl}} = ${f(cLow)}`] });
  pasos.push({ titulo: "Intervalo para σ²", lineas: [`\\dfrac{(${n}-1)(${f(s2)})}{${f(cUp)}} < \\sigma^2 < \\dfrac{(${n}-1)(${f(s2)})}{${f(cLow)}}`, `${f(inf)} < \\sigma^2 < ${f(sup)}`] });
  const res = {
    id: "ic_varianza", tema: "Intervalo de confianza para la varianza", tabla: "C.8-A",
    formula: "\\dfrac{(n-1)s^2}{\\chi^2_{\\alpha/2}} < \\sigma^2 < \\dfrac{(n-1)s^2}{\\chi^2_{1-\\alpha/2}}",
    supuestos: ["Población normal"], pasos, intervalo: { inf, sup, simbolo: "\\sigma^2" },
    grafica: { familia: "chi2", gl, conf, a2, lim: [cLow, cUp] },
    conclusion: conclusion(conf, "la varianza poblacional σ²", inf, sup)
  };
  if (o.pideDesviacion) {
    const i2 = Math.sqrt(inf), s_2 = Math.sqrt(sup);
    pasos.push({ titulo: "Intervalo para σ (raíz cuadrada)", lineas: [`\\sqrt{${f(inf)}} < \\sigma < \\sqrt{${f(sup)}}`, `${f(i2)} < \\sigma < ${f(s_2)}`] });
    res.intervalo = { inf: i2, sup: s_2, simbolo: "\\sigma" };
    res.conclusion = conclusion(conf, "la desviación estándar poblacional σ", i2, s_2);
  }
  return res;
}

/* ---------- 6. Cociente de varianzas (C.8-B) ---------- */
export function icCociente(d) {
  const { conf, a2 } = nivel(d);
  const v1 = d.s1sq ?? d.s1 ** 2, v2 = d.s2sq ?? d.s2 ** 2;
  exigir(d, "n1", "n2");
  if ([v1, v2].some(Number.isNaN)) throw new Error("Faltan datos: s₁² y s₂²");
  const g1 = d.n1 - 1, g2 = d.n2 - 1;
  const fA = fCrit(a2, g1, g2), fB = fCrit(a2, g2, g1);
  const r = v1 / v2, inf = r / fA, sup = r * fB;
  const pasos = [
    { titulo: "Datos", lineas: [`n_1=${d.n1},\\ s_1^2=${f(v1)}\\qquad n_2=${d.n2},\\ s_2^2=${f(v2)}`, `\\nu_1=${g1},\\ \\nu_2=${g2}`, `1-\\alpha=${f(conf)} \\Rightarrow \\alpha/2=${f(a2)}`] },
    { titulo: "Valores críticos F", lineas: [`F_{${f(a2)}}(${g1},${g2}) = ${f(fA)},\\qquad F_{${f(a2)}}(${g2},${g1}) = ${f(fB)}`] },
    { titulo: "Cociente muestral", lineas: [`\\dfrac{s_1^2}{s_2^2} = \\dfrac{${f(v1)}}{${f(v2)}} = ${f(r)}`] },
    { titulo: "Intervalo", lineas: [`\\dfrac{${f(r)}}{${f(fA)}} < \\dfrac{\\sigma_1^2}{\\sigma_2^2} < ${f(r)}\\cdot ${f(fB)}`, `${f(inf)} < \\dfrac{\\sigma_1^2}{\\sigma_2^2} < ${f(sup)}`] }
  ];
  const incluye1 = inf <= 1 && sup >= 1;
  return {
    id: "ic_cociente", tema: "Intervalo de confianza para el cociente de dos varianzas", tabla: "C.8-B",
    formula: "\\dfrac{s_1^2}{s_2^2}\\cdot\\dfrac{1}{F_{\\alpha/2}(\\nu_1,\\nu_2)} < \\dfrac{\\sigma_1^2}{\\sigma_2^2} < \\dfrac{s_1^2}{s_2^2}\\cdot F_{\\alpha/2}(\\nu_2,\\nu_1)",
    supuestos: ["Ambas poblaciones normales", "Muestras independientes"], pasos,
    intervalo: { inf, sup, simbolo: "\\sigma_1^2/\\sigma_2^2" },
    grafica: { familia: "f", gl: g1, gl2: g2, conf, a2, lim: [1 / fB, fA] },
    conclusion: conclusion(conf, "el cociente σ₁²/σ₂²", inf, sup) +
      (incluye1 ? " Como el intervalo contiene al 1, es plausible que las varianzas sean iguales." : " Como el intervalo no contiene al 1, las varianzas poblacionales parecen distintas.")
  };
}

export const SOLVERS = {
  ic_media: icMedia, ic_proporcion: icProporcion, ic_dif_proporciones: icDifProporciones,
  ic_dif_medias: icDifMedias, ic_pareadas: icPareadas, ic_varianza: icVarianza, ic_cociente: icCociente
};
