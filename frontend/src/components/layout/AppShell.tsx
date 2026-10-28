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
          bgcolor: '#0d47a1',
          color: '#ffffff',
          px: 2,
          py: 1,
          borderRadius: 1,
          fontWeight: 600,
          '&:focus': { top: 16 },
        }}
      >
        Pular para o conteúdo principal
      </MuiLink>

      {/* TOPBAR AZUL ROYAL INSTITUCIONAL (Idêntica ao Figma) */}
      <Box
        component="header"
        sx={{
          height: 56,
          bgcolor: '#1976d2',
          backgroundImage: 'linear-gradient(90deg, #1565c0 0%, #1976d2 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          position: 'sticky',
          top: 0,
          zIndex: 1100,
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
        }}
      >
        {/* Esquerda: Menu hambúrguer + Logo Aratu Gestão de Frota */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
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
              '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.12)' },
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
              gap: 1.2,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              textAlign: 'left',
              p: 0,
            }}
          >
            {/* Ícone de Viatura */}
            <Box
              sx={{
                bgcolor: 'rgba(255, 255, 255, 0.18)',
                borderRadius: 1,
                p: 0.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.22.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z" />
              </svg>
            </Box>

            <Box>
              <Typography variant="body1" sx={{ fontWeight: 800, color: '#ffffff', lineHeight: 1.2, fontSize: 16 }}>
                Aratu <span style={{ fontWeight: 400, opacity: 0.9, fontSize: 14 }}>Gestão de Frota · FSPH</span>
              </Typography>
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
                border: '1.5px solid #1976d2',
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
                bgcolor: isScheduleActive ? '#eff6ff' : 'transparent',
                borderRight: isScheduleActive ? '3px solid #1976d2' : '3px solid transparent',
                borderRadius: isScheduleActive ? '6px 0 0 6px' : 1.5,
                cursor: 'pointer',
                color: isScheduleActive ? '#1976d2' : '#374151',
                fontSize: 14,
                fontWeight: isScheduleActive ? 700 : 500,
                textAlign: 'left',
                '&:hover': { bgcolor: isScheduleActive ? '#eff6ff' : '#f9fafb' },
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
