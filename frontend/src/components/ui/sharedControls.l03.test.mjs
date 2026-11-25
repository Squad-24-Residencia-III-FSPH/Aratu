import test, { after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createElement, useState } from 'react'
import { JSDOM } from 'jsdom'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { sessionFor } from '../../../tests/fixtures.mjs'

const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aratu-l03-ui-test-'))
const dom = new JSDOM('<!doctype html><html lang="pt-BR"><body></body></html>', {
  url: 'http://localhost/',
})
Object.defineProperties(globalThis, Object.fromEntries([
  ['window', dom.window],
  ['document', dom.window.document],
  ['navigator', dom.window.navigator],
  ...['HTMLElement', 'SVGElement', 'Node', 'DocumentFragment', 'ShadowRoot', 'MutationObserver'].map((key) => [key, dom.window[key]]),
  ['getComputedStyle', dom.window.getComputedStyle.bind(dom.window)],
].map(([key, value]) => [key, { configurable: true, value }])))
globalThis.IS_REACT_ACT_ENVIRONMENT = true
dom.window.matchMedia ??= () => ({
  matches: false,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() { return false },
})
globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)

const { cleanup, render, screen, waitFor, within } = await import('@testing-library/react')
const userEvent = (await import('@testing-library/user-event')).default

const frontendRoot = fileURLToPath(new URL('../../..', import.meta.url))
const vite = await createServer({
  configFile: false,
  root: frontendRoot,
  cacheDir,
  plugins: [react()],
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
})

const [
  { ThemeProvider },
  { theme },
  { default: StatusChip },
  { FormField, FormSelect },
  { default: ConfirmDialog },
  { default: Topbar },
  { AuthContext },
  { default: DirectionsCarOutlinedIcon },
] = await Promise.all([
  vite.ssrLoadModule('@mui/material/styles'),
  vite.ssrLoadModule('/src/theme.ts'),
  vite.ssrLoadModule('/src/components/ui/StatusChip.tsx'),
  vite.ssrLoadModule('/src/components/ui/FormField.tsx'),
  vite.ssrLoadModule('/src/components/ui/ConfirmDialog.tsx'),
  vite.ssrLoadModule('/src/components/Topbar.tsx'),
  vite.ssrLoadModule('/src/auth/AuthContext.ts'),
  vite.ssrLoadModule('@mui/icons-material/DirectionsCarOutlined'),
])

afterEach(() => cleanup())
after(async () => {
  await vite.close()
  fs.rmSync(cacheDir, { recursive: true, force: true })
  dom.window.close()
})

function relativeLuminance(hex) {
  const clean = hex.replace('#', '')
  const channels = [0, 2, 4].map((offset) => {
    const value = Number.parseInt(clean.slice(offset, offset + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function contrastRatio(hexA, hexB) {
  const lumA = relativeLuminance(hexA)
  const lumB = relativeLuminance(hexB)
  const lighter = Math.max(lumA, lumB)
  const darker = Math.min(lumA, lumB)
  return (lighter + 0.05) / (darker + 0.05)
}

test('theme.ts garante contraste WCAG AA (>= 4,5:1 texto, >= 3:1 contorno/foco), alvos >= 44px e scroll-padding-top', () => {
  assert.equal(theme.palette.primary.main.toUpperCase(), '#FF6B00')
  assert.ok(contrastRatio(theme.palette.primary.dark, '#ffffff') >= 4.5)
  assert.ok(contrastRatio(theme.palette.primary.dark, '#f4f6f8') >= 4.5)
  assert.ok(contrastRatio(theme.palette.primary.contrastText, theme.palette.primary.main) >= 4.5)
  assert.ok(contrastRatio('#6b7280', '#ffffff') >= 3.0)

  const cssBaseline = theme.components?.MuiCssBaseline?.styleOverrides
  assert.equal(cssBaseline.html.scrollPaddingTop, '80px')
  assert.equal(cssBaseline['a, button, input, select, textarea, [tabindex], [role="button"], [role="combobox"]'].scrollMarginTop, '80px')

  const muiButton = theme.components?.MuiButton?.styleOverrides
  assert.equal(muiButton.root.minHeight, 44)
  assert.equal(muiButton.root.minWidth, 44)
  assert.equal(muiButton.root.scrollMarginTop, 80)
  assert.equal(muiButton.root['&.MuiButton-textPrimary'].color, '#b94700')
  assert.equal(muiButton.root['&.MuiButton-outlinedPrimary'].color, '#b94700')
  assert.equal(muiButton.root['&.MuiButton-containedPrimary'].backgroundColor, '#FF6B00')
  assert.equal(muiButton.root['&.MuiButton-containedPrimary'].color, '#111827')

  const muiOutlined = theme.components?.MuiOutlinedInput?.styleOverrides
  assert.equal(muiOutlined.root.minHeight, 44)
  assert.equal(muiOutlined.input['&.MuiInputBase-inputSizeSmall'].minHeight, 44)
  assert.equal(theme.components?.MuiSelect?.styleOverrides?.select?.minHeight, 44)
})

test('StatusChip exibe ícones SVG semânticos distintos por StatusTone e aceita icon opcional', () => {
  const tones = [
    { tone: 'success', label: 'Ativo' },
    { tone: 'warning', label: 'Pendente' },
    { tone: 'info', label: 'Em análise' },
    { tone: 'neutral', label: 'Inativo' },
  ]
  render(
    createElement(
      ThemeProvider,
      { theme },
      createElement('div', null, tones.map((item) => createElement(StatusChip, { key: item.tone, ...item }))),
    ),
  )

  const pathSignatures = new Set()
  for (const item of tones) {
    const chip = screen.getByText(item.label).closest('.MuiChip-root')
    assert.ok(chip)
    const iconSvg = chip.querySelector('.MuiChip-icon')
    assert.ok(iconSvg)
    assert.equal(iconSvg.tagName.toLowerCase(), 'svg')
    assert.equal(iconSvg.getAttribute('aria-hidden'), 'true')
    pathSignatures.add(iconSvg.innerHTML)
  }
  assert.equal(pathSignatures.size, 4, 'Cada StatusTone deve possuir um ícone SVG distinto')

  cleanup()
  render(
    createElement(
      ThemeProvider,
      { theme },
      createElement(StatusChip, {
        label: 'Em Viagem',
        tone: 'info',
        icon: createElement(DirectionsCarOutlinedIcon, { 'data-testid': 'custom-trip-icon' }),
      }),
    ),
  )
  const customChip = screen.getByText('Em Viagem').closest('.MuiChip-root')
  const customSvg = customChip?.querySelector('[data-testid="custom-trip-icon"]')
  assert.ok(customSvg)
  assert.equal(customSvg.getAttribute('aria-hidden'), 'true')
})

test('FormField e FormSelect vinculam rótulos, erros em role="alert" e funcionam com ThemeProvider', async () => {
  const user = userEvent.setup()
  let selected = ''
  render(
    createElement(
      ThemeProvider,
      { theme },
      createElement(
        'div',
        null,
        createElement(FormField, {
          label: 'Placa do veículo',
          value: '',
          onChange: () => {},
          error: 'Informe uma placa válida.',
          required: true,
        }),
        createElement(FormSelect, {
          label: 'Situação',
          value: selected,
          onChange: (value) => { selected = value },
          options: [{ value: 'ACTIVE', label: 'Ativo' }],
          emptyLabel: 'Todas',
          displayEmpty: true,
        }),
      ),
    ),
  )

  const input = screen.getByRole('textbox', { name: /Placa do veículo/ })
  assert.equal(input.getAttribute('aria-invalid'), 'true')
  const alert = screen.getByRole('alert')
  assert.equal(alert.textContent, 'Informe uma placa válida.')
  assert.ok(input.getAttribute('aria-describedby')?.includes(alert.id))

  const combobox = screen.getByRole('combobox', { name: 'Situação' })
  await user.click(combobox)
  await user.click(await screen.findByRole('option', { name: 'Ativo' }))
  assert.equal(selected, 'ACTIVE')
})

test('ConfirmDialog devolve o foco ao botão acionador após fechar por Esc', async () => {
  function Harness({ unmountOnClose = false }) {
    const [open, setOpen] = useState(false)
    return createElement(
      ThemeProvider,
      { theme },
      createElement('button', { type: 'button', onClick: () => setOpen(true) }, 'Abrir confirmação'),
      (!unmountOnClose || open) && createElement(ConfirmDialog, {
        open,
        title: 'Confirmar ação',
        description: 'Deseja prosseguir?',
        confirmLabel: 'Confirmar ação',
        onConfirm: () => setOpen(false),
        onCancel: () => setOpen(false),
      }),
    )
  }

  for (const unmountOnClose of [false, true]) {
    render(createElement(Harness, { unmountOnClose }))
    const user = userEvent.setup()
    const trigger = screen.getByRole('button', { name: 'Abrir confirmação' })
    await user.click(trigger)
    assert.ok(await screen.findByRole('dialog', { name: 'Confirmar ação' }))
    await user.keyboard('{Escape}')
    await waitFor(() => assert.ok(screen.queryByRole('dialog') === null))
    await waitFor(() => assert.ok(document.activeElement === trigger))
    cleanup()
  }
})

test('Topbar mantém contraste acessível na barra e devolve foco ao botão Conta ao fechar menu por Esc', async () => {
  const auth = {
    session: sessionFor('GESTOR'),
    signIn: async () => {},
    logout() {},
    api: async () => new Response(),
    notice: '',
  }
  render(
    createElement(
      ThemeProvider,
      { theme },
      createElement(AuthContext.Provider, { value: auth }, createElement(Topbar)),
    ),
  )

  const user = userEvent.setup()
  const accountBtn = screen.getByRole('button', { name: /^Conta de / })
  await user.click(accountBtn)
  const menu = await screen.findByRole('menu')
  assert.ok(within(menu).getByRole('menuitem', { name: 'Sair' }))

  await user.keyboard('{Escape}')
  await waitFor(() => assert.ok(screen.queryByRole('menu') === null))
  await waitFor(() => assert.ok(document.activeElement === accountBtn))
})
