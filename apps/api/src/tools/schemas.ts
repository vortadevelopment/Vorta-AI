import { z } from 'zod';

/**
 * Esquemas de los parámetros de cada RPC del catálogo `ai_*`.
 *
 * Hay dos representaciones de la misma firma porque sirven a dos consumidores
 * distintos:
 *
 *  - `jsonSchema` es lo que ve Claude. Va con `strict: true`, que exige
 *    `additionalProperties: false` y que todas las propiedades estén en
 *    `required`. Por eso los parámetros opcionales se declaran NULLABLE en vez
 *    de omitirse: el modelo manda `null` para "sin filtro" y `supabase/rpc.ts`
 *    traduce ese null a "clave ausente" para que aplique el default de la firma
 *    de Postgres.
 *
 *  - `input` (Zod) es la validación del servidor. Hace falta porque las tools
 *    van con `eager_input_streaming: true`: con eso la API deja de validar el
 *    input y el parser tolerante del SDK puede entregar un objeto truncado que
 *    pasa como "JSON válido". Nada se ejecuta sin pasar por aquí.
 *
 * Las firmas reflejan el SQL de `ai_rpcs_v1`: todo parámetro tiene
 * `default null` y `p_limite` se acota a 1..200 dentro de la propia función.
 */

/** Fecha en formato ISO corto, que es lo que Postgres acepta como `date`. */
const fecha = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe venir como YYYY-MM-DD')
  .nullable();

const limite = z.number().int().min(1).max(200).nullable();
const texto = z.string().min(1).max(200).nullable();

const FECHA_JSON = {
  type: ['string', 'null'],
  description: 'Fecha en formato YYYY-MM-DD.',
} as const;

function textoJson(description: string) {
  return { type: ['string', 'null'], description } as const;
}

function limiteJson(porDefecto: number) {
  return {
    type: ['integer', 'null'],
    minimum: 1,
    maximum: 200,
    description: `Máximo de filas a devolver, de 1 a 200. Si lo dejas en null se usan ${porDefecto}. El resumen siempre cubre el total, aunque las filas vengan acotadas.`,
  } as const;
}

export interface ToolSchema {
  /** Validación en servidor del input ya parseado. */
  input: z.ZodType<Record<string, unknown>>;
  /** Esquema que se le manda a Claude en `input_schema`. */
  jsonSchema: Record<string, unknown>;
}

function schema(
  input: z.ZodType<Record<string, unknown>>,
  properties: Record<string, unknown>,
): ToolSchema {
  return {
    input,
    jsonSchema: {
      type: 'object',
      additionalProperties: false,
      properties,
      required: Object.keys(properties),
    },
  };
}

export const TOOL_SCHEMAS: Record<string, ToolSchema> = {
  ai_ventas_periodo: schema(
    z.object({
      p_desde: fecha,
      p_hasta: fecha,
      p_cliente: texto,
      p_producto: texto,
      p_limite: limite,
    }),
    {
      p_desde: {
        ...FECHA_JSON,
        description:
          'Inicio del rango, en YYYY-MM-DD. Si lo dejas en null se usan los 30 días que terminan en p_hasta.',
      },
      p_hasta: {
        ...FECHA_JSON,
        description: 'Fin del rango, en YYYY-MM-DD. Si lo dejas en null se usa hoy.',
      },
      p_cliente: textoJson(
        'Filtro por cliente: coincidencia parcial contra nombre, alias o código. null = todos los clientes.',
      ),
      p_producto: textoJson(
        'Filtro por producto: coincidencia parcial contra nombre o SKU. null = todos los productos. Si lo usas, los kg y el importe salen SOLO de los renglones de ese producto y total_ordenes_periodo viene en null a propósito.',
      ),
      p_limite: limiteJson(50),
    },
  ),

  ai_buscar_venta: schema(
    z.object({
      p_monto: z.number().nullable(),
      p_fecha: fecha,
      p_cliente: texto,
      p_producto: texto,
      p_folio: texto,
      p_limite: limite,
    }),
    {
      p_monto: {
        type: ['number', 'null'],
        description:
          'Importe a buscar, con tolerancia de ±1 peso. Se compara contra el total de la orden y contra el subtotal de cada renglón.',
      },
      p_fecha: {
        ...FECHA_JSON,
        description: 'Fecha exacta de la orden, en YYYY-MM-DD. No es un rango.',
      },
      p_cliente: textoJson('Cliente: coincidencia parcial contra nombre, alias o código.'),
      p_producto: textoJson('Producto: coincidencia parcial contra nombre o SKU.'),
      p_folio: textoJson('Folio o parte del folio de la orden de venta.'),
      p_limite: limiteJson(20),
    },
  ),

  ai_top_productos: schema(
    z.object({
      p_desde: fecha,
      p_hasta: fecha,
      p_por: z.enum(['kg', 'monto']).nullable(),
      p_limite: limite,
    }),
    {
      p_desde: {
        ...FECHA_JSON,
        description: 'Inicio del rango. null = los 30 días que terminan en p_hasta.',
      },
      p_hasta: { ...FECHA_JSON, description: 'Fin del rango. null = hoy.' },
      p_por: {
        type: ['string', 'null'],
        enum: ['kg', 'monto', null],
        description:
          'Criterio del ranking: "kg" por volumen o "monto" por importe facturado. null = kg. Cualquier otro valor es un error.',
      },
      p_limite: limiteJson(20),
    },
  ),

  ai_top_clientes: schema(
    z.object({ p_desde: fecha, p_hasta: fecha, p_limite: limite }),
    {
      p_desde: {
        ...FECHA_JSON,
        description: 'Inicio del rango. null = los 30 días que terminan en p_hasta.',
      },
      p_hasta: { ...FECHA_JSON, description: 'Fin del rango. null = hoy.' },
      p_limite: limiteJson(20),
    },
  ),

  ai_cuentas_por_cobrar: schema(
    z.object({
      p_cliente: texto,
      p_solo_vencidas: z.boolean().nullable(),
      p_limite: limite,
    }),
    {
      p_cliente: textoJson(
        'Filtro por cliente: coincidencia parcial contra nombre, alias o código. null = todos.',
      ),
      p_solo_vencidas: {
        type: ['boolean', 'null'],
        description:
          'true = solo documentos vencidos; false = solo vigentes; null = toda la cartera abierta.',
      },
      p_limite: limiteJson(50),
    },
  ),

  ai_inventario_estado: schema(
    z.object({
      p_producto: texto,
      p_almacen: texto,
      p_bajo_minimo: z.boolean().nullable(),
      p_limite: limite,
    }),
    {
      p_producto: textoJson(
        'Filtro por producto: coincidencia parcial contra nombre o SKU. null = todos.',
      ),
      p_almacen: textoJson(
        'Filtro por almacén: coincidencia parcial contra nombre o código. null = todos.',
      ),
      p_bajo_minimo: {
        type: ['boolean', 'null'],
        description:
          'true = solo lo que está debajo de su stock mínimo; false = solo lo que está arriba; null = todo.',
      },
      p_limite: limiteJson(50),
    },
  ),

  ai_resumen_semana: schema(z.object({ p_fecha_ref: fecha }), {
    p_fecha_ref: {
      ...FECHA_JSON,
      description:
        'Cualquier día de la semana que quieres resumir; la función la expande a lunes–domingo. null = la semana en curso.',
    },
  }),
};
