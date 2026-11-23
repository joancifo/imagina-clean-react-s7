// @vitest-environment node
// Ejercicio S7 · Parte A · La feature Pedidos, medida desde la composición. Los casos de uso no se han tocado.
import { createInMemoryAdapters, createOrdersModule, type OrdersAdapters } from './composition';
import type { MemoryLogger } from '../observability';
import type { Order } from './domain/order';

const PENDING: Order = { id: 'P-1005', customerName: 'Hotel Brisa', customerTier: 'silver', status: 'pending', ownerId: 'u2', createdAt: '2026-10-08T10:00:00Z', lines: [{ sku: 'A-10', quantity: 10, unitPrice: 32.5 }] };
const SHIPPED: Order = { ...PENDING, id: 'P-1004', status: 'shipped' };
const ADMIN = { id: 'u1', role: 'admin' as const };
const AGENT = { id: 'u3', role: 'agent' as const };
const CLOCK = { now: () => new Date('2026-11-23T18:00:00Z') };

function setup(patch: Partial<OrdersAdapters> = {}) {
  const adapters = { ...createInMemoryAdapters([PENDING, SHIPPED], CLOCK), ...patch };
  return { module: createOrdersModule(adapters), entries: (adapters.logger as MemoryLogger).entries };
}

describe('Parte A · la feature Pedidos deja rastro', () => {
  it('cancelar deja una entrada orders.cancel con el pedido y el resultado', async () => {
    const { module, entries } = setup();
    await module.cancelOrder({ orderId: 'P-1005', reason: 'Pedido duplicado en el ERP', actor: ADMIN });
    expect(entries).toEqual([expect.objectContaining({ level: 'info', event: 'orders.cancel', feature: 'orders', traceId: 't-1', fields: expect.objectContaining({ orderId: 'P-1005', outcome: 'ok' }) })]);
  });

  it('una regla incumplida es warn con su código (y el motivo no aparece por ningún sitio)', async () => {
    const { module, entries } = setup();
    await module.cancelOrder({ orderId: 'P-1004', reason: 'Pedido duplicado en el ERP', actor: ADMIN });
    expect(entries[0]).toMatchObject({ level: 'warn', event: 'orders.cancel', fields: { code: 'already-closed' } });
    expect(JSON.stringify(entries)).not.toContain('duplicado');
  });

  it('aprobar también se mide', async () => {
    const { module, entries } = setup();
    await module.approveOrder({ orderId: 'P-1005', actor: AGENT });
    expect(entries[0]).toMatchObject({ level: 'warn', event: 'orders.approve', fields: { orderId: 'P-1005', code: 'forbidden' } });
  });

  it('si la analítica falla, el pedido se cancela igual… pero ahora queda constancia', async () => {
    const failing = { publish: async () => { throw new Error('HTTP 422'); } };
    const { module, entries } = setup({ events: failing });
    const result = await module.cancelOrder({ orderId: 'P-1005', reason: 'Pedido duplicado en el ERP', actor: ADMIN });
    expect(result.ok).toBe(true);
    expect(entries.map((entry) => entry.event)).toEqual(['events.publish_failed', 'orders.cancel']);
    expect(entries[0]).toMatchObject({ level: 'warn', fields: { code: 'OrderCancelled', errorName: 'Error' } });
  });
});
