// Ejercicio S7 · Parte C · Tests de CARACTERIZACIÓN del panel.
// «heredada» fijaba lo que hacía src/pages/DashboardPage.tsx; «nueva», src/orders/ui/DashboardScreen.tsx.
// Dos diferencias A PROPÓSITO, escritas en el test: la facturación (bug del descuento) y lo que se ve mientras carga.
// Solución: la versión heredada se ha BORRADO (y su bloque de aquí con ella). Las expectativas de «heredada»
// se quedan en el archivo como documentación de qué cambió y por qué; ya no se ejecutan.
import { screen, waitFor } from '@testing-library/react';
import * as api from '../services/api';
import { DashboardScreen } from '../orders';
import { ADMIN, MANAGER, ORDERS, renderScreen, WithSessionAndToast } from './characterization-harness';
import type { Actor } from '../orders';

vi.mock('../services/api');

type Version = 'heredada' | 'nueva';

function open(version: Version, actor: Actor) {
  vi.mocked(api.getOrders).mockResolvedValue(ORDERS);
  if (version === 'heredada') throw new Error('La versión heredada del panel ya no existe');
  const element = <WithSessionAndToast>{({ actor: current }) => <DashboardScreen actor={current} />}</WithSessionAndToast>;
  return renderScreen({ path: '/dashboard', route: '/dashboard', actor, element, orders: ORDERS });
}

/** El número grande de cada tarjeta, buscado por su rótulo. Intl usa U+00A0 antes del €: se normaliza. */
const card = (label: string) => (screen.queryByText(label)?.querySelector('h2')?.textContent ?? '').replace(/\s+/g, ' ');

function characterize(version: Version) {
  it('cuenta los pedidos pendientes', async () => {
    open(version, ADMIN);
    await waitFor(() => expect(card('Pendientes')).toBe('3'));
  });

  it('cancelables por ti: un admin, pendientes y aprobados (nunca cerrados)', async () => {
    open(version, ADMIN);
    await waitFor(() => expect(card('Cancelables por ti')).toBe('4'));
  });

  it('cancelables por ti: un manager, solo pendientes por debajo de su límite', async () => {
    open(version, MANAGER);
    await waitFor(() => expect(card('Cancelables por ti')).toBe('2'));
  });

  // ── Cambios A PROPÓSITO ────────────────────────────────────────────────────────────
  it('facturación de aprobados y enviados', async () => {
    const expected = {
      heredada: '769,56 €', // BUG: el panel tenía su propia fórmula y no aplicaba el descuento por nivel
      nueva: '756,49 €', // el total del dominio (calculateTotal), el mismo que la lista y el detalle
    } satisfies Record<Version, string>;
    open(version, ADMIN);
    await waitFor(() => expect(card('Facturación')).toBe(expected[version]));
  });

  it('lo que se ve ANTES de que lleguen los datos', () => {
    open(version, ADMIN);
    if (version === 'heredada') {
      expect(card('Pendientes')).toBe('0'); // un cero que no es verdad durante la carga
      expect(card('Facturación')).toBe('0,00 €');
    } else {
      expect(screen.getByText('Cargando…')).toBeInTheDocument();
      expect(screen.queryByText('Facturación')).toBeNull();
    }
  });
}

afterEach(() => vi.restoreAllMocks());

// describe('panel · versión heredada (la red)', () => characterize('heredada'));  ← borrado con DashboardPage.tsx
describe('Parte C · panel · versión nueva', () => characterize('nueva'));
