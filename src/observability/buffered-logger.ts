// OBSERVABILIDAD · Logger con búfer: agrupa entradas y las envía por lotes a un LogSink.
// Por qué un búfer: una petición por log satura la red justo cuando la aplicación va mal (muchos errores a la vez).
// Garantías:
//   · log() es síncrono y nunca lanza.
//   · flush() nunca rechaza: si el destino falla, las entradas esperan al siguiente envío.
//   · El búfer tiene tope: si el destino lleva caído mucho rato, se descartan las MÁS ANTIGUAS y se cuentan.
//   · Nunca se envía dos veces la misma entrada aunque se llame a flush() dos veces seguidas.
import { toLogEntry } from './log-entry';
import type { LogEntry, Logger, LogSink, TimeSource } from './port';

export type BufferedLogger = Logger & {
  /** Envía todo lo pendiente. Nunca rechaza. */
  flush(): Promise<void>;
  /** Entradas que esperan envío. */
  pending(): number;
  /** Entradas descartadas por superar maxBuffer. */
  dropped(): number;
};

export type BufferedLoggerOptions = { sink: LogSink; clock: TimeSource; maxBatch?: number; maxBuffer?: number };

export function createBufferedLogger({ sink, clock, maxBatch = 20, maxBuffer = 200 }: BufferedLoggerOptions): BufferedLogger {
  let buffer: LogEntry[] = [];
  let dropped = 0;
  let inFlight: Promise<void> | null = null;

  const keepWithinLimit = () => {
    const excess = buffer.length - maxBuffer;
    if (excess > 0) {
      buffer = buffer.slice(excess); // fuera las más antiguas
      dropped += excess;
    }
  };

  const flush = (): Promise<void> => {
    if (inFlight) return inFlight; // ya hay un envío en marcha: no se manda nada dos veces
    if (buffer.length === 0) return Promise.resolve();
    const batch = buffer; // el lote se lleva el array actual…
    buffer = []; // …y el búfer empieza otro: lo que se registre durante el envío no toca el lote
    inFlight = sink
      .send(batch)
      .catch(() => {
        buffer = [...batch, ...buffer]; // vuelven delante, en su orden
        keepWithinLimit();
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  };

  return {
    log(record) {
      buffer.push(toLogEntry(record, clock.now()));
      keepWithinLimit();
      if (buffer.length >= maxBatch) void flush();
    },
    flush,
    pending: () => buffer.length,
    dropped: () => dropped,
  };
}
