/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // 로컬 확인용으로 다른 포트의 API 를 쓸 때만 JINSEONMI_API_TARGET 을 준다(기본 8001). 비밀값이 아니다.
      '/v1': { target: (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.JINSEONMI_API_TARGET ?? 'http://127.0.0.1:8001', changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
  },
})
