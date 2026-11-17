import { Box, Button, Paper, Stack, Typography } from '@mui/material'
import { FormField } from '../../../components/ui/FormField'
import type { MaintenanceItem, PricedItem } from '../../../maintenance/maintenanceTypes'
import { formatMoney } from '../../../maintenance/maintenanceTypes'
import { maintenanceItemErrors } from '../../../maintenance/maintenanceForm'

interface ItemsEditorProps {
  /** Diferencia orçamento de execução também nos rótulos acessíveis. */
  label: string
  items: readonly MaintenanceItem[]
  onChange: (items: MaintenanceItem[]) => void
  disabled?: boolean
  validate?: boolean
}
/** Usa campos compartilhados e permite peças fracionárias sem impor periodicidade de troca. */
export function ItemsEditor({ label, items, onChange, disabled, validate }: ItemsEditorProps) {
  function change(index: number, patch: Partial<MaintenanceItem>) {
    onChange(items.map((item, position) => position === index ? { ...item, ...patch } as MaintenanceItem : item))
  }
  return <Stack spacing={2}>
    <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 700 }}>{label}</Typography>
    {items.length === 0 && <Typography variant="body2">Nenhuma peça ou serviço informado.</Typography>}
    {items.map((item, index) => {
      const errors = validate ? maintenanceItemErrors(item) : {}
      return <Paper key={index} variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={2}>
        <FormField label={`${label} — ${item.kind === 'PART' ? 'peça' : 'serviço'} ${index + 1}`} value={item.description}
          onChange={description => change(index, { description })} error={errors.description} required disabled={disabled} />
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          {item.kind === 'PART' ? <>
            <FormField label={`Quantidade ${index + 1}`} value={item.quantity} onChange={quantity => change(index, { quantity })}
              helperText="Até três casas decimais. Ex.: 1,500" error={errors.quantity} required disabled={disabled} />
            <FormField label={`Valor unitário (R$) ${index + 1}`} value={item.unitPrice} onChange={unitPrice => change(index, { unitPrice })}
              helperText="Ex.: 18,75" error={errors.unitPrice} required disabled={disabled} />
          </> : <FormField label={`Valor do serviço (R$) ${index + 1}`} value={item.amount} onChange={amount => change(index, { amount })}
            helperText="Ex.: 40,00" error={errors.amount} required disabled={disabled} />}
        </Stack>
        <Button color="error" disabled={disabled} onClick={() => onChange(items.filter((_, position) => position !== index))}
          aria-label={`Remover ${item.kind === 'PART' ? 'peça' : 'serviço'} ${index + 1} de ${label}`}>Remover item {index + 1}</Button>
      </Stack>
    </Paper>})}
    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
      <Button variant="outlined" disabled={disabled} onClick={() => onChange([...items, { kind: 'PART', description: '', quantity: '1', unitPrice: '0,00' }])}>Adicionar peça</Button>
      <Button variant="outlined" disabled={disabled} onClick={() => onChange([...items, { kind: 'LABOR', description: '', amount: '0,00' }])}>Adicionar serviço</Button>
    </Box>
    <Typography variant="body2">Os subtotais e o total serão calculados ao salvar.</Typography>
  </Stack>
}

interface ItemsSummaryProps {
  /** Relação recebida do servidor; nulo preserva composição desconhecida de ordens legadas. */
  label: string
  items: readonly PricedItem[] | null
  total: string | null
}
export function ItemsSummary({ label, items, total }: ItemsSummaryProps) {
  return <Box>
    <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 700 }}>{label}: {formatMoney(total)}</Typography>
    {items === null ? <Typography variant="body2">Detalhamento não informado.</Typography>
      : items.length === 0 ? <Typography variant="body2">Relação confirmada sem itens.</Typography>
        : <Box component="ul" sx={{ pl: 3 }}>{items.map((item, index) => <li key={index}>
          {item.description} — {item.kind === 'PART' ? `${item.quantity} × ${formatMoney(item.unitPrice)} = ` : ''}{formatMoney(item.subtotal)}
        </li>)}</Box>}
  </Box>
}