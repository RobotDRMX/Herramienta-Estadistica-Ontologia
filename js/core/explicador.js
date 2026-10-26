// Convierte el estado de un ejercicio (tipo, datos, opciones) en HTML: datos editables + solución explicada.
import { resolver } from "./resolver.js";
import { TIPOS, ETIQUETAS, faltantes } from "./roles.js";
import { TIPOS_DM } from "./muestral.js";
import { TIPOS_PH, ETIQ_PH, faltantesPH, frasesHipotesis } from "./hipotesis.js";
import { TIPOS_RL, ETIQ_RL, faltantesRL } from "./regresion.js";
import { interpretarTodo } from "./interpretar.js";
import { MACRO_DATO } from "./formato.js";

const TODOS_LOS_TIPOS = { ...TIPOS, ...TIPOS_DM, ...TIPOS_PH, ...TIPOS_RL };
export const ETIQ_DM = {
  mu: "μ (media poblacional)", sigma: "σ (desv. poblacional)", p: "p (proporción poblacional)", n: "n (tamaño de muestra)",
  mu1: "μ₁", mu2: "μ₂", sigma1: "σ₁", sigma2: "σ₂", p1: "p₁ (poblacional)", p2: "p₂ (poblacional)", n1: "n₁", n2: "n₂"
};
/** Etiquetas de los tipos que no son intervalos (distribuciones muestrales, pruebas, regresión). */
export const ETIQ_NUEVAS = { ...ETIQ_DM, ...ETIQ_PH, ...ETIQ_RL };
const esIC = tipo => tipo.startsWith("ic_");
const esPH = tipo => tipo.startsWith("ph_");
const esRL = tipo => tipo.startsWith("rl_");

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** Campos esenciales por tipo (se muestran siempre); el resto aparece solo si tiene valor. */
const ESENCIALES = {
  ic_media: ["confianza", "n", "xbar", "s"],
  ic_proporcion: ["confianza", "n", "x"],
  ic_dif_proporciones: ["confianza", "n1", "x1", "n2", "x2"],
  ic_dif_medias: ["confianza", "n1", "x1", "s1", "n2", "x2", "s2"],
  ic_pareadas: ["confianza", "n", "dbar", "sd"],
  ic_varianza: ["confianza", "n", "s"],
  ic_cociente: ["confianza", "n1", "s1sq", "n2", "s2sq"],
  dm_media: ["mu", "sigma", "n"],
  dm_proporcion: ["p", "n"],
  dm_dif_medias: ["mu1", "mu2", "sigma1", "sigma2", "n1", "n2"],
  dm_dif_proporciones: ["p1", "p2", "n1", "n2"],
  ph_dif_medias: ["alfa", "n1", "x1", "s1", "n2", "x2", "s2", "d0"],
  ph_varianza: ["alfa", "sigma0sq", "n", "s"],
  ph_cociente: ["alfa", "n1", "s1sq", "n2", "s2sq"],
  ph_correlacion: ["alfa", "rho0", "n", "r"],
  ph_proporcion: ["alfa", "p0", "n", "x"],
  ph_dif_proporciones: ["alfa", "n1", "x1", "n2", "x2", "d0"],
  ph_media: ["alfa", "mu0", "n", "xbar", "s"],
  ph_pareadas: ["alfa", "n", "dbar", "sd", "d0"],
  ph_pendiente: ["alfa", "n", "b1", "seb1", "beta10"],
  rl_simple: ["crudosx", "crudosy"]
};
const ORDEN = ["mu", "confianza", "alfa", "sigma0sq", "rho0", "d0", "r", "crudosx", "crudosy", "x0", "ssq", "n", "xbar", "s", "sigma", "x", "p", "s2", "dbar", "sd", "n1", "x1", "p1", "s1", "sigma1", "s1sq", "n2", "x2", "p2", "s2", "sigma2", "s2sq"];

/* ---------- TeX ---------- */
export function tex(t, display = true) {
  try {
    if (window.katex) return window.katex.renderToString(t, { displayMode: display, throwOnError: false, strict: "ignore", macros: { ...MACRO_DATO } });
  } catch (e) { /* cae al texto plano */ }
  return `<code>${esc(t)}</code>`;
}

const coma = s => String(s).replace(/(\d)\.(\d)/g, "$1,$2");

/* ---------- editor de datos ---------- */
let usaNuevas = false;   // los tipos que no son intervalos traen sus propias etiquetas
const etiquetaCampo = sim => (usaNuevas ? ETIQ_NUEVAS[sim] : null) ?? ETIQUETAS[sim] ?? sim;
const OPCIONALES = new Set(["d0", "rho0", "x0", "beta10", "beta00"]);
function campo(sim, valor, faltaDato) {
  if (Array.isArray(valor) || sim.startsWith("crudos")) {
    return `<label class="campo campo--lista ${faltaDato ? "campo--falta" : ""}"><span>${esc(etiquetaCampo(sim))}</span>
      <textarea data-dato="${sim}" rows="2" placeholder="Pega los datos separados por espacios o comas">${esc((valor ?? []).join(", "))}</textarea></label>`;
  }
  const pct = sim === "confianza" || sim === "alfa";
  const v = pct && valor !== undefined ? Math.round(valor * 10000) / 100 : valor;
  return `<label class="campo ${faltaDato ? "campo--falta" : ""}"><span>${esc(etiquetaCampo(sim))}${pct ? " en %" : ""}</span>
    <input data-dato="${sim}" type="number" step="any" inputmode="decimal" value="${v ?? ""}" placeholder="${["d0", "rho0", "beta10", "beta00"].includes(sim) ? "0" : "—"}"></label>`;
}

/** Campo de texto libre guardado en las opciones (frases de las hipótesis, nombres de las variables). */
const campoTexto = (clave, etiqueta, valor, sugerido) => `<label class="campo campo--lista"><span>${esc(etiqueta)}</span>
  <input type="text" data-opcion="${clave}" data-texto value="${esc(valor ?? "")}" placeholder="${esc(sugerido ?? "")}"></label>`;

const faltantesDe = (tipo, d) => (esPH(tipo) ? faltantesPH(tipo, d) : esRL(tipo) ? faltantesRL(d) : tipo.startsWith("dm_") ? ESENCIALES[tipo].filter(k => d[k] === undefined) : faltantes(tipo, d));

function editorConsultas(estado) {
  const filas = (estado.consultas ?? []).map((c, i) => `<div class="consulta">
      <span class="consulta__etq">${esc(c.etq || "P")}</span>
      <select data-consulta="${i}" data-campo="op"><option value="menor" ${c.op === "menor" ? "selected" : ""}>menor que</option><option value="mayor" ${c.op === "mayor" ? "selected" : ""}>mayor que</option><option value="entre" ${c.op === "entre" ? "selected" : ""}>entre</option></select>
      <input type="number" step="any" data-consulta="${i}" data-campo="a" value="${c.a ?? ""}">
      ${c.op === "entre" ? `<span>y</span><input type="number" step="any" data-consulta="${i}" data-campo="b" value="${c.b ?? ""}">` : ""}
      <button class="btn btn--icon" type="button" data-quitar-consulta="${i}" aria-label="Quitar">✕</button></div>`).join("");
  return `<div class="consultas"><span class="selector">Probabilidades por calcular</span>${filas}
    <button class="btn" type="button" data-agregar-consulta>＋ Agregar probabilidad</button></div>`;
}

function editor(estado) {
  const { tipo, datos } = estado;
  const esDM = tipo.startsWith("dm_");
  usaNuevas = !esIC(tipo);
  const claves = [...new Set([...ESENCIALES[tipo], ...Object.keys(datos)])];
  claves.sort((a, b) => (ORDEN.indexOf(a) + 100 * (ORDEN.indexOf(a) < 0)) - (ORDEN.indexOf(b) + 100 * (ORDEN.indexOf(b) < 0)));
  const faltan = new Set(faltantesDe(tipo, datos));
  // intervalos y probabilidades marcan todo campo esencial vacío; pruebas y regresión, solo lo realmente necesario
  const marcado = k => faltan.has(k) || (!esPH(tipo) && !esRL(tipo) && datos[k] === undefined && ESENCIALES[tipo].includes(k) && !OPCIONALES.has(k));
  const campos = claves.map(k => campo(k, datos[k], marcado(k))).join("");

  const o = estado.opciones ?? {};
  let opciones = tipo.endsWith("proporcion") || tipo.endsWith("proporciones") || esPH(tipo) || esRL(tipo) ? "" : `<label class="check"><input type="checkbox" data-opcion="normal" ${o.normal ? "checked" : ""}> Población normal</label>`;
  if (tipo === "ic_media" || tipo === "ic_dif_medias") {
    const enSigma = tipo === "ic_media" ? datos.sigma !== undefined : datos.sigma1 !== undefined;
    opciones += `<label class="check"><input type="checkbox" data-accion="sigma" ${enSigma ? "checked" : ""}> La desviación es poblacional (σ conocida)</label>`;
  }
  if (esPH(tipo)) {
    const sel = v => (o.cola ?? "dos") === v ? "selected" : "";
    opciones += `<label class="selector">Hipótesis alternativa (H₁)
      <select data-opcion="cola" data-texto><option value="dos" ${sel("dos")}>≠ (dos colas)</option><option value="der" ${sel("der")}>&gt; (cola a la derecha)</option><option value="izq" ${sel("izq")}>&lt; (cola a la izquierda)</option></select></label>`;
    const auto = frasesHipotesis(tipo, datos, { ...o, contextoH0: undefined, contextoH1: undefined });
    opciones += `<details class="plegable plegable--hip"><summary>Redacción de las hipótesis</summary>
      ${tipo === "ph_varianza" || tipo === "ph_correlacion" ? campoTexto("sujeto", tipo === "ph_varianza" ? "Sobre qué es la varianza" : "Entre qué variables", o.sujeto, tipo === "ph_varianza" ? "la varianza poblacional" : "las dos variables") : ""}
      ${campoTexto("contextoH0", "H₀ en palabras (opcional)", o.contextoH0, auto.h0)}
      ${campoTexto("contextoH1", "H₁ en palabras (opcional)", o.contextoH1, auto.h1)}</details>`;
  }
  if (esRL(tipo)) {
    opciones += `<div class="campos">${campoTexto("nombreX", "Nombre de x", o.nombreX, "x")}${campoTexto("nombreY", "Nombre de y", o.nombreY, "y")}</div>`;
  }
  if (tipo === "ic_dif_medias" || tipo === "ph_dif_medias") {
    opciones += `<label class="selector">Varianzas
      <select data-opcion="varianzasIguales"><option value="">¿?</option><option value="true" ${o.varianzasIguales === true ? "selected" : ""}>iguales</option><option value="false" ${o.varianzasIguales === false ? "selected" : ""}>distintas</option></select></label>`;
  }
  if (tipo === "ic_varianza") opciones += `<label class="check"><input type="checkbox" data-opcion="pideDesviacion" ${o.pideDesviacion ? "checked" : ""}> Dar el intervalo para σ</label>`;

  const tipos = Object.entries(TODOS_LOS_TIPOS).map(([k, v]) => `<option value="${k}" ${k === tipo ? "selected" : ""}>${esc(v)}</option>`).join("");
  return `<div class="editor">
      <label class="selector">Tipo de problema <select data-accion="tipo">${tipos}</select></label>
      <div class="campos">${campos}</div>
      <div class="opciones">${opciones}</div>
      ${esDM ? editorConsultas(estado) : ""}
    </div>`;
}

/* ---------- solución ---------- */
export function tablaHtml(t) {
  return `<div class="tabla-wrap"><table class="tabla-paso"><thead><tr>${t.cab.map(c => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${t.filas.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function pasoHtml(p, i) {
  const lineas = (p.lineas ?? []).map(l => `<div class="tex">${tex(l)}</div>`).join("");
  const texto = p.texto ? `<p class="paso__txt">${esc(p.texto)}</p>` : "";
  return `<li class="paso"><b>${esc(p.titulo)}</b>${texto}${p.tabla ? tablaHtml(p.tabla) : ""}${lineas}</li>`;
}

function solucionHtml(r) {
  const supuestos = r.supuestos?.length ? `<ul class="supuestos">${r.supuestos.map(s => `<li>${esc(s)}</li>`).join("")}</ul>` : "";
  const f = x => String(Math.round(x * 10000) / 10000).replace(".", "{,}");
  const cierre = r.resultados
    ? (r.resultados.length
      ? r.resultados.map(x => `<div class="resultado__tex">${tex(x.tex)}</div>`).join("")
      : `<p class="resultado__txt">Agrega una probabilidad por calcular.</p>`)
    : `<div class="resultado__tex">${tex(`${f(r.intervalo.inf)} < ${r.intervalo.simbolo} < ${f(r.intervalo.sup)}`)}</div>`;
  const adv = r.advertencias?.length ? `<p class="aviso">⚠ ${r.advertencias.map(esc).join(" ")}</p>` : "";
  return `
    <details class="tarjeta" open><summary>Tema <span class="etq">${esc(r.tabla)}</span></summary>
      <div class="tarjeta__cuerpo"><p style="margin:0">${esc(r.tema)}</p></div></details>
    <details class="tarjeta" open><summary>Fórmula</summary>
      <div class="tarjeta__cuerpo"><div class="tex">${tex(r.formula)}</div>${supuestos}</div></details>
    <details class="tarjeta" open><summary>Procedimiento</summary>
      <div class="tarjeta__cuerpo"><ol class="pasos">${r.pasos.map(pasoHtml).join("")}</ol></div></details>
    <div class="resultado glass glass--strong">${cierre}${adv}
      <p class="resultado__txt">${esc(coma(r.conclusion))}</p>
      ${r.grafica ? `<div class="graf-btns">
        <button class="btn btn--py" type="button" data-grafica="python"><span aria-hidden="true">📈</span> Gráfica Python</button>
        <button class="btn btn--r" type="button" data-grafica="r"><span aria-hidden="true">📊</span> Gráfica R</button>
        <button class="btn btn--sg" type="button" data-grafica="statgraphics"><span aria-hidden="true">📉</span> Gráfica Statgraphics</button>
      </div>` : ""}</div>`;
}

/** Tipos de problema distintos del actual para los que el enunciado sí trae todos los datos. */
function alternativas(estado) {
  const buenos = [];
  for (const k of Object.keys(TODOS_LOS_TIPOS)) {
    if (k === estado.tipo) continue;
    try {
      const e = interpretarTodo(estado.texto, k);
      const completo = k.startsWith("dm_") ? ESENCIALES[k].every(x => e.datos[x] !== undefined) && e.consultas?.length : faltantesDe(k, e.datos).length === 0;
      if (completo) buenos.push(k);
    } catch (err) { /* ese tipo no aplica */ }
  }
  return buenos.slice(0, 3);
}

/** HTML completo de la respuesta del asistente. */
export function renderEstado(estado) {
  if (!estado.soportado) {
    const pq = estado.preguntaClase;
    const botones = pq ? `<div class="pregunta"><p>${esc(pq.texto)}</p>${pq.opciones.map(o => `<button class="btn" type="button" data-clase="${o.clase}">${esc(o.etiqueta)}</button>`).join(" ")}</div>` : "";
    return `<p class="aviso">${(estado.notas ?? []).map(esc).join("<br>")}</p>${botones}`;
  }
  const evid = estado.evidencias?.length
    ? `<div class="evidencias">${estado.evidencias.map(e => `<span class="dato" title="${esc(e.frase)}"><b>${esc(ETIQUETAS[e.simbolo]?.split(" ")[0] ?? e.simbolo)}</b> ${esc(e.texto)}</span>`).join("")}</div>`
    : "";
  const out = resolver(estado.tipo, estado.datos, estado.opciones, estado.consultas);
  const notas = (estado.notas ?? []).map(n => `<p class="nota">ⓘ ${esc(n)}</p>`).join("");

  let cuerpo;
  if (out.ok) cuerpo = solucionHtml(out.resultado);
  else if (out.pregunta) {
    cuerpo = `<div class="pregunta"><p>${esc(out.error)}</p>${out.pregunta.opciones.map(o => `<button class="btn" type="button" data-responder="${out.pregunta.clave}" data-valor="${o.valor}">${esc(o.etiqueta)}</button>`).join(" ")}</div>`;
  } else {
    const alt = alternativas(estado);
    cuerpo = `<p class="aviso">⚠ ${esc(out.error)}. Completa o corrige los datos de arriba.</p>` + (alt.length
      ? `<div class="pregunta"><p>¿Quizá el ejercicio es de otro tipo? Estos encajan con los datos que encontré:</p>${alt.map(k => `<button class="btn" type="button" data-tipo-sugerido="${k}">${esc(TODOS_LOS_TIPOS[k])}</button>`).join(" ")}</div>`
      : "");
  }

  return `
    <details class="tarjeta" open><summary>Datos identificados</summary>
      <div class="tarjeta__cuerpo">${evid}${notas}${editor(estado)}</div></details>
    ${cuerpo}`;
}
