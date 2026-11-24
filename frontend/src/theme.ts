import { createTheme } from '@mui/material/styles'

export const theme = createTheme({
  palette: {
    primary: { main: '#FF6B00', dark: '#b94700', contrastText: '#111827' },
    text: { primary: '#642c04', secondary: '#000000' },
    background: { default: '#fff', paper: '#fff' },
  },
  typography: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    button: { textTransform: 'none', fontWeight: 600 },
  },
  shape: { borderRadius: 6 },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        html: {
          scrollPaddingTop: '80px',
        },
        'a, button, input, select, textarea, [tabindex], [role="button"], [role="combobox"]': {
          scrollMarginTop: '80px',
        },
        'a:focus-visible, button:focus-visible, [tabindex]:focus-visible, [role="button"]:focus-visible, [role="combobox"]:focus-visible': {
          outline: '3px solid #b94700',
          outlineOffset: '2px',
        },
      },
    },
    MuiButtonBase: {
      styleOverrides: {
        root: {
          scrollMarginTop: 80,
          '&.Mui-focusVisible, &:focus-visible': {
            outline: '3px solid #b94700',
            outlineOffset: 2,
          },
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          minHeight: 44,
          minWidth: 44,
          scrollMarginTop: 80,
          '&.Mui-focusVisible, &:focus-visible': {
            outline: '3px solid #b94700',
            outlineOffset: 2,
          },
          '&.MuiButton-textPrimary': {
            color: '#b94700',
            '&:hover': { backgroundColor: 'rgba(185, 71, 0, 0.08)' },
          },
          '&.MuiButton-outlinedPrimary': {
            color: '#b94700',
            borderColor: '#b94700',
            '&:hover': {
              borderColor: '#9a3412',
              backgroundColor: 'rgba(185, 71, 0, 0.06)',
            },
          },
          '&.MuiButton-containedPrimary': {
            backgroundColor: '#FF6B00',
            color: '#111827',
            '&:hover': { backgroundColor: '#e05e00' },
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          minWidth: 44,
          minHeight: 44,
          scrollMarginTop: 80,
          '&.Mui-focusVisible, &:focus-visible': {
            outline: '3px solid #b94700',
            outlineOffset: 2,
          },
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          minHeight: 44,
          '&.Mui-focusVisible, &:focus-visible': {
            outline: '3px solid #b94700',
            outlineOffset: -2,
          },
        },
      },
    },
    MuiLink: {
      styleOverrides: {
        root: {
          color: '#b94700',
          scrollMarginTop: 80,
          '&.Mui-focusVisible, &:focus-visible': {
            outline: '3px solid #b94700',
            outlineOffset: 2,
            borderRadius: 2,
          },
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          '&.Mui-focused:not(.Mui-error)': { color: '#b94700' },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          fontSize: 14,
          minHeight: 44,
          scrollMarginTop: 80,
          '&:not(.Mui-disabled):not(.Mui-error) .MuiOutlinedInput-notchedOutline': {
            borderColor: '#6b7280',
          },
          '&.Mui-focused:not(.Mui-error) .MuiOutlinedInput-notchedOutline': {
            borderColor: '#b94700',
            borderWidth: 2,
          },
        },
        notchedOutline: { borderColor: '#6b7280' },
        input: {
          padding: '10px 12px',
          minHeight: 44,
          boxSizing: 'border-box',
          '&.MuiInputBase-inputSizeSmall': {
            padding: '10px 12px',
            minHeight: 44,
            boxSizing: 'border-box',
          },
          '&.MuiInputBase-inputMultiline': {
            padding: 0,
            minHeight: 44,
            boxSizing: 'border-box',
          },
        },
        multiline: { minHeight: 44, padding: '10px 12px' },
      },
    },
    MuiSelect: {
      styleOverrides: {
        select: {
          minHeight: 44,
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          '&.MuiInputBase-inputSizeSmall': {
            paddingTop: 10,
            paddingBottom: 10,
            minHeight: 44,
          },
        },
      },
    },
  },
})
