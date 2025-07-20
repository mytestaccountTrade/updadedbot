import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/binance-api': {
        target: 'https://api.binance.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/binance-api/, ''),
        secure: true,
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'DNT': '1',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'cross-site'
        },
      },
      '/binance-testnet': {
        target: 'https://testnet.binance.vision',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/binance-testnet/, ''),
        secure: true,
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'DNT': '1',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'cross-site'
        },
      },
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
