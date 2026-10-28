import { useId } from 'react'
import type { InputProps } from '@mui/material'
import { FormControl, FormHelperText, FormLabel, OutlinedInput } from '@mui/material'

export interface FormFieldProps extends Omit<InputProps, 'id' | 'error'> {
  label: string
  errorMessage?: string
  helperText?: string
  required?: boolean
  children?: React.ReactNode
}

/**
 * Campo de formulário acessível em conformidade com WCAG 2.2 AA.
 * Utiliza useId() para associar programaticamente o rótulo ao controle
 * e os textos de ajuda/erro via aria-describedby e role="alert".
 */
export function FormField({
  label,
  errorMessage,
  helperText,
  required,
  children,
  ...inputProps
}: FormFieldProps) {
  const id = useId()
  const errorId = `${id}-error`
  const helperId = `${id}-helper`
  const hasError = Boolean(errorMessage)

  return (
    <FormControl fullWidth required={required} error={hasError} sx={{ mb: 2.5 }}>
      <FormLabel
        htmlFor={id}
        sx={{
          mb: 0.75,
          fontSize: 14,
          fontWeight: 600,
          color: '#1e293b',
          '&.Mui-focused': { color: '#0d47a1' },
        }}
      >
        {label}
      </FormLabel>

      {children ? (
        children
      ) : (
        <OutlinedInput
          {...inputProps}
          id={id}
          inputProps={{
            ...inputProps.inputProps,
            'aria-invalid': hasError,
            'aria-describedby': hasError ? errorId : helperText ? helperId : undefined,
          }}
          sx={{
            minHeight: 44,
            borderRadius: 1.5,
            bgcolor: '#ffffff',
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: '#0d47a1',
              borderWidth: 2,
            },
            ...inputProps.sx,
          }}
        />
      )}

      {hasError && (
        <FormHelperText id={errorId} role="alert" sx={{ fontWeight: 500, fontSize: 13 }}>
          {errorMessage}
        </FormHelperText>
      )}
      {!hasError && helperText && (
        <FormHelperText id={helperId} sx={{ fontSize: 13, color: '#64748b' }}>
          {helperText}
        </FormHelperText>
      )}
    </FormControl>
  )
}
