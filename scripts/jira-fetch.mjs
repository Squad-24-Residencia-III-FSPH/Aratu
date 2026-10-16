#!/usr/bin/env node
/**
 * Utilitário de integração com a Jira Cloud REST API v3 — Sistema Aratu (Squad 24)
 *
 * Uso:
 *   node scripts/jira-fetch.mjs FROTA-27
 *   node scripts/jira-fetch.mjs 27
 *   node scripts/jira-fetch.mjs https://squad24.atlassian.net/browse/FROTA-27
 *   node scripts/jira-fetch.mjs --mine
 *   node scripts/jira-fetch.mjs FROTA-27 --save
 *
 * Requisitos:
 *   Node.js 20+ (usa fetch nativo, zero dependências externas).
 *   Credenciais em `.credentials` (ou `.env`) na raiz do repositório:
 *     JIRA_BASE_URL="https://squad24.atlassian.net"
 *     JIRA_EMAIL="seu-email@dominio.com"
 *     JIRA_API_TOKEN="seu-token-atlassian"
 *     JIRA_PROJECT_KEY="FROTA"
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

/**
 * Carrega variáveis de ambiente de um arquivo .credentials ou .env sem expor segredos.
 */
function loadCredentialsFile(filePath) {
  const vars = {};
  if (!fs.existsSync(filePath)) {
    return vars;
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    vars[key] = value;
  }
  return vars;
}

function getConfig() {
  const credFile = path.join(REPO_ROOT, '.credentials');
  const envFile = path.join(REPO_ROOT, '.env');
  const fromEnvFile = loadCredentialsFile(envFile);
  const fromCredFile = loadCredentialsFile(credFile);

  const baseUrlRaw =
    process.env.JIRA_BASE_URL ||
    fromCredFile.JIRA_BASE_URL ||
    fromEnvFile.JIRA_BASE_URL ||
    'https://squad24.atlassian.net';
  const email =
    process.env.JIRA_EMAIL ||
    fromCredFile.JIRA_EMAIL ||
    fromEnvFile.JIRA_EMAIL ||
    '';
  const apiToken =
    process.env.JIRA_API_TOKEN ||
    fromCredFile.JIRA_API_TOKEN ||
    fromEnvFile.JIRA_API_TOKEN ||
    '';
  const projectKey =
    process.env.JIRA_PROJECT_KEY ||
    fromCredFile.JIRA_PROJECT_KEY ||
    fromEnvFile.JIRA_PROJECT_KEY ||
    'FROTA';

  const baseUrl = baseUrlRaw.replace(/\/+$/, '');
  return { baseUrl, email, apiToken, projectKey };
}

/**
 * Converte nós ADF (Atlassian Document Format) da API v3 do Jira para Markdown limpo.
 */
function adfToMarkdown(node, listDepth = 0) {
  if (!node) return '';
  if (typeof node === 'string') return node;

  const { type, content, text, marks, attrs } = node;

  switch (type) {
    case 'doc':
      return (content || [])
        .map((child) => adfToMarkdown(child, listDepth))
        .filter(Boolean)
        .join('\n\n')
        .trim();

    case 'paragraph': {
      const inner = (content || [])
        .map((child) => adfToMarkdown(child, listDepth))
        .join('');
      return inner;
    }

    case 'heading': {
      const level = Math.min(Math.max(attrs?.level || 3, 1), 6);
      const inner = (content || [])
        .map((child) => adfToMarkdown(child, listDepth))
        .join('');
      return `${'#'.repeat(level)} ${inner}`;
    }

    case 'text': {
      let formatted = text || '';
      if (Array.isArray(marks)) {
        for (const mark of marks) {
          if (mark.type === 'code') {
            formatted = `\`${formatted}\``;
          } else if (mark.type === 'strong') {
            formatted = `**${formatted}**`;
          } else if (mark.type === 'em') {
            formatted = `*${formatted}*`;
          } else if (mark.type === 'strike') {
            formatted = `~~${formatted}~~`;
          } else if (mark.type === 'link' && mark.attrs?.href) {
            formatted = `[${formatted}](${mark.attrs.href})`;
          }
        }
      }
      return formatted;
    }

    case 'hardBreak':
      return '\n';

    case 'rule':
      return '---';

    case 'mention':
      return `@${attrs?.text || attrs?.id || 'usuario'}`;

    case 'inlineCard':
    case 'blockCard':
      return attrs?.url ? `[${attrs.url}](${attrs.url})` : '';

    case 'bulletList':
      return (content || [])
        .map((item) => adfToMarkdown(item, listDepth))
        .join('\n');

    case 'orderedList':
      return (content || [])
        .map((item, idx) => adfToMarkdown({ ...item, _orderIndex: idx + 1 }, listDepth))
        .join('\n');

    case 'listItem': {
      const indent = '  '.repeat(listDepth);
      const prefix = node._orderIndex ? `${node._orderIndex}. ` : '- ';
      const parts = (content || []).map((child) => {
        if (child.type === 'bulletList' || child.type === 'orderedList') {
          return '\n' + adfToMarkdown(child, listDepth + 1);
        }
        return adfToMarkdown(child, listDepth + 1);
      });
      return `${indent}${prefix}${parts.join(' ').trim()}`;
    }

    case 'taskList':
      return (content || [])
        .map((item) => adfToMarkdown(item, listDepth))
        .join('\n');

    case 'taskItem': {
      const checked = attrs?.state === 'DONE' ? 'x' : ' ';
      const inner = (content || [])
        .map((child) => adfToMarkdown(child, listDepth))
        .join('');
      return `- [${checked}] ${inner}`;
    }

    case 'codeBlock': {
      const lang = attrs?.language || '';
      const code = (content || []).map((c) => c.text || '').join('');
      return `\`\`\`${lang}\n${code}\n\`\`\``;
    }

    case 'blockquote':
    case 'panel': {
      const panelTitle = attrs?.panelType ? `[${attrs.panelType.toUpperCase()}] ` : '';
      const inner = (content || [])
        .map((child) => adfToMarkdown(child, listDepth))
        .join('\n');
      return inner
        .split('\n')
        .map((line, idx) => `> ${idx === 0 ? panelTitle : ''}${line}`)
        .join('\n');
    }

    case 'table': {
      const rows = (content || []).map((row) => {
        const cells = (row.content || []).map((cell) =>
          (cell.content || [])
            .map((c) => adfToMarkdown(c, listDepth))
            .join(' ')
            .replace(/\r?\n/g, ' ')
            .trim()
        );
        return `| ${cells.join(' | ')} |`;
      });
      if (rows.length > 0) {
        const firstRowCells = (content[0]?.content || []).length || 1;
        const separator = `| ${Array(firstRowCells).fill('---').join(' | ')} |`;
        rows.splice(1, 0, separator);
      }
      return rows.join('\n');
    }

    default:
      if (Array.isArray(content)) {
        return content
          .map((child) => adfToMarkdown(child, listDepth))
          .filter(Boolean)
          .join('\n');
      }
      return '';
  }
}

/**
 * Executa comando git seguro no diretório do repositório.
 */
function runGit(args) {
  try {
    return execSync(`git ${args}`, {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

/**
 * Infere o módulo do Sistema Aratu e os perfis RBAC a partir do texto da issue.
 */
function inferAratuContext(summary, description, labels = []) {
  const combined = `${summary} ${description} ${labels.join(' ')}`.toLowerCase();

  let modulo = 'FROTA';
  if (/\b(login|autentica[cç][aã]o|autenticar|rbac|permiss[aã]o|permiss[oõ]es|usu[aá]rio|usu[aá]rios|senha|sess[aã]o|token|jwt)\b/.test(combined)) {
    modulo = 'AUTENTICACAO_RBAC';
  } else if (/\b(svo|óbito|obito|remo[cç][aã]o|cad[aá]ver|laudo|plant[aã]o)\b/.test(combined)) {
    modulo = 'SVO';
  } else if (/\b(manuten[cç][aã]o|oficina|ordem de servi[cç]o|preventiva|corretiva)\b/.test(combined)) {
    modulo = 'MANUTENCOES';
  } else if (/\b(motorista|cnh|condutor|escala)\b/.test(combined)) {
    modulo = 'MOTORISTAS';
  } else if (/\b(viagem|viagens|solicita[cç][aã]o|itiner[aá]rio|hod[oô]metro|rota)\b/.test(combined)) {
    modulo = 'VIAGENS';
  } else if (/\b(frota|ve[ií]culo|placa|renavam|combust[ií]vel|abastecimento)\b/.test(combined)) {
    modulo = 'FROTA';
  }

  const perfis = new Set();
  if (/\b(admin|administrador)\b/.test(combined)) perfis.add('ADMIN');
  if (/\b(gestor|aprovador|frota)\b/.test(combined)) perfis.add('GESTOR_FROTA');
  if (/\b(solicitante|fsph|setor)\b/.test(combined)) perfis.add('SOLICITANTE');
  if (/\b(motorista|condutor)\b/.test(combined)) perfis.add('MOTORISTA');
  if (/\b(svo|operador|plant[aã]o|remo[cç][aã]o)\b/.test(combined)) perfis.add('OPERADOR_SVO');

  return {
    modulo,
    perfis: perfis.size > 0 ? Array.from(perfis).join(', ') : 'A confirmar na etapa de planejamento (Regra da Dúvida)',
  };
}

/**
 * Gera um slug curto para sugestão de nome de branch Gitflow.
 */
function slugify(text) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-')
    .slice(0, 4)
    .join('-');
}

/**
 * Extrai a chave da issue (ex: FROTA-27) de um argumento, URL do Jira, número puro ou nome da branch.
 */
function extractIssueKey(rawArg, currentBranch, projectKey = 'FROTA') {
  const keyRegex = /\b([A-Z][A-Z0-9_]+-\d+)\b/i;
  if (rawArg) {
    const trimmed = rawArg.trim();
    if (/^\d+$/.test(trimmed)) {
      return `${projectKey.toUpperCase()}-${trimmed}`;
    }
    const match = trimmed.match(keyRegex);
    if (match) return match[1].toUpperCase();
  }
  if (currentBranch) {
    const branchMatch = currentBranch.match(keyRegex);
    if (branchMatch) return branchMatch[1].toUpperCase();
  }
  return null;
}

/**
 * Realiza requisição autenticada à API REST v3 do Jira Cloud.
 */
async function jiraRequest(config, endpoint) {
  const authHeader = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');
  const url = `${config.baseUrl}${endpoint}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Basic ${authHeader}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `Falha de autenticação/permissão no Jira (HTTP ${response.status}). Verifique JIRA_EMAIL e JIRA_API_TOKEN em .credentials.`
      );
    }
    if (response.status === 404) {
      throw new Error(
        `Recurso não encontrado no Jira (HTTP 404). Confirme se a chave da issue e JIRA_BASE_URL estão corretos.`
      );
    }
    const errText = await response.text().catch(() => '');
    throw new Error(`Erro HTTP ${response.status} ao consultar Jira: ${errText.slice(0, 200)}`);
  }

  return response.json();
}

/**
 * Lista issues abertas atribuídas ao usuário atual (ou do projeto configurado).
 */
async function listMyIssues(config) {
  const projectFilter = config.projectKey ? `project = "${config.projectKey}" AND ` : '';
  const jql = `${projectFilter}assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC`;
  const params = new URLSearchParams({
    jql,
    maxResults: '15',
    fields: 'summary,status,priority,issuetype,updated',
  });

  const data = await jiraRequest(config, `/rest/api/3/search/jql?${params.toString()}`);
  const issues = data.issues || [];

  console.log('## Tarefas Abertas no Jira (Atribuídas a você)\n');
  if (issues.length === 0) {
    console.log('Nenhuma tarefa aberta encontrada para o seu usuário.');
    return;
  }

  console.log('| Chave | Tipo | Status | Prioridade | Título |');
  console.log('|---|---|---|---|---|');
  for (const issue of issues) {
    const key = issue.key;
    const type = issue.fields?.issuetype?.name || '-';
    const status = issue.fields?.status?.name || '-';
    const priority = issue.fields?.priority?.name || '-';
    const summary = (issue.fields?.summary || '').replace(/\|/g, '\\|');
    console.log(`| \`${key}\` | ${type} | ${status} | ${priority} | ${summary} |`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const saveFlag = args.includes('--save');
  const mineFlag = args.includes('--mine') || args.includes('--list');
  const positionalArgs = args.filter((a) => !a.startsWith('--'));

  const currentBranch = runGit('branch --show-current') || 'desconhecida';
  const config = getConfig();

  if (!config.baseUrl || !config.email || !config.apiToken) {
    console.error(
      [
        '⚠️ Credenciais do Jira não encontradas em `.credentials` (nem nas variáveis de ambiente).',
        '',
        'Para habilitar a busca automática no Jira Cloud:',
        '1. Copie o modelo: cp .credentials.example .credentials',
        '2. Gere seu token em: https://id.atlassian.com/manage-profile/security/api-tokens',
        '3. Preencha JIRA_BASE_URL, JIRA_EMAIL e JIRA_API_TOKEN no arquivo `.credentials`.',
        '',
        `Branch Git atual: ${currentBranch}`,
      ].join('\n')
    );
    process.exit(2);
  }

  if (mineFlag) {
    await listMyIssues(config);
    return;
  }

  const issueKey = extractIssueKey(positionalArgs[0], currentBranch, config.projectKey);
  if (!issueKey) {
    console.error(
      [
        '⚠️ Nenhuma chave de issue do Jira foi informada ou detectada no nome da branch atual.',
        `Branch atual: ${currentBranch}`,
        '',
        'Uso:',
        '  node scripts/jira-fetch.mjs FROTA-27',
        '  node scripts/jira-fetch.mjs https://squad24.atlassian.net/browse/FROTA-27',
        '  node scripts/jira-fetch.mjs --mine   (lista suas tarefas abertas no Jira)',
      ].join('\n')
    );
    process.exit(1);
  }

  const fields = [
    'summary',
    'description',
    'status',
    'priority',
    'issuetype',
    'labels',
    'comment',
    'attachment',
    'assignee',
    'reporter',
    'subtasks',
    'parent',
  ].join(',');

  const issue = await jiraRequest(
    config,
    `/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=${fields}`
  );

  const f = issue.fields || {};
  const summary = f.summary || '(Sem título)';
  const issueType = f.issuetype?.name || 'Tarefa';
  const status = f.status?.name || 'Desconhecido';
  const priority = f.priority?.name || 'Normal';
  const assignee = f.assignee?.displayName || 'Não atribuído';
  const reporter = f.reporter?.displayName || 'Não informado';
  const labels = Array.isArray(f.labels) ? f.labels : [];
  const parentInfo = f.parent
    ? `${f.parent.key} — ${f.parent.fields?.summary || ''}`
    : 'Nenhum (item raiz)';

  const descriptionMd =
    adfToMarkdown(f.description) || '*(Sem descrição cadastrada na issue do Jira)*';

  const subtasks = Array.isArray(f.subtasks) ? f.subtasks : [];
  let childIssues = [];
  if (/epic|épico/i.test(issueType) || subtasks.length === 0) {
    try {
      const childParams = new URLSearchParams({
        jql: `parent = "${issue.key}" ORDER BY key ASC`,
        maxResults: '50',
        fields: 'summary,status,issuetype,priority,assignee,description',
      });
      const childData = await jiraRequest(
        config,
        `/rest/api/3/search/jql?${childParams.toString()}`
      );
      childIssues = childData.issues || [];
    } catch {
      childIssues = [];
    }
  }

  const allChildren = subtasks.length > 0 ? subtasks : childIssues;
  const subtasksMd =
    allChildren.length > 0
      ? allChildren
          .map((st) => {
            const done = st.fields?.status?.statusCategory?.key === 'done';
            const stType = st.fields?.issuetype?.name || 'Item';
            const stStatus = st.fields?.status?.name || '';
            const stAssignee = st.fields?.assignee?.displayName
              ? ` — Resp: ${st.fields.assignee.displayName}`
              : '';
            const stDesc = st.fields?.description
              ? '\n  ' + adfToMarkdown(st.fields.description).replace(/\n/g, '\n  ')
              : '';
            return `- [${done ? 'x' : ' '}] **${st.key}** [${stType}]: ${st.fields?.summary || ''} *(${stStatus}${stAssignee})*${stDesc}`;
          })
          .join('\n\n')
      : '- (nenhuma subtarefa ou história vinculada)';

  const commentsList = f.comment?.comments || [];
  const commentsMd =
    commentsList.length > 0
      ? commentsList
          .slice(-10)
          .map((c) => {
            const author = c.author?.displayName || 'Usuário';
            const date = (c.created || '').slice(0, 10);
            const body = adfToMarkdown(c.body).replace(/\n+/g, ' ').trim();
            return `- **${author}** (${date}): ${body}`;
          })
          .join('\n')
      : '- (nenhum comentário)';

  const { modulo, perfis } = inferAratuContext(summary, descriptionMd, labels);
  const isBug = /bug|defeito|erro|fix|corre[cç][aã]o/i.test(issueType);
  const commitType = isBug ? 'fix' : 'feat';
  const moduloSlug = modulo.toLowerCase().replace(/_/g, '-');
  const suggestedCommit = `${commitType}(${moduloSlug}): ${slugify(summary).replace(/-/g, ' ')} (${issue.key})`;
  const planFileName = `${issue.key.toLowerCase()}-${slugify(summary)}.html`;
  const planExists = fs.existsSync(path.join(REPO_ROOT, 'plans', planFileName));

  const markdownOutput = [
    `## Contexto da Tarefa — ${issue.key}`,
    '',
    `- **Chave Jira / Link:** [${issue.key}](${config.baseUrl}/browse/${issue.key})`,
    `- **Título:** ${summary}`,
    `- **Tipo:** ${issueType}`,
    `- **Status no Jira:** ${status}`,
    `- **Prioridade:** ${priority}`,
    `- **Item Pai / Épico:** ${parentInfo}`,
    `- **Labels:** ${labels.length > 0 ? labels.join(', ') : '(nenhuma)'}`,
    `- **Módulo Aratu Sugerido:** \`${modulo}\``,
    `- **Perfis RBAC Identificados:** ${perfis}`,
    `- **Responsável:** ${assignee} · **Relator:** ${reporter}`,
    '',
    '### Descrição e Critérios de Aceite',
    descriptionMd,
    '',
    '### Subtarefas',
    subtasksMd,
    '',
    '### Comentários Recentes',
    commentsMd,
    '',
    '### Situação no Git (`dev-<nome>` → `develop` (QA) → `main`) e SDD',
    `- **Branch atual do desenvolvedor:** \`${currentBranch}\` (atualizada somente via \`main\`)`,
    '- **Fluxo de entrega:** `dev-<nome>` → PR para `develop` (QA) → `main`',
    `- **Commit sugerido:** \`${suggestedCommit}\``,
    `- **Plano SDD (\`plans/${planFileName}\`):** ${planExists ? 'encontrado' : 'ainda não gerado'}`,
  ].join('\n');

  if (saveFlag) {
    const tmpDir = path.join(REPO_ROOT, '.tmp', `task-${issue.key}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'context.md'), markdownOutput + '\n', 'utf-8');
    fs.writeFileSync(
      path.join(tmpDir, 'issue.json'),
      JSON.stringify(
        {
          key: issue.key,
          summary,
          issueType,
          status,
          priority,
          modulo,
          perfis,
          currentBranch,
          suggestedCommit,
          planFileName,
          descriptionMd,
        },
        null,
        2
      ) + '\n',
      'utf-8'
    );
  }

  console.log(markdownOutput);
}

main().catch((err) => {
  console.error(`❌ Erro ao consultar o Jira: ${err.message}`);
  process.exit(1);
});
