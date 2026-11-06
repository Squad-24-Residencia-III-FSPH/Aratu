import { useId } from 'react'
import type { ReactNode } from 'react'
import { MenuItem, TextField } from '@mui/material'
import type { SxProps, Theme } from '@mui/material'

export interface FormFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  helperText?: string
  required?: boolean
  disabled?: boolean
  type?: 'text' | 'number' | 'date'
  multiline?: boolean
  minRows?: number
  autoComplete?: string
  placeholder?: string
  inputMode?: 'text' | 'numeric'
  maxLength?: number
  autoFocus?: boolean
  sx?: SxProps<Theme>
  hideLabel?: boolean
}

const visuallyHiddenLabel = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
}

interface FeedbackIds {
  describedBy: string | undefined
  helperContent: ReactNode
}

/** Liga erro/ajuda ao controle por `aria-describedby` e anuncia o erro. */
function useFeedbackIds(error?: string, helperText?: string): FeedbackIds {
  const baseId = useId()
  const errorId = `${baseId}-error`
  const helperId = `${baseId}-help`
  const describedBy = [error ? errorId : null, helperText ? helperId : null].filter(Boolean).join(' ') || undefined
  const helperContent = error || helperText
    ? (
        <>
          {error && <span id={errorId} role="alert">{error}</span>}
          {helperText && <span id={helperId} style={{ display: 'block' }}>{helperText}</span>}
        </>
      )
    : undefined
  return { describedBy, helperContent }
}

/** Campo de texto acessível com rótulo persistente e erro associado. */
export function FormField({
  label,
  value,
  onChange,
  error,
  helperText,
  required,
  disabled,
  type = 'text',
  multiline,
  minRows,
  autoComplete,
  placeholder,
  inputMode,
  maxLength,
  autoFocus,
  sx,
  hideLabel = false,
}: FormFieldProps) {
  const id = useId()
  const { describedBy, helperContent } = useFeedbackIds(error, helperText)

  return (
    <TextField
      id={id}
      label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      error={Boolean(error)}
      helperText={helperContent}
      required={required}
      disabled={disabled}
      fullWidth
      size="small"
      type={type}
      multiline={multiline}
      minRows={minRows}
      autoComplete={autoComplete}
      placeholder={placeholder}
      autoFocus={autoFocus}
      sx={sx}
      slotProps={{
        htmlInput: {
          'aria-invalid': error ? true : undefined,
          'aria-describedby': describedBy,
          ...(maxLength ? { maxLength } : {}),
          ...(inputMode ? { inputMode } : {}),
        },
        inputLabel: {
          shrink: true,
          ...(hideLabel ? { sx: visuallyHiddenLabel } : {}),
        },
      }}
    />
  )
}

export interface FormSelectOption {
  value: string
  label: string
}

interface FormSelectBaseProps {
  label: string
  options: readonly FormSelectOption[]
  error?: string
  helperText?: string
  required?: boolean
  disabled?: boolean
  /** Quando informado, acrescenta uma opção vazia (uso em filtros). */
  emptyLabel?: string
  autoFocus?: boolean
  sx?: SxProps<Theme>
  hideLabel?: boolean
  displayEmpty?: boolean
}

interface SingleSelectProps extends FormSelectBaseProps {
  multiple?: false
  value: string
  onChange: (value: string) => void
}

interface MultipleSelectProps extends FormSelectBaseProps {
  multiple: true
  value: readonly string[]
  onChange: (value: string[]) => void
}

export type FormSelectProps = SingleSelectProps | MultipleSelectProps

/** Select acessível com rótulo, erro e suporte a múltipla seleção. */
export function FormSelect(props: FormSelectProps) {
  const id = useId()
  const { describedBy, helperContent } = useFeedbackIds(props.error, props.helperText)
  const multiple = props.multiple === true

  return (
    <TextField
      select
      id={id}
      label={props.label}
      value={props.value}
      onChange={(event) => {
        const value = event.target.value
        if (props.multiple) props.onChange(Array.isArray(value) ? value : [value])
        else props.onChange(Array.isArray(value) ? (value[0] ?? '') : value)
      }}
      error={Boolean(props.error)}
      helperText={helperContent}
      required={props.required}
      disabled={props.disabled}
      fullWidth
      size="small"
      autoFocus={props.autoFocus}
      sx={props.sx}
      slotProps={{
        select: {
          multiple,
          displayEmpty: props.displayEmpty ?? false,
          inputProps: {
            'aria-invalid': props.error ? true : undefined,
            'aria-describedby': describedBy,
          },
        },
        inputLabel: {
          shrink: true,
          ...(props.hideLabel ? { sx: visuallyHiddenLabel } : {}),
        },
      }}
    >
      {!multiple && props.emptyLabel !== undefined && (
        <MenuItem value="">{props.emptyLabel}</MenuItem>
      )}
      {props.options.map((option) => (
        <MenuItem key={option.value} value={option.value}>
          {option.label}
        </MenuItem>
      ))}
    </TextField>
  )
}
