/**
 * Bloques que puede contener un mensaje del asistente.
 *
 * El modelo nunca emite estos bloques directamente: los produce la API a partir
 * del resultado de una RPC (una tabla de ventas, una serie para graficar, un
 * archivo generado). El UI los renderiza dentro de la burbuja del mensaje.
 */

/** Texto en markdown acotado (negritas, listas, enlaces). */
export interface TextBlock {
  type: 'text';
  text: string;
}

export type ColumnFormat = 'text' | 'number' | 'currency' | 'percent' | 'date';

export interface TableColumn {
  key: string;
  label: string;
  format: ColumnFormat;
  /** Alineación sugerida; si se omite, el UI la deduce del formato. */
  align?: 'left' | 'right' | 'center';
}

/** Tabla tabular. Las celdas ya vienen con el valor crudo; el UI aplica formato. */
export interface TableBlock {
  type: 'table';
  title?: string;
  columns: TableColumn[];
  rows: Array<Record<string, string | number | null>>;
  /** Fila de totales opcional, separada visualmente. */
  footer?: Record<string, string | number | null>;
  /** Cuántas filas se omitieron por el límite de la RPC. */
  truncatedRows?: number;
}

export type ChartKind = 'line' | 'bar' | 'area' | 'donut';

export interface ChartSeries {
  label: string;
  points: Array<{ x: string | number; y: number }>;
}

/** Gráfica. Los colores los decide el UI con los tokens de marca. */
export interface ChartBlock {
  type: 'chart';
  kind: ChartKind;
  title?: string;
  series: ChartSeries[];
  xLabel?: string;
  yLabel?: string;
  valueFormat?: ColumnFormat;
}

/**
 * Archivo descargable, renderizado como tarjeta.
 *
 * `url` es siempre una URL firmada y de vida corta emitida por el Supabase del
 * sistema; la API nunca manda el contenido del archivo por el canal SSE.
 */
export interface FileBlock {
  type: 'file';
  name: string;
  mimeType: string;
  sizeBytes?: number;
  url: string;
  expiresAt?: string;
}

export type AssistantBlock = TextBlock | TableBlock | ChartBlock | FileBlock;

export type ChatRole = 'user' | 'assistant';

/** Mensaje tal como lo guarda y reenvía el UI. */
export interface ChatMessage {
  id: string;
  role: ChatRole;
  /** El usuario solo manda texto; el asistente puede traer bloques enriquecidos. */
  blocks: AssistantBlock[];
  createdAt: string;
}
