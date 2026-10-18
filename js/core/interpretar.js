// Punto de entrada único: decide si el enunciado es de intervalos de confianza o de distribuciones muestrales.
import { interpretar as interpretarIC } from "./roles.js";
import { esMuestral, interpretarMuestral } from "./muestral.js";

export function interpretarTodo(texto, forzarTipo = null) {
  if (forzarTipo ? forzarTipo.startsWith("dm_") : esMuestral(texto)) return interpretarMuestral(texto, forzarTipo);
  return { consultas: undefined, ...interpretarIC(texto, forzarTipo) };
}
