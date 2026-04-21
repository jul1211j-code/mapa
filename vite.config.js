import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  css: {
    // Forzar uso de PostCSS en lugar de LightningCSS
    transformer: 'postcss',
    postcss: {
      plugins: []
    }
  }
})
