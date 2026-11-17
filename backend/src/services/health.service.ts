interface HealthRepositoryContract {
  hasMigrations(versions: string[]): Promise<boolean>
}

/** Mantém falhas internas de conexão fora do contrato público de prontidão. */
export class HealthService {
  constructor(
    private readonly repository: HealthRepositoryContract,
    private readonly loadVersions: () => Promise<string[]>,
  ) {}

  /** Falha fechada quando o banco ou alguma migração do pacote está indisponível. */
  async isReady(): Promise<boolean> {
    try {
      const versions = await this.loadVersions()
      return versions.length > 0 && await this.repository.hasMigrations(versions)
    } catch {
      return false
    }
  }
}
