import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/** Injects a Content-Security-Policy: strict in production, HMR-friendly in development. */
function cspPlugin(): Plugin {
  return {
    name: 'allbee-csp',
    transformIndexHtml(html, ctx) {
      const dev = !!ctx.server;
      const csp = [
        "default-src 'self'",
        dev ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        "media-src 'self' data: blob:",
        dev ? "connect-src 'self' ws://localhost:5178 http://localhost:5178" : "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
        "frame-src 'none'",
      ].join('; ');
      return html.replace('%CSP%', csp);
    },
  };
}

const r = (p: string) => path.resolve(__dirname, p);

export default defineConfig({
  root: r('src/renderer'),
  base: './',
  plugins: [react(), cspPlugin()],
  resolve: { alias: { '@shared': r('src/shared') } },
  css: { postcss: r('.') },
  server: { port: 5178, strictPort: true },
  build: {
    outDir: r('dist/renderer'),
    emptyOutDir: true,
    target: 'chrome130',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      input: {
        main: r('src/renderer/index.html'),
        companion: r('src/renderer/companion.html'),
        audio: r('src/renderer/audio.html'),
      },
    },
  },
});
