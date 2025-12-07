import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000, 
    strictPort: true,
    proxy: {
      // API Data Proxy
      '/api': {
        target: 'https://metaforge.app',
        changeOrigin: true,
        secure: false,
      },
      // Image Proxy (In case Metaforge returns relative image paths)
      '/storage': {
        target: 'https://metaforge.app',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})