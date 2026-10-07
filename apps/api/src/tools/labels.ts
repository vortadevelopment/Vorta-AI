/**
 * Texto que el UI muestra mientras una tool corre ("Consultando ventas del 1 al
 * 30 de septiembre de 2026…").
 *
 * El contrato es explícito: el UI nunca ve el `name` crudo de una tool, así que
 * este archivo es la única traducción de nombre de RPC a lenguaje de negocio.
 * Si falta un caso, el fallback es genérico pero nunca filtra el nombre técnico.
 */

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/**
 * Formatea un `YYYY-MM-DD` sin construir un Date, para no arriesgar un corrimiento
 * de día por zona horaria: la cadena ya viene en la zona del sistema.
 */
function fecha(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return undefined;
  const [, year, month, day] = match;
  const mes = MESES[Number(month) - 1];
  if (mes === undefined) return undefined;
  return `${Number(day)} de ${mes} de ${year}`;
}

/** "del 1 de septiembre de 2026 al 30 de septiembre de 2026", o un extremo solo. */
function rango(desde: unknown, hasta: unknown): string {
  const a = fecha(desde);
  const b = fecha(hasta);
  if (a !== undefined && b !== undefined) return ` del ${a} al ${b}`;
  if (b !== undefined) return ` hasta el ${b}`;
  if (a !== undefined) return ` desde el ${a}`;
  return ' de los últimos 30 días';
}

function texto(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function filtro(args: Record<string, unknown>): string {
  const cliente = texto(args['p_cliente']);
  const producto = texto(args['p_producto']);
  const almacen = texto(args['p_almacen']);
  const partes: string[] = [];
  if (cliente !== undefined) partes.push(`cliente "${cliente}"`);
  if (producto !== undefined) partes.push(`producto "${producto}"`);
  if (almacen !== undefined) partes.push(`almacén "${almacen}"`);
  return partes.length === 0 ? '' : ` — ${partes.join(', ')}`;
}

/**
 * `input` llega tal como lo parseó el SDK: puede no haber pasado por la
 * validación todavía, así que aquí nada se asume de su forma.
 */
export function labelFor(name: string, input: unknown): string {
  const args: Record<string, unknown> =
    typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};

  switch (name) {
    case 'ai_ventas_periodo':
      return `Consultando ventas${rango(args['p_desde'], args['p_hasta'])}${filtro(args)}…`;

    case 'ai_buscar_venta': {
      const folio = texto(args['p_folio']);
      if (folio !== undefined) return `Buscando la venta del folio ${folio}…`;
      const monto = args['p_monto'];
      if (typeof monto === 'number') {
        const formateado = monto.toLocaleString('es-MX', {
          style: 'currency',
          currency: 'MXN',
          maximumFractionDigits: 2,
        });
        return `Buscando una venta por ${formateado}…`;
      }
      const dia = fecha(args['p_fecha']);
      if (dia !== undefined) return `Buscando ventas del ${dia}${filtro(args)}…`;
      const conFiltro = filtro(args);
      return conFiltro === '' ? 'Buscando la venta…' : `Buscando ventas${conFiltro}…`;
    }

    case 'ai_top_productos': {
      const por = args['p_por'] === 'monto' ? 'por importe' : 'por kilos';
      return `Sacando los productos más vendidos ${por}${rango(args['p_desde'], args['p_hasta'])}…`;
    }

    case 'ai_top_clientes':
      return `Sacando los clientes más grandes${rango(args['p_desde'], args['p_hasta'])}…`;

    case 'ai_cuentas_por_cobrar': {
      const soloVencidas = args['p_solo_vencidas'];
      const base =
        soloVencidas === true
          ? 'Revisando la cartera vencida'
          : soloVencidas === false
            ? 'Revisando la cartera vigente'
            : 'Revisando las cuentas por cobrar';
      return `${base}${filtro(args)}…`;
    }

    case 'ai_inventario_estado': {
      const base =
        args['p_bajo_minimo'] === true
          ? 'Revisando qué está bajo mínimo'
          : 'Revisando el inventario';
      return `${base}${filtro(args)}…`;
    }

    case 'ai_resumen_semana': {
      const ref = fecha(args['p_fecha_ref']);
      return ref === undefined
        ? 'Armando el resumen de la semana…'
        : `Armando el resumen de la semana del ${ref}…`;
    }

    default:
      return 'Consultando el sistema…';
  }
}
