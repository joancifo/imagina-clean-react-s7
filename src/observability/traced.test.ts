// @vitest-environment node
// Ejercicio S7 · Parte A · Medir un caso de uso sin tocarlo.
import { createMemoryLogger } from './memory-logger';
import { traced } from './traced';

type Command = { orderId: string; reason: string };
type Outcome = { ok: true; value: string } | { ok: false; error: 'forbidden' | 'conflict' };

/** Reloj que avanza 40 ms cada vez que se consulta. */
function steppingClock(start = Date.parse('2026-11-23T18:00:00Z'), step = 40) {
  let current = start;
  return { now: () => { const value = new Date(current); current += step; return value; } };
}

function setup(useCase: (command: Command) => Promise<Outcome>) {
  const logger = createMemoryLogger();
  let id = 0;
  const run = traced('orders.cancel', useCase, { logger, clock: steppingClock(), newId: () => `t-${++id}`, feature: 'orders' });
  return { logger, run };
}

const COMMAND: Command = { orderId: 'P-1005', reason: 'El cliente llamó muy enfadado' };

describe('Parte A · traced', () => {
  it('devuelve EXACTAMENTE lo que devuelve el caso de uso', async () => {
    const outcome: Outcome = { ok: true, value: 'cancelado' };
    const { run } = setup(async () => outcome);
    expect(await run(COMMAND)).toBe(outcome);
  });

  it('un éxito deja UNA entrada info con el pedido, el resultado y la duración', async () => {
    const { logger, run } = setup(async () => ({ ok: true, value: 'x' }));
    await run(COMMAND);
    expect(logger.entries).toEqual([
      expect.objectContaining({ level: 'info', event: 'orders.cancel', feature: 'orders', traceId: 't-1', fields: { orderId: 'P-1005', outcome: 'ok', durationMs: 40 } }),
    ]);
  });

  it('un error previsible es warn y lleva su código', async () => {
    const { logger, run } = setup(async () => ({ ok: false, error: 'conflict' }));
    await run(COMMAND);
    expect(logger.entries[0]).toMatchObject({ level: 'warn', fields: { outcome: 'error', code: 'conflict' } });
  });

  it('una excepción es error, registra el TIPO y se relanza la MISMA excepción', async () => {
    const boom = new TypeError('Cannot read properties of undefined (reading "lines") · cliente Talleres Norte');
    const { logger, run } = setup(async () => { throw boom; });
    await expect(run(COMMAND)).rejects.toBe(boom);
    expect(logger.entries[0]).toMatchObject({ level: 'error', fields: { outcome: 'exception', errorName: 'TypeError' } });
    expect(JSON.stringify(logger.entries)).not.toMatch(/Talleres|Cannot read/);
  });

  it('del comando solo sale el orderId: el motivo escrito por una persona nunca llega al log', async () => {
    const { logger, run } = setup(async () => ({ ok: true, value: 'x' }));
    await run(COMMAND);
    expect(JSON.stringify(logger.entries)).not.toContain('enfadado');
  });

  it('cada llamada tiene su propio traceId', async () => {
    const { logger, run } = setup(async () => ({ ok: true, value: 'x' }));
    await run(COMMAND);
    await run(COMMAND);
    expect(logger.entries.map((entry) => entry.traceId)).toEqual(['t-1', 't-2']);
  });

  it('no registra nada ANTES de terminar: una operación, una entrada', async () => {
    let finish: (value: Outcome) => void = () => undefined;
    const { logger, run } = setup(() => new Promise<Outcome>((resolve) => (finish = resolve)));
    const pending = run(COMMAND);
    expect(logger.entries).toHaveLength(0);
    finish({ ok: true, value: 'x' });
    await pending;
    expect(logger.entries).toHaveLength(1);
  });
});
