// PRESENTACIÓN · Pantalla de detalle NUEVA (Sesión 7). Sustituye a src/pages/OrderDetailPage.tsx detrás del flag newOrderDetail.
// Contenedor: conecta el hook de datos, el view model y el caso de uso de cancelar. No calcula ni formatea.
// Misma marca que la heredada (lo exigen los tests de caracterización) salvo los cambios anotados en el view model.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Actor } from '../domain/cancellation';
import { buildOrderDetailViewModel } from './orders-detail-view-model';
import { useCancelOrder } from './useCancelOrder';
import { useOrderDetail } from './useOrderDetail';

/** El detalle heredado cancelaba con este motivo fijo. Se conserva: cambiarlo es otra decisión de producto. */
export const DETAIL_CANCEL_REASON = 'Cancelado desde el detalle';

type Props = { orderId: string; actor: Actor; onNotify: (message: string) => void };

export function OrderDetailScreen({ orderId, actor, onNotify }: Props) {
  const state = useOrderDetail(orderId);
  const { cancel, pending } = useCancelOrder();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  if (state.status === 'loading') return <main className="page">Cargando…</main>;
  if (state.status === 'not-found') {
    return (
      <main className="page">
        <h1>No existe el pedido {orderId}</h1>
        <Link to="/">Volver a Pedidos</Link>
      </main>
    );
  }
  if (state.status === 'error') return <main className="page" role="alert">No se ha podido cargar el pedido. Inténtalo de nuevo en unos segundos.</main>;

  const view = buildOrderDetailViewModel(state.order, actor);

  const handleCancel = async () => {
    setError(null);
    const outcome = await cancel({ orderId, reason: DETAIL_CANCEL_REASON, actor });
    if (!outcome.ok) return setError(outcome.message);
    onNotify('Pedido cancelado');
    navigate('/');
  };

  return (
    <main className="page">
      <h1>
        {view.title} <span className={view.status.danger ? 'badge badge--danger' : 'badge'}>{view.status.label}</span>
      </h1>
      <p>{view.subtitle}</p>
      <table>
        <thead>
          <tr><th>SKU</th><th>Cantidad</th><th>Precio</th><th>Importe</th></tr>
        </thead>
        <tbody>
          {view.lines.map((line) => (
            <tr key={line.sku}><td>{line.sku}</td><td>{line.quantity}</td><td>{line.unitPrice}</td><td>{line.amount}</td></tr>
          ))}
        </tbody>
      </table>
      {view.note && <p className="note">{view.note}</p>}
      {view.total && <p><strong>{view.total}</strong></p>}
      {error && <p role="alert">{error}</p>}
      {view.canCancel && <button onClick={handleCancel} disabled={pending}>Cancelar pedido</button>}
    </main>
  );
}
