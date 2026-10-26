// Une la interpretación con el motor: resolver(tipo, datos, opciones, consultas) -> { ok, resultado | error, pregunta? }
import { SOLVERS } from "./ic.js";
import { resolverMuestral } from "./muestral.js";
import { resolverHipotesis } from "./hipotesis.js";
import { resolverRegresion } from "./regresion.js";

export function resolver(tipo, datos, opciones = {}, consultas = []) {
  try {
    if (tipo?.startsWith("dm_")) return { ok: true, resultado: resolverMuestral(tipo, datos, opciones, consultas) };
    if (tipo?.startsWith("ph_")) return { ok: true, resultado: resolverHipotesis(tipo, datos, opciones) };
    if (tipo === "rl_simple") return { ok: true, resultado: resolverRegresion(datos, opciones) };
    const solver = SOLVERS[tipo];
    if (!solver) return { ok: false, error: "Tipo de problema no disponible." };
    return { ok: true, resultado: solver(datos, opciones) };
  } catch (e) {
    return { ok: false, error: e.message.replace(/\.$/, ""), pregunta: e.pregunta ?? null };
  }
}
