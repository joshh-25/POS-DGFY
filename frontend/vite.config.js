import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      // More specific aliases must come first
      { find: '@/hooks', replacement: path.resolve(__dirname, './src/hooks') },
      { find: '@/components', replacement: path.resolve(__dirname, './Components') },
      { find: '@/Pages', replacement: path.resolve(__dirname, './Pages') },
      { find: '@/Entities', replacement: path.resolve(__dirname, './Entities') },
      { find: '@/lib', replacement: path.resolve(__dirname, './src/lib') },
      { find: '@/services', replacement: path.resolve(__dirname, './src/services') },
      // General alias to src folder
      { find: '@', replacement: path.resolve(__dirname, './') },
    ],
    extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'],
  },
  server: {
    allowedHosts: ['skupervisor.surebizcorp.com', '10.123.33.49'],
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  preview: {
    port: 5173,
    host: true,
    allowedHosts: ['skupervisor.surebizcorp.com', '10.123.33.49'],
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})

