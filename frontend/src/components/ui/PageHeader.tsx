import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { Box, Typography } from '@mui/material'
import type { SxProps, Theme, TypographyProps } from '@mui/material'
import PageActions from './PageActions'

/** Cabeçalho padronizado de página com título `h1`, descrição e ações. */
export interface PageHeaderProps {
  title: string
  eyebrow?: string
  description?: string
  actions?: ReactNode
  titleVariant?: TypographyProps['variant']
  sx?: SxProps<Theme>
  titleSx?: SxProps<Theme>
  descriptionSx?: SxProps<Theme>
}

export default function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  titleVariant = 'h5',
  sx,
  titleSx,
  descriptionSx,
}: PageHeaderProps) {
  useEffect(() => {
    document.title = `${title} | Aratu`
  }, [title])

  return (
    <Box sx={sx ?? { mb: 3 }}>
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
