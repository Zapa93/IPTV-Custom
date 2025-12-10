
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const root = path.resolve('.');
    const env = loadEnv(mode, process.cwd(), '');
    
    return {
      base: './', // Crucial for WebOS file-system loading
      server: {
        port: 3000,
        host: '0.0.0.0', // Expose to network for TV testing
      },
      plugins: [react()],
      define: {
        'process.env.VITE_SPORT_URL': JSON.stringify(env.VITE_SPORT_URL),
        'process.env.VITE_ENTERTAINMENT_URL': JSON.stringify(env.VITE_ENTERTAINMENT_URL),
        'process.env.VITE_EPG_URL': JSON.stringify(env.VITE_EPG_URL),
        'process.env.VITE_EPG_URL_EXTRA': JSON.stringify(env.VITE_EPG_URL_EXTRA),
        'process.env.VITE_FOOTBALL_DATA_KEY': JSON.stringify(env.VITE_FOOTBALL_DATA_KEY),
      },
      resolve: {
        alias: {
          '@': root,
        }
      }
    };
});
