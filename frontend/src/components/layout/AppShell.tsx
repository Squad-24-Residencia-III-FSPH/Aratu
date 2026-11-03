import { useId } from 'react'
import { Box, Button, Typography, Link as MuiLink } from '@mui/material'
import { useAuth } from '../../auth/useAuth'
import { navigate, usePathname } from '../../routing/navigation'

export interface AppShellProps {
  children: React.ReactNode
}

/**
 * Shell institucional global fiel ao Figma da Squad 24:
 * TopBar azul royal institucional com busca central e avatar do Gestor,
 * Sidebar padronizada com seções OPERAÇÃO, FROTA e CONTROLE e badges de notificação.
 */
export function AppShell({ children }: AppShellProps) {
  const { session, logout } = useAuth()
  const currentPath = usePathname()

  // Persona Gestor de Frota (Marcos Vieira / Vitor Guilherme)
  const userName = session?.nome || 'Marcos Vieira'
  const userInitials = userName
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()

  const isScheduleActive =
    currentPath.includes('agendar-viagem') || currentPath.includes('preview/agendamento')

  const searchInputId = useId()

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', bgcolor: '#f4f6f8' }}>
      {/* Link de atalho acessível para saltar navegação (WCAG 2.4.1) */}
      <MuiLink
        href="#main-content"
        sx={{
          position: 'absolute',
          top: -999,
          left: 16,
          zIndex: 9999,
          bgcolor: '#9a3412',
          color: '#ffffff',
          px: 2,
          py: 1,
          borderRadius: 1,
          fontWeight: 600,
          '&:focus': { top: 16, outline: '2px solid #ffffff' },
        }}
      >
        Pular para o conteúdo principal
      </MuiLink>

      {/* TOPBAR LARANJA INSTITUCIONAL SQUAD 24 */}
      <Box
        component="header"
        sx={{
          minHeight: 56,
          height: { xs: 56, md: 62 },
          bgcolor: '#ea580c',
          backgroundImage: 'linear-gradient(90deg, #9a3412 0%, #ea580c 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: { xs: 1.5, sm: 2 },
          position: 'sticky',
          top: 0,
          zIndex: 1100,
          boxShadow: '0 2px 6px rgba(124, 45, 18, 0.25)',
        }}
      >
        {/* Esquerda: Menu hambúrguer + Logomarca Estilizada Oficial do Aratu (Squad 24) */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 1.5 } }}>
          <Box
            component="button"
            aria-label="Abrir ou recolher menu lateral"
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: 'none',
              background: 'transparent',
              color: '#ffffff',
              cursor: 'pointer',
              p: 0.5,
              borderRadius: 1,
              '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.14)' },
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </Box>

          <Box
            component="button"
            onClick={() => navigate(currentPath.includes('preview') ? '/preview/agendamento' : '/frota/inicio')}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.25,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              textAlign: 'left',
              p: 0,
            }}
          >
            {/* Silhueta Vetorial (SVG) do Crustáceo Aratu em Tons Marrom e Terracota */}
            <Box
              sx={{
                width: 38,
                height: 38,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: 'rgba(255, 255, 255, 0.15)',
                borderRadius: 2,
                p: 0.5,
                border: '1px solid rgba(255, 255, 255, 0.25)',
                flexShrink: 0,
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.12)',
              }}
            >
              <svg
                viewBox="0 0 100 80"
                width="100%"
                height="100%"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
                style={{ overflow: 'visible' }}
              >
                {/* Hastes e Olhos em Laranja */}
                <line x1="43" y1="28" x2="38" y2="12" stroke="#7c2d12" strokeWidth="2.8" strokeLinecap="round" />
                <line x1="57" y1="28" x2="62" y2="12" stroke="#7c2d12" strokeWidth="2.8" strokeLinecap="round" />
                <circle cx="38" cy="12" r="5" fill="#f97316" stroke="#431407" strokeWidth="1.2" />
                <circle cx="62" cy="12" r="5" fill="#f97316" stroke="#431407" strokeWidth="1.2" />
                <circle cx="36.5" cy="10.5" r="1.5" fill="#ffffff" />
                <circle cx="60.5" cy="10.5" r="1.5" fill="#ffffff" />

                {/* Garra Esquerda */}
                <path
                  d="M 22 36 C 14 30 10 24 10 16 C 10 10 16 8 20 8 C 22 13 20 18 17 21 C 21 21 28 27 32 32 Z"
                  fill="#7c2d12"
                />
                <path
                  d="M 12 14 C 6 12 2 15 2 20 C 4 28 12 34 20 38 L 18 33 C 12 30 8 26 8 20 C 8 16 10 15 12 14 Z"
                  fill="#9a3412"
                />

                {/* Garra Direita */}
                <path
                  d="M 78 36 C 86 30 90 24 90 16 C 90 10 84 8 80 8 C 78 13 80 18 83 21 C 79 21 72 27 68 32 Z"
                  fill="#7c2d12"
                />
                <path
                  d="M 88 14 C 94 12 98 15 98 20 C 96 28 88 34 80 38 L 82 33 C 88 30 92 26 92 20 C 92 16 90 15 88 14 Z"
                  fill="#9a3412"
                />

                {/* Patas Esquerda (3 patas articuladas) */}
                <path
                  d="M 22 44 C 12 45 6 52 3 60 C 2 64 3 67 4 69"
                  stroke="#7c2d12"
                  strokeWidth="3.2"
                  strokeLinecap="round"
                  fill="none"
                />
                <path
                  d="M 24 49 C 15 54 11 61 10 68 C 9 71 11 74 12 76"
                  stroke="#9a3412"
                  strokeWidth="3"
                  strokeLinecap="round"
                  fill="none"
                />
                <path
                  d="M 28 54 C 20 60 17 68 18 75 C 19 77 21 79 23 80"
                  stroke="#7c2d12"
                  strokeWidth="2.8"
                  strokeLinecap="round"
                  fill="none"
                />

                {/* Patas Direita (3 patas articuladas) */}
                <path
                  d="M 78 44 C 88 45 94 52 97 60 C 98 64 97 67 96 69"
                  stroke="#7c2d12"
                  strokeWidth="3.2"
                  strokeLinecap="round"
                  fill="none"
                />
                <path
                  d="M 76 49 C 85 54 89 61 90 68 C 91 71 89 74 88 76"
                  stroke="#9a3412"
                  strokeWidth="3"
                  strokeLinecap="round"
                  fill="none"
                />
                <path
                  d="M 72 54 C 80 60 83 68 82 75 C 81 77 79 79 77 80"
                  stroke="#7c2d12"
                  strokeWidth="2.8"
                  strokeLinecap="round"
                  fill="none"
                />

                {/* Carapaça em Marrom e Terracota */}
                <path
                  d="M 20 40 C 20 28 35 24 50 24 C 65 24 80 28 80 40 C 80 52 65 58 50 58 C 35 58 20 52 20 40 Z"
                  fill="#431407"
                />
                <path
                  d="M 24 40 C 24 30 36 26 50 26 C 64 26 76 30 76 40 C 76 50 64 54 50 54 C 36 54 24 50 24 40 Z"
                  fill="#7c2d12"
                />
                <ellipse cx="50" cy="40" rx="19" ry="9" fill="#9a3412" />

                {/* Pista Central / Rodovia em Laranja Institucional */}
                <polygon points="46,32 54,32 58,48 42,48" fill="#ea580c" />
                <rect x="49" y="34" width="2" height="4" fill="#ffffff" rx="0.5" />
                <rect x="49" y="41" width="2" height="5" fill="#ffffff" rx="0.5" />
              </svg>
            </Box>

            {/* Tipografia e Selos Institucionais Oficiais */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                <Typography variant="body1" sx={{ fontWeight: 900, color: '#ffffff', lineHeight: 1.1, fontSize: 16 }}>
                  Aratu
                </Typography>

                {/* Selo: S24 */}
                <Box
                  component="span"
                  sx={{
                    bgcolor: '#431407',
                    color: '#ffedd5',
                    fontSize: 10,
                    fontWeight: 800,
                    px: 0.7,
                    py: 0.15,
                    borderRadius: 0.8,
                    border: '1px solid rgba(255, 237, 213, 0.35)',
                    letterSpacing: '0.04em',
                    lineHeight: 1.2,
                  }}
                >
                  S24
                </Box>

                <Typography
                  component="span"
                  sx={{
                    fontWeight: 500,
                    color: 'rgba(255, 255, 255, 0.9)',
                    fontSize: 13,
                    display: { xs: 'none', md: 'inline' },
                  }}
                >
                  Gestão de Frota
                </Typography>
              </Box>

              {/* Selos de Subtexto Exigidos: "FSPH · SVO Sergipe" e "Residência III · Unit & Porto Digital" */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'nowrap' }}>
                <Typography
                  component="span"
                  sx={{
                    fontSize: { xs: 10, sm: 11 },
                    color: 'rgba(255, 255, 255, 0.9)',
                    fontWeight: 600,
                    lineHeight: 1,
                  }}
                >
                  FSPH · SVO Sergipe
                </Typography>
                <Box
                  component="span"
                  sx={{
                    width: 3,
                    height: 3,
                    bgcolor: 'rgba(255, 255, 255, 0.6)',
                    borderRadius: '50%',
                    display: { xs: 'none', sm: 'inline-block' },
                  }}
                />
                <Typography
                  component="span"
                  sx={{
                    fontSize: { xs: 9, sm: 10 },
                    color: 'rgba(255, 255, 255, 0.8)',
                    fontWeight: 500,
                    lineHeight: 1,
                    display: { xs: 'none', sm: 'inline' },
                  }}
                >
                  Residência III · Unit & Porto Digital
                </Typography>
              </Box>
            </Box>
          </Box>
        </Box>

        {/* Centro: Barra de Busca Translúcida */}
        <Box
          sx={{
            display: { xs: 'none', md: 'flex' },
            alignItems: 'center',
            bgcolor: 'rgba(0, 0, 0, 0.15)',
            border: '1px solid rgba(255, 255, 255, 0.18)',
            borderRadius: 1.5,
            px: 1.75,
            py: 0.6,
            width: 380,
            gap: 1.2,
          }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" opacity="0.8">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            id={searchInputId}
            type="text"
            placeholder="Pesquisar..."
            aria-label="Pesquisar na frota"
            style={{
              border: 'none',
              background: 'transparent',
              outline: 'none',
              color: '#ffffff',
              fontSize: 14,
              width: '100%',
            }}
          />
        </Box>

        {/* Direita: Notificações + Avatar do Usuário */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5 }}>
          {/* Sino com badge de notificação */}
          <Box
            component="button"
            aria-label="Notificações do sistema (1 nova notificação)"
            sx={{
              position: 'relative',
              background: 'transparent',
              border: 'none',
              color: '#ffffff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              p: 0.5,
              borderRadius: 1,
              '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.12)' },
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
            </svg>
            <Box
              sx={{
                position: 'absolute',
                top: 3,
                right: 3,
                width: 8,
                height: 8,
                bgcolor: '#ef4444',
                borderRadius: '50%',
                border: '1.5px solid #ea580c',
              }}
            />
          </Box>

          {/* Avatar e Perfil */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
            <Box
              sx={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                bgcolor: 'rgba(255, 255, 255, 0.25)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 12,
                border: '1px solid rgba(255, 255, 255, 0.35)',
              }}
            >
              {userInitials}
            </Box>
            <Box sx={{ display: { xs: 'none', sm: 'block' }, textAlign: 'left' }}>
              <Typography variant="body2" sx={{ fontWeight: 700, color: '#ffffff', lineHeight: 1.1, fontSize: 13 }}>
                {userName}
              </Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: 11, display: 'block' }}>
                Gestor de Frota ▾
              </Typography>
            </Box>
            <Button
              variant="text"
              size="small"
              onClick={logout}
              sx={{
                color: '#ffffff',
                fontSize: 12,
                minHeight: 28,
                p: 0.5,
                opacity: 0.85,
                '&:hover': { opacity: 1, bgcolor: 'rgba(255, 255, 255, 0.12)' },
              }}
            >
              Sair
            </Button>
          </Box>
        </Box>
      </Box>

      {/* ESTRUTURA PRINCIPAL (Sidebar + Conteúdo) */}
      <Box sx={{ display: 'flex', flex: 1 }}>
        {/* SIDEBAR FIEL AO FIGMA */}
        <Box
          component="nav"
          aria-label="Navegação principal"
          sx={{
            width: { xs: 68, md: 230 },
            flexShrink: 0,
            bgcolor: '#ffffff',
            borderRight: '1px solid #e5e7eb',
            py: 2,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Header da Sidebar */}
          <Box sx={{ px: 2.5, mb: 2, display: { xs: 'none', md: 'block' } }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#111827', fontSize: 13 }}>
              Gestor de Frota
            </Typography>
            <Typography variant="caption" sx={{ color: '#9ca3af', fontSize: 12 }}>
              Gestão de Frota
            </Typography>
          </Box>

          {/* Item Início */}
          <Box sx={{ px: 1, mb: 1.5 }}>
            <Box
              component="button"
              onClick={() => navigate(currentPath.includes('preview') ? '/preview/agendamento' : '/frota/inicio')}
              sx={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                px: 1.5,
                py: 1,
                border: 'none',
                background: 'transparent',
                borderRadius: 1.5,
                cursor: 'pointer',
                color: '#374151',
                fontSize: 14,
                fontWeight: 500,
                textAlign: 'left',
                '&:hover': { bgcolor: '#f9fafb', color: '#111827' },
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              <Box component="span" sx={{ display: { xs: 'none', md: 'inline' } }}>Início</Box>
            </Box>
          </Box>

          {/* SEÇÃO: OPERAÇÃO */}
          <Box sx={{ px: 2.5, mb: 1, mt: 1, display: { xs: 'none', md: 'block' } }}>
            <Typography variant="caption" sx={{ color: '#9ca3af', fontWeight: 700, letterSpacing: '0.05em', fontSize: 11 }}>
              OPERAÇÃO
            </Typography>
          </Box>

          <Box sx={{ px: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {/* Solicitações (com badge 7) */}
            <Box
              component="button"
              onClick={() => navigate(currentPath.includes('preview') ? '/preview/agendamento' : '/frota/solicitacoes')}
              sx={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                px: 1.5,
                py: 1,
                border: 'none',
                background: 'transparent',
                borderRadius: 1.5,
                cursor: 'pointer',
                color: '#374151',
                fontSize: 14,
                fontWeight: 500,
                textAlign: 'left',
                '&:hover': { bgcolor: '#f9fafb', color: '#111827' },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                </svg>
                <Box component="span" sx={{ display: { xs: 'none', md: 'inline' } }}>Solicitações</Box>
              </Box>
              <Box
                component="span"
                sx={{
                  bgcolor: '#fee2e2',
                  color: '#dc2626',
                  fontSize: 11,
                  fontWeight: 700,
                  px: 0.8,
                  py: 0.2,
                  borderRadius: 10,
                  display: { xs: 'none', md: 'inline-block' },
                }}
              >
                7
              </Box>
            </Box>

            {/* Viagens / Agendamento (Item Selecionado) */}
            <Box
              component="button"
              onClick={() => navigate(currentPath.includes('preview') ? '/preview/agendamento' : '/frota/agendar-viagem/123')}
              sx={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                px: 1.5,
                py: 1,
                border: 'none',
                bgcolor: isScheduleActive ? '#fff7ed' : 'transparent',
                borderRight: isScheduleActive ? '3px solid #ea580c' : '3px solid transparent',
                borderRadius: isScheduleActive ? '6px 0 0 6px' : 1.5,
                cursor: 'pointer',
                color: isScheduleActive ? '#c2410c' : '#374151',
                fontSize: 14,
                fontWeight: isScheduleActive ? 700 : 500,
                textAlign: 'left',
                '&:hover': { bgcolor: isScheduleActive ? '#fff7ed' : '#f9fafb' },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <polyline points="17 1 21 5 17 9" />
                  <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                  <polyline points="7 23 3 19 7 15" />
                  <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                </svg>
                <Box component="span" sx={{ display: { xs: 'none', md: 'inline' } }}>Viagens (Agenda)</Box>
              </Box>
            </Box>

            {/* Confirmar viagens (com badge 2) */}
            <Box
              component="button"
              onClick={() => navigate('/frota/confirmar-viagens')}
              sx={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                px: 1.5,
                py: 1,
                border: 'none',
                background: 'transparent',
                borderRadius: 1.5,
                cursor: 'pointer',
                color: '#374151',
                fontSize: 14,
                fontWeight: 500,
                textAlign: 'left',
                '&:hover': { bgcolor: '#f9fafb', color: '#111827' },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <Box component="span" sx={{ display: { xs: 'none', md: 'inline' } }}>Confirmar viagens</Box>
              </Box>
              <Box
                component="span"
                sx={{
                  bgcolor: '#fee2e2',
                  color: '#dc2626',
                  fontSize: 11,
                  fontWeight: 700,
                  px: 0.8,
                  py: 0.2,
                  borderRadius: 10,
                  display: { xs: 'none', md: 'inline-block' },
                }}
              >
                2
              </Box>
            </Box>
          </Box>

          {/* SEÇÃO: FROTA */}
          <Box sx={{ px: 2.5, mb: 1, mt: 2.5, display: { xs: 'none', md: 'block' } }}>
            <Typography variant="caption" sx={{ color: '#9ca3af', fontWeight: 700, letterSpacing: '0.05em', fontSize: 11 }}>
              FROTA
            </Typography>
          </Box>

          <Box sx={{ px: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Box
              component="button"
              onClick={() => navigate('/frota/veiculos')}
              sx={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                px: 1.5,
                py: 1,
                border: 'none',
                background: 'transparent',
                borderRadius: 1.5,
                cursor: 'pointer',
                color: '#374151',
                fontSize: 14,
                fontWeight: 500,
                textAlign: 'left',
                '&:hover': { bgcolor: '#f9fafb', color: '#111827' },
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <rect x="1" y="3" width="15" height="13" />
                <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                <circle cx="5.5" cy="18.5" r="2.5" />
                <circle cx="18.5" cy="18.5" r="2.5" />
              </svg>
              <Box component="span" sx={{ display: { xs: 'none', md: 'inline' } }}>Veículos</Box>
            </Box>

            <Box
              component="button"
              onClick={() => navigate('/frota/motoristas')}
              sx={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                px: 1.5,
                py: 1,
                border: 'none',
                background: 'transparent',
                borderRadius: 1.5,
                cursor: 'pointer',
                color: '#374151',
                fontSize: 14,
                fontWeight: 500,
                textAlign: 'left',
                '&:hover': { bgcolor: '#f9fafb', color: '#111827' },
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <Box component="span" sx={{ display: { xs: 'none', md: 'inline' } }}>Motoristas</Box>
            </Box>

            <Box
              component="button"
              onClick={() => navigate('/frota/tipos-servico')}
              sx={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                px: 1.5,
                py: 1,
                border: 'none',
                background: 'transparent',
                borderRadius: 1.5,
                cursor: 'pointer',
                color: '#374151',
                fontSize: 14,
                fontWeight: 500,
                textAlign: 'left',
                '&:hover': { bgcolor: '#f9fafb', color: '#111827' },
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polygon points="12 2 2 22 22 22" />
              </svg>
              <Box component="span" sx={{ display: { xs: 'none', md: 'inline' } }}>Tipos de serviço</Box>
            </Box>

            {/* Manutenção com badge 3 */}
            <Box
              component="button"
              onClick={() => navigate('/frota/manutencao')}
              sx={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                px: 1.5,
                py: 1,
                border: 'none',
                background: 'transparent',
                borderRadius: 1.5,
                cursor: 'pointer',
                color: '#374151',
                fontSize: 14,
                fontWeight: 500,
                textAlign: 'left',
                '&:hover': { bgcolor: '#f9fafb', color: '#111827' },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                </svg>
                <Box component="span" sx={{ display: { xs: 'none', md: 'inline' } }}>Manutenção</Box>
              </Box>
              <Box
                component="span"
                sx={{
                  bgcolor: '#fee2e2',
                  color: '#dc2626',
                  fontSize: 11,
                  fontWeight: 700,
                  px: 0.8,
                  py: 0.2,
                  borderRadius: 10,
                  display: { xs: 'none', md: 'inline-block' },
                }}
              >
                3
              </Box>
            </Box>

            <Box
              component="button"
              onClick={() => navigate('/frota/abastecimento')}
              sx={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                px: 1.5,
                py: 1,
                border: 'none',
                background: 'transparent',
                borderRadius: 1.5,
                cursor: 'pointer',
                color: '#374151',
                fontSize: 14,
                fontWeight: 500,
                textAlign: 'left',
                '&:hover': { bgcolor: '#f9fafb', color: '#111827' },
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M3 22v-8a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v8" />
                <path d="M15 10l3-3 3 3" />
                <path d="M21 7v15" />
              </svg>
              <Box component="span" sx={{ display: { xs: 'none', md: 'inline' } }}>Abastecimento</Box>
            </Box>
          </Box>

          {/* SEÇÃO: CONTROLE */}
          <Box sx={{ px: 2.5, mb: 1, mt: 2.5, display: { xs: 'none', md: 'block' } }}>
            <Typography variant="caption" sx={{ color: '#9ca3af', fontWeight: 700, letterSpacing: '0.05em', fontSize: 11 }}>
              CONTROLE
            </Typography>
          </Box>

          <Box sx={{ px: 1, mt: 'auto', pt: 1 }}>
            <Box
              component="button"
              onClick={() => navigate('/frota/ajuda')}
              sx={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                px: 1.5,
                py: 1,
                border: 'none',
                background: 'transparent',
                borderRadius: 1.5,
                cursor: 'pointer',
                color: '#374151',
                fontSize: 14,
                fontWeight: 500,
                textAlign: 'left',
                '&:hover': { bgcolor: '#f9fafb', color: '#111827' },
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <Box component="span" sx={{ display: { xs: 'none', md: 'inline' } }}>Ajuda</Box>
            </Box>
          </Box>
        </Box>

        {/* ÁREA DE CONTEÚDO PRINCIPAL */}
        <Box
          component="main"
          id="main-content"
          tabIndex={-1}
          sx={{
            flex: 1,
            p: { xs: 2, sm: 3, md: 3.5 },
            maxWidth: 1480,
            width: '100%',
            mx: 'auto',
            outline: 'none',
          }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  )
}
