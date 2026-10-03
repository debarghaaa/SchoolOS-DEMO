import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    allowedHosts: true as any,
    cors: true,
    hmr: { clientPort: 443 },
    proxy: {
      // Same-origin /api for the presence feed's FastAPI login + exchange.
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
})
