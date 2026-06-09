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
    // 5173이 점유돼 있으면 조용히 다른 포트로 밀리지 않고 명확히 실패시킨다.
    // (좀비 vite가 5173을 잡고 있을 때 hsh:5173이 옛 인스턴스로 가는 혼란 방지)
    strictPort: true,
    open: true,
    // 호스트명 기반 접근 허용 (Vite 5.0.12+ 보안 검사):
    //  - 'lattes-macbook' : 현재 개발 머신의 Tailscale MagicDNS short name
    //  - 'hsh'            : 구 개발 머신 short name (하위호환)
    //  - '.ts.net'        : Tailscale FQDN (예: lattes-macbook.<tailnet>.ts.net)
    //  - '.local'         : Bonjour mDNS (예: Lattes-MacBook.local)
    // (IP 직접 접근은 host 헤더 검사를 우회하므로 별도 등록 불필요.)
    // ※ 짧은 이름을 쓰려면 머신의 Tailscale 디바이스명과 일치해야 함.
    allowedHosts: ['lattes-macbook', 'hsh', '.ts.net', '.local'],
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
