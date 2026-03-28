import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      'openclaw/plugin-sdk/core': resolve(__dirname, './types/openclaw-sdk.ts'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
