// @vitest-environment node
// Ejercicio S7 · Parte A · Un logger que no tumba la aplicación cuando el destino falla.
import { createBufferedLogger } from './buffered-logger';
import type { LogEntry, LogSink } from './port';

const clock = { now: () => new Date('2026-11-23T18:00:00Z') };
const record = (n: number) => ({ level: 'info' as const, event: `prueba.${n}`, feature: 'orders' });

/** Destino controlable: guarda cada lote y se le puede pedir que falle o que tarde. */
function sinkSpy() {
  const batches: LogEntry[][] = [];
  let failing = false;
  let release: (() => void) | null = null;
  const sink: LogSink = {
    send: async (entries) => {
      batches.push(entries);
      if (release === null && hold) await new Promise<void>((resolve) => (release = resolve));
      if (failing) throw new Error('telemetría caída');
    },
  };
  let hold = false;
  return {
    sink,
    batches,
    fail: (value: boolean) => (failing = value),
    holdNext: () => (hold = true),
    releaseNow: () => { hold = false; release?.(); release = null; },
  };
}

describe('Parte A · registrar', () => {
  it('completa la entrada con la hora y deja fuera los campos que no están en la lista blanca', async () => {
    const spy = sinkSpy();
    const logger = createBufferedLogger({ sink: spy.sink, clock });
    logger.log({ level: 'warn', event: 'orders.cancel', feature: 'orders', fields: { orderId: 'P-1', reason: 'Cliente enfadado' } as never });
    await logger.flush();
    expect(spy.batches[0]).toEqual([
      { level: 'warn', event: 'orders.cancel', feature: 'orders', traceId: null, at: '2026-11-23T18:00:00.000Z', fields: { orderId: 'P-1' } },
    ]);
  });

  it('por debajo de maxBatch no envía nada: espera a juntar un lote', () => {
    const spy = sinkSpy();
    const logger = createBufferedLogger({ sink: spy.sink, clock, maxBatch: 3 });
    logger.log(record(1));
    logger.log(record(2));
    expect(spy.batches).toHaveLength(0);
    expect(logger.pending()).toBe(2);
  });

  it('al llegar a maxBatch envía el lote solo, sin que nadie llame a flush', () => {
    const spy = sinkSpy();
    const logger = createBufferedLogger({ sink: spy.sink, clock, maxBatch: 3 });
    [1, 2, 3].forEach((n) => logger.log(record(n)));
    expect(spy.batches).toHaveLength(1);
    expect(spy.batches[0].map((entry) => entry.event)).toEqual(['prueba.1', 'prueba.2', 'prueba.3']);
    expect(logger.pending()).toBe(0);
  });
});

describe('Parte A · enviar', () => {
  it('flush sin nada pendiente no llama al destino', async () => {
    const spy = sinkSpy();
    await createBufferedLogger({ sink: spy.sink, clock }).flush();
    expect(spy.batches).toHaveLength(0);
  });

  it('lo que se registra MIENTRAS se envía no se cuela en el lote que ya ha salido', async () => {
    const spy = sinkSpy();
    const logger = createBufferedLogger({ sink: spy.sink, clock });
    logger.log(record(1));
    spy.holdNext();
    const sending = logger.flush();
    logger.log(record(2));
    spy.releaseNow();
    await sending;
    expect(spy.batches[0].map((entry) => entry.event)).toEqual(['prueba.1']);
    expect(logger.pending()).toBe(1);
  });

  it('dos flush seguidos no envían dos veces las mismas entradas', async () => {
    const spy = sinkSpy();
    const logger = createBufferedLogger({ sink: spy.sink, clock });
    logger.log(record(1));
    spy.holdNext();
    const first = logger.flush();
    const second = logger.flush();
    spy.releaseNow();
    await Promise.all([first, second]);
    expect(spy.batches).toHaveLength(1);
  });
});

describe('Parte A · cuando el destino falla', () => {
  it('flush no rechaza y las entradas esperan al siguiente envío, en su orden', async () => {
    const spy = sinkSpy();
    const logger = createBufferedLogger({ sink: spy.sink, clock });
    logger.log(record(1));
    spy.fail(true);
    await expect(logger.flush()).resolves.toBeUndefined();
    logger.log(record(2));
    spy.fail(false);
    await logger.flush();
    expect(spy.batches.at(-1)?.map((entry) => entry.event)).toEqual(['prueba.1', 'prueba.2']);
  });

  it('con el destino caído, el búfer no crece sin límite: descarta las más antiguas y las cuenta', async () => {
    const spy = sinkSpy();
    spy.fail(true);
    const logger = createBufferedLogger({ sink: spy.sink, clock, maxBatch: 100, maxBuffer: 3 });
    [1, 2, 3, 4, 5].forEach((n) => logger.log(record(n)));
    await logger.flush();
    expect(logger.pending()).toBe(3);
    expect(logger.dropped()).toBe(2);
    spy.fail(false);
    await logger.flush();
    expect(spy.batches.at(-1)?.map((entry) => entry.event)).toEqual(['prueba.3', 'prueba.4', 'prueba.5']);
  });
});
