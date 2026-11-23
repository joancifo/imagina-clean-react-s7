// COMPOSICIÓN · Único lugar donde se eligen implementaciones concretas y se conectan con los casos de uso.
// Sesión 4: ya no exporta instancias globales (singletons). Exporta FÁBRICAS: quien arranca la aplicación
// (src/main.tsx) o un test decide qué adapters usar y crea el módulo una vez.
import { createMemoryLogger, observePublisher, traced, type Logger } from '../observability';
import { createApproveOrder, type ApproveOrder } from './application/approve-order';
import { createCancelOrder, type CancelOrder } from './application/cancel-order';
import { createLoadOrderDetail, type LoadOrderDetail } from './application/load-order-detail';
import { listUrgentOrders, type UrgentOrder } from './application/list-urgent-orders';
import { loadOrderSummary, type OrderSummary } from './application/load-order-summary';
import type { Clock, EventPublisher, OrderGateway, OrderReader } from './application/ports';
import type { Order } from './domain/order';
import { createAnalyticsEventPublisher } from './infrastructure/analytics-event-publisher';
import { createHttpOrderGateway } from './infrastructure/http-order-gateway';
import { createHttpOrderReader } from './infrastructure/http-order-reader';
import { createInMemoryEventPublisher } from './infrastructure/in-memory-event-publisher';
import { createInMemoryOrderGateway } from './infrastructure/in-memory-order-gateway';
import { systemClock } from './infrastructure/system-clock';

/** Lo que necesita la feature del exterior: un adapter por puerto.
 *  Sesión 7: también un Logger y un generador de identificadores de traza. Los casos de uso NO los reciben:
 *  la medición se añade aquí, envolviéndolos (decorador), y el núcleo sigue sin saber que lo miden. */
export type OrdersAdapters = { reader: OrderReader; gateway: OrderGateway; clock: Clock; events: EventPublisher; logger: Logger; newId: () => string };

/** Lo que la feature ofrece a la UI: casos de uso listos para llamar. Ni adapters ni fetch. */
export type OrdersModule = {
  loadOrderSummary: () => Promise<OrderSummary>;
  listUrgentOrders: () => Promise<UrgentOrder[]>;
  cancelOrder: CancelOrder;
  // Sesión 5
  /** Consulta de paso: no añade lógica. Se acepta a propósito para que la UI no reciba el puerto (ADR-003). */
  listOrders: () => Promise<Order[]>;
  approveOrder: ApproveOrder;
  // Sesión 7
  loadOrderDetail: LoadOrderDetail;
};

/** Conecta casos de uso con adapters. Inyección manual (Pure DI): sin contenedor.
 *  Sesión 7: las operaciones con efecto se envuelven con traced() y los eventos con observePublisher(). */
export function createOrdersModule({ reader, gateway, clock, events, logger, newId }: OrdersAdapters): OrdersModule {
  const trace = { logger, clock, newId, feature: 'orders' };
  const observedEvents = observePublisher(events, { logger, feature: 'orders' });
  return {
    loadOrderSummary: () => loadOrderSummary(reader),
    listUrgentOrders: () => listUrgentOrders(reader),
    cancelOrder: traced('orders.cancel', createCancelOrder({ orders: gateway, clock, events: observedEvents }), trace),
    listOrders: () => reader.findAll(),
    approveOrder: traced('orders.approve', createApproveOrder({ orders: gateway, clock, events: observedEvents }), trace),
    loadOrderDetail: traced('orders.load_detail', createLoadOrderDetail({ orders: gateway }), trace),
  };
}

/** Producción: BFF por HTTP, reloj del sistema, analítica en /api/logs y el logger que elija main.tsx. */
export function createHttpAdapters(fetchFn: typeof fetch, logger: Logger, baseUrl = '/api'): OrdersAdapters {
  return {
    reader: createHttpOrderReader(fetchFn, baseUrl),
    gateway: createHttpOrderGateway(fetchFn, baseUrl),
    clock: systemClock,
    events: createAnalyticsEventPublisher(fetchFn, baseUrl),
    logger,
    newId: () => crypto.randomUUID(),
  };
}

/** Tests, demos, Storybook y desarrollo sin backend: todo en memoria y observable. */
export function createInMemoryAdapters(seed: Order[] = [], clock: Clock = systemClock) {
  const store = createInMemoryOrderGateway(seed);
  const events = createInMemoryEventPublisher();
  let traces = 0;
  // Sesión 7: un logger en memoria (se pueden leer sus entradas) y trazas predecibles: t-1, t-2…
  return { reader: store, gateway: store, clock, events, logger: createMemoryLogger(clock), newId: () => `t-${++traces}` } satisfies OrdersAdapters;
}
