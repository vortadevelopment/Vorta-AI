import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Build en library mode.
 *
 * react / react-dom quedan como externals: el ERP anfitrión usa su propia copia.
 * Es lo que permite instalar el mismo paquete en 8 sistemas con versiones
 * distintas de React.
 *
 * El playground de desarrollo (`pnpm dev`) llega en la Fase 3 con su propio
 * `dev/index.html`.
 */
export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: fileURLToPath(new URL('src/index.ts', import.meta.url)),
      formats: ['es'],
      fileName: () => 'index.js',
      cssFileName: 'styles',
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
    },
    sourcemap: true,
    emptyOutDir: true,
  },
});
