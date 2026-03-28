import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['tests/**', 'dist/**', 'extension/**', 'k8s/**'],
    },
    // Give integration tests a longer timeout
    testTimeout: 10_000,
  },
})
