/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/v1': { target: 'http://127.0.0.1:8001', changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    // 앱 전체 흐름 테스트(온보딩·비교·담기)는 jsdom + user-event 로 느려서, 다른 작업과 겹치면 기본 5초를 넘길 수 있다
    testTimeout: 15_000,
  },
})
