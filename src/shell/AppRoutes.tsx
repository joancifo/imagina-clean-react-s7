// SHELL · Mapa de rutas de la aplicación. Único lugar que relaciona URL, permiso y pantalla.
// Las pantallas no comprueban si se puede entrar: eso lo decide una regla del dominio a través del guard.
import { Route, Routes } from 'react-router-dom';
import { canViewDashboard, canViewOrders, DashboardScreen, OrdersListPage } from '../orders';
import { NotFoundPage } from './NotFoundPage';
import { OrderDetailRoute } from './OrderDetailRoute';
import { RequireAccess } from './RequireAccess';
import type { Session } from '../session';

type Props = { session: Session; onNotify: (message: string) => void };

export function AppRoutes({ session, onNotify }: Props) {
  return (
    <Routes>
      <Route path="/" element={<RequireAccess session={session} can={canViewOrders}>{(actor) => <OrdersListPage actor={actor} onNotify={onNotify} />}</RequireAccess>} />
      {/* Sesión 7 · el detalle elige versión con un flag; el panel ya es solo el nuevo */}
      <Route path="/orders/:id" element={<OrderDetailRoute session={session} onNotify={onNotify} />} />
      <Route path="/dashboard" element={<RequireAccess session={session} can={canViewDashboard}>{(actor) => <DashboardScreen actor={actor} />}</RequireAccess>} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
