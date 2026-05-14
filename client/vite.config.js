import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backend = process.env.VITE_BACKEND_URL || 'http://localhost:3001'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/proxy': {
        target: backend,
        changeOrigin: true,
      },
      '/search': {
        target: backend,
        changeOrigin: true,
      },
      '/socket.io': {
        target: backend,
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
