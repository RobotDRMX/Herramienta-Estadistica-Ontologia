// Versión 2: con IA. Misma interfaz que reglas.js.
// Plan: la IA solo refina la interpretación (qué número es cada dato y qué tipo de problema es);
// los números ya vienen del extractor determinista y el cálculo siempre lo hace el motor.
// Cadena de respaldo prevista:
//   1) proxy propio -> API gratuita (varios proveedores)
//   2) WebLLM en el navegador (si hay WebGPU)
//   3) si todo falla -> modo reglas
// Por ahora es un esqueleto: delega en reglas y avisa.

import { analizar as analizarReglas } from "./reglas.js";

export const config = {
  proxyUrl: null,       // p. ej. "https://mi-worker.example.workers.dev/interpretar"
  usarWebLLM: false
};

export async function disponible() {
  return Boolean(config.proxyUrl) || (config.usarWebLLM && "gpu" in navigator);
}

export async function analizar(texto, catalogo) {
  const r = await analizarReglas(texto, catalogo);
  return { ...r, modo: "llm", notas: [...(r.notas ?? []), "El modo con IA aún no está conectado; se usó el modo reglas como respaldo."] };
}
