// Une la interpretación con el motor: resolver(tipo, datos, opciones, consultas) -> { ok, resultado | error, pregunta? }
import { SOLVERS } from "./ic.js";
import { resolverMuestral } from "./muestral.js";

export function resolver(tipo, datos, opciones = {}, consultas = []) {
  try {
    if (tipo?.startsWith("dm_")) return { ok: true, resultado: resolverMuestral(tipo, datos, opciones, consultas) };
    const solver = SOLVERS[tipo];
    if (!solver) return { ok: false, error: "Tipo de problema no disponible." };
    return { ok: true, resultado: solver(datos, opciones) };
  } catch (e) {
    return { ok: false, error: e.message.replace(/\.$/, ""), pregunta: e.pregunta ?? null };
  }
}
