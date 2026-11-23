# Solución del ejercicio de la Sesión 7 (versión del profesor)

Repositorio de referencia: este mismo. Diferencias con el de prácticas:

| Archivo | Prácticas | Solución |
|---|---|---|
| `src/observability/buffered-logger.ts` | «Por implementar» | Búfer, lotes, un solo envío en vuelo, reintento y tope |
| `src/observability/traced.ts`, `observed-publisher.ts` | «Por implementar» | Decoradores completos |
| `src/orders/composition.ts` | Recibe `logger` y `newId` y no los usa | Envuelve `cancelOrder`, `approveOrder`, `loadOrderDetail` y los eventos |
| `src/orders/infrastructure/analytics-event-publisher.ts` | Envía `reason` (422 del BFF) | Sin `reason` |
| `src/orders/ui/orders-detail-view-model.ts`, `useOrderDetail.ts`, `OrderDetailScreen.tsx` | «Por implementar» | Completos |
| `src/shell/OrderDetailRoute.tsx` | «Por implementar» | Flag + `RequireAccess` + `FeatureBoundary` + `lazy()` |
| `src/orders/ui/DashboardScreen.tsx` | «Por implementar» | Completo |
| `src/shell/AppRoutes.tsx` | Importa las dos páginas heredadas | `OrderDetailRoute` y `DashboardScreen` |
| `src/pages/DashboardPage.tsx` | Presente | Borrado (con su bloque de caracterización y su test en `cancel-order.test.tsx`) |
| `src/orders/ui/orders-dashboard.test.ts` | 2 tests (100 % de cobertura, 19 % de mutación) | 6 tests (100 % de mutación) |
| Tests (`.skip`) | 11 bloques omitidos (55 tests) | Todo activo |

## Parte A · paso a paso
```ts
export function createBufferedLogger({ sink, clock, maxBatch = 20, maxBuffer = 200 }: BufferedLoggerOptions): BufferedLogger {
  let buffer: LogEntry[] = [];
  let dropped = 0;
  let inFlight: Promise<void> | null = null;

  const keepWithinLimit = () => {
    const excess = buffer.length - maxBuffer;
    if (excess > 0) { buffer = buffer.slice(excess); dropped += excess; }
  };

  const flush = (): Promise<void> => {
    if (inFlight) return inFlight;
    if (buffer.length === 0) return Promise.resolve();
    const batch = buffer;
    buffer = [];
    inFlight = sink.send(batch)
      .catch(() => { buffer = [...batch, ...buffer]; keepWithinLimit(); })
      .finally(() => { inFlight = null; });
    return inFlight;
  };

  return {
    log(record) {
      buffer.push(toLogEntry(record, clock.now()));
      keepWithinLimit();
      if (buffer.length >= maxBatch) void flush();
    },
    flush,
    pending: () => buffer.length,
    dropped: () => dropped,
  };
}
```
```ts
export function traced<C, R extends ResultLike>(name: string, useCase: (command: C) => Promise<R>, deps: TraceDeps) {
  const { logger, clock, newId, feature } = deps;
  return async (command: C): Promise<R> => {
    const traceId = newId();
    const startedAt = clock.now().getTime();
    const base = { event: name, feature, traceId };
    const orderId = orderIdOf(command);
    const elapsed = () => clock.now().getTime() - startedAt;
    try {
      const result = await useCase(command);
      if (result.ok) logger.log({ ...base, level: 'info', fields: { orderId, outcome: 'ok', durationMs: elapsed() } });
      else logger.log({ ...base, level: 'warn', fields: { orderId, outcome: 'error', code: result.error, durationMs: elapsed() } });
      return result;
    } catch (error) {
      const errorName = error instanceof Error ? error.name : typeof error;
      logger.log({ ...base, level: 'error', fields: { orderId, outcome: 'exception', errorName, durationMs: elapsed() } });
      throw error;
    }
  };
}
```
Puntos a comentar:
- **Medir no puede romper lo que se mide.** `log()` es síncrono y `flush()` nunca rechaza. Un logger que lanza convierte un problema de red en una pantalla en blanco.
- **El lote se lleva el array.** `const batch = buffer; buffer = [];` frente a `sink.send(buffer); buffer.length = 0`: la segunda vacía el array que el destino está serializando. Es el fallo más frecuente de la parte.
- **Decorador en la composición.** Ni `cancel-order.ts` ni `approve-order.ts` han cambiado. Añadir medición fue abrir para extensión sin modificar (OCP), y `lint:arch` impide que el núcleo importe `observability`.
- **El tipo del error, no el mensaje.** Un `TypeError` dice qué clase de fallo es; su mensaje puede llevar el nombre de un cliente. Lo mismo en `FeatureBoundary`.
- **El 422.** `toLog` enviaba `reason: event.reason`. El BFF lo rechaza desde la Sesión 6 (lista blanca) y el caso de uso lo ignoraba. Dos fallos en uno: un texto escrito por una persona viajaba a la analítica, y la analítica de cancelaciones llevaba un día sin datos. Lo encuentra un test de integración contra el BFF real; en producción lo habría encontrado `events.publish_failed`.

Trampas previstas:
- Vaciar el array que se pasó al destino → falla «lo que se registra MIENTRAS se envía».
- Sin `inFlight` → falla «dos flush seguidos».
- `flush` sin `catch` → falla «flush no rechaza».
- `fields: { ...command }` → falla «el motivo escrito por una persona nunca llega al log» (y, de paso, el campo no está en la lista blanca).
- `throw new Error(error.message)` → falla `rejects.toBe(boom)`.

## Parte B · paso a paso
```ts
export function buildOrderDetailViewModel(order: Order, actor: Actor | null): OrderDetailViewModel {
  return {
    title: `Pedido ${order.id}`,
    status: { label: STATUS_LABELS[order.status], danger: order.status === 'cancelled' },
    subtitle: `${order.customerName} · ${formatDate(order.createdAt)} · ${order.customerTier}`,
    lines: order.lines.map((line) => ({ sku: line.sku, quantity: String(line.quantity), unitPrice: formatCurrency(line.unitPrice), amount: formatCurrency(line.quantity * line.unitPrice) })),
    note: order.customerNote ? order.customerNote : null,
    total: canSeeAmounts(actor) ? `Total con IVA: ${formatCurrency(calculateTotal(order))}` : null,
    canCancel: canCancel(order, actor),
  };
}
```
```ts
export function useOrderDetail(orderId: string): OrderDetailState {
  const { loadOrderDetail } = useOrdersModule();
  const [loaded, setLoaded] = useState<{ orderId: string; state: OrderDetailState } | null>(null);
  useEffect(() => {
    let active = true;
    loadOrderDetail({ orderId }).then(
      (result) => { if (!active) return; setLoaded({ orderId, state: result.ok ? { status: 'ready', order: result.value } : { status: result.error === 'not-found' ? 'not-found' : 'error' } }); },
      () => active && setLoaded({ orderId, state: { status: 'error' } }),
    );
    return () => { active = false; };
  }, [loadOrderDetail, orderId]);
  return loaded?.orderId === orderId ? loaded.state : LOADING;
}
```
Puntos a comentar:
- **La red primero.** El bloque «heredada» de la caracterización estaba en verde antes de escribir una línea. La versión nueva se da por buena cuando pasa **la misma tabla**. Los 13 tests corren dos veces: 26 ejecuciones.
- **Cambios a propósito, escritos.** Dos: el agente ya no ve «Total con IVA: 0,00 €» (un dato falso) y un pedido que no existe ya no deja la pantalla cargando para siempre. Cada uno lleva `{ heredada, nueva }` en el test.
- **Lo que se conserva aunque no guste.** El nivel en inglés («gold») y el motivo fijo al cancelar. Cambiarlos es producto, no refactor: otro PR, con su test.
- **Respuesta tardía.** El patrón `active` es el de `useOrdersList` (Sesión 5). Guardar el resultado con su `orderId` evita además un `setState` dentro del efecto para volver a «cargando».
- **Rama por abstracción.** Las dos versiones están desplegadas; `?flags=-newOrderDetail` vuelve a la heredada sin desplegar. La heredada se carga con `lazy()`: si nadie apaga el flag, `axios` y `moment` no se descargan nunca.
- **Degradación controlada.** Si la pantalla nueva se rompe, `FeatureBoundary` enseña un aviso, deja una entrada `ui.crash` con la feature y el resto de la aplicación sigue viva.

Trampas previstas:
- `TIER_LABELS[order.customerTier]` (como en el ejemplo del Tema 9) → falla el subtítulo: la heredada enseña «gold».
- `formatCurrency(calculateTotal({ ...order, lines: [line] }))` por línea → aplica el descuento a la línea.
- Sin `active` → falla «una respuesta TARDÍA del pedido anterior se descarta».
- Mantener `import OrderDetailPage from '../pages/OrderDetailPage'` en `AppRoutes.tsx` → los tests pasan, pero el presupuesto de la Parte C no.

## Parte C · paso a paso
```ts
// Los cuatro tests que faltaban en orders-dashboard.test.ts
it('cuenta SOLO los pendientes', () => {
  const orders = [order('P-1', 'pending'), order('P-2', 'approved'), order('P-3', 'shipped'), order('P-4', 'cancelled'), order('P-5', 'pending')];
  expect(buildDashboardMetrics(orders, ADMIN).pending).toBe(2);
});
it('factura aprobados y enviados, con el total del dominio', () => {
  expect(plain(buildDashboardMetrics([order('P-1', 'approved')], ADMIN).revenue)).toBe('121,00 €');
  expect(plain(buildDashboardMetrics([order('P-1', 'shipped')], ADMIN).revenue)).toBe('121,00 €');
  expect(plain(buildDashboardMetrics([order('P-1', 'approved'), order('P-2', 'shipped')], ADMIN).revenue)).toBe('242,00 €');
});
it('no factura pendientes ni cancelados', () => {
  expect(plain(buildDashboardMetrics([order('P-1', 'pending'), order('P-2', 'cancelled')], ADMIN).revenue)).toBe('0,00 €');
});
it('cuenta los cancelables según la regla del dominio y el actor', () => {
  const orders = [order('P-1', 'pending'), order('P-2', 'approved'), order('P-3', 'shipped'), order('P-4', 'pending', 9000)];
  expect(buildDashboardMetrics(orders, ADMIN).cancellable).toBe(3);
  expect(buildDashboardMetrics(orders, MANAGER).cancellable).toBe(1);
});
```
Puntos a comentar:
- **Cobertura no es protección.** Los dos tests de partida ejecutan el 100 % de las líneas y matan 3 de 16 mutantes. Con cuatro tests de valores exactos, 16 de 16.
- **Un panel sin flag.** Sus dos cambios (facturación con descuento y «Cargando…» en lugar de ceros) están decididos y probados, y la pantalla es pequeña. Un flag para todo es deuda: cada flag es una rama más que probar y borrar.
- **El presupuesto, medido.** JavaScript inicial: de 105,8 kB a 64,4 kB (gzip). El detalle heredado, con `axios` y `moment`, queda en un chunk aparte de 43,3 kB que solo se descarga con el flag apagado.

Trampas previstas:
- «Matar» mutantes editando `orders-dashboard.ts` (el enunciado lo prohíbe y el profesor lo mira en el diff).
- Borrar `DashboardPage.tsx` y dejar su bloque «heredada» → `typecheck` en rojo.
- Mantener un import estático de `src/pages` → `perf:budget` FUERA.

## Antes y después
| Medida | Antes | Después | Comando |
|---|---|---|---|
| Fallos de analítica sin rastro | Todos | 0 | `events.publish_failed` · `npm run test:observability` |
| Operaciones de Pedidos medidas | 0 | 3 | `orders.cancel`, `orders.approve`, `orders.load_detail` |
| JavaScript inicial (gzip) | 105,8 kB | 64,4 kB | `npm run build && npm run perf:budget` |
| Pantallas heredadas en la ruta principal | 2 | 0 (una perezosa tras un flag) | `src/shell/AppRoutes.tsx` |
| Mutantes muertos en `orders-dashboard.ts` | 19 % | 100 % | `npm run mutate -- src/orders/ui/orders-dashboard.ts` |
| `useEffect` para estado derivado en el detalle | 1 | 0 | `npm run state` |
| Tests | 451 (y 55 omitidos) | 504 | `npm test` |
