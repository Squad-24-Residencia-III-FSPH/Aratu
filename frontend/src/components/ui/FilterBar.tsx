import type { ReactNode } from 'react'
import { Paper, Stack } from '@mui/material'
import type { SxProps, Theme } from '@mui/material'

export interface FilterBarProps {
  label: string
  children: ReactNode
  sx?: SxProps<Theme>
}

/** Agrupador acessível de filtros, com quebra responsiva e rótulo de região. */
export default function FilterBar({ label, children, sx }: FilterBarProps) {
  return (
    <Paper
      component="section"
      aria-label={label}
      variant="outlined"
      sx={[{ width: '100%', minWidth: 0, boxSizing: 'border-box', p: 2, mb: 3, borderRadius: 2 }, ...(Array.isArray(sx) ? sx : sx ? [sx] : [])]}
    >
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        useFlexGap
        sx={{
          width: '100%',
          minWidth: 0,
          alignItems: { md: 'flex-end' },
          flexWrap: 'wrap',
          '& > *': { minWidth: 0, maxWidth: '100%' },
          '& > .MuiButton-root': { flex: '0 0 auto', whiteSpace: 'nowrap' },
        }}
      >
        {children}
      </Stack>
    </Paper>
  )
}
