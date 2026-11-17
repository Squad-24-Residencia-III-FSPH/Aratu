import { createContext, useContext, useId } from 'react'
import type { ReactNode } from 'react'
import { Box, Card, CardActions, CardContent, Typography } from '@mui/material'

interface EntityCardContextValue {
  titleId: string
  statusId: string
}

const EntityCardContext = createContext<EntityCardContextValue | null>(null)

function useEntityCard(part: string): EntityCardContextValue {
  const context = useContext(EntityCardContext)
  if (!context) throw new Error(`EntityCard.${part} deve ser usado dentro de EntityCard.`)
  return context
}

export interface EntityCardProps {
  children: ReactNode
}

/**
 * Card composto para itens de lista operacional (viagens do motorista, veículos, chamados).
 *
 * Acessibilidade (WCAG 2.2 AA): o `<article>` é nomeado pelo título (`aria-labelledby`) e
 * descrito pela situação (`aria-describedby`), ambos ligados por `useId()`. Não faz I/O
 * nem conhece regras de domínio; quem usa decide o conteúdo e as ações.
 */
export function EntityCard({ children }: EntityCardProps) {
  const uniqueId = useId()
  const titleId = `${uniqueId}-title`
  const statusId = `${uniqueId}-status`

  return (
    <EntityCardContext.Provider value={{ titleId, statusId }}>
      <Card component="article" variant="outlined" aria-labelledby={titleId} aria-describedby={statusId} sx={{ mb: 1.5 }}>
        {children}
      </Card>
    </EntityCardContext.Provider>
  )
}

export interface EntityCardHeaderProps {
  /** Título do item; nomeia o card para leitores de tela e quebra linha quando longo. */
  title: string
  /** Nível de cabeçalho do título; use o nível seguinte ao da seção que contém a lista. */
  headingComponent?: 'h2' | 'h3' | 'h4'
  /** Conteúdo auxiliar à direita do título (ex.: chip de situação). */
  children?: ReactNode
}

function EntityCardHeader({ title, headingComponent = 'h3', children }: EntityCardHeaderProps) {
  const { titleId } = useEntityCard('Header')
  return (
    <Box component="header" sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 1, px: 2, pt: 2 }}>
      <Typography id={titleId} component={headingComponent} variant="subtitle1" sx={{ fontWeight: 600, minWidth: 0, overflowWrap: 'anywhere' }}>
        {title}
      </Typography>
      {children}
    </Box>
  )
}

export interface EntityCardStatusProps {
  /** Indicador de situação; deve trazer texto, não apenas cor (WCAG 1.4.1). */
  children: ReactNode
}

function EntityCardStatus({ children }: EntityCardStatusProps) {
  const { statusId } = useEntityCard('Status')
  return <Box id={statusId}>{children}</Box>
}

function EntityCardBody({ children }: { children: ReactNode }) {
  useEntityCard('Body')
  return <CardContent sx={{ py: 1.5, overflowWrap: 'anywhere' }}>{children}</CardContent>
}

function EntityCardActions({ children }: { children: ReactNode }) {
  useEntityCard('Actions')
  return <CardActions sx={{ px: 2, pb: 2, pt: 0, flexWrap: 'wrap', gap: 1 }}>{children}</CardActions>
}

EntityCard.Header = EntityCardHeader
EntityCard.Status = EntityCardStatus
EntityCard.Body = EntityCardBody
EntityCard.Actions = EntityCardActions
