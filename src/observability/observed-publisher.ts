// OBSERVABILIDAD · Decorador del puerto EventPublisher: si publicar falla, queda constancia.
// Los casos de uso ignoran a propósito un fallo de analítica (el pedido YA está cancelado y no se deshace).
// Ignorar no puede significar «no enterarse»: el fallo se registra y se relanza igual que antes.
import type { Logger } from './port';

type Publisher<E extends { type: string }> = { publish(event: E): Promise<void> };

export function observePublisher<E extends { type: string }>(events: Publisher<E>, { logger, feature }: { logger: Logger; feature: string }): Publisher<E> {
  return {
    async publish(event) {
      try {
        await events.publish(event);
      } catch (error) {
        logger.log({
          level: 'warn',
          event: 'events.publish_failed',
          feature,
          fields: { code: event.type, errorName: error instanceof Error ? error.name : typeof error },
        });
        throw error;
      }
    },
  };
}
