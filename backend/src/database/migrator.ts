import fs from 'node:fs';
import path from 'node:path';
import type { Pool, PoolClient } from 'pg';

/**
 * Representação de um arquivo de migração descoberto no sistema de arquivos.
 */
export interface MigrationFile {
  filename: string;
  filepath: string;
  version: string;
  name: string;
}

/**
 * Resultado da execução ou avaliação de uma migração SQL.
 */
export interface MigrationResult {
  version: string;
  name: string;
  durationMs: number;
  status: 'applied' | 'skipped';
}

/**
 * Utilitário responsável por descobrir, ordenar e executar arquivos SQL de migração
 * dentro de transações atômicas seguras no PostgreSQL 18.
 */
export class DatabaseMigrator {
  private readonly migrationsDirectory: string;

  /**
   * Inicializa o gerenciador de migrações apontando para o diretório de migrações.
   *
   * @param migrationsDirectory - Caminho absoluto ou relativo do diretório contendo os arquivos .sql.
   */
  constructor(migrationsDirectory?: string) {
    this.migrationsDirectory = migrationsDirectory ?? path.resolve(__dirname, 'migrations');
  }

  /**
   * Carrega e ordena alfabeticamente os arquivos de migração .sql (ignorando .down.sql).
   *
   * @returns Lista ordenada de arquivos de migração encontrados.
   */
  public async loadFiles(): Promise<MigrationFile[]> {
    if (!fs.existsSync(this.migrationsDirectory)) {
      return [];
    }

    const entries = await fs.promises.readdir(this.migrationsDirectory);
    const sqlFiles = entries
      .filter((file) => file.endsWith('.sql') && !file.endsWith('.down.sql'))
      .sort();

    return sqlFiles.map((filename) => {
      const match = filename.match(/^([0-9a-zA-Z]+)_(.+)\.sql$/);
      const version = match?.[1] ?? path.basename(filename, '.sql');
      const name = match?.[2] ?? path.basename(filename, '.sql');

      return {
        filename,
        filepath: path.join(this.migrationsDirectory, filename),
        version,
        name,
      };
    });
  }

  /**
   * Executa todas as migrações pendentes em transação atômica.
   *
   * Cria a tabela `schema_migrations` caso não exista, identifica quais arquivos
   * já foram aplicados e executa os pendentes em blocos `BEGIN ... COMMIT / ROLLBACK`.
   *
   * @param target - Instância de `Pool` ou `PoolClient` conectado ao PostgreSQL 18.
   * @param options - Opções de execução (ex: `silent`).
   * @returns Resultados das migrações avaliadas com tempo de execução e status.
   *
   * @throws {Error} Caso ocorra falha na execução de qualquer instrução SQL da migração.
   */
  public async runMigrations(
    target: Pool | PoolClient,
    options: { silent?: boolean } = {}
  ): Promise<MigrationResult[]> {
    const isPool = typeof (target as Pool).connect === 'function';
    const client: PoolClient = isPool ? await (target as Pool).connect() : (target as PoolClient);

    try {
      // 1. Assegurar criação da tabela de controle de migrações
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version VARCHAR(255) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 2. Consultar versões já registradas no banco de dados
      const appliedRes = await client.query<{ version: string }>(
        'SELECT version FROM schema_migrations ORDER BY version ASC;'
      );
      const appliedVersions = new Set(appliedRes.rows.map((row) => row.version));

      const files = await this.loadFiles();
      const results: MigrationResult[] = [];

      for (const file of files) {
        if (appliedVersions.has(file.version)) {
          results.push({
            version: file.version,
            name: file.name,
            durationMs: 0,
            status: 'skipped',
          });
          continue;
        }

        const rawSql = await fs.promises.readFile(file.filepath, 'utf-8');
        const cleanedSql = this.cleanMigrationSql(rawSql);

        const startTime = Date.now();
        await client.query('BEGIN;');
        try {
          if (cleanedSql.length > 0) {
            await client.query(cleanedSql);
          }
          await client.query(
            'INSERT INTO schema_migrations (version, name) VALUES ($1, $2);',
            [file.version, file.name]
          );
          await client.query('COMMIT;');

          const durationMs = Date.now() - startTime;
          results.push({
            version: file.version,
            name: file.name,
            durationMs,
            status: 'applied',
          });
        } catch (migrationError) {
          await client.query('ROLLBACK;');
          throw migrationError;
        }
      }

      return results;
    } finally {
      if (isPool) {
        client.release();
      }
    }
  }

  /**
   * Remove delimitadores externos redundantes de transação (BEGIN; / COMMIT;)
   * do arquivo SQL para evitar advertências de transações aninhadas e assegurar
   * que a transação controlada pelo `PoolClient` comande a atomicidade.
   *
   * @param sql - Conteúdo SQL original do arquivo.
   * @returns SQL sem BEGIN e COMMIT externos.
   */
  private cleanMigrationSql(sql: string): string {
    let clean = sql.replace(/^\uFEFF/, '').trim();
    clean = clean.replace(/^(?:--[^\n]*\n|\/\*[\s\S]*?\*\/|\s*)*BEGIN\s*;/i, '');
    clean = clean.replace(/COMMIT\s*;(?:\s*|--[^\n]*\n|\/\*[\s\S]*?\*\/)*$/i, '');
    return clean.trim();
  }
}
