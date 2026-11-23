// Ejercicio S7 · Parte B · Tests de CARACTERIZACIÓN del detalle de un pedido.
// El bloque «heredada» está activo desde el principio: es la red. Lo escribió Joan Cifo ANTES de tocar nada.
// El bloque «nueva» es el mismo comportamiento contra src/orders/ui/OrderDetailScreen.tsx: quítale el .skip.
// Donde las dos versiones se comportan distinto A PROPÓSITO, el test lo dice con un objeto { heredada, nueva }.
import { fireEvent, screen, within } from '@testing-library/react';
import * as api from '../services/api';
import type { Order } from '../shared/types';
import { OrderDetailScreen } from '../orders';
import OrderDetailPage from './OrderDetailPage';
import { ADMIN, AGENT, asSeenBy, MANAGER, ORDERS, renderScreen, WithSessionAndToast } from './characterization-harness';
import type { Actor } from '../orders';

vi.mock('../services/api');

type Version = 'heredada' | 'nueva';
const byId = (orders: Order[], id: string) => orders.find((order) => order.ord_id === id);

function open(version: Version, id: string, actor: Actor) {
  const orders = ORDERS.map(asSeenBy(actor));
  // Heredada: lee de src/services/api. En producción, un pedido que no existe da un 404 que nadie captura
  // (la pantalla se queda en «Cargando…» y aparece un unhandledrejection en consola). Aquí: una petición sin respuesta.
  vi.mocked(api.getOrder).mockImplementation((orderId) => {
    const order = byId(orders, orderId);
    return order ? Promise.resolve(order) : new Promise<Order>(() => undefined);
  });
  vi.mocked(api.doAction).mockImplementation(async (orderId) => ({ ...byId(orders, orderId)!, ord_st: 'cancelled' }));
  vi.mocked(api.sendLog).mockResolvedValue(undefined);
  const element =
    version === 'heredada' ? <OrderDetailPage /> : <WithSessionAndToast>{(props) => <OrderDetailScreen {...props} />}</WithSessionAndToast>;
  return renderScreen({ path: `/orders/${id}`, route: '/orders/:id', actor, element, orders });
}

const heading = () => screen.findByRole('heading', { level: 1 });
/** Intl separa el importe del símbolo con un espacio de no separación (U+00A0). Se normaliza para comparar. */
const plain = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ');

/** Comportamiento que se CONSERVA: las dos versiones tienen que hacer exactamente lo mismo. */
function characterizeKept(version: Version) {
  it('mientras carga, enseña «Cargando…»', () => {
    open(version, 'P-1001', ADMIN);
    expect(screen.getByText('Cargando…')).toBeInTheDocument();
  });

  it('cabecera: número de pedido y estado', async () => {
    open(version, 'P-1001', ADMIN);
    expect(await heading()).toHaveTextContent('Pedido P-1001 Pendiente');
  });

  it('un pedido cancelado lleva la etiqueta en rojo', async () => {
    open(version, 'P-1006', ADMIN);
    await heading();
    expect(screen.getByText('Cancelado')).toHaveClass('badge', 'badge--danger');
  });

  it('subtítulo: cliente · fecha · nivel tal y como llega', async () => {
    open(version, 'P-1001', ADMIN);
    await heading();
    expect(screen.getByText('Talleres Norte · 02/10/2026 · gold')).toBeInTheDocument();
  });

  it('líneas: SKU, cantidad, precio e importe SIN descuento', async () => {
    open(version, 'P-1001', ADMIN);
    await heading();
    const rows = screen.getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell').map((cell) => plain(cell.textContent)));
    expect(rows).toEqual([
      ['A-10', '40', '32,50 €', '1300,00 €'],
      ['B-20', '4', '210,00 €', '840,00 €'],
    ]);
  });

  it('total con descuento por nivel e IVA', async () => {
    open(version, 'P-1001', MANAGER);
    expect(await screen.findByText('Total con IVA: 2330,46 €')).toBeInTheDocument();
  });

  it('la nota del cliente se lee como texto, con las marcas a la vista', async () => {
    open(version, 'P-1002', ADMIN);
    await heading();
    expect(screen.getByText('Entregar <b>antes</b> del viernes')).toHaveClass('note');
  });

  it('sin nota, no hay párrafo de nota', async () => {
    open(version, 'P-1001', ADMIN);
    await heading();
    expect(document.querySelector('.note')).toBeNull();
  });

  it('el botón de cancelar sigue la regla del dominio', async () => {
    open(version, 'P-1005', MANAGER); // pendiente y por debajo de su límite
    expect(await screen.findByRole('button', { name: 'Cancelar pedido' })).toBeInTheDocument();
  });

  it('nadie cancela un pedido ya enviado, ni un manager por encima de su límite', async () => {
    const first = open(version, 'P-1004', ADMIN);
    await heading();
    expect(screen.queryByRole('button', { name: 'Cancelar pedido' })).toBeNull();
    first.unmount();
    open(version, 'P-1003', MANAGER);
    await heading();
    expect(screen.queryByRole('button', { name: 'Cancelar pedido' })).toBeNull();
  });

  it('cancelar: vuelve a la lista y avisa «Pedido cancelado»', async () => {
    open(version, 'P-1005', ADMIN);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar pedido' }));
    expect(await screen.findByRole('heading', { name: 'Lista de pedidos' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Pedido cancelado');
  });

}

/** Comportamiento que cambia A PROPÓSITO: cada test dice qué hace cada versión. */
function characterizeChanged(version: Version) {
  it('un agente no ve importes', async () => {
    const expected = {
      heredada: 'Total con IVA: 0,00 €', // el BFF ya no le manda líneas y la pantalla calcula 0: un dato falso
      nueva: null, // la nueva no enseña un total que no puede calcular
    } satisfies Record<Version, string | null>;
    open(version, 'P-1001', AGENT);
    await heading();
    const total = screen.queryByText(/Total con IVA/);
    expect(total ? plain(total.textContent) : null).toBe(expected[version]);
  });

  it('un pedido que no existe', async () => {
    open(version, 'P-9999', ADMIN);
    if (version === 'heredada') {
      // Se queda cargando para siempre.
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(screen.getByText('Cargando…')).toBeInTheDocument();
    } else {
      expect(await screen.findByRole('heading', { name: 'No existe el pedido P-9999' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Volver a Pedidos' })).toHaveAttribute('href', '/');
    }
  });
}

function characterize(version: Version) {
  characterizeKept(version);
  characterizeChanged(version);
}

afterEach(() => vi.restoreAllMocks());

describe('detalle · versión heredada (la red)', () => characterize('heredada'));
describe('Parte B · detalle · versión nueva', () => characterize('nueva'));
