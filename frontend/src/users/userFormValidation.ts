export interface UserFormValues {
  name: string
  email: string
  password: string
  roleId: string
  active?: boolean
}

export interface UserFormErrors {
  name?: string
  email?: string
  password?: string
  roleId?: string
}

export function validateUserForm(
  values: UserFormValues,
  mode: 'create' | 'edit' = 'create',
): UserFormErrors {
  const errors: UserFormErrors = {}
  if (!values.name.trim()) errors.name = 'Informe o nome do usuário.'
  if (!values.email.trim()) errors.email = 'Informe o e-mail institucional.'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
    errors.email = 'Informe um e-mail válido.'
  }
  if (mode === 'create' && !values.password) errors.password = 'Informe uma senha inicial.'
  else if (values.password && new TextEncoder().encode(values.password).byteLength > 72) {
    errors.password = 'A senha excede o limite de 72 bytes suportado pelo sistema.'
  }
  if (!values.roleId) errors.roleId = 'Selecione um perfil de acesso.'
  return errors
}
