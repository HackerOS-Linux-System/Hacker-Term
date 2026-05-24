import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  base: '/',
  build: {
    target: ['es2021', 'chrome105', 'safari15'],
    minify: 'esbuild' as const,
    sourcemap: false,
  },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
})
