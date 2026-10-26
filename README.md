# Herramienta de Estadística Inferencial (web)

Intervalos de confianza (Llinás Solano, Tablas C.5–C.8), pruebas de hipótesis, correlación y regresión lineal simple a partir de enunciados en lenguaje natural.
Un solo proyecto, dos versiones de la misma herramienta:

| Versión | Archivo | Estado |
|---|---|---|
| **Reglas** | `js/modos/reglas.js` | Funcional. Sin IA, siempre disponible. |
| **Con IA** | `js/modos/llm.js` | Esqueleto: delega en Reglas. La IA solo refinará la interpretación, nunca calcula. |

## Cómo funciona
```
texto → texto.js (números, listas de datos) → roles.js (tipo + papel de cada dato)
      → resolver.js / ic.js (cálculo exacto) → explicador.js (tarjetas + KaTeX)
```
Los datos detectados son editables en la respuesta; al cambiar uno se recalcula.

## Tipos de problema
Media (z/t, con resumen o datos crudos) · proporción · diferencia de proporciones · diferencia de medias
(independientes: Z, t combinada, Welch) · datos pareados · varianza/desviación (χ²) · cociente de varianzas (F).
Distribuciones muestrales (probabilidades): media, proporción, diferencia de medias y de proporciones.
**Pruebas de hipótesis** (procedimiento de las plantillas: datos → H₀/H₁ → estadístico → punto crítico → decisión → conclusión, con valor P aparte): diferencia de medias (Z, t combinada, Welch), varianza (χ²), cociente de varianzas (F) y correlación (t con ρ₀ = 0, Z de Fisher con ρ₀ ≠ 0). La dirección de H₁ y la redacción de H₀/H₁ se deducen del enunciado y se pueden editar.
**Regresión lineal simple:** tabla x, y, x², xy; Sxx, Sxy; b₀, b₁; r y R²; ANOVA; t e intervalos de los coeficientes; predicción.
**También:** una media (Z/t), datos pareados (t sobre las diferencias), una proporción y diferencia de proporciones (Z, con proporción combinada si H₀: p₁ = p₂) y la pendiente o el intercepto de la regresión (t con n − 2 gl, con IC como dato extra).
**Comprensión del enunciado:** se limpia la matemática duplicada del texto pegado (`b1=3b1=3`), se leen primero las asignaciones `símbolo = valor` (`js/core/simbolos.js`), α y confianza son intercambiables y, si el enunciado pide a la vez un intervalo y contrastar, la herramienta pregunta en vez de adivinar (`js/core/interpretar.js`).
No disponibles aún: varianza (χ²) y cociente (F) en versión de probabilidad, nivel de confianza de un intervalo dado,
límites de tolerancia, tamaño de muestra, cotas de una cola.

## Estructura
```
index.html
css/        tokens.css (variables), glass.css (componentes), app.css (layout)
js/app.js   chat, barra lateral, historial, tema, edición de datos
js/core/    hipotesis.js  regresion.js  simbolos.js  formato.js  exportar.js (PDF y Word)  dist.js (normal, t, χ², F)  ic.js (motor)  muestral.js  texto.js  roles.js  interpretar.js  resolver.js  explicador.js  grafica.js
js/modos/   reglas.js, llm.js
vendor/     KaTeX local (funciona sin internet)
ontologia/  catalogo.json (borrador inicial; el conocimiento vigente está en roles.js)
tests/      banco.json (enunciados del libro + redacciones coloquiales) y run.js
```

## Ejecutar
`http://localhost/Estadistica/herramienta-estadistica-web/` con Apache de XAMPP encendido.
Pruebas: `node tests/run.js` (añade `--v` para ver los aciertos o `--id=ej35` para un caso).

## Hoja de ruta
1. [x] Motor de los 6 intervalos + pareados, validado con los ejemplos resueltos del libro
2. [x] Gráficas en panel lateral (estilo Python/matplotlib y R, cada una con su paleta) y script equivalente
2. [x] Descargar cada chat en PDF (impresión del navegador) o Word (.docx) con fórmulas y gráficas
2. [x] Intérprete por reglas, datos editables, preguntas aclaratorias, explicación con KaTeX
3. [x] Pruebas de hipótesis (diferencia de medias, varianza, cociente), correlación y regresión lineal simple; PDF en blanco y negro con los datos del problema en rojo
3. [x] Distribuciones muestrales de x̄, p̂, x̄₁−x̄₂ y p̂₁−p̂₂ (falta s² y el cociente)
4. [ ] Incisos «sin calcular» (¿mayor, menor o igual longitud?), nivel de confianza de un intervalo dado
5. [ ] Conectar el modo IA (proxy gratuito / WebLLM)
6. [ ] Gráfica de la distribución, exportar a PDF

## Licencia y créditos
- **Código:** [MIT](LICENSE). Úsalo, modifícalo y compártelo libremente.
- **KaTeX** (MIT) va incluido en `vendor/katex/` con su licencia.
- **Método:** las fórmulas y la organización por tipos de intervalo siguen el libro *Estadística inferencial* de
  Llinás Solano (Cap. 2, Tablas C.5–C.8), que se cita como fuente. Este proyecto no está afiliado a sus autores.
- **Enunciados de prueba (`tests/banco.json`):** son redacciones propias; no reproducen textos del libro ni de materiales de clase.
- Proyecto personal, gratuito y con fines de aprendizaje. Los resultados no sustituyen la revisión de un docente.
