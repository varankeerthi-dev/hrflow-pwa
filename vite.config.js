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
        maximumFileSizeToCacheInBytes: 10485760, // 10MB
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
    sourcemap: true,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      external: [
        '@capacitor/core',
        '@capacitor/camera',
        '@capgo/capacitor-updater'
      ],
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          'vendor-ui': ['@mui/material', '@emotion/react', '@emotion/styled', 'lucide-react'],
          'vendor-pdf': ['@react-pdf/renderer', 'jspdf', 'jspdf-autotable', 'html2canvas'],
          'vendor-utils': ['date-fns', 'zod', 'clsx', 'tailwind-merge', 'jszip', 'browser-image-compression'],
          'vendor-maps': ['leaflet', 'react-leaflet']
        }
      }
    }
  }
})