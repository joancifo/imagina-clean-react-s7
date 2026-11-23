// Ejercicio S7 · Parte B · La ruta del detalle durante la migración: rama por abstracción con un flag.
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as api from '../services/api';
import { createMemoryLogger, ObservabilityProvider } from '../observability';
import { createInMemoryAdapters, createOrdersModule, OrdersProvider, toOrder, type Actor, type OrdersModule } from '../orders';
import { createInMemorySessionGateway, SessionProvider, type Session } from '../session';
import type { Order as LegacyOrder } from '../shared/types';
import { AppStoreProvider } from '../store/appStore';
import { AppRoutes } from './AppRoutes';
import { DEFAULT_FLAGS, FlagsProvider, type FeatureFlags } from './flags';

vi.mock('../services/api');

const ORDER: LegacyOrder = { ord_id: 'P-1005', cust_nm: 'Hotel Brisa', cust_tier: 'silver', ord_st: 'pending', owner_id: 'u2', crt_ts: '2026-10-08T10:00:00Z', ln_items: [{ sku: 'A-10', qty: 10, unit_prc: 32.5 }] };
const MANAGER: Session = { status: 'ready', actor: { id: 'u2', role: 'manager' } as Actor, name: 'Pau' };

function renderDetail({ flags = DEFAULT_FLAGS, session = MANAGER, patch = {} }: { flags?: FeatureFlags; session?: Session; patch?: Partial<OrdersModule> } = {}) {
  const logger = createMemoryLogger();
  const module = { ...createOrdersModule(createInMemoryAdapters([toOrder(ORDER)])), ...patch };
  render(
    <MemoryRouter initialEntries={['/orders/P-1005']}>
      <ObservabilityProvider logger={logger}>
        <FlagsProvider flags={flags}>
          {/* La heredada lee la sesión con useSession(); la nueva la recibe del shell por props */}
          <SessionProvider gateway={createInMemorySessionGateway(session.status === 'ready' ? session.actor : null)}>
            <AppStoreProvider>
              <OrdersProvider module={module}>
                <AppRoutes session={session} onNotify={() => undefined} />
              </OrdersProvider>
            </AppStoreProvider>
          </SessionProvider>
        </FlagsProvider>
      </ObservabilityProvider>
    </MemoryRouter>,
  );
  return { logger };
}

beforeEach(() => {
  vi.mocked(api.getOrder).mockResolvedValue(ORDER);
});
afterEach(() => vi.restoreAllMocks());

describe('Parte B · /orders/:id elige versión con el flag newOrderDetail', () => {
  it('con el flag encendido se ve la versión nueva, que no usa src/services/api', async () => {
    renderDetail();
    expect(await screen.findByRole('heading', { name: 'Pedido P-1005 Pendiente' })).toBeInTheDocument();
    expect(api.getOrder).not.toHaveBeenCalled();
  });

  it('con el flag apagado vuelve la heredada (cargada bajo demanda)', async () => {
    renderDetail({ flags: { ...DEFAULT_FLAGS, newOrderDetail: false } });
    expect(await screen.findByRole('heading', { name: 'Pedido P-1005 Pendiente' })).toBeInTheDocument();
    expect(api.getOrder).toHaveBeenCalledWith('P-1005');
  });

  it('la versión nueva pide sesión, como el resto de pantallas de Pedidos', () => {
    renderDetail({ session: { status: 'ready', actor: null, name: null } });
    expect(screen.getByRole('heading', { name: 'No tienes acceso a esta página' })).toBeInTheDocument();
  });

  it('si la versión nueva se rompe, se rompe sola: aviso en pantalla y una entrada ui.crash', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const broken = { ...toOrder(ORDER), lines: null as never };
    const { logger } = renderDetail({ patch: { loadOrderDetail: async () => ({ ok: true, value: broken }) } });
    expect(await screen.findByRole('alert')).toHaveTextContent('No se ha podido mostrar esta pantalla');
    expect(logger.entries).toEqual([expect.objectContaining({ event: 'ui.crash', feature: 'orders-detail', fields: { errorName: 'TypeError' } })]);
  });
});
