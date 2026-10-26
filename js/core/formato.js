// Formato de números para TeX y texto (coma decimal) y la macro \dato que marca los datos del problema.
// \dato{x} se ve igual que x en pantalla y en Word; en el PDF se pinta de rojo (ver exportar.js).

export const redondear = (x, d = 4) => Math.round((x + Number.EPSILON) * 10 ** d) / 10 ** d;
export const f = (x, d = 4) => String(redondear(x, d)).replace(".", "{,}");
/** Dígitos fijos: 0.50 -> 0{,}50 */
export const ff = (x, d = 4) => (Number.isFinite(x) ? x.toFixed(d) : String(x)).replace(".", "{,}").replace("-", "-");
export const dv = (x, d = 4) => `\\dato{${typeof x === "number" ? f(x, d) : x}}`;
/** Probabilidad en TeX: los valores muy pequeños se escriben como cota. */
export const fp = p => (p < 0.0001 ? "< 0{,}0001" : `= ${f(p, 4)}`);
/** Número como texto plano con coma decimal. */
export const num = (x, d = 4) => String(redondear(x, d)).replace(".", ",");
export const pctTxt = a => `${num(a * 100, 2)} %`;
export const MACRO_DATO = { "\\dato": "#1" };
