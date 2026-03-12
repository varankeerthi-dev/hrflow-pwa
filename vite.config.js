import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  optimizeDeps: {
    exclude: ['@capacitor/core', '@capgo/capacitor-updater']
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'HRFlow',
        short_name: 'HRFlow',
        theme_color: '#6366f1',
        background_color: '#f8f9fc',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' }
        ]
      }
    })
  ],
  build: {
    rollupOptions: {
      external: [
        '@capacitor/core',
        '@capacitor/camera',
        '@capgo/capacitor-updater'
      ]
    }
  }
})
