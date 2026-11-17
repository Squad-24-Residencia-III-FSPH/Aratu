import { useId } from 'react'
import { Box, Button, Checkbox, FormControlLabel, Stack, Typography } from '@mui/material'
import type { ReportColumn } from '../../reports/reportTypes'

/** Seleção de colunas do relatório; rótulos associados e alvos de toque de 44px. */
interface ReportColumnsSelectorProps {
  columns: readonly ReportColumn[]
  selected: readonly string[]
  onChange: (keys: string[]) => void
  disabled?: boolean
}
export default function ReportColumnsSelector({ columns, selected, onChange, disabled }: ReportColumnsSelectorProps) {
  const id = useId()
  return <Box component="fieldset" sx={{ minWidth: 0, border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2, m: 0 }}>
    <Typography component="legend" variant="subtitle2">Colunas visíveis no relatório</Typography>
    <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
      <Button disabled={disabled} onClick={() => onChange(columns.map(column => column.key))}>Marcar todas</Button>
      <Button disabled={disabled} onClick={() => onChange(columns.filter(column => column.defaultSelected).map(column => column.key))}>Restaurar padrão</Button>
    </Stack>
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' } }}>
      {columns.map(column => <FormControlLabel key={column.key} htmlFor={`${id}-${column.key}`} sx={{ m: 0, minHeight: 44 }} label={column.label}
        control={<Checkbox id={`${id}-${column.key}`} disabled={disabled} checked={selected.includes(column.key)}
          slotProps={{ input: { 'aria-invalid': selected.length === 0, 'aria-describedby': selected.length === 0 ? `${id}-error` : undefined } }}
          onChange={(_event, checked) => onChange(checked ? [...selected, column.key] : selected.filter(key => key !== column.key))} />} />)}
    </Box>
    {!selected.length && <Typography id={`${id}-error`} role="alert" color="error">Selecione ao menos uma coluna para gerar ou exportar o relatório.</Typography>}
    <Typography role="status" aria-live="polite" variant="body2">{selected.length} colunas selecionadas.</Typography>
  </Box>
}
