/**
 * Variables de entorno del servidor.
 *
 * Son solo dos, y a propósito: las credenciales públicas de cada sistema viven
 * en `systems/<slug>.ts` (no son secretos, el frontend de cada ERP ya las
 * expone). Aquí queda únicamente lo que sí es secreto o depende del despliegue.
 *
 * `anthropicApiKey()` se lee aparte y tarde, no al construir la app: así
 * `GET /health` —el chequeo de despliegue— funciona aunque la key no esté
 * configurada, y el error sale cuando de verdad se iba a usar.
 */

let cachedKey: string | undefined;

/** La única credencial de servidor del asistente. Nunca llega al navegador. */
export function anthropicApiKey(): string {
  if (cachedKey !== undefined) return cachedKey;
  const value = process.env['ANTHROPIC_API_KEY'];
  if (value === undefined || value.trim() === '') {
    throw new Error('Falta la variable de entorno ANTHROPIC_API_KEY');
  }
  cachedKey = value;
  return cachedKey;
}

let cachedOrigins: string[] | undefined;

/**
 * Orígenes permitidos para CORS. Lista vacía = ningún navegador puede llamar a
 * la API, que es el default correcto: es más seguro que un deploy sin configurar
 * no funcione desde el navegador que uno que acepte a cualquiera.
 */
export function allowedOrigins(): string[] {
  if (cachedOrigins !== undefined) return cachedOrigins;
  cachedOrigins = (process.env['VORTA_ALLOWED_ORIGINS'] ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin !== '');
  return cachedOrigins;
}
