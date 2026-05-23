import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'ビッド式オセロ',
        short_name: 'BidOthello',
        description:
          '着手権を秘密入札で取り合う戦略的オセロ。NPC 4 段階・オンライン対戦対応。',
        theme_color: '#1c2438',
        background_color: '#0d1220',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        lang: 'ja',
        icons: [
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        navigateFallback: '/index.html',
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  server: {
    port: 5173,
    host: true,
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    // Run test files sequentially. The time-budgeted oni in ai.test.ts /
    // aiBidding / oniStrength / aiSearchUpgrades is wall-clock-bounded — if
    // multiple AI-heavy test files share CPU via the default thread pool,
    // each oni search gets less compute in the same wall budget and plays
    // measurably weaker, which manifests as flaky strength tests in CI.
    // The added wall-time cost is small (~30-60s on this suite) vs the
    // value of deterministic CI.
    fileParallelism: false,
  },
});
