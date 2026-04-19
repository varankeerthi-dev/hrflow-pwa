import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  optimizeDeps: {
    exclude: ['@capacitor/core', '@capgo/capacitor-updater']
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        maximumFileSizeToCacheInBytes: 5000000, // 5MB
      },
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
    sourcemap: true,  // ✅ ADDED: Enable source maps for production debugging
    rollupOptions: {
      external: [
        '@capacitor/core',
        '@capacitor/camera',
        '@capgo/capacitor-updater'
      ]
    }
  }
})