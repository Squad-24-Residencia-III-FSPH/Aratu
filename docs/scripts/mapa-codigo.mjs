#!/usr/bin/env node
/**
 * Utilitário de Mapeamento Compacto do Codebase — Sistema Aratu (Squad 24)
 *
 * Gera um resumo estruturado e enxuto de todos os arquivos, classes, funções,
 * interfaces, tipos, componentes React, rotas Express, planos SDD e módulos
 * documentados, economizando chamadas exploratórias de leitura de arquivos (tokens).
 *
 * Uso:
 *   node docs/scripts/mapa-codigo.mjs
 *   node docs/scripts/mapa-codigo.mjs --filter auth
 *   node docs/scripts/mapa-codigo.mjs --json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.tmp', 'coverage']);
const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.sql']);

/**
 * Percorre recursivamente um diretório retornando arquivos válidos.
 */
function walkDir(dirPath, results = []) {
  if (!fs.existsSync(dirPath)) return results;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath, results);
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Extrai símbolos exportados, rotas Express e tabelas SQL de um arquivo de código.
 */
function extractFileMetadata(filePath) {
  const ext = path.extname(filePath);
  const relPath = path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');

  if (!CODE_EXTENSIONS.has(ext)) {
    return { path: relPath, type: 'asset', lines: 0, exports: [], routes: [], tables: [] };
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/).length;
  const exportsList = [];
  const routesList = [];
  const tablesList = [];

  if (ext === '.sql') {
    const tableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_]+)/gi;
    let match;
    while ((match = tableRegex.exec(content)) !== null) {
      tablesList.push(match[1]);
    }
    return { path: relPath, type: 'sql', lines, exports: [], routes: [], tables: tablesList };
  }

  // Captura exports nomeados: export class/function/interface/type/const/enum
  const exportRegex =
    /export\s+(?:async\s+)?(class|function|interface|type|const|let|enum)\s+([A-Za-z0-9_]+)/g;
  let match;
  while ((match = exportRegex.exec(content)) !== null) {
    const kind = match[1];
    const name = match[2];
    exportsList.push(`${kind} ${name}`);
  }

  // Captura export default
  const defaultExportRegex = /export\s+default\s+(?:function\s+|class\s+)?([A-Za-z0-9_]+)?/g;
  while ((match = defaultExportRegex.exec(content)) !== null) {
    const target = match[1] ? `default:${match[1]}` : 'default';
    if (!exportsList.includes(target)) {
      exportsList.push(target);
    }
  }

  // Captura rotas Express: app.get('/rota', ...) ou router.post('/rota', ...)
  const routeRegex = /\b(?:app|router)\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/gi;
  while ((match = routeRegex.exec(content)) !== null) {
    routesList.push(`${match[1].toUpperCase()} ${match[2]}`);
  }

  return {
    path: relPath,
    type: 'code',
    lines,
    exports: exportsList,
    routes: routesList,
    tables: tablesList,
  };
}

function scanSection(dirRelPath, filterTerm) {
  const absDir = path.join(REPO_ROOT, dirRelPath);
  const files = walkDir(absDir);
  const items = [];

  for (const file of files) {
    const meta = extractFileMetadata(file);
    if (filterTerm) {
      const haystack = `${meta.path} ${meta.exports.join(' ')} ${meta.routes.join(' ')} ${meta.tables.join(' ')}`.toLowerCase();
      if (!haystack.includes(filterTerm.toLowerCase())) continue;
    }
    items.push(meta);
  }
  return items;
}

function listHtmlDocs(dirRelPath) {
  const absDir = path.join(REPO_ROOT, dirRelPath);
  if (!fs.existsSync(absDir)) return [];
  return fs
    .readdirSync(absDir)
    .filter((f) => f.endsWith('.html'))
    .map((f) => `${dirRelPath}/${f}`);
}

function formatSectionMarkdown(title, items) {
  const out = [`### ${title}`];
  if (items.length === 0) {
    out.push('- *(nenhum arquivo correspondente encontrado)*\n');
    return out.join('\n');
  }

  for (const item of items) {
    if (item.type === 'asset') {
      out.push(`- \`${item.path}\``);
      continue;
    }
    const details = [];
    if (item.exports.length > 0) {
      details.push(`exports: ${item.exports.map((e) => `\`${e}\``).join(', ')}`);
    }
    if (item.routes.length > 0) {
      details.push(`rotas: ${item.routes.map((r) => `\`${r}\``).join(', ')}`);
    }
    if (item.tables.length > 0) {
      details.push(`tabelas: ${item.tables.map((t) => `\`${t}\``).join(', ')}`);
    }
    const suffix = details.length > 0 ? ` — ${details.join(' | ')}` : '';
    out.push(`- \`${item.path}\` (${item.lines}L)${suffix}`);
  }
  out.push('');
  return out.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const jsonFlag = args.includes('--json');
  const filterIdx = args.indexOf('--filter');
  const filterTerm = filterIdx !== -1 && args[filterIdx + 1] ? args[filterIdx + 1] : '';

  const backendSrc = scanSection('backend/src', filterTerm);
  const backendTests = scanSection('backend/tests', filterTerm);
  const frontendSrc = scanSection('frontend/src', filterTerm);
  const frontendTests = scanSection('frontend/tests', filterTerm);
  const plans = listHtmlDocs('docs/plans');
  const modulos = listHtmlDocs('docs/modulos');

  if (jsonFlag) {
    console.log(
      JSON.stringify(
        { backendSrc, backendTests, frontendSrc, frontendTests, plans, modulos },
        null,
        2
      )
    );
    return;
  }

  const output = [
    `## Mapa Compacto do Codebase — Sistema Aratu${filterTerm ? ` (Filtro: "${filterTerm}")` : ''}`,
    '',
    formatSectionMarkdown('1. Backend (`backend/src/`)', backendSrc),
    ...(backendTests.length > 0
      ? [formatSectionMarkdown('2. Testes Backend (`backend/tests/`)', backendTests)]
      : []),
    formatSectionMarkdown('3. Frontend (`frontend/src/`)', frontendSrc),
    ...(frontendTests.length > 0
      ? [formatSectionMarkdown('4. Testes Frontend (`frontend/tests/`)', frontendTests)]
      : []),
    '### 5. Planos SDD (`docs/plans/`) e Módulos (`docs/modulos/`)',
    `- **Planos SDD:** ${plans.map((p) => `\`${p}\``).join(', ') || '*(nenhum)*'}`,
    `- **Módulos HTML:** ${modulos.map((m) => `\`${m}\``).join(', ') || '*(nenhum)*'}`,
  ];

  console.log(output.join('\n'));
}

main();
