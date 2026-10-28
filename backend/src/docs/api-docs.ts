import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Express } from 'express'
import { serve, setup } from 'swagger-ui-express'
import type { JsonObject } from 'swagger-ui-express'
import { parse } from 'yaml'

const OPENAPI_SPEC_PATH = path.resolve(__dirname, '..', '..', 'docs', 'openapi.yaml')

/**
 * Registra a documentação interativa da API apenas no ambiente de desenvolvimento.
 *
 * Lê o contrato versionado em `backend/docs/openapi.yaml`, expõe o JSON bruto em
 * `/docs/openapi.json` e monta o Swagger UI em `/docs`. A função deve ser chamada
 * somente quando a documentação estiver habilitada, pois o `swagger-ui-express`
 * é uma dependência de desenvolvimento e não é incluído na imagem de produção.
 *
 * @param app - Instância Express já configurada com as rotas da API.
 * @throws {Error} Se o arquivo do contrato não existir ou não puder ser lido.
 */
export function registerApiDocs(app: Express): void {
  const spec = parse(readFileSync(OPENAPI_SPEC_PATH, 'utf8')) as JsonObject

  app.get('/docs/openapi.json', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.json(spec)
  })

  app.use(
    '/docs',
    serve,
    setup(spec, {
      customSiteTitle: 'Aratu API',
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        filter: true,
        tryItOutEnabled: true,
      },
    }),
  )
}
