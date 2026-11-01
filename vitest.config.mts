import { fileURLToPath } from 'node:url'
import swc from 'unplugin-swc'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    swc.vite({
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        target: 'es2021',
      },
      module: { type: 'es6' },
    }),
  ],
  resolve: { alias: { src: fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    setupFiles: ['reflect-metadata'],
    clearMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/auth/**/*.ts', 'src/users/**/*.ts', 'src/mail/**/*.ts', 'src/config/**/*.ts'],
    },
  },
})
