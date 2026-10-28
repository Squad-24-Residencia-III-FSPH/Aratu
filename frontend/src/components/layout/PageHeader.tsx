import { Box, Typography } from '@mui/material'

export interface PageHeaderProps {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  breadcrumbs?: React.ReactNode
}

/**
 * Cabeçalho semântico e acessível no padrão do Sistema Aratu.
 * Exibe o título principal h1, contexto de navegação e botões primários.
 */
export function PageHeader({ title, subtitle, actions, breadcrumbs }: PageHeaderProps) {
  return (
    <Box
      component="header"
      sx={{
        mb: 3,
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        justifyContent: 'space-between',
        alignItems: { xs: 'flex-start', sm: 'center' },
        gap: 2,
      }}
    >
      <Box>
        {breadcrumbs && <Box sx={{ mb: 1 }}>{breadcrumbs}</Box>}
        <Typography
          component="h1"
          variant="h5"
          sx={{
            fontWeight: 700,
            color: '#0f172a',
            letterSpacing: '-0.02em',
          }}
        >
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5, fontSize: 14 }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      {actions && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          {actions}
        </Box>
      )}
    </Box>
  )
}
