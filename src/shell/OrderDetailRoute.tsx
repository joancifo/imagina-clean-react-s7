// SHELL · Ruta del detalle durante la migración (Sesión 7): RAMA POR ABSTRACCIÓN.
// Las dos versiones conviven desplegadas; el flag newOrderDetail elige. Vuelta atrás sin desplegar: ?flags=-newOrderDetail.
//   · La nueva: protegida por el guard, dentro de un límite de error con su feature (degradación controlada).
//   · La heredada: carga PEREZOSA. Ni ella ni lo que arrastra (axios, moment) entran en el bundle principal.
// Cuando la nueva se dé por buena, este archivo, el flag y src/pages/OrderDetailPage.tsx se borran (proyecto final).
import { lazy, Suspense } from 'react';
import { useParams } from 'react-router-dom';
import { FeatureBoundary } from '../observability';
import { canViewOrders, OrderDetailScreen } from '../orders';
import type { Session } from '../session';
import { useFlag } from './flags';
import { RequireAccess } from './RequireAccess';

const LegacyOrderDetailPage = lazy(() => import('../pages/OrderDetailPage'));

type Props = { session: Session; onNotify: (message: string) => void };

export function OrderDetailRoute({ session, onNotify }: Props) {
  const { id = '' } = useParams();
  const useNewDetail = useFlag('newOrderDetail');

  if (!useNewDetail) {
    return (
      <Suspense fallback={<main className="page">Cargando…</main>}>
        <LegacyOrderDetailPage />
      </Suspense>
    );
  }

  return (
    <RequireAccess session={session} can={canViewOrders}>
      {(actor) => (
        <FeatureBoundary feature="orders-detail">
          <OrderDetailScreen key={id} orderId={id} actor={actor} onNotify={onNotify} />
        </FeatureBoundary>
      )}
    </RequireAccess>
  );
}
