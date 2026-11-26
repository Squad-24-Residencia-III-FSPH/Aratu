import { createServer } from 'vite'

const disableTestDependencyOptimization = {
  name: 'aratu:test-dependency-optimization',
  enforce: 'post',
  config(config) {
    // O plugin React preenche `include`; limpe-o após todos os plugins configurarem o Vite.
    config.optimizeDeps = { ...config.optimizeDeps, noDiscovery: true, include: [] }
  },
}

/** Cria o servidor Vite dos testes sem descobrir nem pré-empacotar dependências. */
export function createTestViteServer(options) {
  return createServer({
    ...options,
    plugins: [...(options.plugins ?? []), disableTestDependencyOptimization],
    optimizeDeps: { ...options.optimizeDeps, noDiscovery: true, include: [] },
  })
}
