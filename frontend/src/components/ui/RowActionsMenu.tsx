import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import { IconButton, ListItemIcon, ListItemText, Menu, MenuItem } from '@mui/material'
import MoreVertIcon from '@mui/icons-material/MoreVert'

export interface RowActionItem {
  key: string
  label: string
  onSelect: () => void
  icon?: ReactNode
  disabled?: boolean
  danger?: boolean
}

export interface RowActionsMenuProps {
  /** Nome que identifica o registro afetado pelo menu na tabela. */
  label: string
  actions: readonly RowActionItem[]
}

/** Reúne comandos secundários sem alargar cada linha da consulta. */
export default function RowActionsMenu({ label, actions }: RowActionsMenuProps) {
  const menuId = useId()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)

  if (actions.length === 0) return null

  function closeMenu() {
    setAnchor(null)
  }

  return (
    <>
      <IconButton
        aria-label={label}
        aria-haspopup="menu"
        aria-controls={anchor ? menuId : undefined}
        aria-expanded={anchor ? 'true' : undefined}
        onClick={(event) => {
          event.stopPropagation()
          setAnchor(event.currentTarget)
        }}
        sx={{ width: 44, height: 44 }}
      >
        <MoreVertIcon aria-hidden="true" />
      </IconButton>
      <Menu
        id={menuId}
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={closeMenu}
        slotProps={{ list: { 'aria-label': label } }}
      >
        {actions.map((action) => (
          <MenuItem
            key={action.key}
            disabled={action.disabled}
            onClick={(event) => {
              event.stopPropagation()
              closeMenu()
              action.onSelect()
            }}
            sx={{ minHeight: 44, color: action.danger ? 'error.main' : undefined }}
          >
            {action.icon && <ListItemIcon sx={{ color: 'inherit', minWidth: 40 }}>{action.icon}</ListItemIcon>}
            <ListItemText>{action.label}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </>
  )
}
