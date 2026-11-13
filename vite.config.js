import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const loader = () => ({
  name: 'zwishly-loader',
  transformIndexHtml: {
    order: 'pre',
    handler: (html) => html.replace('<!--loader-->', () => readFileSync('src/loader.html', 'utf8')),
  },
});

export default defineConfig({
  base: './',
  plugins: [loader()],
  build: { rollupOptions: { input: { main: 'index.html', analyze: 'analyze.html' } } },
});
