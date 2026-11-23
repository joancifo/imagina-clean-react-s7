// @vitest-environment node
// Ejercicio S7 · Parte A · Test de integración: el publicador de analítica contra el BFF DE VERDAD.
// Hasta hoy nadie lo había probado contra el servidor. Por eso nadie vio el 422.
import { createBff } from '../../../server/bff.mjs';
import { createAnalyticsEventPublisher } from './analytics-event-publisher';
import type { OrderCancelled } from '../domain/cancellation';
import type { OrderApproved } from '../domain/approval';

async function withSignedInBff(run: (fetchFn: typeof fetch, base: string) => Promise<void>) {
  const server = createBff({ secret: 's', telemetrySink: () => undefined }).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
  const login = await fetch(`${base}/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: 'u1' }) });
  const cookie = login.headers.get('set-cookie')!.split(';')[0];
  // En el navegador la cookie viaja sola (mismo origen). Aquí se añade a mano.
  const fetchFn: typeof fetch = (input, init) => fetch(input, { ...init, headers: { ...(init?.headers as Record<string, string>), cookie } });
  try {
    await run(fetchFn, base);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

const CANCELLED = { type: 'OrderCancelled', orderId: 'P-1005', cancelledBy: 'u1', reason: 'Pedido duplicado en el ERP', occurredAt: '2026-11-23T18:00:00.000Z' } as unknown as OrderCancelled;
const APPROVED: OrderApproved = { type: 'OrderApproved', orderId: 'P-1005', approvedBy: 'u1', total: 373.59, channel: 'web', hasNote: false, occurredAt: '2026-11-23T18:00:00.000Z' };

describe('Parte A · analítica contra el BFF', () => {
  it('el BFF acepta el evento de aprobación', () =>
    withSignedInBff(async (fetchFn, base) => {
      await expect(createAnalyticsEventPublisher(fetchFn, base).publish(APPROVED)).resolves.toBeUndefined();
    }));

  it('el BFF acepta el evento de cancelación (y el motivo no viaja)', () =>
    withSignedInBff(async (fetchFn, base) => {
      const bodies: string[] = [];
      const spying: typeof fetch = (input, init) => { bodies.push(String(init?.body)); return fetchFn(input, init); };
      await expect(createAnalyticsEventPublisher(spying, base).publish(CANCELLED)).resolves.toBeUndefined();
      expect(bodies[0]).not.toContain('duplicado');
    }));
});
