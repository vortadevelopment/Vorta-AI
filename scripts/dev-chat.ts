/**
 * Prueba de punta a punta de POST /chat sin UI.
 *
 * Hace login real contra el Supabase de ACM con TEST_EMAIL / TEST_PASSWORD,
 * toma el access_token y manda la pregunta a la API local, imprimiendo el
 * stream tal como lo recibirá el UI.
 *
 *   pnpm dev:chat "¿cuánto vendimos del 1 al 30 de septiembre?"
 *
 * Requiere TEST_EMAIL y TEST_PASSWORD en apps/api/.env. Son OPCIONALES para el
 * resto del proyecto: sin ellos la API funciona igual y solo este script deja
 * de poder correr.
 *
 * Opcionales: VORTA_API_URL (default http://localhost:3000),
 * VORTA_SYSTEM (default acm).
 *
 * La URL y la anon key del Supabase salen de la config del sistema
 * (apps/api/src/systems/<slug>.ts), no de variables de entorno.
 */
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveSystem } from '../apps/api/src/systems/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENV_FILE = resolve(HERE, '../apps/api/.env');

/**
 * Lector mínimo de .env. No se usa `dotenv` para no agregar una dependencia solo
 * para un script de desarrollo; soporta comentarios, comillas y nada más.
 */
function loadEnv(path: string): void {
  let contents: string;
  try {
    contents = readFileSync(path, 'utf8');
  } catch {
    // No es fatal: TEST_EMAIL/TEST_PASSWORD pueden venir del entorno. Si tampoco
    // están ahí, `required()` lo dirá con precisión.
    return;
  }
  for (const line of contents.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    console.error(
      `Falta ${name}. Es opcional para el proyecto, pero este script lo necesita:\n` +
        `defínelo en ${ENV_FILE} o en el entorno.`,
    );
    process.exit(1);
  }
  return value;
}

const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const RESET = '\x1b[0m';

async function main(): Promise<void> {
  const question = process.argv.slice(2).join(' ').trim();
  if (question === '') {
    console.error('Uso: pnpm dev:chat "tu pregunta"');
    process.exit(1);
  }

  loadEnv(ENV_FILE);

  const apiUrl = process.env['VORTA_API_URL'] ?? 'http://localhost:3000';
  const slug = process.env['VORTA_SYSTEM'] ?? 'acm';

  const system = resolveSystem(slug);
  if (system === undefined) {
    console.error(`${RED}No conozco el sistema "${slug}".${RESET}`);
    process.exit(1);
  }

  // Login real: el objetivo es un JWT emitido por el Supabase DE ESE SISTEMA,
  // que es contra lo que la API valida. Se usan las mismas credenciales que la
  // API, leídas de su config, para que el script no pueda apuntar a otro lado.
  const supabase = createClient(system.supabase.url, system.supabase.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.signInWithPassword({
    email: required('TEST_EMAIL'),
    password: required('TEST_PASSWORD'),
  });

  if (error !== null || data.session === null) {
    console.error(`${RED}Login falló:${RESET}`, error?.message ?? 'sin sesión');
    process.exit(1);
  }

  console.log(`${DIM}usuario: ${data.user?.email}  ·  sistema: ${slug}${RESET}`);
  console.log(`${DIM}pregunta: ${question}${RESET}\n`);

  const response = await fetch(`${apiUrl}/chat`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      'X-Vorta-System': slug,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      messages: [
        {
          id: randomUUID(),
          role: 'user',
          blocks: [{ type: 'text', text: question }],
          createdAt: new Date().toISOString(),
        },
      ],
    }),
  });

  if (!response.ok) {
    console.error(`${RED}HTTP ${response.status}${RESET}`, await response.text());
    process.exit(1);
  }

  if (response.body === null) {
    console.error(`${RED}La respuesta no trae cuerpo.${RESET}`);
    process.exit(1);
  }

  await printStream(response.body);
}

/**
 * Parser de SSE suficiente para este script: acumula hasta la línea en blanco y
 * se queda con el `data:`.
 */
async function printStream(body: ReadableStream<Uint8Array>): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let failed = false;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let separator = buffer.indexOf('\n\n');
    while (separator !== -1) {
      const frame = buffer.slice(0, separator);
      buffer = buffer.slice(separator + 2);
      if (handle(frame) === 'error') failed = true;
      separator = buffer.indexOf('\n\n');
    }
  }

  console.log('');
  if (failed) process.exitCode = 1;
}

function handle(frame: string): 'ok' | 'error' {
  const dataLine = frame
    .split('\n')
    .find((line) => line.startsWith('data:'))
    ?.slice('data:'.length)
    .trim();

  if (dataLine === undefined) return 'ok';

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(dataLine) as Record<string, unknown>;
  } catch {
    return 'ok';
  }

  switch (event['type']) {
    case 'start':
      console.log(`${DIM}▸ conversación ${String(event['conversationId'])}${RESET}\n`);
      return 'ok';
    case 'text_delta':
      process.stdout.write(String(event['text']));
      return 'ok';
    case 'tool_start':
      console.log(`\n${CYAN}→ ${String(event['label'])}${RESET} ${DIM}(${String(event['name'])})${RESET}`);
      return 'ok';
    case 'tool_end':
      console.log(
        event['ok'] === true
          ? `${GREEN}✓${RESET} ${DIM}listo${RESET}\n`
          : `${RED}✗ ${String(event['message'] ?? 'falló')}${RESET}\n`,
      );
      return 'ok';
    case 'block':
      console.log(`\n${DIM}[bloque ${JSON.stringify(event['block'])}]${RESET}`);
      return 'ok';
    case 'done':
      console.log(`\n${DIM}▪ fin (${String(event['stopReason'])})${RESET}`);
      return 'ok';
    case 'error':
      console.log(`\n${RED}▪ error ${String(event['code'])}: ${String(event['message'])}${RESET}`);
      return 'error';
    default:
      return 'ok';
  }
}

void main();
