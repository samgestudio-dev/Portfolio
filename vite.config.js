import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        david: resolve(import.meta.dirname, 'david.html'),
        phone: resolve(import.meta.dirname, 'phone.html'),
        cabinet: resolve(import.meta.dirname, 'cabinet.html'),
        spacing: resolve(import.meta.dirname, 'spacing.html'),
        springs: resolve(import.meta.dirname, 'springs.html'),
        flipbook: resolve(import.meta.dirname, 'flipbook.html'),
        atlas: resolve(import.meta.dirname, 'atlas.html'),
        pop: resolve(import.meta.dirname, 'pop.html'),
      },
    },
  },
})
