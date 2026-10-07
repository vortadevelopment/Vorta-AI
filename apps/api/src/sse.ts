import type { SSEStreamingApi } from 'hono/streaming';
import type { ChatErrorCode, ChatEvent, StopReason } from '@vorta/ai-contracts';
import type { AssistantBlock } from '@vorta/ai-contracts';

/**
 * Única capa que escribe en el canal SSE. Está tipada contra `ChatEvent` del
 * paquete de contratos, así que el UI y la API no se pueden desincronizar: un
 * evento que no exista en el contrato no compila.
 *
 * El `type` viaja dos veces a propósito, en el campo `event:` del protocolo SSE
 * y dentro del JSON, para que el UI pueda despachar por cualquiera de los dos.
 */
export class ChatStream {
  #stream: SSEStreamingApi;
  #closed = false;

  constructor(stream: SSEStreamingApi) {
    this.#stream = stream;
  }

  async #send(event: ChatEvent): Promise<void> {
    await this.#stream.writeSSE({ event: event.type, data: JSON.stringify(event) });
  }

  start(conversationId: string, messageId: string): Promise<void> {
    return this.#send({ type: 'start', conversationId, messageId });
  }

  textDelta(text: string): Promise<void> {
    return this.#send({ type: 'text_delta', text });
  }

  toolStart(toolUseId: string, name: string, label: string): Promise<void> {
    return this.#send({ type: 'tool_start', toolUseId, name, label });
  }

  toolEnd(toolUseId: string, ok: boolean, message?: string): Promise<void> {
    return this.#send({
      type: 'tool_end',
      toolUseId,
      ok,
      ...(message === undefined ? {} : { message }),
    });
  }

  block(block: AssistantBlock): Promise<void> {
    return this.#send({ type: 'block', block });
  }

  /**
   * Cierra el stream con éxito. Idempotente: un `done` después de un `error`
   * se ignora, porque el contrato dice que después del evento terminal el
   * stream se cierra.
   */
  async done(stopReason: StopReason): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    await this.#send({ type: 'done', stopReason });
  }

  /** Cierra el stream con un error. El mensaje se muestra al usuario tal cual. */
  async error(code: ChatErrorCode, message: string): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    await this.#send({ type: 'error', code, message });
  }
}
