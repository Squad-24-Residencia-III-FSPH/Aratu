import { useEffect, useRef, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, Paper, Stack, Typography } from '@mui/material'
import { PROFILE_HOMES, resolveProfile } from '../../../auth/profiles.ts'
import { useAuth } from '../../../auth/useAuth.ts'
import { accessibleControls } from '../../../components/ui/accessibleControls.ts'
import DataTable from '../../../components/ui/DataTable.tsx'
import FilterBar from '../../../components/ui/FilterBar.tsx'
import { FormField, FormSelect } from '../../../components/ui/FormField.tsx'
import PageHeader from '../../../components/ui/PageHeader.tsx'
import StateFeedback from '../../../components/ui/StateFeedback.tsx'
import { useTripAgenda } from '../../../hooks/useDashboard.ts'
import { canAccessTripAgenda } from '../../../types/dashboard.ts'
import {
  TRIP_AGENDA_FILTER_OPTIONS,
  formatInclusivePeriodLabel,
} from './gestorDashboardData.ts'
import { TRIP_AGENDA_COLUMNS } from './tripAgendaColumns.tsx'

const AGENDA_CONTROLS_SX = {
  ...accessibleControls,
  '& .MuiInputBase-root': { minHeight: 44 },
  '& a:focus-visible, & button:focus-visible': {
    outline: '3px solid',
    outlineColor: 'primary.dark',
    outlineOffset: 2,
  },
} as const

/** Tela dedicada da agenda operacional de viagens do Gestor integrada a `GET /trips`. */
export default function TripAgendaPage() {
  const { api, session } = useAuth()
  const profile = session ? resolveProfile(session.perfil) : null
  const allowed = canAccessTripAgenda(profile)
  const agenda = useTripAgenda(api, allowed)
  const [statusAnnouncement, setStatusAnnouncement] = useState('')
  const todayResetButtonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    const previousTitle = document.title
    document.title = 'Agenda de viagens — Aratu'
    return () => { document.title = previousTitle }
  }, [])

  function handleResetToToday() {
    agenda.resetToToday()
    setStatusAnnouncement('Filtros redefinidos para a agenda de hoje.')
    window.requestAnimationFrame(() => {
      todayResetButtonRef.current?.focus()
    })
  }

  const periodLabel = agenda.from || agenda.to
    ? formatInclusivePeriodLabel(agenda.from || agenda.to, agenda.to || agenda.from)
    : 'Todas as datas'

  const statusDescription = agenda.status === ''
    ? 'Exibindo viagens ativas (agendadas, em andamento, finalizadas e confirmadas; canceladas ocultas por padrão).'
    : agenda.status === 'ALL'
      ? 'Exibindo todas as situações, incluindo canceladas.'
      : 'Filtrado pela situação selecionada.'

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto', ...AGENDA_CONTROLS_SX }}>
      <PageHeader
        breadcrumbs={['Início', 'Viagens', 'Agenda']}
        title="Agenda de viagens"
        titleVariant="h4"
        description="Consulte a programação de viagens pelo horário agendado no fuso operacional (America/Maceio)."
        actions={(
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
            <Button
              ref={todayResetButtonRef}
              type="button"
              variant="outlined"
              onClick={handleResetToToday}
              sx={{ minHeight: 44, minWidth: 44 }}
            >
              Hoje
            </Button>
            <Button
              component={RouterLink}
              to={PROFILE_HOMES.GESTOR.path}
              variant="outlined"
              sx={{ minHeight: 44, minWidth: 44 }}
            >
              Voltar ao início
            </Button>
          </Stack>
        )}
      />

      <Box role="status" aria-live="polite" sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)' }}>
        {statusAnnouncement}
      </Box>

      {!allowed && (
        <StateFeedback
          kind="forbidden"
          title="Acesso restrito"
          description="A consulta da agenda gerencial de viagens é restrita ao perfil Gestor de Frota."
        />
      )}

      {allowed && (
        <>
          <FilterBar label="Filtros da agenda de viagens" sx={{ p: 2, mb: 3, borderRadius: 2 }}>
            <FormField
              label="Data inicial"
              type="date"
              value={agenda.from}
              onChange={(value) => { agenda.setFrom(value); setStatusAnnouncement('') }}
              error={!agenda.validation.valid ? agenda.validation.fromError : undefined}
              helperText="Fuso America/Maceio (inclusiva)"
              sx={{ flex: 1, minWidth: { xs: '100%', sm: 190 } }}
            />
            <FormField
              label="Data final"
              type="date"
              value={agenda.to}
              onChange={(value) => { agenda.setTo(value); setStatusAnnouncement('') }}
              error={!agenda.validation.valid ? agenda.validation.toError : undefined}
              helperText="Data final inclusiva"
              sx={{ flex: 1, minWidth: { xs: '100%', sm: 190 } }}
            />
            <FormSelect
              label="Situação"
              value={agenda.status}
              onChange={(value) => { agenda.setStatus(value); setStatusAnnouncement('') }}
              options={TRIP_AGENDA_FILTER_OPTIONS}
              emptyLabel="Ativas (exceto canceladas)"
              displayEmpty
              sx={{ flex: 1, minWidth: { xs: '100%', sm: 230 } }}
            />
          </FilterBar>

          {!agenda.validation.valid && (
            <StateFeedback
              kind="error"
              title={agenda.validation.summaryTitle}
              description={agenda.validation.summaryDescription}
              actionLabel="Usar data de hoje"
              onAction={handleResetToToday}
            />
          )}

          {agenda.validation.valid && agenda.error && (
            <StateFeedback
              kind="error"
              title="Não foi possível carregar a agenda de viagens."
              description={agenda.error}
              actionLabel="Tentar novamente"
              onAction={agenda.refresh}
            />
          )}

          {agenda.validation.valid && !agenda.error && (
            <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1}
                sx={{ mb: 1.5, justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' } }}
              >
                <Box>
                  <Typography component="h2" variant="h6" sx={{ fontWeight: 700 }}>
                    {agenda.loading
                      ? 'Consultando viagens...'
                      : `${agenda.items.length} ${agenda.items.length === 1 ? 'viagem encontrada' : 'viagens encontradas'}`}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {periodLabel} · {statusDescription}
                  </Typography>
                </Box>
              </Stack>

              <DataTable
                caption={`Agenda de viagens para ${periodLabel}`}
                columns={TRIP_AGENDA_COLUMNS}
                rows={agenda.items}
                rowKey={(trip) => trip.id}
                busy={agenda.loading}
                minWidth={760}
                loadingContent={<StateFeedback kind="loading" title="Carregando agenda de viagens..." />}
                emptyContent={(
                  <StateFeedback
                    kind="empty"
                    title="Nenhuma viagem encontrada para este recorte."
                    description="Ajuste as datas ou o filtro de situação para consultar outros agendamentos."
                    actionLabel="Usar data de hoje"
                    onAction={handleResetToToday}
                    centered
                  />
                )}
                paperSx={{ border: 0, boxShadow: 'none' }}
              />
            </Paper>
          )}
        </>
      )}
    </Box>
  )
}
