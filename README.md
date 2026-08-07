# Directorio – Gerencia Comercial (Friopacking Colombia)

Dashboard ejecutivo de ventas, pipeline, clientes, objetivos y participación de mercado.

## Estructura

```
index.html                 Shell de la app: header, tabs, contenedores vacíos por vista
assets/
  css/
    base.css               Variables, reset, header/tabs, .section genérico
    components.css         Componentes reutilizados por 2+ vistas (.card, .kpis, modal genérico, etc.)
    views/<vista>.css      Estilos exclusivos de cada vista
  js/
    main.js                Bootstrap: inyecta el HTML de cada vista y luego carga sus módulos JS
    core/
      router.js            go(seccion, sub) — activar pestaña/sección
      modal.js              Motor de modal genérico + tabla-en-modal reutilizable
      utils.js              Formato de moneda, orden de tablas, helpers de Chart.js
      data.js               fetch cacheado de /data/*.json
      ventas-agg.js         Agregados de ventas compartidos por Ventas y Clientes
      charts.js             Configuración global de Chart.js
    views/<vista>.js        Lógica exclusiva de cada vista
  img/                      Imágenes extraídas de los base64 embebidos en el original
views/<vista>.html          Fragmento de marcado de cada vista (se inyecta en index.html)
data/*.json                 Datos normalizados con nombre de campo (generados desde el original)
scripts/
  extract-excel.mjs         Regenera data/ventas.json desde "BASE COLOMBIA-.xlsx" (pestaña VENTAS)
  extract-pipeline.mjs      Regenera data/pipeline.json desde "BASE COLOMBIA-.xlsx" (pestaña PIPELINE)
  extract-data.mjs          Regenera data/{objetivos,participacion}.json desde Presentacion CO.html
  extract-images.mjs        Regenera assets/img/*.{jpg,png} desde Presentacion CO.html
Presentacion CO.html        Archivo original de referencia — NO se usa en producción, se conserva como respaldo
BASE COLOMBIA-.xlsx         Fuente de datos autoritativa de Ventas y Pipeline (pestañas VENTAS → data/ventas.json, PIPELINE → data/pipeline.json)
```

## Cómo correr el proyecto

Requiere servirse por HTTP (usa `fetch` para cargar `views/*.html` y `data/*.json`; no funciona abriendo `index.html` con doble clic por las restricciones de `file://`).

```
npx serve .
# o
node -e "require('http').createServer(require('serve-handler')).listen(3000)"
```

Cualquier servidor estático sirve — Node, Python, IIS, nginx, etc.

## Vistas

7 pestañas de navegación: Portada, Resumen, Ventas, Pipeline, Objetivos, Clientes, Organigrama.

Dos secciones adicionales existen y funcionan igual que en el original, pero **sin botón de acceso** en la navegación (así estaban en el original — se conservó esa decisión):
- **Mano de Obra** (`moventas`) — sub-vista de Ventas.
- **Participación de mercado** (`participacion`) — relacionada con Clientes.

## Regenerar los datos

**`data/ventas.json`** se regenera directamente desde `BASE COLOMBIA-.xlsx` (pestaña **VENTAS**), la fuente autoritativa del histórico de ventas:

```
node scripts/extract-excel.mjs
```

El script solo toma el rango histórico válido para el dashboard (enero 2023 a julio 2026) y deriva `año`/`mes` de la fecha real de cada fila (no de las columnas de texto Año/Mes, que en la fuente tienen alguna inconsistencia puntual frente a la fecha). Si detecta una discrepancia entre el texto y la fecha, lo avisa por consola pero no falla.

**`data/pipeline.json`** se regenera directamente desde `BASE COLOMBIA-.xlsx` (pestaña **PIPELINE**):

```
node scripts/extract-pipeline.mjs
```

Cada fila incluye `anio` (2026 o 2027) además de `mesCierre` (1–12 o `null` si no tiene mes estimado), lo que permite filtrar el forecast y el detalle de clientes por año + mes sin ambigüedad entre ambos periodos.

Los otros 2 datasets (`objetivos`, `participacion`) todavía se extraen de los arrays embebidos en `Presentacion CO.html` con nombres de campo en vez de índices posicionales:

```
node scripts/extract-data.mjs
node scripts/extract-images.mjs
```

Los 4 scripts usan solo módulos built-in de Node (`fs`, `vm`, `zlib`) — no requieren `npm install`.
