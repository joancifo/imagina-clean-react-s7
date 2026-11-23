// INFRAESTRUCTURA · Publica los eventos de dominio en el endpoint de analítica heredado (POST /api/logs).
// Sustituye a trackEvent('order_cancelled', …) de src/shared/utils.ts para este flujo.
// Traduce el evento de dominio al formato del proveedor: si mañana cambia el proveedor, cambia este archivo.
import type { DomainEvent, EventPublisher } from '../application/ports';

/** Un traductor por tipo de evento. El switch es exhaustivo: un evento nuevo sin traducción no compila. */
function toLog(event: DomainEvent): { name: string; payload: Record<string, unknown> } {
  switch (event.type) {
    case 'OrderCancelled':
      // Sesión 7 · El motivo lo escribe una persona: no viaja. Además, el BFF lo rechazaba con 422 desde la Sesión 6
      // y nadie lo vio, porque el caso de uso ignora (a propósito) los fallos de analítica. Lo destapó el log
      // 'events.publish_failed'. El código del motivo, si algún día existe, iría en «code».
      return { name: 'order_cancelled', payload: { id: event.orderId, by: event.cancelledBy, at: event.occurredAt } };
    case 'OrderApproved':
      // Sesión 6 · Se publica el CANAL y si hubo nota; nunca el texto de la nota ni el nombre del cliente.
      return { name: 'order_approved', payload: { id: event.orderId, by: event.approvedBy, total: event.total, code: event.channel, at: event.occurredAt } };
  }
}

export function createAnalyticsEventPublisher(fetchFn: typeof fetch = fetch, baseUrl = '/api'): EventPublisher {
  return {
    async publish(event) {
      const response = await fetchFn(`${baseUrl}/logs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ level: 'info', ...toLog(event) }),
      });
      if (!response.ok) throw new Error(`Analítica no disponible (HTTP ${response.status})`);
    },
  };
}
