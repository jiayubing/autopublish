import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';

function fixForElectron(): Plugin {
  return {
    name: 'fix-for-electron',
    enforce: 'post',
    transformIndexHtml(html) {
      // Remove type="module" and crossorigin (not compatible with file://)
      html = html
        .replace(/ type="module"/g, '')
        .replace(/ crossorigin/g, '');
      // Move script from <head> to end of <body> so DOM is ready
      const scriptMatch = html.match(/<script src="[^"]+"><\/script>/);
      if (scriptMatch) {
        html = html.replace(scriptMatch[0], '');
        html = html.replace('</body>', scriptMatch[0] + '\n</body>');
      }
      return html;
    },
  };
}

export default defineConfig(() => {
  return {
    base: './',
    plugins: [react(), tailwindcss(), fixForElectron()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          format: 'iife',
        },
      },
    },
  };
});