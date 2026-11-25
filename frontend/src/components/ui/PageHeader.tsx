import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { Box, Breadcrumbs, Link, Typography } from '@mui/material'
import type { SxProps, Theme, TypographyProps } from '@mui/material'
import PageActions from './PageActions'

export interface PageBreadcrumb {
  label: string
  to?: string
}

/** Cabeçalho padronizado de página com título `h1`, trilha e ações. */
export interface PageHeaderProps {
  title: string
  breadcrumbs?: readonly (string | PageBreadcrumb)[]
  eyebrow?: string
  description?: string
  actions?: ReactNode
  titleVariant?: TypographyProps['variant']
  sx?: SxProps<Theme>
  titleSx?: SxProps<Theme>
  descriptionSx?: SxProps<Theme>
  breadcrumbsSx?: SxProps<Theme>
}

export default function PageHeader({
  title,
  breadcrumbs,
  eyebrow,
  description,
  actions,
  titleVariant = 'h5',
  sx,
  titleSx,
  descriptionSx,
  breadcrumbsSx,
}: PageHeaderProps) {
  useEffect(() => {
    document.title = `${title} | Aratu`
  }, [title])

  return (
    <Box sx={sx ?? { mb: 3 }}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <Breadcrumbs aria-label="Navegação estrutural" sx={breadcrumbsSx ?? { mb: 1 }}>
          {breadcrumbs.map((item, index) => {
            const label = typeof item === 'string' ? item : item.label
            const explicitPath = typeof item === 'string' ? undefined : item.to
            const path = explicitPath
            const current = index === breadcrumbs.length - 1
            if (path && !current) {
              return <Link key={`${label}-${index}`} href={`#${path}`} underline="hover" color="text.secondary" variant="body2">{label}</Link>
            }
            return (
              <Typography
                key={`${label}-${index}`}
                variant="body2"
                color={current ? 'text.primary' : 'text.secondary'}
                aria-current={current ? 'page' : undefined}
              >
                {label}
              </Typography>
            )
          })}
        </Breadcrumbs>
      )}
      {eyebrow && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
          {eyebrow}
        </Typography>
      )}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2, minWidth: 0 }}>
        <Box sx={{ minWidth: 0, flex: '1 1 auto' }}>
          <Typography component="h1" variant={titleVariant} sx={[{ fontWeight: 700, fontSize: { xs: '1.5rem', sm: '1.75rem' }, lineHeight: 1.25 }, ...(Array.isArray(titleSx) ? titleSx : titleSx ? [titleSx] : [])]}>
            {title}
          </Typography>
          {description && (
            <Typography variant="body2" color="text.secondary" sx={[{ mt: 0.5 }, ...(Array.isArray(descriptionSx) ? descriptionSx : descriptionSx ? [descriptionSx] : [])]}>
              {description}
            </Typography>
          )}
        </Box>
        {actions && <PageActions>{actions}</PageActions>}
      </Box>
    </Box>
  )
}
