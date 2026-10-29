export interface UserFormValues {
  name: string
  email: string
  password: string
  roleId: string
}

export interface UserFormErrors {
  name?: string
  email?: string
  password?: string
  roleId?: string
}

export function validateUserForm(values: UserFormValues): UserFormErrors {
  const errors: UserFormErrors = {}
  if (!values.name.trim()) errors.name = 'Informe o nome do usuário.'
  if (!values.email.trim()) errors.email = 'Informe o e-mail institucional.'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
    errors.email = 'Informe um e-mail válido.'
  }
  if (!values.password) errors.password = 'Informe uma senha inicial.'
  else if (new TextEncoder().encode(values.password).byteLength > 72) {
    errors.password = 'A senha excede o limite de 72 bytes suportado pelo sistema.'
  }
  if (!values.roleId) errors.roleId = 'Selecione um perfil de acesso.'
  return errors
}
