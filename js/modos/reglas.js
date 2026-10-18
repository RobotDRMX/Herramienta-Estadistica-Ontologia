// Versión 1: sin IA. Siempre disponible.
// Contrato común de los modos: analizar(texto) -> estado
//   estado = { modo, texto, soportado, tipo, datos, opciones, consultas?, evidencias, notas, faltantes }
// La solución se calcula al mostrar el estado (core/explicador.js), de modo que editar un dato la recalcula.

import { interpretarTodo } from "../core/interpretar.js";

export async function analizar(texto) {
  return { modo: "reglas", ...interpretarTodo(texto) };
}
