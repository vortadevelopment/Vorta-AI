import type { SystemConfig } from './types.js';

/** Sistema piloto: Abastecedora de Carnes Magaña. */
export const acm: SystemConfig = {
  slug: 'acm',
  businessName: 'Abastecedora de Carnes Magaña',
  industry: 'Abastecedora y comercializadora de carne al mayoreo',
  // Las RPCs `ai_*` resuelven su "hoy" con
  // (now() at time zone 'America/Mexico_City')::date. Guadalajara está en esa
  // misma zona; hay que usar la misma o el asistente y la base discreparían
  // sobre qué día es hoy.
  timeZone: 'America/Mexico_City',
  currency: 'MXN',
  // La URL y la anon key viven aquí, no en variables de entorno, porque no son
  // secretos: el frontend de ACM las trae embebidas en su bundle
  // (src/integrations/supabase/client.ts), así que cualquiera que abra el ERP ya
  // las tiene. Lo que las hace inofensivas es que la anon key NO otorga acceso
  // por sí sola: toda lectura va acompañada del JWT del usuario y RLS decide.
  //
  // Verificado contra el payload de la key: role = "anon", ref =
  // "xnkuuxbnxqrugfzuumdg". NO es la service role key; esa nunca entra a este
  // repo ni a este archivo.
  //
  // Esto también quita un modo de falla tonto: un deploy con una variable de
  // entorno mal escrita dejaba el sistema sin credenciales y respondía
  // `unknown_system` sin explicar por qué.
  supabase: {
    url: 'https://xnkuuxbnxqrugfzuumdg.supabase.co',
    anonKey:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhua3V1eGJueHFydWdmenV1bWRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzNzA3MjgsImV4cCI6MjA4ODk0NjcyOH0.IgrFDkP2292l3BuE_TKUsHWsp05UtQG6ckixtwHP3Uo',
  },
  suggestions: [
    '¿Cuánto vendimos esta semana?',
    'Compara las ventas de este mes contra el mes pasado',
    '¿Quiénes son mis 10 clientes más grandes?',
    '¿Qué productos se están quedando sin inventario?',
    'Muéstrame las cuentas por cobrar vencidas',
    'Busca la venta del folio 4821',
  ],
  enabledTools: [
    'ai_ventas_periodo',
    'ai_buscar_venta',
    'ai_top_productos',
    'ai_top_clientes',
    'ai_cuentas_por_cobrar',
    'ai_inventario_estado',
    'ai_resumen_semana',
  ],
  notes: [
    'Notas de este negocio (ACM):',
    '',
    '- Es una abastecedora y comercializadora de carne. TODO el volumen se maneja en',
    '  kilogramos. Cuando hables de cantidades, habla en kg; las piezas son secundarias.',
    '',
    '- Cartera inicial: alrededor de 4.8 millones de pesos de las cuentas por cobrar son',
    '  documentos con tipo_documento = "SALDO_INICIAL", cargados al arrancar el sistema el',
    '  12 de julio de 2026. NO tienen fecha de vencimiento real: la que aparece la calcula',
    '  la base con fecha_emision + dias_credito del cliente, así que salen marcadas como',
    '  vencidas aunque nadie las haya dejado vencer. Cuando te pregunten por cartera',
    '  vencida: llama ai_cuentas_por_cobrar con p_limite 200, separa en tu respuesta los',
    '  documentos SALDO_INICIAL del resto, y acláralo con esas palabras. El campo',
    '  resumen.vencido que te regresa la tool los INCLUYE, así que no lo presentes como',
    '  "cartera vencida real" sin el desglose. Si omitidas.por_limite es mayor que cero,',
    '  di que el desglose es parcial porque hay más documentos de los que caben en una',
    '  consulta.',
    '',
    '- Almacenes virtuales: los renglones con es_virtual = true son producción en proceso',
    '  (WIP de deshuese, decisión e inyección). Esa carne existe físicamente pero ya está',
    '  comprometida en una producción abierta: NO es stock disponible. El stock disponible',
    '  es resumen.en_almacen_fisico; el WIP se reporta aparte, como',
    '  resumen.en_proceso_virtual. Nunca los sumes en la misma cifra.',
    '',
    '- Ventas a crédito: desde el 28 de julio de 2026 el negocio dejó de vender a crédito.',
    '  Si te preguntan por cartera reciente o por crédito de los últimos meses, dilo: todo',
    '  lo que está abierto se originó antes de esa fecha, no hay cartera nueva.',
  ].join('\n'),
};
