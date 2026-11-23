// @vitest-environment node
// Ejercicio S7 · Parte C · Métricas del panel.
// Estos dos tests ejecutan el 100 % de las líneas de orders-dashboard.ts (npm run coverage)… y aun así
// dejan comportamientos sin comprobar. Compruébalo: npm run mutate -- src/orders/ui/orders-dashboard.ts
// Tu trabajo: añadir los tests que matan a TODOS los mutantes supervivientes.
import type { Actor } from '../domain/cancellation';
import type { Order } from '../domain/order';
import { buildDashboardMetrics } from './orders-dashboard';

const order = (id: string, status: Order['status'], unitPrice = 100): Order => ({
  id, customerName: 'Cliente', customerTier: 'standard', status, ownerId: 'u2', createdAt: '2026-11-01T09:00:00Z', lines: [{ sku: 'A', quantity: 1, unitPrice }],
});
const ADMIN: Actor = { id: 'u1', role: 'admin' };

describe('Parte C · buildDashboardMetrics', () => {
  it('sin pedidos, todo a cero', () => {
    const metrics = buildDashboardMetrics([], ADMIN);
    expect(metrics.pending).toBe(0);
    expect(metrics.cancellable).toBe(0);
  });

  it('calcula las tres métricas', () => {
    const metrics = buildDashboardMetrics([order('P-1', 'pending'), order('P-2', 'approved')], ADMIN);
    expect(metrics.pending).toBeGreaterThan(0);
    expect(metrics.revenue).toBeDefined();
  });
});

// ── Solución · tests que matan a los supervivientes ──────────────────────────────────
// Cada test fija UN comportamiento con un valor exacto (toBe), no con «mayor que cero» o «está definido».
const MANAGER: Actor = { id: 'u2', role: 'manager' };
const plain = (value: string) => value.replace(/\s+/g, ' ');

describe('Parte C · buildDashboardMetrics (los tests que faltaban)', () => {
  it('cuenta SOLO los pendientes', () => {
    const orders = [order('P-1', 'pending'), order('P-2', 'approved'), order('P-3', 'shipped'), order('P-4', 'cancelled'), order('P-5', 'pending')];
    expect(buildDashboardMetrics(orders, ADMIN).pending).toBe(2);
  });

  it('factura aprobados y enviados, con el total del dominio', () => {
    // 100 € sin descuento (standard) + IVA = 121 € cada uno
    expect(plain(buildDashboardMetrics([order('P-1', 'approved')], ADMIN).revenue)).toBe('121,00 €');
    expect(plain(buildDashboardMetrics([order('P-1', 'shipped')], ADMIN).revenue)).toBe('121,00 €');
    expect(plain(buildDashboardMetrics([order('P-1', 'approved'), order('P-2', 'shipped')], ADMIN).revenue)).toBe('242,00 €');
  });

  it('no factura pendientes ni cancelados', () => {
    expect(plain(buildDashboardMetrics([order('P-1', 'pending'), order('P-2', 'cancelled')], ADMIN).revenue)).toBe('0,00 €');
  });

  it('cuenta los cancelables según la regla del dominio y el actor', () => {
    const orders = [order('P-1', 'pending'), order('P-2', 'approved'), order('P-3', 'shipped'), order('P-4', 'pending', 9000)];
    expect(buildDashboardMetrics(orders, ADMIN).cancellable).toBe(3); // nunca un pedido cerrado
    expect(buildDashboardMetrics(orders, MANAGER).cancellable).toBe(1); // solo pendientes bajo su límite
  });
});
