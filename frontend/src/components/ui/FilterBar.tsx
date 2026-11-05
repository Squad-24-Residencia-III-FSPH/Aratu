import type { ReactNode } from 'react'
import { Paper, Stack } from '@mui/material'

export interface FilterBarProps {
  label: string
  children: ReactNode
}

/** Agrupador acessível de filtros, com quebra responsiva e rótulo de região. */
export default function FilterBar({ label, children }: FilterBarProps) {
  return (
    <Paper
      component="section"
      aria-label={label}
      variant="outlined"
      sx={{ p: 2, mb: 3, borderRadius: 2 }}
    >
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        useFlexGap
        sx={{ alignItems: { md: 'center' }, flexWrap: 'wrap' }}
      >
        {children}
      </Stack>
    </Paper>
  )
}
