import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
                            base: './', // Crucial for Electron to load assets from the local filesystem
                            server: {
                                port: 5173,
                                strictPort: true,
                            }
})
