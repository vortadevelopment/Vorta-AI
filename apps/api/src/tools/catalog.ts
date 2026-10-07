import type Anthropic from '@anthropic-ai/sdk';
import { TOOL_SCHEMAS } from './schemas.js';

/**
 * Catálogo de tools. Una tool por RPC `ai_*`, con el mismo nombre que la
 * función: así el modelo, el log y el SQL hablan del mismo identificador.
 *
 * `ai_mis_permisos` NO está aquí a propósito: no es algo que el modelo tenga
 * que pedir, se llama una vez por petición para decidir qué tools le ofrecemos.
 *
 * Todas llevan:
 *  - `strict: true`, para que los argumentos validen contra el esquema (en este
 *    modelo no se puede forzar `tool_choice`, así que el esquema es la única
 *    garantía que queda).
 *  - `eager_input_streaming: true`, porque la petición es streaming. A cambio la
 *    API deja de validar el input y la validación pasa a ser nuestra
 *    (`tools/execute.ts`).
 *
 * Las descripciones explican QUÉ contesta cada tool y CUÁNDO conviene, no cómo
 * está hecha por dentro. Son parte del prefijo cacheado: cambiarlas invalida el
 * caché de prompt, así que no se tocan por gusto.
 */

const DESCRIPTIONS: Record<string, string> = {
  ai_ventas_periodo: [
    'Ventas de un rango de fechas: cuántas órdenes, cuántos kg, cuánto se facturó,',
    'ticket promedio, precio promedio por kg, cuánto fue de contado y cuánto a crédito,',
    'más el detalle orden por orden. Puedes filtrar por cliente y/o por producto.',
    'Úsala para "cuánto vendimos", comparar periodos, o ver las ventas de un cliente',
    'o de un producto en particular.',
  ].join(' '),

  ai_buscar_venta: [
    'Encuentra una orden de venta concreta por importe, fecha exacta, cliente, producto',
    'o folio, y devuelve sus renglones (producto, kg, precio, subtotal).',
    'Úsala cuando el usuario busca UNA venta ("la venta de 12,450 pesos", "el folio 4821",',
    '"la orden del 15 de septiembre"), no cuando quiere un total de un periodo.',
    'Exige al menos un criterio: sin ninguno devuelve error.',
  ].join(' '),

  ai_top_productos: [
    'Ranking de los productos más vendidos en un rango, por kg o por importe, con su',
    'participación sobre el total, margen estimado, precio promedio por kg, y en cuántas',
    'órdenes y a cuántos clientes se vendió.',
    'Úsala para "qué se vende más", "productos más rentables", mezcla de venta.',
  ].join(' '),

  ai_top_clientes: [
    'Ranking de clientes por importe facturado en un rango, con sus kg, ticket promedio,',
    'días sin comprar, límite y días de crédito, y el adeudo que traen HOY (vigente y',
    'vencido) más si están sobre su límite de crédito.',
    'Úsala para "mis clientes más grandes", clientes que dejaron de comprar, o quién',
    'concentra la venta.',
  ].join(' '),

  ai_cuentas_por_cobrar: [
    'Cartera por cobrar abierta, documento por documento, con antigüedad en buckets',
    '(vigente, 1–30, 31–60, 61–90, más de 90 días), lo vencido, lo que vence en los',
    'próximos 7 días, el peor atraso, y cuánto ya se cobró de cada documento.',
    'Cada fila trae tipo_documento, que distingue el origen del adeudo.',
    'Úsala para cobranza, cartera vencida y saldos de un cliente.',
  ].join(' '),

  ai_inventario_estado: [
    'Existencias por producto y almacén: cantidad en kg, costo promedio, valor,',
    'calificaciones, stock mínimo, cuánto falta para el mínimo, y si está bajo mínimo.',
    'El resumen separa lo que está en almacén físico de lo que está en proceso',
    '(almacenes virtuales). Úsala para "qué hay en inventario", "qué se está acabando",',
    'o el stock de un producto o de un almacén.',
  ].join(' '),

  ai_resumen_semana: [
    'Resumen de una semana completa (lunes a domingo): ventas, compras, cobranza,',
    'cuentas por pagar y alertas de inventario, más el desglose día por día.',
    'Úsala para "cómo vamos esta semana" o un panorama general. Los bloques que el',
    'usuario no tiene permiso de ver vienen en null y se listan en omitidas.por_permiso:',
    'cuando pase, dilo en lugar de asumir que son cero.',
  ].join(' '),
};

/** Nombres de las RPCs que el catálogo sabe ofrecer. */
export const TOOL_NAMES = Object.keys(DESCRIPTIONS);

function define(name: string): Anthropic.Beta.BetaTool {
  const schema = TOOL_SCHEMAS[name];
  const description = DESCRIPTIONS[name];
  if (schema === undefined || description === undefined) {
    throw new Error(`Tool sin definición completa: ${name}`);
  }
  return {
    name,
    description,
    input_schema: schema.jsonSchema as Anthropic.Beta.BetaTool['input_schema'],
    strict: true,
    eager_input_streaming: true,
  };
}

/**
 * Catálogo completo, en orden estable. El orden importa: las tools se renderizan
 * antes del system prompt y cualquier cambio de bytes en el prefijo invalida el
 * caché, así que nunca se ordena por algo que dependa de la petición.
 */
export const TOOL_CATALOG: Anthropic.Beta.BetaTool[] = TOOL_NAMES.map(define);
