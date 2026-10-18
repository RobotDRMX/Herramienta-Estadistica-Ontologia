// Extractor determinista de cantidades en el texto (sin IA).
// Devuelve cada número con su posición y contexto, para que luego
// las reglas (o el LLM) le asignen un papel estadístico.

const NUM = /(-?\d+(?:[.,]\d+)?)(\s*%)?/g;

export function extraerNumeros(texto) {
  const salida = [];
  for (const m of texto.matchAll(NUM)) {
    const bruto = m[1].replace(",", ".");
    const esPorcentaje = Boolean(m[2]);
    let valor = parseFloat(bruto);
    if (esPorcentaje) valor = valor / 100;
    const ini = m.index;
    const fin = ini + m[0].length;
    salida.push({
      valor,
      textoOriginal: m[0].trim(),
      porcentaje: esPorcentaje,
      ini,
      fin,
      contexto: texto.slice(Math.max(0, ini - 40), Math.min(texto.length, fin + 40)),
      rol: null,        // lo asigna el modo reglas / LLM
      confianza: 0
    });
  }
  return salida;
}

export function aplicarEquivalencias(texto, equivalencias) {
  const t = texto.toLowerCase();
  return equivalencias
    .filter(e => t.includes(e.patron))
    .map(e => ({ valor: e.valor, simbolo: e.simbolo, textoOriginal: e.patron, confianza: 0.9 }));
}
