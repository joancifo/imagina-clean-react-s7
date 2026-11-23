// PRESENTACIÓN · View model del detalle de un pedido (Sesión 7). Función PURA: sin React y sin router.
// Nace de src/pages/OrderDetailPage.tsx y conserva su comportamiento visible, que fijan los tests de caracterización
// (src/pages/order-detail.characterization.test.tsx). Lo que cambia, cambia a propósito y está anotado:
//   · Un agente no recibe importes (el BFF se los recorta): antes veía «Total con IVA: 0,00 €», un dato falso. Ahora, nada.
import { canCancel, type Actor } from '../domain/cancellation';
import { calculateTotal, type Order, type OrderStatus } from '../domain/order';
import { canSeeAmounts } from '../domain/permissions';
import { formatCurrency, formatDate } from './formatters';

export type OrderDetailViewModel = {
  title: string;
  status: { label: string; danger: boolean };
  subtitle: string;
  lines: { sku: string; quantity: string; unitPrice: string; amount: string }[];
  note: string | null;
  total: string | null;
  canCancel: boolean;
};

const STATUS_LABELS = { pending: 'Pendiente', approved: 'Aprobado', shipped: 'Enviado', cancelled: 'Cancelado' } satisfies Record<OrderStatus, string>;

export function buildOrderDetailViewModel(order: Order, actor: Actor | null): OrderDetailViewModel {
  return {
    title: `Pedido ${order.id}`,
    status: { label: STATUS_LABELS[order.status], danger: order.status === 'cancelled' },
    // El nivel se enseña tal cual llega («gold»): traducirlo es una decisión de producto para otro PR.
    subtitle: `${order.customerName} · ${formatDate(order.createdAt)} · ${order.customerTier}`,
    // El importe de cada línea va SIN descuento (como antes): el descuento es del pedido, no de la línea.
    lines: order.lines.map((line) => ({
      sku: line.sku,
      quantity: String(line.quantity),
      unitPrice: formatCurrency(line.unitPrice),
      amount: formatCurrency(line.quantity * line.unitPrice),
    })),
    note: order.customerNote ? order.customerNote : null,
    total: canSeeAmounts(actor) ? `Total con IVA: ${formatCurrency(calculateTotal(order))}` : null,
    canCancel: canCancel(order, actor),
  };
}
