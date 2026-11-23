// PRESENTACIÓN · Panel NUEVO (Sesión 7). Contenedor: datos con useOrdersList, cálculo con buildDashboardMetrics.
// Diferencias A PROPÓSITO con el heredado (las fija dashboard.characterization.test.tsx):
//   · Mientras carga, «Cargando…». El heredado enseñaba «0» y «0,00 €»: un dato falso durante un segundo.
//   · La facturación aplica el descuento por nivel (el heredado no lo aplicaba).
import type { Actor } from '../domain/cancellation';
import { buildDashboardMetrics } from './orders-dashboard';
import { useOrdersList } from './useOrdersList';

export function DashboardScreen({ actor }: { actor: Actor }) {
  const { state, reload } = useOrdersList();

  if (state.status === 'loading') return <main className="page">Cargando…</main>;
  if (state.status === 'error') {
    return (
      <main className="page" role="alert">
        No se han podido cargar los pedidos. <button onClick={reload}>Reintentar</button>
      </main>
    );
  }

  const metrics = buildDashboardMetrics(state.orders, actor);
  return (
    <main className="page">
      <h1>Panel</h1>
      <div className="cards">
        <div className="card"><h2>{metrics.pending}</h2>Pendientes</div>
        <div className="card"><h2>{metrics.revenue}</h2>Facturación</div>
        <div className="card"><h2>{metrics.cancellable}</h2>Cancelables por ti</div>
      </div>
    </main>
  );
}
