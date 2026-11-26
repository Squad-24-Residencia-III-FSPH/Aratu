import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { createTestViteServer } from './viteTestServer.mjs'

const frontendRoot = fileURLToPath(new URL('..', import.meta.url))

for (const { name, plugins } of [
  { name: 'sem plugin React', plugins: [] },
  { name: 'com plugin React', plugins: [react()] },
]) {
  test(`desativa a otimização de dependências ${name} e carrega módulos SSR`, async () => {
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aratu-vite-server-test-'))
    let vite

    try {
      vite = await createTestViteServer({
        configFile: false,
        root: frontendRoot,
        cacheDir,
        plugins,
        server: { middlewareMode: true, hmr: false, ws: false },
        appType: 'custom',
      })

      assert.equal(vite.config.optimizeDeps.noDiscovery, true)
      assert.deepEqual(vite.config.optimizeDeps.include, [])
      assert.equal(vite.environments.client.depsOptimizer, undefined)

      const form = await vite.ssrLoadModule('/src/drivers/driverForm.ts')
      assert.equal(form.maskCpf('12345678901'), '123.456.789-01')
    } finally {
      if (vite) await vite.close()
      fs.rmSync(cacheDir, { recursive: true, force: true })
    }
  })
}
