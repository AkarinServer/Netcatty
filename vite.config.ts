import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
    return {
      base: "./",
      server: {
        port: 5173,
        host: 'localhost',
        headers: {
          // Required for SharedArrayBuffer and WASM in some browsers
          'Cross-Origin-Opener-Policy': 'same-origin',
          // Use credentialless to allow loading cross-origin images (e.g. Google avatars)
          // while still enabling crossOriginIsolated.
          'Cross-Origin-Embedder-Policy': 'credentialless',
        },
        // Suppress source map warnings for monaco-editor
        hmr: {
          overlay: true,
        },
      },
      build: {
        chunkSizeWarningLimit: 3000,
        target: 'esnext', // Required for top-level await in WASM modules
        sourcemap: false, // Disable source maps to avoid missing map file warnings
        // Optimize chunk splitting for faster initial load
        rollupOptions: {
          output: {
            manualChunks: {
              // Vendor chunks - rarely change, can be cached aggressively
              'vendor-react': ['react', 'react-dom'],
              'vendor-radix': [
                '@radix-ui/react-collapsible',
                '@radix-ui/react-context-menu',
                '@radix-ui/react-dialog',
                '@radix-ui/react-popover',
                '@radix-ui/react-scroll-area',
                '@radix-ui/react-select',
                '@radix-ui/react-slot',
                '@radix-ui/react-tabs',
              ],
              'vendor-xterm': [
                '@xterm/xterm',
                '@xterm/addon-fit',
                '@xterm/addon-search',
                '@xterm/addon-serialize',
                '@xterm/addon-web-links',
                '@xterm/addon-webgl',
              ],
            },
          },
        },
      },
      plugins: [tailwindcss(), react()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
