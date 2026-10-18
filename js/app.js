import * as reglas from "./modos/reglas.js";
import * as llm from "./modos/llm.js";
import { renderEstado } from "./core/explicador.js";
import { interpretarTodo } from "./core/interpretar.js";
import { resolver as resolverEstado } from "./core/resolver.js";
import { figuras, codigo as codigoGrafica, descargarPNG, PALETAS } from "./core/grafica.js";

const modos = { reglas, llm };
let modo = "reglas";

const $ = s => document.querySelector(s);
const chat = $("#chat"), entrada = $("#entrada"), form = $("#form"), estado = $("#estado");
const sidebar = $("#sidebar"), velo = $("#velo"), listaChats = $("#historial");

const EJEMPLOS = [
  "Una muestra de 36 focos tiene vida media de 800 h con desviación de 40 h. Construya un intervalo de confianza del 95 % para la media.",
  "De una muestra aleatoria de 140 estudiantes de una universidad, 74 indicaron que provienen de estratos altos. Construya un intervalo del 90% de confianza para estimar la proporción de estudiantes que provienen de estratos altos.",
  "Se tomó una muestra aleatoria de nueve puertas con media de 187,9 cm. Se sabe que la longitud sigue una distribución normal con una desviación típica de 32,4 cm. Calcule un intervalo de confianza del 80% para la longitud media.",
  "Calcule un intervalo de confianza del 90% para la diferencia entre las proporciones: 24 de 100 estudiantes de la universidad A y 36 de 120 de la universidad B planean especializarse en el exterior.",
  "Una muestra de 12 bolsas de azúcar produjo estos pesos netos (libras): 12,1 12,1 11,8 11,9 11,8 12,0 12,3 11,8 12,0 11,9 12,2 11,6. Construya un intervalo del 95% de confianza para la varianza, suponiendo que se distribuyen normalmente."
];

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ---------- Almacenamiento de chats (localStorage, con respaldo en memoria) ---------- */
const CLAVE = "chats-v2", MAX_CHATS = 50;
let chats = [];          // [{id, titulo, ts, mensajes:[{tipo:"user",texto}|{tipo:"bot",estado}|{tipo:"error",texto}]}]
let activo = null;       // chat abierto (null = chat nuevo todavía sin mensajes)

function cargar() {
  try { chats = JSON.parse(localStorage.getItem(CLAVE)) ?? []; } catch (e) { chats = []; }
}
function guardar() {
  try { localStorage.setItem(CLAVE, JSON.stringify(chats)); } catch (e) { /* sin almacenamiento: queda en memoria */ }
}

/* ---------- Render del chat ---------- */
const refs = new WeakMap();   // elemento .msg--bot -> mensaje guardado (con su estado editable)

function burbuja(clase, html) {
  const d = document.createElement("div");
  d.className = `msg ${clase}` + (clase === "msg--bot" ? " glass" : "");
  d.innerHTML = html;
  chat.appendChild(d);
  chat.scrollTop = chat.scrollHeight;
  return d;
}

function bienvenida() {
  burbuja("msg--bot", '<p style="margin:0">Hola. Pega o escribe un ejercicio de intervalos de confianza en lenguaje natural (media, proporción, diferencia de medias o de proporciones, varianza, cociente de varianzas). Identificaré los datos, el tema, la fórmula y el procedimiento, y podrás corregir cualquier dato. Prueba con los ejemplos de la barra lateral.</p>');
}

function pintarBot(msg) {
  const el = burbuja("msg--bot", renderEstado(msg.estado));
  refs.set(el, msg);
  return el;
}

function pintarMensaje(m) {
  if (m.tipo === "user") return burbuja("msg--user", esc(m.texto));
  if (m.tipo === "bot" && m.estado) return pintarBot(m);
  return burbuja("msg--bot", `<span class="aviso">${esc(m.texto ?? "Mensaje de una versión anterior.")}</span>`);
}

/* ---------- Edición de datos en la respuesta ---------- */
const aLista = txt => txt.split(/[\s;]+/).map(s => s.replace(/,$/, "").replace(",", ".")).filter(Boolean).map(Number).filter(Number.isFinite);

function aplicarCambio(est, el) {
  const d = est.datos;
  if (el.dataset.consulta !== undefined) {
    const c = est.consultas[Number(el.dataset.consulta)], k = el.dataset.campo;
    if (k === "op") { c.op = el.value; if (c.op === "entre" && c.b === undefined) c.b = c.a; }
    else if (el.value === "" || !Number.isFinite(Number(el.value))) delete c[k];
    else c[k] = Number(el.value);
  } else if (el.dataset.dato) {
    const k = el.dataset.dato, v = el.value.trim();
    if (k.startsWith("crudos")) { const l = aLista(v); l.length ? (d[k] = l) : delete d[k]; }
    else if (v === "" || !Number.isFinite(Number(v))) delete d[k];
    else d[k] = k === "confianza" ? (Number(v) > 1 ? Number(v) / 100 : Number(v)) : Number(v);
  } else if (el.dataset.opcion) {
    const k = el.dataset.opcion;
    est.opciones = est.opciones ?? {};
    if (el.type === "checkbox") est.opciones[k] = el.checked;
    else est.opciones[k] = el.value === "" ? undefined : el.value === "true";
  } else if (el.dataset.accion === "sigma") {
    const pares = est.tipo === "ic_media" ? [["s", "sigma"]] : [["s1", "sigma1"], ["s2", "sigma2"]];
    for (const [s, g] of pares) {
      const [de, a] = el.checked ? [s, g] : [g, s];
      if (d[de] !== undefined) { d[a] = d[de]; delete d[de]; }
    }
  } else if (el.dataset.accion === "tipo") {
    Object.assign(est, interpretarTodo(est.texto, el.value), { modo: est.modo });
  }
}

function refrescar(caja, msg) {
  caja.innerHTML = renderEstado(msg.estado);
  guardar();
  if (panelEstado && panelEstado.msg === msg && panel.classList.contains("abierto")) pintarPanel();
}

/* ---------- Panel lateral derecho: gráficas (Python / R) ---------- */
const panel = $("#panel"), pCuerpo = $("#panel-cuerpo");
let panelEstado = null;   // { msg, lang, codigo, figs, spec }

function abrirPanel(msg, lang) {
  panelEstado = { msg, lang, codigo: false };
  pintarPanel();
  panel.classList.add("abierto");
  panel.setAttribute("aria-hidden", "false");
  document.body.classList.add("con-panel");
}

function cerrarPanel() {
  panel.classList.remove("abierto");
  panel.setAttribute("aria-hidden", "true");
  document.body.classList.remove("con-panel");
  panelEstado = null;
}

function pintarPanel() {
  const { msg, lang, codigo: ver } = panelEstado;
  const est = msg.estado;
  const out = resolverEstado(est.tipo, est.datos, est.opciones, est.consultas);
  const spec = out.ok ? out.resultado.grafica : null;
  panel.dataset.lang = lang;
  panel.querySelectorAll("[data-lang]").forEach(b => b.setAttribute("aria-pressed", b.dataset.lang === lang));
  $("#panel-codigo").textContent = ver ? "{ } Ocultar código" : "{ } Ver código";
  if (!spec || (spec.familia === "muestral" && !spec.consultas.length)) {
    panelEstado.figs = []; panelEstado.spec = null;
    pCuerpo.innerHTML = '<p class="aviso">No hay gráfica para mostrar todavía: completa los datos o agrega una probabilidad.</p>';
    return;
  }
  const figs = figuras(spec, lang);
  panelEstado.figs = figs; panelEstado.spec = spec;
  pCuerpo.innerHTML = `<p class="panel__tit">${esc(PALETAS[lang].nombre)}</p>` +
    figs.map(f => `<figure class="fig">${f.svg}<figcaption>${esc(f.titulo)}</figcaption></figure>`).join("") +
    (ver ? `<div class="codigo"><div class="codigo__cab"><span>Script en ${lang === "python" ? "Python" : "R"}</span><button class="btn" type="button" id="copiar-codigo">Copiar</button></div><pre><code>${esc(codigoGrafica(spec, lang))}</code></pre></div>` : "");
}

$("#panel-cerrar").addEventListener("click", cerrarPanel);
panel.querySelector("#panel-lang").addEventListener("click", e => {
  const b = e.target.closest("[data-lang]");
  if (b && panelEstado) { panelEstado.lang = b.dataset.lang; pintarPanel(); }
});
$("#panel-codigo").addEventListener("click", () => { if (panelEstado) { panelEstado.codigo = !panelEstado.codigo; pintarPanel(); } });
$("#panel-png").addEventListener("click", () => {
  if (!panelEstado?.figs?.length) return;
  panelEstado.figs.forEach((f, i) => descargarPNG(f.svg, `grafica_${panelEstado.lang}${panelEstado.figs.length > 1 ? "_" + (i + 1) : ""}.png`));
});
pCuerpo.addEventListener("click", async e => {
  if (e.target.id !== "copiar-codigo" || !panelEstado?.spec) return;
  try { await navigator.clipboard.writeText(codigoGrafica(panelEstado.spec, panelEstado.lang)); e.target.textContent = "¡Copiado!"; }
  catch (err) { e.target.textContent = "Selecciona y copia"; }
  setTimeout(() => { e.target.textContent = "Copiar"; }, 1600);
});

chat.addEventListener("change", e => {
  const caja = e.target.closest(".msg--bot"), msg = caja && refs.get(caja);
  if (!msg || !e.target.matches("[data-dato],[data-opcion],[data-accion],[data-consulta]")) return;
  aplicarCambio(msg.estado, e.target);
  refrescar(caja, msg);
});

chat.addEventListener("click", e => {
  const g = e.target.closest("[data-grafica]");
  if (g) {
    const caja = g.closest(".msg--bot"), msg = caja && refs.get(caja);
    if (msg) abrirPanel(msg, g.dataset.grafica);
    return;
  }
  const accion = e.target.closest("[data-agregar-consulta],[data-quitar-consulta]");
  if (accion) {
    const caja = accion.closest(".msg--bot"), msg = caja && refs.get(caja);
    if (!msg) return;
    const est = msg.estado;
    est.consultas = est.consultas ?? [];
    if (accion.matches("[data-agregar-consulta]")) est.consultas.push({ etq: `(${String.fromCharCode(97 + est.consultas.length)})`, op: "menor" });
    else est.consultas.splice(Number(accion.dataset.quitarConsulta), 1);
    refrescar(caja, msg);
    return;
  }
  const sug = e.target.closest("[data-tipo-sugerido]");
  if (sug) {
    const caja = sug.closest(".msg--bot"), msg = caja && refs.get(caja);
    if (msg) { Object.assign(msg.estado, interpretarTodo(msg.estado.texto, sug.dataset.tipoSugerido), { modo: msg.estado.modo }); refrescar(caja, msg); }
    return;
  }
  const b = e.target.closest("[data-responder]");
  const caja = b?.closest(".msg--bot"), msg = caja && refs.get(caja);
  if (!msg) return;
  msg.estado.opciones = { ...(msg.estado.opciones ?? {}), [b.dataset.responder]: b.dataset.valor === "true" };
  refrescar(caja, msg);
});

/* ---------- Lista de chats en la barra lateral ---------- */
function fechaCorta(ts) {
  const d = new Date(ts), hoy = new Date();
  return d.toDateString() === hoy.toDateString()
    ? d.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("es", { day: "numeric", month: "short" });
}

function pintarLista() {
  listaChats.innerHTML = [...chats].sort((a, b) => b.ts - a.ts).map(c => `
    <li class="chat-item" ${c === activo ? 'aria-current="true"' : ""} data-id="${c.id}">
      <button class="chat-item__abrir" type="button" data-accion-chat="abrir" title="${esc(c.titulo)}">
        <span>${esc(c.titulo)}</span><small>${fechaCorta(c.ts)}</small>
      </button>
      <button class="chat-item__desc" type="button" data-accion-chat="descargar" aria-label="Descargar chat" title="Descargar (PDF o Word)">⬇</button>
      <button class="chat-item__borrar" type="button" data-accion-chat="borrar" aria-label="Eliminar chat">✕</button>
    </li>`).join("");
}

function nuevoChat() {
  cerrarPanel();
  activo = null;
  chat.innerHTML = "";
  bienvenida();
  pintarLista();
  entrada.focus();
  cerrarMenu();
}

function abrirChat(id) {
  const c = chats.find(x => x.id === id);
  if (!c) return;
  cerrarPanel();
  activo = c;
  chat.innerHTML = "";
  c.mensajes.forEach(pintarMensaje);
  pintarLista();
  cerrarMenu();
}

function borrarChat(id) {
  chats = chats.filter(c => c.id !== id);
  guardar();
  if (activo && activo.id === id) nuevoChat(); else pintarLista();
}

function registrar(mensaje, primerTexto) {
  if (!activo) {
    activo = { id: crypto.randomUUID?.() ?? String(Date.now()), titulo: primerTexto.slice(0, 60), ts: Date.now(), mensajes: [] };
    chats.push(activo);
    if (chats.length > MAX_CHATS) chats.sort((a, b) => b.ts - a.ts).length = MAX_CHATS;
  }
  activo.mensajes.push(mensaje);
  activo.ts = Date.now();
  guardar();
  pintarLista();
}

listaChats.addEventListener("click", e => {
  const boton = e.target.closest("[data-accion-chat]");
  const accion = boton?.dataset.accionChat;
  const id = e.target.closest(".chat-item")?.dataset.id;
  if (!accion || !id) return;
  if (accion === "descargar") return abrirMenuDescarga(id, boton);
  accion === "abrir" ? abrirChat(id) : borrarChat(id);
});

/* ---------- Descargar un chat (PDF o Word), opcional ---------- */
const menuDesc = $("#menu-desc"), aviso = $("#aviso-export");
let chatADescargar = null;

function abrirMenuDescarga(id, boton) {
  chatADescargar = id;
  const r = boton.getBoundingClientRect();
  menuDesc.hidden = false;
  const ancho = menuDesc.offsetWidth;
  menuDesc.style.top = `${Math.min(r.bottom + 6, window.innerHeight - menuDesc.offsetHeight - 10)}px`;
  menuDesc.style.left = `${Math.max(8, Math.min(r.left - ancho + r.width, window.innerWidth - ancho - 8))}px`;
}
function cerrarMenuDescarga() { menuDesc.hidden = true; }

function mostrarAviso(texto, tipo = "") {
  aviso.textContent = texto; aviso.className = `aviso-export ${tipo}`; aviso.hidden = false;
  clearTimeout(mostrarAviso.t);
  if (tipo !== "trabajando") mostrarAviso.t = setTimeout(() => { aviso.hidden = true; }, 4500);
}

menuDesc.addEventListener("click", async e => {
  const fmt = e.target.closest("[data-fmt]")?.dataset.fmt;
  const c = chats.find(x => x.id === chatADescargar);
  cerrarMenuDescarga();
  if (!fmt || !c) return;
  const { exportarPDF, exportarWord } = await import("./core/exportar.js");   // se carga solo si se pide
  try {
    if (fmt === "pdf") {
      mostrarAviso("Preparando el PDF… elige «Guardar como PDF» en la ventana de impresión.", "trabajando");
      await exportarPDF(c);
      mostrarAviso("Listo. En la ventana de impresión elige «Guardar como PDF».");
    } else {
      mostrarAviso("Generando el documento de Word…", "trabajando");
      await exportarWord(c, p => { aviso.textContent = `Generando el documento de Word… ${Math.round(p * 100)} %`; });
      mostrarAviso("Documento de Word descargado.");
    }
  } catch (err) { mostrarAviso(`No se pudo exportar: ${err.message}`, "error"); }
});
document.addEventListener("click", e => { if (!menuDesc.hidden && !e.target.closest("#menu-desc, .chat-item__desc")) cerrarMenuDescarga(); });
$("#nuevo").addEventListener("click", nuevoChat);

/* ---------- Resolver ---------- */
async function resolver(texto) {
  cerrarMenu();
  if (!activo) chat.innerHTML = "";      // quita la bienvenida al empezar un chat nuevo
  burbuja("msg--user", esc(texto));
  registrar({ tipo: "user", texto }, texto);
  const espera = burbuja("msg--bot", "Analizando…");
  try {
    const est = await modos[modo].analizar(texto);
    const msg = { tipo: "bot", estado: est };
    espera.innerHTML = renderEstado(est);
    refs.set(espera, msg);
    activo.mensajes.push(msg);
  } catch (e) {
    espera.innerHTML = `<span class="aviso">Ocurrió un error: ${esc(e.message)}</span>`;
    activo.mensajes.push({ tipo: "error", texto: `Ocurrió un error: ${e.message}` });
  }
  activo.ts = Date.now(); guardar(); pintarLista();
  chat.scrollTop = chat.scrollHeight;
}

/* ---------- Selector de versión ---------- */
document.querySelectorAll(".segmented button").forEach(b => b.addEventListener("click", () => {
  modo = b.dataset.modo;
  document.querySelectorAll(".segmented button").forEach(x => x.setAttribute("aria-pressed", x === b));
  estado.textContent = modo === "llm" ? "Con IA · aún no conectada, usa Reglas" : "Sin IA · siempre disponible";
}));

/* ---------- Tema claro / oscuro ---------- */
const mq = window.matchMedia("(prefers-color-scheme: dark)");
const esOscuro = () => (document.documentElement.dataset.tema ?? (mq.matches ? "oscuro" : "claro")) === "oscuro";

function pintarBotonTema() {
  const o = esOscuro();
  $("#tema").setAttribute("aria-pressed", o);
  $("#tema-icono").textContent = o ? "☀️" : "🌙";
  $("#tema-texto").textContent = o ? "Tonos claros" : "Tonos oscuros";
  document.querySelector('meta[name="theme-color"]').content = o ? "#0b0d1a" : "#f4f7ff";
}
$("#tema").addEventListener("click", () => {
  const nuevo = esOscuro() ? "claro" : "oscuro";
  document.documentElement.dataset.tema = nuevo;
  try { localStorage.setItem("tema", nuevo); } catch (e) {}
  pintarBotonTema();
});
mq.addEventListener?.("change", pintarBotonTema);
pintarBotonTema();

/* ---------- Menú lateral en móvil ---------- */
function abrirMenu() { sidebar.classList.add("abierta"); velo.hidden = false; }
function cerrarMenu() { sidebar.classList.remove("abierta"); velo.hidden = true; }
$("#menu").addEventListener("click", abrirMenu);
velo.addEventListener("click", cerrarMenu);
document.addEventListener("keydown", e => { if (e.key === "Escape") { cerrarMenu(); cerrarPanel(); cerrarMenuDescarga(); } });

/* ---------- Entrada ---------- */
form.addEventListener("submit", e => {
  e.preventDefault();
  const t = entrada.value.trim();
  if (!t) return;
  entrada.value = "";
  resolver(t);
});
entrada.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
});

/* ---------- Ejemplos ---------- */
$("#ejemplos").innerHTML = EJEMPLOS.map((t, i) => `<button class="btn" type="button" data-i="${i}">Ejemplo ${i + 1}: ${esc(t.slice(0, 38))}…</button>`).join("");
$("#ejemplos").addEventListener("click", e => {
  const i = e.target.closest("button")?.dataset.i;
  if (i !== undefined) resolver(EJEMPLOS[i]);
});

/* ---------- Inicio ---------- */
cargar();
pintarLista();
bienvenida();
