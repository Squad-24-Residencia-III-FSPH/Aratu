import { useId } from 'react'
import type { ReactNode, Ref } from 'react'
import { Box, Checkbox, ListItemText, MenuItem, TextField } from '@mui/material'
import type { CompatibleVehicleOption } from './serviceHelpers'

export interface CompatibleVehiclesFieldProps {
  value: readonly string[]
  onChange: (nextIds: string[]) => void
  options: readonly CompatibleVehicleOption[]
  error?: string
  helperText?: string
  disabled?: boolean
  containerRef?: Ref<HTMLDivElement>
}

/**
 * Seletor múltiplo acessível de veículos compatíveis que impede nova seleção
 * de veículos inativos enquanto preserva a apresentação de vínculos históricos.
 */
export default function CompatibleVehiclesField({
  value,
  onChange,
  options,
  error,
  helperText,
  disabled = false,
  containerRef,
}: CompatibleVehiclesFieldProps) {
  const id = useId()
  const errorId = `${id}-error`
  const helperId = `${id}-help`
  const describedBy = [error ? errorId : null, helperText ? helperId : null].filter(Boolean).join(' ') || undefined

  const optionById = new Map(options.map((option) => [option.id, option]))
  const selectedSet = new Set(value)

  function handleChange(rawValue: unknown) {
    const candidateIds = Array.isArray(rawValue)
      ? rawValue.filter((item): item is string => typeof item === 'string')
      : typeof rawValue === 'string'
        ? [rawValue]
        : []

    // Impede nova seleção de veículos inativos mesmo por manipulação programática.
    const sanitized = candidateIds.filter((candidateId) => {
      if (selectedSet.has(candidateId)) return true
      const option = optionById.get(candidateId)
      return option ? option.selectable : false
    })
    onChange(sanitized)
  }

  function renderSelectedValue(selected: unknown): ReactNode {
    const ids = Array.isArray(selected) ? selected.filter((item): item is string => typeof item === 'string') : []
    if (ids.length === 0) return 'Nenhum veículo selecionado'
    return ids
      .map((selectedId) => {
        const option = optionById.get(selectedId)
        if (!option) return `Veículo #${selectedId}`
        return option.inactive ? `${option.licensePlate} (inativo)` : option.licensePlate
      })
      .join(', ')
  }

  const helperContent = error || helperText
    ? (
        <>
          {error && <span id={errorId} role="alert">{error}</span>}
          {helperText && <span id={helperId} style={{ display: 'block' }}>{helperText}</span>}
        </>
      )
    : undefined

  return (
    <Box ref={containerRef}>
      <TextField
        select
        id={id}
        label="Veículos compatíveis"
        value={[...value]}
        onChange={(event) => handleChange(event.target.value)}
        error={Boolean(error)}
        helperText={helperContent}
        disabled={disabled}
        fullWidth
        size="small"
        slotProps={{
          select: {
            multiple: true,
            displayEmpty: true,
            renderValue: renderSelectedValue,
            inputProps: {
              'aria-invalid': error ? true : undefined,
              'aria-describedby': describedBy,
            },
          },
          inputLabel: {
            shrink: true,
          },
        }}
      >
        {options.map((option) => {
          const checked = selectedSet.has(option.id)
          const itemDisabled = !option.selectable && !checked
          return (
            <MenuItem key={option.id} value={option.id} disabled={itemDisabled}>
              <Checkbox checked={checked} tabIndex={-1} disableRipple size="small" />
              <ListItemText primary={option.label} />
            </MenuItem>
          )
        })}
      </TextField>
    </Box>
  )
}
