import { createServer } from 'vite'

/** Creates the test Vite server without scanning or prebundling app dependencies. */
export function createTestViteServer(options) {
  return createServer({
    ...options,
    optimizeDeps: { ...options.optimizeDeps, noDiscovery: true },
  })
}
