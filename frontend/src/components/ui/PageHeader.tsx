import type { ReactNode } from 'react'
import { Box, Breadcrumbs, Typography } from '@mui/material'
import type { SxProps, Theme, TypographyProps } from '@mui/material'

/** Cabeçalho padronizado de página com título `h1`, trilha e ações. */
export interface PageHeaderProps {
  title: string
  breadcrumbs?: readonly string[]
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
  return (
    <Box sx={sx ?? { mb: 3 }}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <Breadcrumbs aria-label="Navegação estrutural" sx={breadcrumbsSx ?? { mb: 1 }}>
          {breadcrumbs.map((item, index) => (
            <Typography
              key={item}
              variant="body2"
              color={index === breadcrumbs.length - 1 ? 'text.primary' : 'text.secondary'}
              aria-current={index === breadcrumbs.length - 1 ? 'page' : undefined}
            >
              {item}
            </Typography>
          ))}
        </Breadcrumbs>
      )}
      {eyebrow && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
          {eyebrow}
        </Typography>
      )}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography component="h1" variant={titleVariant} sx={[{ fontWeight: 700 }, ...(Array.isArray(titleSx) ? titleSx : titleSx ? [titleSx] : [])]}>
            {title}
          </Typography>
          {description && (
            <Typography variant="body2" color="text.secondary" sx={[{ mt: 0.5 }, ...(Array.isArray(descriptionSx) ? descriptionSx : descriptionSx ? [descriptionSx] : [])]}>
              {description}
            </Typography>
          )}
        </Box>
        {actions && <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>{actions}</Box>}
      </Box>
    </Box>
  )
}
