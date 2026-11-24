import type { ReactNode } from 'react'
import { Box } from '@mui/material'

export interface PageActionsProps {
  children: ReactNode
}

/** Agrupa ações da página e transforma os botões em alvos largos no celular. */
export default function PageActions({ children }: PageActionsProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: { xs: 'stretch', sm: 'flex-end' },
        flexWrap: 'wrap',
        gap: 1,
        width: { xs: '100%', sm: 'auto' },
        minWidth: 0,
        maxWidth: '100%',
        '& > *': { minWidth: 0, maxWidth: '100%' },
        '& > .MuiButton-root': { flex: { xs: '1 1 100%', sm: '0 0 auto' } },
      }}
    >
      {children}
    </Box>
  )
}
