import { SvgIcon } from '@mui/material'
import type { SvgIconProps } from '@mui/material'
import type { ReactNode } from 'react'

export type AratuIconName =
  | 'menu'
  | 'notifications'
  | 'chevronDown'
  | 'users'
  | 'shield'
  | 'history'
  | 'settings'
  | 'help'
  | 'search'
  | 'import'
  | 'export'
  | 'userAdd'
  | 'chevronLeft'
  | 'chevronRight'

const paths: Record<AratuIconName, ReactNode> = {
  menu: <path d="M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z" />,
  notifications: <path d="M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2m6-6v-5a6 6 0 0 0-5-5.91V4a1 1 0 0 0-2 0v1.09A6 6 0 0 0 6 11v5l-2 2v1h16v-1z" />,
  chevronDown: <path d="m7 10 5 5 5-5z" />,
  users: <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3M8 11c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3m0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13m8.01.04c-.29 0-.62.02-.97.05 1.16.84 1.96 1.97 1.96 3.41V19H23v-2.5c0-2.33-4.66-3.46-6.99-3.46" />,
  shield: <path d="M12 1 3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5zm0 4.1 5 2.22V11c0 3.9-2.5 7.57-5 8.72-2.5-1.15-5-4.82-5-8.72V7.32z" />,
  history: <path d="M13 3a9 9 0 0 0-9 9H1l4 4 4-4H6a7 7 0 1 1 2.05 4.95l-1.42 1.42A9 9 0 1 0 13 3m-1 5v5l4.25 2.52 1.03-1.71L14 12V8z" />,
  settings: <path d="m19.14 12.94.03-.94-.03-.94 2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7.3 7.3 0 0 0-1.63-.95L14.38 2.7a.49.49 0 0 0-.49-.42h-3.78a.49.49 0 0 0-.49.42L9.26 5.3c-.59.23-1.14.55-1.63.95l-2.39-.96a.5.5 0 0 0-.61.22L2.71 8.83a.5.5 0 0 0 .12.64l2.03 1.58-.03.95.03.94-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.12.2.36.29.61.22l2.39-.96c.49.4 1.04.72 1.63.95l.36 2.59c.04.24.24.42.49.42h3.78c.25 0 .45-.18.49-.42l.36-2.59c.59-.23 1.14-.55 1.63-.95l2.39.96c.24.09.49 0 .61-.22l1.92-3.32a.5.5 0 0 0-.12-.64zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7" />,
  help: <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20m0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16m0-14a4 4 0 0 0-4 4h2a2 2 0 1 1 3.2 1.6C12.08 12.4 11 13 11 15h2c0-1 .37-1.35 1.4-2.15A4 4 0 0 0 12 6m-1 11h2v2h-2z" />,
  search: <path d="M15.5 14h-.79l-.28-.27A6.5 6.5 0 1 0 14 15.5l.27.28v.79l5 4.99L20.49 20zm-5 0A4.5 4.5 0 1 1 10.5 5a4.5 4.5 0 0 1 0 9" />,
  import: <path d="M19 18H5v2h14v-2zM13 16V8.83l2.59 2.58L17 10l-5-5-5 5 1.41 1.41L11 8.83V16h2z" />,
  export: <path d="M5 20h14v-2H5v2zm7-2 7-7-1.41-1.41L13 14.17V3h-2v11.17l-4.59-4.58L5 11l7 7z" />,
  userAdd: <path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4m-8 2v-3H5v3H2v2h3v3h2v-3h3v-2zm8-1c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4" />,
  chevronLeft: <path d="m15.4 7.4-1.4-1.4L8 12l6 6 1.4-1.4L10.8 12z" />,
  chevronRight: <path d="m8.6 16.6 1.4 1.4 6-6-6-6-1.4 1.4 4.6 4.6z" />,
}

export function AratuIcon({ name, ...props }: SvgIconProps & { name: AratuIconName }) {
  return <SvgIcon viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...props}>{paths[name]}</SvgIcon>
}
