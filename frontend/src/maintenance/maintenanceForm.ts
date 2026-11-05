import type { MaintenanceItem } from './maintenanceTypes.ts'

function decimal(value: string, scale: number): string {
  const normalized = value.trim().replace(',', '.')
  const pattern = scale === 2 ? /^(0|[1-9]\d*)(?:\.\d{1,2})?$/ : /^(0|[1-9]\d*)(?:\.\d{1,3})?$/
  if (!pattern.test(normalized)) throw new Error(scale === 2
    ? 'Informe valores não negativos com até duas casas decimais.' : 'Informe quantidade positiva com até três casas decimais.')
  return normalized
}
function monetary(value: string): string {
  const [whole, fraction = ''] = decimal(value, 2).split('.')
  return `${whole}.${fraction.padEnd(2, '0')}`
}
/** Associa cada erro ao campo da linha para permitir correção com leitor de tela. */
export function maintenanceItemErrors(item: MaintenanceItem): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!item.description.trim()) errors.description = 'Informe a descrição.'
  if (item.kind === 'PART') {
    try {
      if (Number(decimal(item.quantity, 3)) <= 0) errors.quantity = 'Informe quantidade maior que zero.'
    } catch { errors.quantity = 'Informe quantidade positiva com até três casas decimais.' }
    try { monetary(item.unitPrice) } catch { errors.unitPrice = 'Informe valor não negativo com até duas casas decimais.' }
  } else {
    try { monetary(item.amount) } catch { errors.amount = 'Informe valor não negativo com até duas casas decimais.' }
  }
  return errors
}
/** Converte apenas a entrada localizada; cálculo e arredondamento pertencem ao servidor. */
export function normalizeFormItems(items: readonly MaintenanceItem[]): MaintenanceItem[] {
  return items.map(item => {
    const description = item.description.trim()
    if (!description) throw new Error('Informe a descrição de cada peça ou serviço.')
    if (item.kind === 'LABOR') return { kind: 'LABOR', description, amount: monetary(item.amount) }
    const quantity = decimal(item.quantity, 3)
    if (Number(quantity) <= 0) throw new Error('A quantidade de cada peça deve ser maior que zero.')
    return { kind: 'PART', description, quantity, unitPrice: monetary(item.unitPrice) }
  })
}
export function parseOdometer(value: string): number | null {
  if (!value.trim()) return null
  if (!/^\d+$/.test(value) || Number(value) > 2147483647) throw new Error('Informe quilometragem inteira entre zero e 2.147.483.647.')
  return Number(value)
}

/** Reutiliza a validação do payload para associar o erro ao campo e removê-lo após correção. */
export function getOdometerError(value: string): string | undefined {
  try { parseOdometer(value) } catch (failure) {
    return failure instanceof Error ? failure.message : 'Confira a quilometragem informada.'
  }
  return undefined
}
