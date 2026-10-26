// Punto de entrada único: decide si el enunciado es de regresión, de una prueba de hipótesis,
// de distribuciones muestrales (probabilidades) o de intervalos de confianza.
// Regla: nunca se contesta otra cosa de lo pedido. Si el enunciado pide a la vez un intervalo y contrastar una
// afirmación, se pregunta (estado.preguntaClase) en lugar de adivinar.
import { interpretar as interpretarIC } from "./roles.js";
import { esMuestral, interpretarMuestral } from "./muestral.js";
import { señalesPrueba, interpretarHipotesis } from "./hipotesis.js";
import { esRegresion, interpretarRegresion } from "./regresion.js";
import { limpiarEntrada } from "./texto.js";

const CLASES = { ic_: "Intervalo de confianza", ph_: "Prueba de hipótesis", dm_: "Probabilidad (distribución muestral)", rl_: "Regresión lineal simple" };

/** Estado «sin resolver» que muestra botones para que la persona elija qué se pide. */
function preguntarClase(texto, clases, motivo) {
  return {
    tipo: null, soportado: false, datos: {}, evidencias: [], faltantes: [], opciones: {}, texto, consultas: undefined,
    notas: [motivo],
    preguntaClase: { texto: "¿Qué quieres que resuelva?", opciones: clases.map(c => ({ clase: c, etiqueta: CLASES[c] })) }
  };
}

/** Qué familia de problema es: forzada por el tipo o la clase, o deducida de las señales del enunciado. */
export function clasificar(texto, forzarTipo = null, forzarClase = null) {
  if (forzarTipo) return { clase: forzarTipo.slice(0, 3) };
  if (forzarClase) return { clase: forzarClase };
  const s = señalesPrueba(texto);
  if (s.explicita && s.intervalo) return { clase: null, empate: ["ph_", "ic_"], motivo: "Tu enunciado pide un intervalo de confianza y también contrastar una afirmación." };
  if (s.prueba && !s.intervalo) return { clase: "ph_" };
  if (esRegresion(texto)) return { clase: "rl_" };
  if (esMuestral(texto)) return { clase: "dm_" };
  return { clase: "ic_" };
}

export function interpretarTodo(textoPegado, forzarTipo = null, forzarClase = null) {
  const texto = limpiarEntrada(textoPegado);   // quita la matemática duplicada del texto pegado (b1=3b1=3)
  const c = clasificar(texto, forzarTipo, forzarClase);
  if (c.empate) return preguntarClase(texto, c.empate, c.motivo);
  const tipo = forzarTipo && forzarTipo.startsWith(c.clase) ? forzarTipo : null;
  if (c.clase === "rl_") return interpretarRegresion(texto);
  if (c.clase === "ph_") return { consultas: undefined, ...interpretarHipotesis(texto, tipo) };
  if (c.clase === "dm_") return interpretarMuestral(texto, tipo);
  return { consultas: undefined, ...interpretarIC(texto, tipo) };
}
