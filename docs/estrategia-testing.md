# Estrategia de testing de la feature Pedidos (versión de referencia · Sesión 7)

**Objetivo:** que cada riesgo importante tenga un test que lo detecte, en el nivel más barato que lo pueda detectar.
La distribución no se copia de un dibujo (pirámide, trofeo, panal): sale de la arquitectura y de los riesgos.

## 1 · Qué hay hoy (`npm run test:map`)
| Capa | Tests | Tiempo | Con `vi.mock` | Lectura |
|---|---|---|---|---|
| Dominio | 32 | ~10 ms | 0 | Reglas puras: rápidas y deterministas |
| Casos de uso | 24 | ~20 ms | 0 | Dobles escritos a mano; ni red ni React |
| Adapters | 37 | ~200 ms | 0 | Contrato contra fake y servidor real |
| View models | 55 | ~30 ms | 0 | Presentación sin renderizar |
| Hooks y pantallas | 40 | ~1,1 s | 0 | React Testing Library, módulo en memoria |
| Caracterización | 34 | ~0,6 s | 3 | `vi.mock` solo donde el heredado lee `services/api` |
| BFF | 19 | ~0,2 s | 0 | HTTP de verdad contra el servidor |

(Los números exactos cambian con cada ejecución: lo que importa es la forma.)

## 2 · Riesgo → nivel
| Riesgo | Nivel | Por qué ahí | Archivo |
|---|---|---|---|
| Una regla de negocio mal escrita (umbral, rol, estado) | Unitario de dominio | Es donde vive; un test cuesta milisegundos | `src/orders/domain/*.test.ts` |
| El dominio y el BFF deciden distinto | Contrato | Son dos implementaciones de la misma regla | `src/orders/policy.contract.test.ts` |
| El adapter malinterpreta al backend | Integración / contrato | El fallo está en la frontera | `order-gateway.contract.test.ts`, `analytics-event-publisher.test.ts` |
| La pantalla enseña algo falso | Componente (RTL) + view model | Lo ve la persona usuaria | `*.characterization.test.tsx`, `orders-*-view-model.test.ts` |
| Una respuesta tardía pisa a otra | Hook | Es un problema de orden en React | `useOrderDetail.test.tsx` |
| Un fallo en producción pasa inadvertido | Observabilidad | No se prueba la ausencia de bugs: se prueba que dejan rastro | `src/orders/observability.test.ts` |
| Login, aprobar y cancelar de punta a punta | E2E (Sesión 9) | Pocos y críticos | `e2e/` (Sesión 9) |

## 3 · Calidad, no solo cantidad
- **Mutación** en los módulos críticos: `orders-dashboard.ts` al 100 % (`npm run mutate -- … --check`). Siguiente: `domain/cancellation.ts` y `domain/approval.ts`.
- **Cobertura** como alarma, no como objetivo: una línea sin cubrir es una pregunta; una línea cubierta no es una respuesta.
- **Fragilidad**: `npx vitest run --sequence.shuffle` antes de cada PR grande. Ningún test depende de la hora, del orden ni de esperas reales.

## 4 · Decisiones
- Distribución elegida: **trofeo** en el frontend (muchos tests de dominio y de view model, bastantes de componente, pocos E2E) y **panal** en las fronteras (contratos entre cliente, BFF y backend).
- `vi.mock` solo en tests de código heredado. El código nuevo recibe sus dependencias por parámetro y se prueba con fakes.
- Lo que NO probamos: estilos y textos que no son comportamiento (no hay snapshots de HTML completos).
