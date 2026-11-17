import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

// Cada arquivo de teste tem seu próprio processo e armazenamento sintético.
export const dom = new JSDOM('<!doctype html><html lang="pt-BR"><body></body></html>', { url: 'http://localhost/' })
Object.defineProperties(globalThis, Object.fromEntries([
  ['window', dom.window], ['document', dom.window.document], ['navigator', dom.window.navigator],
  ...['HTMLElement', 'Node', 'DocumentFragment', 'ShadowRoot', 'MutationObserver'].map((key) => [key, dom.window[key]]),
  ['getComputedStyle', dom.window.getComputedStyle.bind(dom.window)],
].map(([key, value]) => [key, { configurable: true, value }])))
globalThis.IS_REACT_ACT_ENVIRONMENT = true
dom.window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} })
globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
export const testing = await import('@testing-library/react')
export const userEvent = (await import('@testing-library/user-event')).default
const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aratu-auth-test-'))
export const vite = await createServer({ configFile: false, root: fileURLToPath(new URL('..', import.meta.url)),
  plugins: [react()], cacheDir, server: { middlewareMode: true, hmr: false }, appType: 'custom' })
export async function closeAuthDom() {
  await vite.close()
  dom.window.close()
  fs.rmSync(cacheDir, { recursive: true, force: true })
}
