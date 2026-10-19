// Exportar un chat a PDF (impresión del navegador) o Word (.docx real), con fórmulas y gráficas.
// Ambos formatos parten de la misma lista de bloques (ver `bloques`).

import { resolver } from "./resolver.js";
import { figuras } from "./grafica.js";
import { ETIQUETAS } from "./roles.js";
import { ETIQ_DM } from "./explicador.js";

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const coma = s => String(s).replace(/(\d)\.(\d)/g, "$1,$2");
const fmt = v => (typeof v === "number" ? String(Math.round(v * 1e6) / 1e6).replace(".", ",") : String(v));

/* ------------------------------------------------------------------ */
/* 1. Contenido: lista de bloques                                      */
/* ------------------------------------------------------------------ */
function etiqueta(sim) { return ETIQ_DM[sim] ?? ETIQUETAS[sim] ?? sim; }

function valorTxt(sim, v) {
  if (Array.isArray(v)) return `${v.length} datos: ${v.map(fmt).join("; ")}`;
  if (sim === "confianza") return `${fmt(Math.round(v * 10000) / 100)} %`;
  return fmt(v);
}

export function bloques(chat) {
  const B = [];
  B.push({ t: "titulo", text: "Inferencia estadística" });
  B.push({ t: "sub", text: chat.titulo });
  B.push({ t: "meta", text: `Generado el ${new Date().toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" })}` });
  let i = 0;
  for (const m of chat.mensajes) {
    if (m.tipo === "user") { i++; B.push({ t: "h1", text: `Ejercicio ${i}` }, { t: "enun", text: m.texto }); continue; }
    if (m.tipo === "error") { B.push({ t: "nota", text: m.texto }); continue; }
    if (m.tipo !== "bot" || !m.estado) continue;
    const est = m.estado;
    if (!est.soportado) { B.push({ t: "nota", text: (est.notas ?? []).join(" ") }); continue; }

    const pares = Object.entries(est.datos).map(([k, v]) => `${etiqueta(k)}: ${valorTxt(k, v)}`);
    (est.consultas ?? []).forEach(c => pares.push(`Probabilidad ${c.etq ?? ""}: ${c.op === "entre" ? `entre ${fmt(c.a)} y ${fmt(c.b)}` : `${c.op === "menor" ? "menor que" : "mayor que"} ${fmt(c.a)}`}`.replace("  ", " ")));
    B.push({ t: "h2", text: "Datos identificados" }, { t: "lista", items: pares });
    for (const n of est.notas ?? []) B.push({ t: "nota", text: n });

    const out = resolver(est.tipo, est.datos, est.opciones, est.consultas);
    if (!out.ok) { B.push({ t: "nota", text: `No se pudo resolver: ${out.error}.` }); continue; }
    const r = out.resultado;

    B.push({ t: "h2", text: "Tema" }, { t: "p", text: `${r.tema} · ${r.tabla}` });
    B.push({ t: "h2", text: "Fórmula" }, { t: "tex", tex: r.formula });
    if (r.supuestos?.length) B.push({ t: "lista", items: r.supuestos });
    B.push({ t: "h2", text: "Procedimiento" });
    r.pasos.forEach((p, k) => {
      B.push({ t: "paso", text: `${k + 1}. ${p.titulo}` });
      if (p.texto) B.push({ t: "p", text: p.texto });
      for (const l of p.lineas ?? []) B.push({ t: "tex", tex: l });
    });
    B.push({ t: "h2", text: "Resultado" });
    if (r.resultados) r.resultados.forEach(x => B.push({ t: "tex", tex: x.tex }));
    else {
      const f = x => String(Math.round(x * 10000) / 10000).replace(".", "{,}");
      B.push({ t: "tex", tex: `${f(r.intervalo.inf)} < ${r.intervalo.simbolo} < ${f(r.intervalo.sup)}` });
    }
    B.push({ t: "concl", text: coma(r.conclusion) });
    for (const a of r.advertencias ?? []) B.push({ t: "nota", text: a });

    if (r.grafica) {
      B.push({ t: "h2", text: "Gráficas" });
      for (const lang of ["python", "r", "statgraphics"]) {
        for (const f of figuras(r.grafica, lang)) B.push({ t: "fig", lang, titulo: f.titulo, svg: f.svg, caption: `${{ python: "Python (matplotlib)", r: "R (gráficos base)", statgraphics: "Statgraphics" }[lang]} · ${f.titulo}` });
      }
    }
  }
  return B;
}

/* ------------------------------------------------------------------ */
/* 2. PDF: impresión del navegador                                     */
/* ------------------------------------------------------------------ */
const CSS_IMPRESION = `
  @page { size: A4; margin: 16mm 15mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font: 11pt/1.45 "Segoe UI", Calibri, Arial, sans-serif; color: #111; margin: 0; }
  h1.titulo { font-size: 22pt; margin: 0; color: #0b5cd5; }
  .sub { font-size: 13pt; margin: 4pt 0 0; color: #333; }
  .meta { font-size: 9pt; color: #666; margin: 2pt 0 12pt; border-bottom: 2px solid #0b5cd5; padding-bottom: 8pt; }
  h2.h1 { font-size: 15pt; margin: 18pt 0 4pt; padding: 4pt 8pt; background: #eaf1ff; border-left: 4px solid #0b5cd5; break-after: avoid; }
  .enun { margin: 6pt 0; padding: 8pt 10pt; background: #f5f7fa; border-radius: 6pt; }
  h3.h2 { font-size: 12pt; margin: 12pt 0 4pt; color: #0b5cd5; break-after: avoid; }
  .paso { font-weight: 600; margin: 8pt 0 2pt; break-after: avoid; }
  .tex { text-align: center; margin: 3pt 0; overflow: hidden; }
  .tex .katex-display { margin: 2pt 0; }
  ul { margin: 2pt 0 2pt 16pt; padding: 0; } li { margin: 1pt 0; }
  .nota { font-size: 9.5pt; color: #555; margin: 3pt 0; }
  .concl { margin: 6pt 0; padding: 8pt 10pt; border: 1.5px solid #0b5cd5; border-radius: 6pt; background: #f4f8ff; }
  figure { margin: 8pt 0; break-inside: avoid; text-align: center; }
  figure svg { width: 100%; max-width: 150mm; height: auto; border: 1px solid #ddd; }
  figcaption { font-size: 9pt; color: #555; margin-top: 2pt; }
`;

export function htmlDocumento(chat, baseUrl) {
  const k = window.katex;
  const tex = t => { try { return k.renderToString(t, { displayMode: true, throwOnError: false, strict: "ignore" }); } catch (e) { return `<code>${esc(t)}</code>`; } };
  const cuerpo = bloques(chat).map(b => {
    switch (b.t) {
      case "titulo": return `<h1 class="titulo">${esc(b.text)}</h1>`;
      case "sub": return `<p class="sub">${esc(b.text)}</p>`;
      case "meta": return `<p class="meta">${esc(b.text)}</p>`;
      case "h1": return `<h2 class="h1">${esc(b.text)}</h2>`;
      case "h2": return `<h3 class="h2">${esc(b.text)}</h3>`;
      case "enun": return `<div class="enun">${esc(b.text)}</div>`;
      case "p": return `<p>${esc(b.text)}</p>`;
      case "paso": return `<div class="paso">${esc(b.text)}</div>`;
      case "tex": return `<div class="tex">${tex(b.tex)}</div>`;
      case "lista": return `<ul>${b.items.map(x => `<li>${esc(x)}</li>`).join("")}</ul>`;
      case "nota": return `<p class="nota">ⓘ ${esc(b.text)}</p>`;
      case "concl": return `<div class="concl">${esc(b.text)}</div>`;
      case "fig": return `<figure>${b.svg.replace(/ width="\d+" height="\d+"/, "")}<figcaption>${esc(b.caption)}</figcaption></figure>`;
      default: return "";
    }
  }).join("\n");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(chat.titulo)}</title>
    <base href="${esc(baseUrl)}"><link rel="stylesheet" href="vendor/katex/katex.min.css"><style>${CSS_IMPRESION}</style></head><body>${cuerpo}</body></html>`;
}

export async function exportarPDF(chat) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  doc.open(); doc.write(htmlDocumento(chat, new URL(".", location.href).href)); doc.close();
  await new Promise(res => { iframe.onload = res; setTimeout(res, 1500); });
  try { await iframe.contentWindow.document.fonts.ready; } catch (e) { /* sin API de fuentes */ }
  await new Promise(r => setTimeout(r, 250));
  const titulo = document.title;
  document.title = `Inferencia - ${chat.titulo}`.slice(0, 80);   // nombre sugerido del archivo
  const limpiar = () => { document.title = titulo; setTimeout(() => iframe.remove(), 500); };
  iframe.contentWindow.addEventListener("afterprint", limpiar, { once: true });
  iframe.contentWindow.focus();
  iframe.contentWindow.print();
  setTimeout(limpiar, 60000);
}

/* ------------------------------------------------------------------ */
/* 3. Word: .docx real                                                 */
/* ------------------------------------------------------------------ */

/* --- zip mínimo (sin compresión) --- */
const TABLA_CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = u8 => { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = TABLA_CRC[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const utf8 = s => new TextEncoder().encode(s);

export function crearZip(archivos) {   // [{ nombre, datos: Uint8Array }]
  const ahora = new Date();
  const hora = (ahora.getHours() << 11) | (ahora.getMinutes() << 5) | (ahora.getSeconds() >> 1);
  const fecha = ((ahora.getFullYear() - 1980) << 9) | ((ahora.getMonth() + 1) << 5) | ahora.getDate();
  const locales = [], centrales = [];
  let desplazamiento = 0;
  for (const a of archivos) {
    const nombre = utf8(a.nombre), crc = crc32(a.datos), tam = a.datos.length;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, hora, true); lh.setUint16(12, fecha, true); lh.setUint32(14, crc, true); lh.setUint32(18, tam, true); lh.setUint32(22, tam, true);
    lh.setUint16(26, nombre.length, true); lh.setUint16(28, 0, true);
    locales.push(new Uint8Array(lh.buffer), nombre, a.datos);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, hora, true); ch.setUint16(14, fecha, true); ch.setUint32(16, crc, true); ch.setUint32(20, tam, true); ch.setUint32(24, tam, true);
    ch.setUint16(28, nombre.length, true); ch.setUint32(42, desplazamiento, true);
    centrales.push(new Uint8Array(ch.buffer), nombre);
    desplazamiento += 30 + nombre.length + tam;
  }
  const tamCentral = centrales.reduce((s, x) => s + x.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, archivos.length, true); fin.setUint16(10, archivos.length, true);
  fin.setUint32(12, tamCentral, true); fin.setUint32(16, desplazamiento, true);
  return new Blob([...locales, ...centrales, new Uint8Array(fin.buffer)], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

/* --- imágenes: SVG → PNG --- */
function cargarImagen(url) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("No se pudo convertir la imagen")); i.src = url; });
}
const aBytes = canvas => new Promise((res, rej) => canvas.toBlob(async b => (b ? res(new Uint8Array(await b.arrayBuffer())) : rej(new Error("Sin imagen"))), "image/png"));

export async function svgAPng(svg, ancho, alto, escala = 2.5) {
  // URL de datos (no blob:): con foreignObject, Chrome "mancha" el canvas si la imagen viene de un blob
  const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  const img = await cargarImagen(url);
  const c = document.createElement("canvas");
  c.width = Math.round(ancho * escala); c.height = Math.round(alto * escala);
  const g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0, c.width, c.height);
  return { bytes: await aBytes(c), w: ancho, h: alto };
}

/* --- fórmulas: KaTeX → PNG (fuentes incrustadas) --- */
const FUENTES_NUCLEO = ["Main-Regular", "Main-Bold", "Main-Italic", "Main-BoldItalic", "Math-Italic", "Math-BoldItalic", "AMS-Regular", "Size1-Regular", "Size2-Regular", "Size3-Regular", "Size4-Regular"];
let cssKatex = null;

async function aDataUri(url) {
  const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
  let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return `data:font/woff2;base64,${btoa(bin)}`;
}

export async function prepararCssKatex() {
  if (cssKatex) return cssKatex;
  const base = new URL("vendor/katex/", location.href);
  let css = await (await fetch(new URL("katex.min.css", base))).text();
  const bloquesFont = css.match(/@font-face\{[^}]*\}/g) ?? [];
  for (const b of bloquesFont) {
    const nombre = b.match(/fonts\/(KaTeX_[A-Za-z0-9_-]+)\.woff2/)?.[1]?.replace("KaTeX_", "");
    if (!nombre || !FUENTES_NUCLEO.includes(nombre)) { css = css.replace(b, ""); continue; }
    const uri = await aDataUri(new URL(`fonts/KaTeX_${nombre}.woff2`, base));
    css = css.replace(b, b.replace(/src:[^;}]*/, `src:url(${uri}) format("woff2")`));
  }
  return (cssKatex = css);
}

const cacheTex = new Map();
let calentado = false;
export async function texAPng(tex) {
  if (cacheTex.has(tex)) return cacheTex.get(tex);
  const css = await prepararCssKatex();
  const FS = 22;
  const caja = document.createElement("div");
  caja.style.cssText = `position:fixed;left:-9999px;top:0;font-size:${FS}px;line-height:1.2;white-space:nowrap;padding:4px 6px;background:#fff;color:#000`;
  caja.innerHTML = window.katex.renderToString(tex, { displayMode: false, throwOnError: false, strict: "ignore", output: "html" });
  document.body.appendChild(caja);
  const r = caja.getBoundingClientRect();
  const w = Math.ceil(r.width), h = Math.ceil(r.height);
  const xhtml = new XMLSerializer().serializeToString(caja.firstChild);
  caja.remove();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="font-size:${FS}px;line-height:1.2;white-space:nowrap;padding:4px 6px;background:#fff;color:#000"><style>${css}</style>${xhtml}</div></foreignObject></svg>`;
  // la primera fórmula calienta las fuentes incrustadas; las demás ya no lo necesitan
  if (!calentado) { await svgAPng(svg, w, h, 1); calentado = true; }
  const png = await svgAPng(svg, w, h, 3);
  cacheTex.set(tex, png);
  return png;
}

/* --- WordprocessingML --- */
const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
const x = s => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

const run = (t, o = {}) => `<w:r><w:rPr>${o.b ? "<w:b/>" : ""}${o.i ? "<w:i/>" : ""}${o.color ? `<w:color w:val="${o.color}"/>` : ""}${o.sz ? `<w:sz w:val="${o.sz}"/>` : ""}</w:rPr><w:t xml:space="preserve">${x(t)}</w:t></w:r>`;
const parrafo = (inner, o = {}) => `<w:p><w:pPr>${o.estilo ? `<w:pStyle w:val="${o.estilo}"/>` : ""}${o.keep ? "<w:keepNext/>" : ""}${o.shd ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.shd}"/>` : ""}${o.borde ? `<w:pBdr><w:left w:val="single" w:sz="18" w:space="6" w:color="${o.borde}"/></w:pBdr>` : ""}<w:spacing w:before="${o.antes ?? 0}" w:after="${o.despues ?? 80}"/>${o.centro ? '<w:jc w:val="center"/>' : ""}</w:pPr>${inner}</w:p>`;

let idImg = 0;
function imagen(rid, cx, cy, nombre) {
  idImg++;
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${idImg}" name="${x(nombre)}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${idImg}" name="${x(nombre)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}

const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${NS}>
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="es-ES"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:qFormat/><w:rPr><w:b/><w:color w:val="0B5CD5"/><w:sz w:val="44"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="0B5CD5"/><w:sz w:val="32"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:color w:val="1F4E9E"/><w:sz w:val="26"/></w:rPr></w:style>
</w:styles>`;

export async function crearDocx(chat, alProgreso = () => {}) {
  idImg = 0;
  const B = bloques(chat);
  const imagenes = [];   // { nombre, bytes }
  const rel = [];        // relaciones
  const partes = [];
  const EMU = 9525;
  const agregar = (bytes, nombre) => { const rid = `rId${rel.length + 10}`; imagenes.push({ nombre: `media/${nombre}`, bytes }); rel.push(`<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${nombre}"/>`); return rid; };

  let hecho = 0;
  for (const b of B) {
    alProgreso(++hecho / B.length);
    switch (b.t) {
      case "titulo": partes.push(parrafo(run(b.text), { estilo: "Title", despues: 40 })); break;
      case "sub": partes.push(parrafo(run(b.text, { sz: 26 }), { despues: 20 })); break;
      case "meta": partes.push(parrafo(run(b.text, { color: "666666", sz: 18 }), { despues: 200 })); break;
      case "h1": partes.push(parrafo(run(b.text), { estilo: "Heading1", antes: 300 })); break;
      case "h2": partes.push(parrafo(run(b.text), { estilo: "Heading2", antes: 160, despues: 60 })); break;
      case "enun": partes.push(parrafo(run(b.text), { shd: "F2F5FA", borde: "0B5CD5", despues: 120 })); break;
      case "p": partes.push(parrafo(run(b.text))); break;
      case "paso": partes.push(parrafo(run(b.text, { b: true }), { keep: true, antes: 100, despues: 20 })); break;
      case "lista": for (const it of b.items) partes.push(parrafo(run("•  " + it), { despues: 20 })); break;
      case "nota": partes.push(parrafo(run("ⓘ " + b.text, { i: true, color: "555555", sz: 19 }))); break;
      case "concl": partes.push(parrafo(run(b.text, { b: true }), { shd: "EAF1FF", borde: "0B5CD5", antes: 80, despues: 140 })); break;
      case "tex": {
        try {
          const p = await texAPng(b.tex), k = 0.72;
          const rid = agregar(p.bytes, `f${rel.length}.png`);
          partes.push(parrafo(imagen(rid, Math.round(p.w * k * EMU), Math.round(p.h * k * EMU), "fórmula"), { centro: true, despues: 40 }));
        } catch (e) { partes.push(parrafo(run(b.tex.replace(/\\[a-z]+/g, " ").replace(/[{}]/g, ""), { i: true }), { centro: true })); }
        break;
      }
      case "fig": {
        const p = await svgAPng(b.svg, 720, 470, 2.5);
        const rid = agregar(p.bytes, `g${rel.length}.png`);
        const cx = 5600000, cy = Math.round(cx * 470 / 720);
        partes.push(parrafo(imagen(rid, cx, cy, b.caption), { centro: true, antes: 100, despues: 20, keep: true }));
        partes.push(parrafo(run(b.caption, { i: true, color: "555555", sz: 18 }), { centro: true, despues: 140 }));
        break;
      }
      default: break;
    }
  }

  const documento = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${partes.join("")}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const tipos = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`;
  const relRaiz = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
  const relDoc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${rel.join("")}</Relationships>`;

  const archivos = [
    { nombre: "[Content_Types].xml", datos: utf8(tipos) },
    { nombre: "_rels/.rels", datos: utf8(relRaiz) },
    { nombre: "word/document.xml", datos: utf8(documento) },
    { nombre: "word/styles.xml", datos: utf8(ESTILOS) },
    { nombre: "word/_rels/document.xml.rels", datos: utf8(relDoc) },
    ...imagenes.map(i => ({ nombre: `word/${i.nombre}`, datos: i.bytes }))
  ];
  return { blob: crearZip(archivos), documento, archivos };
}

export function descargarBlob(blob, nombre) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export const nombreArchivo = titulo => (titulo.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "chat");

export async function exportarWord(chat, alProgreso) {
  const { blob } = await crearDocx(chat, alProgreso);
  descargarBlob(blob, `inferencia_${nombreArchivo(chat.titulo)}.docx`);
}
