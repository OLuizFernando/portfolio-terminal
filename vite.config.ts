import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: true,
    // A API roda separada no desenvolvimento; em produção o nginx serve as duas
    // coisas na mesma origem e este proxy não existe.
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
});
