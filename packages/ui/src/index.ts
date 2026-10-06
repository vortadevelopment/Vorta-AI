/**
 * @vorta/ai-assistant — punto de entrada público.
 *
 * Fase 0: solo tipos y tokens. Los componentes (`VortaAssistant`,
 * `VortaSidebarButton`) y el hook `useVortaChat` se implementan en la Fase 3;
 * ver ARCHITECTURE.md.
 */
import './styles/tokens.css';

export type { VortaAssistantProps } from './types/index.js';

export type {
  AssistantBlock,
  ChatMessage,
  ChatRole,
  ChartBlock,
  FileBlock,
  TableBlock,
  TextBlock,
} from '@vorta/ai-contracts';
