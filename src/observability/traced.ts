// OBSERVABILIDAD · Decorador de casos de uso: mide, registra el resultado y no cambia nada más.
// Patrón Decorator: el caso de uso no sabe que lo miden. Se aplica en la composición (composition.ts),
// así que dominio y aplicación siguen sin importar nada de observabilidad (lo comprueba lint:arch).
import type { Logger, TimeSource } from './port';

/** Forma mínima de un Result: basta con saber si fue bien y, si no, su código. */
type ResultLike = { ok: true } | { ok: false; error: string };

export type TraceDeps = { logger: Logger; clock: TimeSource; newId: () => string; feature: string };

/** Solo el identificador del pedido sale del comando. El motivo, la nota o el actor, nunca. */
const orderIdOf = (command: unknown): string | undefined => {
  const value = (command as { orderId?: unknown } | null)?.orderId;
  return typeof value === 'string' ? value : undefined;
};

export function traced<C, R extends ResultLike>(name: string, useCase: (command: C) => Promise<R>, deps: TraceDeps): (command: C) => Promise<R> {
  const { logger, clock, newId, feature } = deps;
  return async (command) => {
    const traceId = newId();
    const startedAt = clock.now().getTime();
    const base = { event: name, feature, traceId };
    const orderId = orderIdOf(command);
    const elapsed = () => clock.now().getTime() - startedAt;
    try {
      const result = await useCase(command);
      if (result.ok) {
        logger.log({ ...base, level: 'info', fields: { orderId, outcome: 'ok', durationMs: elapsed() } });
      } else {
        logger.log({ ...base, level: 'warn', fields: { orderId, outcome: 'error', code: result.error, durationMs: elapsed() } });
      }
      return result;
    } catch (error) {
      // Un bug sigue siendo un bug: se registra el TIPO (no el mensaje, que puede llevar datos) y se relanza el mismo error.
      const errorName = error instanceof Error ? error.name : typeof error;
      logger.log({ ...base, level: 'error', fields: { orderId, outcome: 'exception', errorName, durationMs: elapsed() } });
      throw error;
    }
  };
}
