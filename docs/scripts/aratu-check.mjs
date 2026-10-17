#!/usr/bin/env node
/**
 * Auditor Automatizado de Qualidade, Camadas, SQL e WCAG — Sistema Aratu (Squad 24)
 *
 * Consolida em 1 única execução toda a coleta de diff Gitflow, validação de
 * Conventional Commits, análise estática dos critérios C1–C17 (camadas Express/React,
 * SQL Injection, SELECT *, client.release(), any, console.log, WCAG 2.2 AA) e
 * compilação TypeScript, economizando 60%–75% de tokens nas skills /revisar,
 * /implementar e /testar.
 *
 * Uso:
 *   node docs/scripts/aratu-check.mjs
 *   node docs/scripts/aratu-check.mjs --base develop
 *   node docs/scripts/aratu-check.mjs --all        (audita todos os arquivos de src/, não só o diff)
 *   node docs/scripts/aratu-check.mjs --skip-tsc   (pula checagem do compilador tsc)
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

function runCmd(cmd, cwd = REPO_ROOT) {
  try {
    const stdout = execSync(cmd, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf-8',
    });
    return { ok: true, output: stdout.trim() };
  } catch (err) {
    const out = [err.stdout, err.stderr].filter(Boolean).join('\n').trim();
    return { ok: false, output: out };
  }
}

function walkCodeFiles(dirPath, results = []) {
  if (!fs.existsSync(dirPath)) return results;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist', 'build'].includes(entry.name)) continue;
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) walkCodeFiles(full, results);
    else if (/\.(ts|tsx|js|mjs|sql|css)$/.test(entry.name)) {
      results.push(path.relative(REPO_ROOT, full).replace(/\\/g, '/'));
    }
  }
  return results;
}

function auditFile(relPath) {
  const absPath = path.join(REPO_ROOT, relPath);
  if (!fs.existsSync(absPath) || fs.statSync(absPath).isDirectory()) return [];

  const content = fs.readFileSync(absPath, 'utf-8');
  const lines = content.split(/\r?\n/);
  const findings = [];

  const isBackend = relPath.startsWith('backend/src/');
  const isFrontend = relPath.startsWith('frontend/src/');
  const isTest = relPath.includes('/tests/') || /\.(test|spec)\./.test(relPath);
  const isTs = /\.(ts|tsx)$/.test(relPath);
  const isCss = /\.css$/.test(relPath);

  // C4: Invariantes de Camada Backend
  if (relPath.startsWith('backend/src/services/')) {
    lines.forEach((line, i) => {
      if (/from\s+['"]express['"]/.test(line)) {
        findings.push({
          severity: '🔴 Bloqueante',
          rule: 'C4 (Camada Service Pura)',
          file: `${relPath}:${i + 1}`,
          msg: 'Service importa tipos/objetos do Express. Mantenha o domínio livre de HTTP.',
        });
      }
      if (/\b(?:SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\b/i.test(line) && !line.trim().startsWith('//') && !line.trim().startsWith('*')) {
        findings.push({
          severity: '🔴 Bloqueante',
          rule: 'C4 (SQL fora do Repository)',
          file: `${relPath}:${i + 1}`,
          msg: 'Query SQL detectada no Service. Mova toda consulta SQL para `backend/src/repositories/`.',
        });
      }
    });
  }

  if (relPath.startsWith('backend/src/controllers/') || relPath.startsWith('backend/src/routes/')) {
    lines.forEach((line, i) => {
      if (/from\s+['"]pg['"]/.test(line) || /\bpool\.query\b/.test(line)) {
        findings.push({
          severity: '🔴 Bloqueante',
          rule: 'C4 (Bypass de Camada)',
          file: `${relPath}:${i + 1}`,
          msg: 'Controller/Route acessando banco de dados diretamente.',
        });
      }
    });
  }

  // C5: Invariantes de Camada Frontend
  if (relPath.startsWith('frontend/src/pages/') || relPath.startsWith('frontend/src/components/')) {
    lines.forEach((line, i) => {
      if (/\bfetch\s*\(/.test(line) && !line.trim().startsWith('//')) {
        findings.push({
          severity: '🟡 Atenção',
          rule: 'C5 (Fronteira de I/O no Frontend)',
          file: `${relPath}:${i + 1}`,
          msg: 'Chamada `fetch()` direta em Page/Component. Centralize em `frontend/src/services/` ou `api/`.',
        });
      }
    });
  }

  // C7 & C8: Segurança e Performance SQL
  if (isBackend || relPath.endsWith('.sql')) {
    lines.forEach((line, i) => {
      if (/SELECT\s+\*\s+FROM/i.test(line) && !line.trim().startsWith('//') && !line.trim().startsWith('--')) {
        findings.push({
          severity: '🔴 Bloqueante',
          rule: 'C8 (Proibido SELECT *)',
          file: `${relPath}:${i + 1}`,
          msg: 'Uso de `SELECT *` detectado. Liste explicitamente as colunas projetadas.',
        });
      }
      if (/\b(?:SELECT|INSERT|UPDATE|DELETE)\b.*\$\{/i.test(line)) {
        findings.push({
          severity: '🔴 Bloqueante',
          rule: 'C7 (Risco de SQL Injection)',
          file: `${relPath}:${i + 1}`,
          msg: 'Interpolação `${}` em query SQL. Use exclusivamente parâmetros posicionais (`$1, $2`).',
        });
      }
    });

    if (/\.connect\s*\(\s*\)/.test(content) && (!/\bfinally\b/.test(content) || !/\.release\s*\(\s*\)/.test(content))) {
      findings.push({
        severity: '🔴 Bloqueante',
        rule: 'C9 (Vazamento de Conexão no Pool)',
        file: relPath,
        msg: 'Uso de `pool.connect()` sem garantia de `client.release()` em bloco `finally`.',
      });
    }
  }

  // C13 & C14: TypeScript Estrito e Clean Code
  if ((isBackend || isFrontend) && isTs && !isTest) {
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;

      if (/(:\s*any\b|\bas\s+any\b|<any>|@ts-ignore|@ts-nocheck)/.test(line)) {
        findings.push({
          severity: '🔴 Bloqueante',
          rule: 'C13 (Proibido any / @ts-ignore)',
          file: `${relPath}:${i + 1}`,
          msg: `Tipagem insegura encontrada: \`${trimmed.slice(0, 70)}\``,
        });
      }

      if (/\bconsole\.log\s*\(/.test(line) && relPath !== 'backend/src/index.ts') {
        findings.push({
          severity: '🟡 Atenção',
          rule: 'C14 (console.log de depuração)',
          file: `${relPath}:${i + 1}`,
          msg: 'Remova `console.log` antes de abrir o Pull Request.',
        });
      }
    });
  }

  // C16 & C17: Acessibilidade WCAG 2.2 AA, Material UI e Padronização CSS
  if (isFrontend && relPath.endsWith('.tsx')) {
    if (/<(input|OutlinedInput|TextField|Select)\b/.test(content) && !/\buseId\s*\(/.test(content) && !/\bFormField\b/.test(content)) {
      findings.push({
        severity: '🟡 Atenção',
        rule: 'C16 (Formulário Acessível — useId / FormField)',
        file: relPath,
        msg: 'Campo de formulário detectado sem `useId()` ou sem o componente reutilizável `FormField` (`src/components/ui/`).',
      });
    }
  }

  if (isFrontend && isCss) {
    const isCssModule = relPath.endsWith('.module.css');
    const kebabClasses = new Set();
    lines.forEach((line, i) => {
      if (/outline\s*:\s*(none|0)\b/i.test(line) && !content.includes(':focus-visible')) {
        findings.push({
          severity: '🔴 Bloqueante',
          rule: 'C17 (Foco Visível — WCAG 2.4.7)',
          file: `${relPath}:${i + 1}`,
          msg: 'Remoção de `outline` sem estilo substituto explícito em `:focus-visible`.',
        });
      }
      if (/:global\(\.Mui/.test(line)) {
        findings.push({
          severity: '🟡 Atenção',
          rule: 'C5 (Proibido :global(.Mui...) em CSS)',
          file: `${relPath}:${i + 1}`,
          msg: 'Sobrescrita manual de classe interna do Material UI detectada. Centralize tokens em `src/theme.ts` ou use a prop `sx`.',
        });
      }
      if (isCssModule && !line.includes(':global(')) {
        const kebabClassMatch = line.match(/\.([a-zA-Z0-9]+-[a-zA-Z0-9-]+)\s*[,{:\s]/);
        if (kebabClassMatch) kebabClasses.add(`.${kebabClassMatch[1]}`);
      }
    });
    if (kebabClasses.size > 0) {
      findings.push({
        severity: '🟡 Atenção',
        rule: 'C14 (CSS Module fora do padrão camelCase em inglês)',
        file: relPath,
        msg: `Classes fora do padrão \`camelCase\` em inglês (${[...kebabClasses].slice(0, 5).join(', ')}${kebabClasses.size > 5 ? '...' : ''}).`,
      });
    }
  }

  return findings;
}

function main() {
  const args = process.argv.slice(2);
  const allFlag = args.includes('--all');
  const skipTsc = args.includes('--skip-tsc');
  const baseIdx = args.indexOf('--base');
  const baseBranch = baseIdx !== -1 && args[baseIdx + 1] ? args[baseIdx + 1] : 'develop';

  const branchRes = runCmd('git branch --show-current');
  const currentBranch = branchRes.ok && branchRes.output ? branchRes.output : 'desconhecida';

  // C2: Validação do nome da branch Gitflow
  const validBranchPattern = /^(main|develop|(feat|feature|fix|hotfix|release|docs|chore|refactor|test)\/[a-z0-9._-]+)$/i;
  const isBranchValid = validBranchPattern.test(currentBranch);

  // Coleta arquivos alterados no diff contra a branch base + working tree local
  const diffFilesSet = new Set();
  if (allFlag) {
    walkCodeFiles(path.join(REPO_ROOT, 'backend', 'src'), []).forEach((f) => diffFilesSet.add(f));
    walkCodeFiles(path.join(REPO_ROOT, 'frontend', 'src'), []).forEach((f) => diffFilesSet.add(f));
  } else {
    const branchDiff = runCmd(`git diff --name-only ${baseBranch}...HEAD`);
    if (branchDiff.ok && branchDiff.output) {
      branchDiff.output.split(/\r?\n/).filter(Boolean).forEach((f) => diffFilesSet.add(f.trim()));
    }
    const localDiff = runCmd('git status --porcelain');
    if (localDiff.ok && localDiff.output) {
      localDiff.output
        .split(/\r?\n/)
        .filter(Boolean)
        .forEach((line) => {
          const filePart = line.slice(3).trim().split(' -> ').pop();
          if (filePart) diffFilesSet.add(filePart.replace(/\\/g, '/'));
        });
    }
  }

  const targetFiles = [...diffFilesSet].filter((f) =>
    /\.(ts|tsx|js|mjs|sql|css)$/.test(f)
  );

  // Estatísticas de linhas do diff
  const shortStat = runCmd(`git diff --shortstat ${baseBranch}...HEAD`);
  const statText = shortStat.ok && shortStat.output ? shortStat.output : 'Sem commits divergentes da base';

  // Commits na branch
  const logRes = runCmd(`git log ${baseBranch}..HEAD --oneline`);
  const commits = logRes.ok && logRes.output ? logRes.output.split(/\r?\n/).filter(Boolean) : [];
  const commitRegex = /^[0-9a-f]+\s+(Merge\b|(feat|fix|docs|test|refactor|chore|style)(\([a-z0-9_-]+\))?!?:\s+.+)/i;
  const invalidCommits = commits.filter((c) => !commitRegex.test(c));

  // Auditoria estática dos arquivos
  const findings = [];
  if (!isBranchValid) {
    findings.push({
      severity: '🟡 Atenção',
      rule: 'C2 (Nomenclatura de Branch Gitflow)',
      file: `branch: ${currentBranch}`,
      msg: 'A branch atual não segue o padrão `feat/<nome-da-tarefa>`, `feature/<nome-da-tarefa>` ou `fix/<nome-da-tarefa>`.',
    });
  }
  for (const ic of invalidCommits) {
    findings.push({
      severity: '🟡 Atenção',
      rule: 'C2 (Conventional Commits)',
      file: `commit: ${ic}`,
      msg: 'Mensagem fora do formato `tipo(escopo): descrição curta`.',
    });
  }

  for (const file of targetFiles) {
    findings.push(...auditFile(file));
  }

  // Execução opcional do TypeScript compiler e testes nativos
  const qaResults = [];
  if (!skipTsc) {
    if (fs.existsSync(path.join(REPO_ROOT, 'backend', 'node_modules'))) {
      const beTsc = runCmd('npx tsc --noEmit', path.join(REPO_ROOT, 'backend'));
      qaResults.push({
        target: 'Backend (`npx tsc --noEmit`)',
        ok: beTsc.ok,
        details: beTsc.ok ? '🟢 Zero erros' : `🔴 Falhou:\n${beTsc.output.split('\n').slice(0, 15).join('\n')}`,
      });
    } else {
      qaResults.push({
        target: 'Backend (`npx tsc --noEmit`)',
        ok: true,
        details: '⚪ `backend/node_modules` não instalado localmente (validar via container Docker)',
      });
    }

    if (fs.existsSync(path.join(REPO_ROOT, 'frontend', 'node_modules'))) {
      const feTsc = runCmd('npx tsc -b --noEmit', path.join(REPO_ROOT, 'frontend'));
      qaResults.push({
        target: 'Frontend (`npx tsc -b --noEmit`)',
        ok: feTsc.ok,
        details: feTsc.ok ? '🟢 Zero erros' : `🔴 Falhou:\n${feTsc.output.split('\n').slice(0, 15).join('\n')}`,
      });
    } else {
      qaResults.push({
        target: 'Frontend (`npx tsc -b --noEmit`)',
        ok: true,
        details: '⚪ `frontend/node_modules` não instalado localmente (validar via container Docker)',
      });
    }

    const feTestsDir = path.join(REPO_ROOT, 'frontend', 'tests');
    if (fs.existsSync(feTestsDir) && fs.readdirSync(feTestsDir).some((f) => f.endsWith('.test.mjs') || f.endsWith('.test.js'))) {
      const feTestRun = runCmd('node --test tests/*.test.mjs', path.join(REPO_ROOT, 'frontend'));
      const passMatch = feTestRun.output.match(/ℹ pass (\d+)/);
      const failMatch = feTestRun.output.match(/ℹ fail (\d+)/);
      const summary = passMatch ? `${passMatch[1]} passaram, ${failMatch ? failMatch[1] : 0} falharam` : 'concluído';
      qaResults.push({
        target: 'Frontend (`node --test tests/*.test.mjs`)',
        ok: feTestRun.ok,
        details: feTestRun.ok ? `🟢 Sucesso (${summary})` : `🔴 Falhou (${summary}):\n${feTestRun.output.split('\n').slice(-15).join('\n')}`,
      });
      if (!feTestRun.ok) {
        findings.push({
          severity: '🔴 Bloqueante',
          rule: 'QA (Testes Automatizados Frontend)',
          file: 'frontend/tests/',
          msg: `Falha na suíte de testes automatizados (${summary}).`,
        });
      }
    }
  }

  const blockers = findings.filter((f) => f.severity.startsWith('🔴'));
  const warnings = findings.filter((f) => f.severity.startsWith('🟡'));

  const out = [
    '## Pré-Auditoria Automatizada (`aratu-check.mjs`) — Sistema Aratu',
    '',
    `- **Branch atual:** \`${currentBranch}\` (${isBranchValid ? '🟢 Gitflow válido' : '🟡 Verificar prefixo Gitflow'})`,
    `- **Branch base comparada:** \`${baseBranch}\``,
    `- **Estatística do Diff:** ${statText}`,
    `- **Commits na branch (${commits.length}):** ${invalidCommits.length === 0 ? '🟢 Todos em Conventional Commits' : `🟡 ${invalidCommits.length} fora do padrão`}`,
    `- **Arquivos de código auditados (${targetFiles.length}):** ${targetFiles.map((f) => `\`${f}\``).join(', ') || '*(nenhum arquivo de código alterado)*'}`,
    '',
    `### Resumo de Achados Estáticos: 🔴 ${blockers.length} Bloqueante(s) · 🟡 ${warnings.length} Atenção`,
  ];

  if (findings.length === 0) {
    out.push('- 🟢 Nenhuma violação estática detectada nos critérios de camadas, SQL, TypeScript ou WCAG.');
  } else {
    for (const f of findings) {
      out.push(`- **${f.severity}** [${f.rule}] \`${f.file}\` — ${f.msg}`);
    }
  }

  if (qaResults.length > 0) {
    out.push('', '### Compilação TypeScript e Testes Automatizados');
    for (const q of qaResults) {
      out.push(`- **${q.target}:** ${q.details}`);
    }
  }

  console.log(out.join('\n'));
  process.exit(blockers.length > 0 ? 1 : 0);
}

main();
