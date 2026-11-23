// PRESENTACIÓN · Hook de DATOS del detalle (Sesión 7). Cuatro estados y ninguna respuesta tardía.
// Si orderId cambia mientras la petición anterior sigue en vuelo, la respuesta vieja se descarta:
// sin esto, abrir P-1001 y saltar enseguida a P-1002 puede acabar enseñando P-1001 con la URL de P-1002.
import { useEffect, useState } from 'react';
import type { Order } from '../domain/order';
import { useOrdersModule } from './OrdersProvider';

export type OrderDetailState = { status: 'loading' } | { status: 'not-found' } | { status: 'error' } | { status: 'ready'; order: Order };

const LOADING: OrderDetailState = { status: 'loading' };

export function useOrderDetail(orderId: string): OrderDetailState {
  const { loadOrderDetail } = useOrdersModule();
  // Se guarda el resultado JUNTO con el pedido al que pertenece. Si no coincide con el actual, es que aún carga.
  const [loaded, setLoaded] = useState<{ orderId: string; state: OrderDetailState } | null>(null);

  useEffect(() => {
    let active = true; // la limpieza desactiva esta petición: si su respuesta llega tarde, se ignora
    loadOrderDetail({ orderId }).then(
      (result) => {
        if (!active) return;
        const state: OrderDetailState = result.ok ? { status: 'ready', order: result.value } : { status: result.error === 'not-found' ? 'not-found' : 'error' };
        setLoaded({ orderId, state });
      },
      () => active && setLoaded({ orderId, state: { status: 'error' } }),
    );
    return () => {
      active = false;
    };
  }, [loadOrderDetail, orderId]);

  return loaded?.orderId === orderId ? loaded.state : LOADING;
}
