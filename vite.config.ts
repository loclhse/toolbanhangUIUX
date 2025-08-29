import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true, // Allow external access
    open: true, // Auto-open browser
    strictPort: false, // Allow fallback to other ports
  },
  optimizeDeps: {
    include: ['react', 'react-dom']
  }
})
