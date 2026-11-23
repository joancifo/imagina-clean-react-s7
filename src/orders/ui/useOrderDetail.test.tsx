// Ejercicio S7 · Parte B · El hook de datos del detalle: cuatro estados y ninguna respuesta tardía.
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createInMemoryAdapters, createOrdersModule, type OrdersModule } from '../composition';
import type { LoadOrderDetail } from '../application/load-order-detail';
import type { Order } from '../domain/order';
import { OrdersProvider } from './OrdersProvider';
import { useOrderDetail } from './useOrderDetail';

const order = (id: string): Order => ({ id, customerName: 'Hotel Brisa', customerTier: 'silver', status: 'pending', ownerId: 'u2', createdAt: '2026-10-08T10:00:00Z', lines: [] });

/** Un caso de uso que responde cuando el test lo decide: así se prueba el orden de llegada. */
function controllable() {
  const calls = new Map<string, (value: Awaited<ReturnType<LoadOrderDetail>>) => void>();
  const loadOrderDetail: LoadOrderDetail = ({ orderId }) => new Promise((resolve) => calls.set(orderId, resolve));
  return { loadOrderDetail, answer: (orderId: string, value: Awaited<ReturnType<LoadOrderDetail>>) => act(async () => calls.get(orderId)?.(value)) };
}

function renderWith(patch: Partial<OrdersModule>, orderId: string) {
  const module = { ...createOrdersModule(createInMemoryAdapters([])), ...patch };
  const wrapper = ({ children }: { children: ReactNode }) => <OrdersProvider module={module}>{children}</OrdersProvider>;
  return renderHook(({ id }) => useOrderDetail(id), { wrapper, initialProps: { id: orderId } });
}

describe('Parte B · useOrderDetail', () => {
  it('empieza cargando y pasa a listo con el pedido', async () => {
    const control = controllable();
    const { result } = renderWith({ loadOrderDetail: control.loadOrderDetail }, 'P-1');
    expect(result.current).toEqual({ status: 'loading' });
    await control.answer('P-1', { ok: true, value: order('P-1') });
    expect(result.current).toEqual({ status: 'ready', order: order('P-1') });
  });

  it('«no existe» y «no hay servidor» son estados distintos', async () => {
    const missing = controllable();
    const first = renderWith({ loadOrderDetail: missing.loadOrderDetail }, 'P-9');
    await missing.answer('P-9', { ok: false, error: 'not-found' });
    expect(first.result.current).toEqual({ status: 'not-found' });

    const down = controllable();
    const second = renderWith({ loadOrderDetail: down.loadOrderDetail }, 'P-1');
    await down.answer('P-1', { ok: false, error: 'unavailable' });
    expect(second.result.current).toEqual({ status: 'error' });
  });

  it('una excepción del caso de uso es «error», no una pantalla en blanco', async () => {
    const { result } = renderWith({ loadOrderDetail: async () => { throw new TypeError('bug'); } }, 'P-1');
    await act(async () => undefined);
    expect(result.current).toEqual({ status: 'error' });
  });

  it('al cambiar de pedido vuelve a «cargando»: no enseña el anterior con la URL del nuevo', async () => {
    const control = controllable();
    const { result, rerender } = renderWith({ loadOrderDetail: control.loadOrderDetail }, 'P-1');
    await control.answer('P-1', { ok: true, value: order('P-1') });
    rerender({ id: 'P-2' });
    expect(result.current).toEqual({ status: 'loading' });
  });

  it('una respuesta TARDÍA del pedido anterior se descarta', async () => {
    const control = controllable();
    const { result, rerender } = renderWith({ loadOrderDetail: control.loadOrderDetail }, 'P-1');
    rerender({ id: 'P-2' }); // P-1 sigue en vuelo
    await control.answer('P-2', { ok: true, value: order('P-2') });
    await control.answer('P-1', { ok: true, value: order('P-1') }); // llega tarde
    expect(result.current).toEqual({ status: 'ready', order: order('P-2') });
  });
});
