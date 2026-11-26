import { Box, Card, CardContent, Skeleton, Typography } from '@mui/material'
import type { ReactNode } from 'react'

export type StatCardTone = 'neutral' | 'info' | 'success' | 'warning' | 'error'

/** Propriedades de um indicador resumido do painel. */
export interface StatCardProps {
  /** Rótulo em português do indicador. */
  title: string
  /** Valor resumido exibido em destaque. */
  value: string | number
  /** Complemento que contextualiza o valor. */
  description?: string
  /** Ícone decorativo; o texto do indicador permanece disponível sem depender dele. */
  icon?: ReactNode
  /** Cor semântica do indicador; neutra por padrão para reduzir laranja decorativo. */
  tone?: StatCardTone
  /** Mantém o carregamento independente dos demais cards do painel. */
  loading?: boolean
}

/** Card de métrica visual que conserva o rótulo e o valor durante o carregamento. */
const ICON_TONES: Readonly<Record<StatCardTone, { background: string; color: string }>> = {
  neutral: { background: '#f1f5f9', color: '#334155' },
  info: { background: '#eff6ff', color: '#1e40af' },
  success: { background: '#f0fdf4', color: '#166534' },
  warning: { background: '#fffbeb', color: '#854d0e' },
  error: { background: '#fef2f2', color: '#991b1b' },
}

export default function StatCard({ title, value, description, icon, tone = 'neutral', loading = false }: StatCardProps) {
  return (
    <Card
      variant="outlined"
      aria-busy={loading}
      sx={{
        p: 0,
        border: 0,
        borderRadius: 2,
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        height: '100%',
      }}
    >
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography component="h2" variant="body2" sx={{ color: '#64748b', fontSize: '0.85rem' }}>
              {title}
            </Typography>
            {loading
              ? <Skeleton aria-label={`Carregando ${title.toLocaleLowerCase('pt-BR')}`} width={76} height={40} />
              : <Typography variant="h4" sx={{ color: '#1e293b', fontWeight: 700, lineHeight: 1.2 }}>
                  {value}
                </Typography>}
            {!loading && description && (
              <Typography variant="caption" sx={{ color: '#64748b' }}>{description}</Typography>
            )}
          </Box>
          {icon && (
            <Box aria-hidden="true" sx={{
              bgcolor: ICON_TONES[tone].background,
              borderRadius: 2,
              color: ICON_TONES[tone].color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: 44,
              minHeight: 44,
              flexShrink: 0,
            }}>
              {icon}
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  )
}
