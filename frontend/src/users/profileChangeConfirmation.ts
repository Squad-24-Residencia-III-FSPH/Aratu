/**
 * Verifica se a edição de um usuário existente mudou seu perfil.
 *
 * @param mode - Indica se o formulário está cadastrando ou editando um usuário.
 * @param currentRoleId - Identificador do perfil atual, quando disponível.
 * @param nextRoleId - Identificador do perfil selecionado no formulário.
 * @returns `true` quando a alteração de perfil precisa de confirmação explícita.
 */
export function shouldConfirmProfileChange(
  mode: 'create' | 'edit',
  currentRoleId: string | null,
  nextRoleId: string,
): boolean {
  return mode === 'edit' && currentRoleId !== null && currentRoleId !== nextRoleId
}

/**
 * Executa a gravação pendente somente após confirmação explícita.
 *
 * @param decision - Decisão tomada pela pessoa no diálogo de confirmação.
 * @param save - Operação de gravação que envia a alteração à API.
 * @returns Uma promessa concluída após a gravação confirmada ou o cancelamento.
 */
export async function resolveProfileChangeConfirmation(
  decision: 'confirmed' | 'cancelled',
  save: () => Promise<void>,
): Promise<void> {
  if (decision === 'confirmed') await save()
}
