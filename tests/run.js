// Banco de pruebas: node tests/run.js [--v] [--id=ej35]
// Verifica (1) que el intérprete extraiga tipo y datos y (2) que el motor reproduzca los intervalos del libro.
import { readFileSync } from "node:fs";
import { interpretarTodo as interpretar } from "../js/core/interpretar.js";
import { resolver } from "../js/core/resolver.js";

const banco = JSON.parse(readFileSync(new URL("./banco.json", import.meta.url), "utf8"));
const verbose = process.argv.includes("--v");
const soloId = process.argv.find(a => a.startsWith("--id="))?.slice(5);

const cerca = (a, b) => (typeof a === "number" && typeof b === "number" ? Math.abs(a - b) <= 1e-3 * Math.max(1, Math.abs(b)) : false);
const igual = (a, b) => (Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((x, i) => cerca(x, b[i])) : cerca(a, b));

let ok = 0, mal = 0;
const fallos = [];
for (const caso of banco) {
  if (soloId && caso.id !== soloId) continue;
  const r = interpretar(caso.texto);
  const errores = [];
  if (r.tipo !== caso.tipo) errores.push(`tipo: obtuve ${r.tipo}, esperaba ${caso.tipo}`);
  if (caso.pregunta && !r.preguntaClase) errores.push("esperaba una pregunta de aclaración (¿intervalo o prueba?)");
  // una prueba de hipótesis nunca debe terminar como intervalo de confianza
  if (caso.tipo?.startsWith("ph_") && r.tipo?.startsWith("ic_")) errores.push("una prueba de hipótesis cayó en un intervalo de confianza");
  for (const [k, v] of Object.entries(caso.datos)) {
    if (!(k in r.datos)) errores.push(`falta ${k} (esperaba ${JSON.stringify(v)})`);
    else if (!igual(r.datos[k], v)) errores.push(`${k}: obtuve ${JSON.stringify(r.datos[k])}, esperaba ${JSON.stringify(v)}`);
  }
  for (const [k, v] of Object.entries(caso.opciones ?? {})) {
    if (r.opciones?.[k] !== v) errores.push(`opción ${k}: obtuve ${r.opciones?.[k]}, esperaba ${v}`);
  }
  if (caso.consultas) {
    const got = r.consultas ?? [];
    if (got.length !== caso.consultas.length) errores.push(`consultas: obtuve ${got.length}, esperaba ${caso.consultas.length}`);
    else caso.consultas.forEach((c, i) => { for (const k of Object.keys(c)) if (!igual(got[i][k], c[k]) && got[i][k] !== c[k]) errores.push(`consulta ${i + 1}.${k}: obtuve ${got[i][k]}, esperaba ${c[k]}`); });
  }
  if (caso.probs && !errores.length) {
    const s = resolver(r.tipo, r.datos, r.opciones, r.consultas);
    if (!s.ok) errores.push(`motor: ${s.error}`);
    else caso.probs.forEach((p, i) => { const g = s.resultado.resultados[i]?.prob; if (g === undefined || Math.abs(g - p) > 0.002) errores.push(`prob ${i + 1}: obtuve ${g?.toFixed(4)}, esperaba ${p}`); });
  }
  if (caso.prueba && !errores.length) {
    const s = resolver(r.tipo, r.datos, r.opciones);
    if (!s.ok) errores.push(`motor: ${s.error}`);
    else {
      const p = s.resultado.prueba, c = caso.prueba;
      if (Math.abs(p.estadistico.valor - c.est) > 1e-3 * Math.max(1, Math.abs(c.est))) errores.push(`estadístico: obtuve ${p.estadistico.valor.toFixed(4)}, esperaba ${c.est}`);
      if (c.criticos && (p.criticos.length !== c.criticos.length || p.criticos.some((v, i) => Math.abs(v - c.criticos[i]) > 2e-3))) errores.push(`críticos: obtuve ${p.criticos.map(v => v.toFixed(4))}, esperaba ${c.criticos}`);
      if (p.rechaza !== c.rechaza) errores.push(`decisión: obtuve ${p.rechaza ? "rechaza" : "no rechaza"}, esperaba ${c.rechaza ? "rechaza" : "no rechaza"}`);
    }
  }
  if (caso.regresion && !errores.length) {
    const s = resolver(r.tipo, r.datos, r.opciones);
    if (!s.ok) errores.push(`motor: ${s.error}`);
    else for (const [k, v] of Object.entries(caso.regresion)) if (Math.abs(s.resultado.extra[k] - v) > 1e-3 * Math.max(1, Math.abs(v))) errores.push(`regresión ${k}: obtuve ${s.resultado.extra[k]}, esperaba ${v}`);
  }
  if (caso.intervalo && !errores.length) {
    const s = resolver(r.tipo, r.datos, r.opciones);
    if (!s.ok) errores.push(`motor: ${s.error}`);
    else {
      const { inf, sup } = s.resultado.intervalo;
      const t = caso.tol ?? 0.01;
      if (Math.abs(inf - caso.intervalo[0]) > t || Math.abs(sup - caso.intervalo[1]) > t) errores.push(`intervalo: obtuve (${inf.toFixed(4)}, ${sup.toFixed(4)}), esperaba (${caso.intervalo})`);
    }
  }
  if (errores.length) { mal++; fallos.push({ id: caso.id, errores }); } else ok++;
  if (verbose && !errores.length) console.log(`✓ ${caso.id}`);
}
for (const f of fallos) console.log(`✗ ${f.id}\n    ${f.errores.join("\n    ")}`);
console.log(`\n${ok} correctos, ${mal} con fallas, de ${ok + mal}.`);
process.exitCode = mal ? 1 : 0;
