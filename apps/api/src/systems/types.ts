/**
 * Contrato de configuración de un sistema (tenant).
 *
 * Un sistema = un ERP = un proyecto de Supabase. Esto es lo ÚNICO que cambia
 * entre los 8 sistemas: ni las tools ni el loop de Claude conocen tablas
 * específicas, solo llaman RPCs estándar.
 */
export interface SystemConfig {
  /** Slug estable, igual al que manda el UI en `X-Vorta-System`. */
  slug: string;

  /** Nombre del negocio tal como el asistente debe nombrarlo al usuario. */
  businessName: string;

  /** Giro del negocio; entra al system prompt para dar contexto al modelo. */
  industry: string;

  /** Zona horaria IANA para resolver "hoy", "este mes", etc. */
  timeZone: string;

  /** Código ISO 4217 de la moneda en que se formatean los importes. */
  currency: string;

  /**
   * Credenciales PÚBLICAS del Supabase del sistema. Van en claro en este
   * archivo porque el frontend de cada ERP ya las expone en su bundle; no son
   * secretos y no hay nada que proteger escondiéndolas en env.
   *
   * La service role key NO cabe aquí: no existe un campo para ella porque el
   * asistente nunca debe leer datos del cliente con ella.
   */
  supabase: {
    url: string;
    /**
     * Anon key (`role: "anon"` en su payload). Las lecturas se hacen con esta
     * key MÁS el JWT del usuario en el header Authorization, de modo que RLS
     * resuelve qué puede ver. Por sí sola no da acceso a nada.
     */
    anonKey: string;
  };

  /** 4–6 sugerencias del estado vacío del chat, en el lenguaje del negocio. */
  suggestions: string[];

  /**
   * RPCs que este sistema expone, del catálogo estándar `ai_*`. Permite que un
   * ERP sin, por ejemplo, módulo de compras no ofrezca esa tool.
   */
  enabledTools: string[];

  /**
   * Notas de negocio que el asistente necesita para no leer mal sus propios
   * datos: rarezas de la carga inicial, qué significa un almacén virtual, qué
   * dejó de operar y desde cuándo. Se concatenan al system prompt después de
   * las reglas base.
   *
   * Son instrucciones del operador, no datos del cliente: aquí NUNCA van
   * cifras que el asistente deba reportar como si las hubiera consultado.
   */
  notes: string;
}
