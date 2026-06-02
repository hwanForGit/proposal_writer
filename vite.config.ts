import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true, // 0.0.0.0 — 사내 망에서 다른 PC가 IP로 접근 가능 (192.168.x.x:5173)
    port: 5173,
    open: true,
    // 호스트명 기반 접근 허용 (Vite 5.0.12+ 보안 검사):
    //  - 'hsh'      : Tailscale MagicDNS short name (http://hsh:5173)
    //  - '.ts.net'  : Tailscale FQDN (예: hsh.<tailnet>.ts.net)
    //  - '.local'   : Bonjour mDNS (예: HSH-2.local)
    // (IP 직접 접근은 host 헤더 검사를 우회하므로 별도 등록 불필요.)
    allowedHosts: ['hsh', '.ts.net', '.local'],
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
