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
        zoetrope: resolve(import.meta.dirname, 'zoetrope.html'),
      },
    },
  },
})
