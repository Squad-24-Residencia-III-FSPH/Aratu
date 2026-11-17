import { cpSync, mkdirSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const source = fileURLToPath(new URL('../src/database/migrations/', import.meta.url))
const target = fileURLToPath(new URL('../dist/database/migrations/', import.meta.url))
if (!readdirSync(source).some(name => name.endsWith('.sql') && !name.endsWith('.down.sql'))) {
  throw new Error('O pacote precisa conter as migrações SQL antes da publicação.')
}
mkdirSync(target, { recursive: true })
cpSync(source, target, { recursive: true })
