# @vorta/ai-assistant

Componente React del asistente de IA de VORTA: la pastilla del sidebar y el
panel de chat. Se instala igual en los 8 ERPs; lo único que cambia por sistema
es el prop `system`.

> Fase 0: el paquete solo expone tipos y tokens de marca. Los componentes
> llegan en la Fase 3 (ver `ARCHITECTURE.md` en la raíz del monorepo).

## Instalación en un ERP

```bash
pnpm add @vorta/ai-assistant   # o npm/yarn, según el ERP
```

## Uso previsto

```tsx
import { VortaAssistant } from '@vorta/ai-assistant';
import '@vorta/ai-assistant/styles.css';
import { supabase } from '@/lib/supabase';

<VortaAssistant
  system="acm"
  apiUrl={import.meta.env.VITE_VORTA_AI_URL}
  getAccessToken={async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? '';
  }}
/>;
```

El componente se monta una sola vez, arriba del menú del sidebar. React y
react-dom son `peerDependencies`: el paquete usa la copia del ERP anfitrión.
