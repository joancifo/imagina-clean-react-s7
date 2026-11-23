# ADR-005 · Migración incremental de las pantallas heredadas y observabilidad de Pedidos

- **Estado:** aceptado (versión de referencia del profesor)
- **Fecha:** 23/11/2026
- **Autoría:** Joan Cifo

## Contexto
- Quedaban dos pantallas heredadas (`src/pages/OrderDetailPage.tsx`, `src/pages/DashboardPage.tsx`) con su propio cliente HTTP (`axios`), `moment`, estado derivado en un `useEffect` y, en el panel, una fórmula del total que no aplicaba el descuento por nivel.
- Ninguna operación de Pedidos dejaba rastro. La analítica de cancelaciones llevaba desde la Sesión 6 recibiendo un 422 del BFF sin que nadie lo supiera: el caso de uso ignora, con razón, los fallos de analítica.
- El JavaScript inicial pesaba 105,8 kB (gzip) e incluía `axios` y `moment`, que la primera pantalla no usa.

## Opciones consideradas
| Opción | A favor | En contra |
|---|---|---|
| 1. Reescribir las dos pantallas en un solo PR | Rápido de escribir | Imposible de revisar; si algo falla, se revierte todo; nadie sabe qué comportamiento cambió |
| 2. **Caracterizar, migrar detrás de una abstracción y borrar** | Cada paso es un PR pequeño; la misma tabla de tests prueba las dos versiones; vuelta atrás sin desplegar | Conviven dos versiones un tiempo; un flag más que retirar |
| 3. Dejarlas como están | Cero riesgo hoy | Siguen el bug del panel, el bundle y la duplicación |

| Observabilidad | A favor | En contra |
|---|---|---|
| a. `console.log` dentro de los casos de uso | Inmediato | El núcleo depende del entorno; datos personales en la consola; nada llega al equipo |
| b. SDK de un proveedor en cada pantalla | Muchas funciones | Acopla la aplicación al proveedor; cada pantalla decide qué envía |
| c. **Puerto `Logger` + decoradores en la composición + BFF** | El núcleo no cambia; lista blanca en cliente y servidor; proveedor sustituible | Un endpoint más (`/api/telemetry`) y un logger con búfer que mantener |

## Decisión
**Migración (opción 2).**
1. Tests de caracterización (`src/pages/*.characterization.test.tsx`) contra la versión heredada **antes** de tocarla.
2. Versión nueva en la feature (`OrderDetailScreen`, `DashboardScreen`) con view model puro, hook de datos y casos de uso.
3. La misma tabla de caracterización contra las dos versiones. Los cambios de comportamiento se escriben como `{ heredada, nueva }`.
4. **Detalle:** rama por abstracción con el flag `newOrderDetail` (`src/shell/OrderDetailRoute.tsx`), la heredada cargada con `lazy()`. **Panel:** sustitución directa; sus dos cambios están decididos y probados, y no compensa un flag.
5. Borrar la versión heredada cuando la nueva lleve un ciclo sin incidencias (`ui.crash` y `orders.load_detail` con `outcome: 'exception'` a cero).

**Observabilidad (opción c).** Puerto `Logger` (`src/observability`) con lista blanca de campos compartida con el BFF (`shared/telemetry.json`). Los casos de uso se envuelven en `composition.ts` con `traced()` y los eventos con `observePublisher()`. Cada pantalla nueva va dentro de un `FeatureBoundary`. En producción, un logger con búfer envía lotes a `/api/telemetry`.

## Consecuencias
- Positivas: el bug del panel corregido a propósito y con test; un agente ya no ve un total falso; JavaScript inicial de 105,8 kB a 64,4 kB; cada cancelación, aprobación y carga de detalle deja una entrada con duración y resultado; el 422 de la analítica, encontrado y corregido.
- Aceptadas: dos versiones del detalle mientras dure el flag; un endpoint de telemetría que operar; el búfer puede perder entradas si el destino está caído mucho tiempo (se cuentan en `dropped()`).
- Controles: `npm run test:characterization`, `npm run test:observability`, `npm run perf:budget` (70 kB), `npm run mutate -- src/orders/ui/orders-dashboard.ts --check`, `npm run lint:arch` (el núcleo no importa `observability`).
- Revisaremos la decisión si: el flag del detalle sigue vivo dentro de dos sesiones (deuda), la telemetría necesita más campos (se amplía `shared/telemetry.json`, nunca se relaja la validación) o el volumen de logs exige muestreo.

## Lo que decidimos NO hacer
- **Un flag para el panel**: cada flag es una rama que probar y que borrar. Se usa cuando hay riesgo de volver atrás, no por costumbre.
- **Registrar mensajes de error y pilas**: pueden llevar datos de la pantalla. Se registra el tipo (`errorName`) y la operación.
- **`memo` por todas partes**: solo donde una medición lo justifique (`examples/tema14/render-count.test.tsx`).
- **Instalar un SDK de observabilidad hoy**: el puerto permite cambiar el `LogSink` por el de un proveedor (u OpenTelemetry) sin tocar ni casos de uso ni pantallas.
