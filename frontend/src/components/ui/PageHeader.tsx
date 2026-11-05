import type { ReactNode } from 'react'
import { Box, Breadcrumbs, Typography } from '@mui/material'

/** Cabeçalho padronizado de página com título `h1`, trilha e ações. */
export interface PageHeaderProps {
  title: string
  breadcrumbs?: readonly string[]
  description?: string
  actions?: ReactNode
}

export default function PageHeader({ title, breadcrumbs, description, actions }: PageHeaderProps) {
  return (
    <Box sx={{ mb: 3 }}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <Breadcrumbs aria-label="Navegação estrutural" sx={{ mb: 1 }}>
          {breadcrumbs.map((item, index) => (
            <Typography
              key={item}
              variant="body2"
              color={index === breadcrumbs.length - 1 ? 'text.primary' : 'text.secondary'}
            >
              {item}
            </Typography>
          ))}
        </Breadcrumbs>
      )}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography component="h1" variant="h5" sx={{ fontWeight: 700 }}>
            {title}
          </Typography>
          {description && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {description}
            </Typography>
          )}
        </Box>
        {actions && <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>{actions}</Box>}
      </Box>
    </Box>
  )
}
