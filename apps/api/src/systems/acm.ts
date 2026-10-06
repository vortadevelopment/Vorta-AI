import type { SystemConfig } from './types.js';

/** Sistema piloto: Abastecedora de Carnes Magaña. */
export const acm: SystemConfig = {
  slug: 'acm',
  businessName: 'Abastecedora de Carnes Magaña',
  industry: 'Distribución y venta mayorista de carnes',
  timeZone: 'America/Monterrey',
  currency: 'MXN',
  supabase: {
    url: process.env['ACM_SUPABASE_URL'] ?? '',
    anonKey: process.env['ACM_SUPABASE_ANON_KEY'] ?? '',
  },
  suggestions: [
    '¿Cuánto vendimos esta semana?',
    'Compara las ventas de este mes contra el mes pasado',
    '¿Quiénes son mis 10 clientes más grandes?',
    '¿Qué productos se están quedando sin inventario?',
    'Muéstrame las cuentas por cobrar vencidas',
    'Busca la venta del folio 4821',
  ],
  // Se llenará en la Fase 1, al cerrar el catálogo de RPCs.
  enabledTools: [],
};
