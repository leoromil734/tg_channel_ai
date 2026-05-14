import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Strip /res prefix, mirroring the production Apache ProxyPass /res → localhost:9005/
      '/res': {
        target: 'http://localhost:9005',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/res\/?/, '/'),
      },
    },
  },
})
