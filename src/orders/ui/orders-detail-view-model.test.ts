// @vitest-environment node
// Ejercicio S7 · Parte B · El view model del detalle, sin renderizar nada.
import type { Actor } from '../domain/cancellation';
import type { Order } from '../domain/order';
import { buildOrderDetailViewModel } from './orders-detail-view-model';

const ORDER: Order = {
  id: 'P-1001', customerName: 'Talleres Norte', customerTier: 'gold', status: 'pending', ownerId: 'u2', createdAt: '2026-10-02T09:15:00Z',
  lines: [{ sku: 'A-10', quantity: 40, unitPrice: 32.5 }, { sku: 'B-20', quantity: 4, unitPrice: 210 }],
};
const ADMIN: Actor = { id: 'u1', role: 'admin' };
const AGENT: Actor = { id: 'u3', role: 'agent' };
const plain = (value: string | null) => value?.replace(/\s+/g, ' ') ?? null;

describe('Parte B · buildOrderDetailViewModel', () => {
  it('título, estado y subtítulo con el nivel tal cual llega', () => {
    const view = buildOrderDetailViewModel(ORDER, ADMIN);
    expect(view.title).toBe('Pedido P-1001');
    expect(view.status).toEqual({ label: 'Pendiente', danger: false });
    expect(view.subtitle).toBe('Talleres Norte · 02/10/2026 · gold');
  });

  it('solo un pedido cancelado es «danger»', () => {
    expect(buildOrderDetailViewModel({ ...ORDER, status: 'cancelled' }, ADMIN).status).toEqual({ label: 'Cancelado', danger: true });
    expect(buildOrderDetailViewModel({ ...ORDER, status: 'shipped' }, ADMIN).status).toEqual({ label: 'Enviado', danger: false });
  });

  it('el importe de cada línea va SIN descuento; el descuento es del pedido', () => {
    const [first] = buildOrderDetailViewModel(ORDER, ADMIN).lines;
    expect({ ...first, unitPrice: plain(first.unitPrice), amount: plain(first.amount) }).toEqual({ sku: 'A-10', quantity: '40', unitPrice: '32,50 €', amount: '1300,00 €' });
  });

  it('el total sale del dominio: descuento por nivel e IVA', () => {
    expect(plain(buildOrderDetailViewModel(ORDER, ADMIN).total)).toBe('Total con IVA: 2330,46 €');
  });

  it('a un agente no se le prepara ningún total (cambio a propósito)', () => {
    expect(buildOrderDetailViewModel({ ...ORDER, lines: [] }, AGENT).total).toBeNull();
  });

  it('la nota: tal cual si hay texto; null si no hay o está vacía', () => {
    expect(buildOrderDetailViewModel({ ...ORDER, customerNote: 'Entregar <b>antes</b>' }, ADMIN).note).toBe('Entregar <b>antes</b>');
    expect(buildOrderDetailViewModel(ORDER, ADMIN).note).toBeNull();
    expect(buildOrderDetailViewModel({ ...ORDER, customerNote: '' }, ADMIN).note).toBeNull();
  });

  it('se puede cancelar según la regla del dominio', () => {
    expect(buildOrderDetailViewModel(ORDER, ADMIN).canCancel).toBe(true);
    expect(buildOrderDetailViewModel({ ...ORDER, status: 'shipped' }, ADMIN).canCancel).toBe(false);
    expect(buildOrderDetailViewModel(ORDER, null).canCancel).toBe(false);
  });
});
