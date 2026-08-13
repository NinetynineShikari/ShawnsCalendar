import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: { entry: 'electron/main/index.ts' },
      preload: { input: 'electron/preload/index.ts' },
      renderer: {},
    }),
  ],
  server: { port: 5173 },
  build: { outDir: 'dist' },
})
