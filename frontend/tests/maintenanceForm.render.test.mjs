import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { getOdometerError } from '../src/maintenance/maintenanceForm.ts'

const vite = await createServer({
  configFile: false,
  root: fileURLToPath(new URL('..', import.meta.url)),
  plugins: [react()],
  server: { middlewareMode: true },
  appType: 'custom',
})
const { FormField } = await vite.ssrLoadModule('/src/components/ui/FormField.tsx')
after(async () => { await vite.close() })

function renderOdometer(value) {
  return renderToStaticMarkup(createElement(FormField, {
    label: 'Hodômetro (km)', value, onChange: () => {},
    error: getOdometerError(value), helperText: 'Opcional; inteiro não negativo.',
  }))
}

test('hodômetro inválido associa rótulo, erro anunciado e ajuda ao mesmo input', () => {
  const markup = renderOdometer('-1')
  const input = markup.match(/<input\b[^>]*>/)?.[0]
  assert.ok(input)
  assert.match(input, /aria-invalid="true"/)
  const id = input.match(/\bid="([^"]+)"/)?.[1]
  assert.ok(id)
  assert.ok(markup.includes(`for="${id}"`))
  const links = input.match(/aria-describedby="([^"]+)"/)?.[1].split(' ')
  assert.equal(links?.length, 2)
  const [errorId, helpId] = links
  assert.ok(markup.includes(`id="${errorId}" role="alert"`))
  assert.ok(markup.includes(getOdometerError('-1')))
  assert.ok(markup.includes(`id="${helpId}"`))
})

test('hodômetro corrigido remove indicação inválida e conserva somente a ajuda', () => {
  const markup = renderOdometer('100')
  const input = markup.match(/<input\b[^>]*>/)?.[0]
  assert.ok(input)
  assert.doesNotMatch(input, /aria-invalid="true"/)
  assert.doesNotMatch(markup, /role="alert"/)
  const links = input.match(/aria-describedby="([^"]+)"/)?.[1].split(' ')
  assert.equal(links?.length, 1)
  assert.ok(markup.includes(`id="${links[0]}"`))
  assert.ok(markup.includes('Opcional; inteiro não negativo.'))
})
