// Asignaciones explícitas «símbolo = valor» (n=12, b1=3, α=0.05, r=0.52, p̂=0,3…).
// Son lo más fiable de un enunciado: se leen primero y sus números dejan de estar «libres»,
// de modo que las heurísticas por palabra clave no los reinterpreten (p. ej. «b1=3» como «3 éxitos»).
// Trabaja sobre el texto normalizado (minúsculas, sin tildes; x̄ → «x_»), con las posiciones del texto original.

const NUM = "([-+]?\\d+(?:[.,]\\d+)?)\\s*(%)?";
const aNum = s => parseFloat(String(s).replace(",", "."));
const idx = g => ({ a: "1", b: "2" })[g] ?? g ?? "";
const MARCA = "[\\u0302\\u0304\\u0307]?";   // acento circunflejo, barra o punto sobre la letra

/** Cada símbolo: expresión (con un grupo para el subíndice) y cómo se llama el dato. */
const SIMBOLOS = [
  { pat: "(?<![a-z_\\d])n\\s*_?\\s*([12ab])?", clave: (i) => `n${idx(i)}` },
  { pat: `(?<![a-z_\\d])(?:x_|xbar|x${MARCA}\\s*barra)\\s*_?\\s*([12ab])?`, clave: (i) => `x${idx(i)}` },
  { pat: "(?<![a-z_\\d])(?:sigma|σ)\\s*_?\\s*([12ab])?", clave: (i, sq) => `sigma${idx(i)}${sq ? "sq" : ""}` },
  { pat: "(?<![a-z_\\d])s\\s*_?\\s*([12ab])?", clave: (i, sq) => `s${idx(i)}${sq ? "sq" : ""}` },
  { pat: `(?<![a-z_\\d])(?:p${MARCA}|p_)\\s*_?\\s*([012])?`, clave: (i) => `p${i ?? ""}` },
  { pat: "(?<![a-z_\\d])r", clave: () => "r", grupo: false },
  { pat: "(?<![a-z_\\d])(?:rho|ρ)\\s*_?\\s*([0])?", clave: () => "rho0" },
  { pat: "(?<![a-z_\\d])b\\s*_?\\s*([01])", clave: i => `b${i}` },
  { pat: "(?<![a-z_\\d])(?:beta|β)\\s*_?\\s*([01])", clave: i => `beta${i}` },
  { pat: "(?<![a-z_\\d])(?:alfa|α)", clave: () => "alfa", grupo: false },
  { pat: "(?<![a-z_\\d])d\\s*_?\\s*([0])", clave: () => "d0" },
  { pat: "(?<![a-z_\\d])(?:mu|μ)\\s*_?\\s*([012])", clave: i => `mu${i}` }
];

/**
 * Devuelve { map, lista }: map[clave] = { valor, ini, fin, vini, vfin, texto } (la primera aparición manda).
 * `ini/fin` abarcan toda la asignación; `vini/vfin`, solo el valor.
 */
export function extraerAsignaciones(n) {
  const map = {}, lista = [];
  for (const s of SIMBOLOS) {
    const sinGrupo = s.grupo === false;
    const re = new RegExp(`${s.pat}${sinGrupo ? "()" : ""}\\s*(\\^\\s*2|²)?\\s*(?:=|:|\\s+(?:es|fue|igual a|vale)\\s)\\s*${NUM}`, "gd");
    for (const m of n.matchAll(re)) {
      const g = sinGrupo ? undefined : m[1] || undefined;
      const sq = Boolean(m[2]);
      let valor = aNum(m[3]);
      if (!Number.isFinite(valor)) continue;
      const clave = s.clave(g, sq);
      const pct = Boolean(m[4]);
      if (clave === "alfa" && (pct || valor >= 1)) valor /= 100;
      const [vini, vfin] = m.indices[3];
      const reg = { clave, valor, pct, ini: m.index, fin: m.index + m[0].length, vini, vfin: pct ? m.indices[4][1] : vfin, texto: m[0].trim() };
      lista.push(reg);
      if (!(clave in map)) map[clave] = reg;
    }
  }
  lista.sort((a, b) => a.ini - b.ini);
  return { map, lista };
}
