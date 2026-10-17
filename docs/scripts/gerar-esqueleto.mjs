#!/usr/bin/env node
/**
 * Gerador de Esqueleto HTML (SDD e Documentação de Módulo) — Sistema Aratu (Squad 24)
 *
 * Economiza milhares de tokens de entrada e saída ao gerar automaticamente
 * o arquivo HTML com todo o CSS oficial, cabeçalho, metadados do Jira, sumário (TOC),
 * Checklist Pré-PR (Seção 10) e Princípios de Desenvolvimento (Seção 12) já preenchidos.
 * O agente de IA só precisa editar os blocos <!-- PREENCHER_SECAO_X --> com replace_file_content.
 *
 * Uso:
 *   node docs/scripts/gerar-esqueleto.mjs plano FROTA-27
 *   node docs/scripts/gerar-esqueleto.mjs plano FROTA-27 --titulo "Controle de Sessão" --modulo AUTENTICACAO_RBAC --perfis "ADMIN, GESTOR_FROTA"
 *   node docs/scripts/gerar-esqueleto.mjs modulo AUTENTICACAO_RBAC --titulo "Autenticação e RBAC"
 *   node docs/scripts/gerar-esqueleto.mjs plano FROTA-27 --force   (sobrescreve se já existir)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

function slugify(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getArgValue(args, flag) {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith('--')) {
    return args[idx + 1];
  }
  return null;
}

function extractStyleBlock(templatePath) {
  const html = fs.readFileSync(templatePath, 'utf-8');
  const match = html.match(/<style>[\s\S]*?<\/style>/i);
  if (!match) {
    throw new Error(`Bloco <style> não encontrado em ${templatePath}`);
  }
  return match[0];
}

function generatePlano(targetKeyRaw, args) {
  const forceFlag = args.includes('--force');
  const issueKey = targetKeyRaw.toUpperCase().startsWith('FROTA-')
    ? targetKeyRaw.toUpperCase()
    : /^\d+$/.test(targetKeyRaw)
      ? `FROTA-${targetKeyRaw}`
      : targetKeyRaw.toUpperCase();

  // Tenta carregar metadados salvos pelo jira-fetch.mjs em .tmp/task-<ISSUE_KEY>/issue.json
  const cachedJsonPath = path.join(REPO_ROOT, '.tmp', `task-${issueKey}`, 'issue.json');
  let cached = {};
  if (fs.existsSync(cachedJsonPath)) {
    try {
      cached = JSON.parse(fs.readFileSync(cachedJsonPath, 'utf-8'));
    } catch {
      cached = {};
    }
  }

  const summary = getArgValue(args, '--titulo') || cached.summary || 'Descrição da Tarefa';
  const modulo = getArgValue(args, '--modulo') || cached.modulo || 'AUTENTICACAO_RBAC';
  const perfis = getArgValue(args, '--perfis') || cached.perfis || 'ADMIN, GESTOR_FROTA';
  const branch =
    getArgValue(args, '--branch') ||
    cached.suggestedBranch ||
    `feat/${slugify(summary) || issueKey.toLowerCase()}`;
  const today = new Date().toISOString().slice(0, 10);

  const slug = slugify(summary) || 'plano';
  const fileName =
    getArgValue(args, '--output') ||
    cached.planFileName ||
    `${issueKey.toLowerCase()}-${slug}.html`;
  const outPath = path.join(REPO_ROOT, 'docs', 'plans', fileName);

  if (fs.existsSync(outPath) && !forceFlag) {
    console.error(
      `⚠️ O arquivo docs/plans/${fileName} já existe. Use --force se desejar sobrescrevê-lo.`
    );
    process.exit(1);
  }

  const templatePath = path.join(REPO_ROOT, 'docs', 'plans', 'EXEMPLO_PLANO.html');
  const styleBlock = extractStyleBlock(templatePath);

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SDD — ${escapeHtml(issueKey)} — ${escapeHtml(summary)} (Sistema Aratu)</title>
  ${styleBlock}
</head>
<body>

<h1>SDD — ${escapeHtml(issueKey)}: ${escapeHtml(summary)}</h1>

<div class="meta-block">
  <p><strong>Tarefa / História:</strong> <code>${escapeHtml(issueKey)}</code> — ${escapeHtml(summary)}</p>
  <p><strong>Branch (Gitflow):</strong> <code>${escapeHtml(branch)}</code> (criada a partir de <code>develop</code> → PR para <code>develop</code>)</p>
  <p><strong>Contexto Operacional:</strong> Fundação de Saúde Parreiras Horta (FSPH) / Serviço de Verificação de Óbito (SVO)</p>
  <p><strong>Módulo:</strong> <code>${escapeHtml(modulo)}</code></p>
  <p><strong>Perfis RBAC Impactados:</strong> <code>${escapeHtml(perfis)}</code></p>
  <p><strong>Data:</strong> ${today}</p>
</div>

<ol class="toc">
  <li><a href="#s1">Contexto, Objetivo e Escopo</a></li>
  <li><a href="#s2">Requisitos e Regras de Negócio (Casos de Borda)</a></li>
  <li><a href="#s3">Estrutura de Arquivos</a></li>
  <li><a href="#s4">Banco de Dados e Migrações (PostgreSQL 18)</a></li>
  <li><a href="#s5">Back-end — Contratos REST e Detalhamento por Arquivo (Express 5 / TS)</a></li>
  <li><a href="#s6">Front-end — Telas, Componentes React 19 e Estados Visuais</a></li>
  <li><a href="#s7">Acessibilidade (WCAG 2.2 Nível AA)</a></li>
  <li><a href="#s8">Escopo de Impacto, RBAC e Configuração</a></li>
  <li><a href="#s9">Casos de Teste e Verificação</a></li>
  <li><a href="#s10">Checklist Pré-PR</a></li>
  <li><a href="#s11">Atualização da Documentação do Módulo</a></li>
  <li><a href="#s12">Princípios de Desenvolvimento e Restrições de Implementação</a></li>
</ol>

<hr>

<h2 id="s1">1. Contexto, Objetivo e Escopo</h2>
<!-- PREENCHER_SECAO_1: Objetivo operacional na FSPH/SVO, delimitação YAGNI (entra/fora do escopo) e decisões confirmadas pela Regra da Dúvida -->
<p>[Descrever objetivo no domínio FSPH/SVO]</p>

<hr>

<h2 id="s2">2. Requisitos e Regras de Negócio (Casos de Borda)</h2>
<!-- PREENCHER_SECAO_2: Cenários Dado/Quando/Então, transições de status e requisitos não-funcionais -->
<p>[Especificar RF e RNF]</p>

<hr>

<h2 id="s3">3. Estrutura de Arquivos</h2>
<!-- PREENCHER_SECAO_3: Novos arquivos e arquivos modificados em backend/src/ e frontend/src/ -->
<h3>Arquivos de referência no projeto (padrão a seguir)</h3>
<ul>
  <li><strong>Camadas Backend e Frontend:</strong> <code>docs/manuais/arquitetura-camadas.md</code>, <code>docs/manuais/padroes-backend.md</code> e <code>docs/manuais/padroes-frontend.md</code>.</li>
  <li><strong>Padrões de Projeto (Design Patterns):</strong> <code>docs/manuais/padroes-projeto.md</code> (Repository, State/FSM, Strategy, Chain of Responsibility, Compound Components).</li>
  <li><strong>Componentes UI Acessíveis:</strong> <code>frontend/src/components/ui/</code>.</li>
</ul>

<hr>

<h2 id="s4">4. Banco de Dados e Migrações (PostgreSQL 18)</h2>
<!-- PREENCHER_SECAO_4: DDL transacional BEGIN...COMMIT, índices e Rollback (ou declarar "Não se aplica a esta tarefa") -->
<p>[Especificar migrations ou declarar não aplicável]</p>

<hr>

<h2 id="s5">5. Back-end — Contratos REST e Detalhamento por Arquivo (Express 5 / TS)</h2>
<!-- PREENCHER_SECAO_5: Tabela de endpoints REST, Types/DTOs, Repository ($1, $2), Service puro e Controller/Middleware -->
<p>[Especificar contratos e camadas do backend ou declarar não aplicável]</p>

<hr>

<h2 id="s6">6. Front-end — Telas, Componentes React 19 e Estados Visuais</h2>
<!-- PREENCHER_SECAO_6: Componentes reutilizados e tabela dos 5 estados visuais (Ideal, Carregando, Vazio, Erro, Parcial) -->
<p>[Especificar telas e os 5 estados visuais ou declarar não aplicável]</p>

<hr>

<h2 id="s7">7. Acessibilidade (WCAG 2.2 Nível AA)</h2>
<!-- PREENCHER_SECAO_7: Checklist de acessibilidade aplicável à tarefa (useId, teclado, foco visível, alvo 44x44px, role="alert"/"status") -->
<ul class="check">
  <li><input type="checkbox"> <strong>Rótulos e Erros (1.3.1, 3.3.1, 3.3.2):</strong> Todos os campos usam <code>useId()</code> conectando <code>&lt;label htmlFor&gt;</code> ao <code>&lt;input id&gt;</code>, <code>aria-invalid</code> e mensagem de erro com <code>role="alert"</code>.</li>
  <li><input type="checkbox"> <strong>Teclado e Foco Visível (2.1.1, 2.4.7, 2.4.11):</strong> Operável integralmente via <code>Tab</code>, <code>Shift+Tab</code>, <code>Enter</code>, <code>Espaço</code> e <code>Esc</code>, com <code>:focus-visible</code> nítido.</li>
  <li><input type="checkbox"> <strong>Tamanho do Alvo (2.5.8):</strong> Botões e controles interativos possuem área mínima de <strong>44×44px</strong> em telas operacionais.</li>
  <li><input type="checkbox"> <strong>Contraste e Uso de Cor (1.4.1, 1.4.3, 1.4.11):</strong> Contraste de texto &gt;= 4.5:1 e status acompanhado de rótulo textual além da cor.</li>
  <li><input type="checkbox"> <strong>Mensagens de Status (4.1.3):</strong> Feedbacks dinâmicos anunciados via <code>role="status"</code> ou <code>aria-live="polite"</code>.</li>
</ul>

<hr>

<h2 id="s8">8. Escopo de Impacto, RBAC e Configuração</h2>
<!-- PREENCHER_SECAO_8: Matriz de acesso por perfil RBAC e variáveis de ambiente/parametrização -->
<p>[Detalhar escopo RBAC e configurações]</p>

<hr>

<h2 id="s9">9. Casos de Teste e Verificação</h2>
<!-- PREENCHER_SECAO_9: Testes automatizados (unitários/integração) e roteiro manual com dados 100% fictícios (LGPD) -->
<p>[Listar cenários de teste automatizados e manuais]</p>

<hr>

<h2 id="s10">10. Checklist Pré-PR</h2>

<ul class="check">
  <li><input type="checkbox"> Branch da tarefa criada a partir de <code>develop</code> atualizada (<code>feat/&lt;nome-da-tarefa&gt;</code>, <code>feature/&lt;nome-da-tarefa&gt;</code> ou <code>fix/&lt;nome-da-tarefa&gt;</code>), com PR direcionado para <code>develop</code></li>
  <li><input type="checkbox"> Commits atômicos seguindo Conventional Commits identificando a entrega (<code>tipo(escopo): descrição curta (${escapeHtml(issueKey)})</code>)</li>
  <li><input type="checkbox"> Diff focado (muda comportamento <strong>ou</strong> estrutura, nunca os dois juntos) e abaixo de 400 linhas</li>
  <li><input type="checkbox"> Métodos públicos de Services, Middlewares e Props de componentes documentados com TSDoc semântico conforme <code>docs/manuais/padroes-docblocks.md</code></li>
  <li><input type="checkbox"> <code>npx tsc --noEmit</code> (backend) e <code>npm run lint &amp;&amp; npm run build</code> (frontend) executando com zero erros</li>
  <li><input type="checkbox"> Sem valores mágicos, sem uso de <code>any</code> e sem <code>console.log</code> de depuração</li>
  <li><input type="checkbox"> Queries SQL parametrizadas (<code>$1, $2</code>), sem <code>SELECT *</code>, e conexões de transação liberadas no <code>finally</code></li>
  <li><input type="checkbox"> Checklist de acessibilidade WCAG 2.2 Nível AA (seção 7) 100% atendida</li>
  <li><input type="checkbox"> Zero dados pessoais reais de motoristas, servidores da FSPH ou registros do SVO (LGPD)</li>
</ul>

<hr>

<h2 id="s11">11. Atualização da Documentação do Módulo</h2>

<p><strong>Arquivo de referência:</strong> <code>docs/modulos/${escapeHtml(modulo)}.html</code> (baseado em <code>docs/modulos/EXEMPLO_MODULO.html</code>)</p>
<!-- PREENCHER_SECAO_11: Indicar se impacta ou não a documentação do módulo -->
<blockquote>Esta tarefa <strong>[impacta / não impacta]</strong> a documentação técnica e funcional do módulo. Atualize as seções correspondentes antes de abrir o Pull Request.</blockquote>

<hr>

<h2 id="s12">12. Princípios de Desenvolvimento e Restrições de Implementação</h2>

<blockquote>Seção obrigatória em todo plano técnico do Sistema Aratu (conforme <code>.agents/skills/principios/references/planejamento.md</code>).</blockquote>

<p>A implementação deste plano segue estritamente a ordem de precedência da skill canônica <code>principios</code>:</p>
<ol>
  <li><strong>Padrões do Projeto Aratu:</strong> camadas Node.js/Express 5 (<code>routes</code> → <code>controllers</code> → <code>services</code> → <code>repositories</code>), Padrões de Projeto conforme <code>docs/manuais/padroes-projeto.md</code>, React 19 (<code>pages</code>, <code>components/ui</code>, <code>services</code>) e PostgreSQL 18.</li>
  <li><strong>Escopo de Impacto:</strong> controle por dado de domínio e perfis RBAC (<code>ADMIN</code>, <code>GESTOR_FROTA</code>, <code>SOLICITANTE</code>, <code>MOTORISTA</code>, <code>OPERADOR_SVO</code>).</li>
  <li><strong>Compatibilidade de Dados e Contratos:</strong> preservação dos contratos JSON e integridade dos registros já gravados.</li>
  <li><strong>Idempotência e Atomicidade:</strong> transações explícitas no pool <code>pg</code> com <code>SELECT ... FOR UPDATE</code> em alocações concorrentes.</li>
  <li><strong>YAGNI:</strong> sem parâmetros, tabelas ou abstrações especulativas.</li>
  <li><strong>DRY:</strong> regra de negócio em um único <code>Service</code> e componentes visuais reutilizados de <code>components/ui/</code>.</li>
  <li><strong>SOLID e KISS:</strong> responsabilidade única, baixo acoplamento e solução mais simples e legível.</li>
  <li><strong>Clean Code e TypeScript Estrito:</strong> zero <code>any</code>, zero valores mágicos, nomes claros no vocabulário da FSPH e do SVO e TSDoc semântico conforme <code>docs/manuais/padroes-docblocks.md</code>.</li>
</ol>

<ul>
  <li><strong>Regra Inegociável da Dúvida na Implementação:</strong> Qualquer divergência encontrada entre este plano e a base de código real interrompe o trabalho e vira pergunta objetiva ao usuário. É terminantemente proibido improvisar ou assumir premissas.</li>
  <li><strong>Proteção de Dados (LGPD / SVO):</strong> Nenhum dado pessoal real de motoristas, servidores ou falecidos entra em seeds, testes, fixtures ou commits.</li>
</ul>

</body>
</html>
`;

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, html, 'utf-8');
  console.log(`✅ Esqueleto SDD gerado com sucesso em: docs/plans/${fileName}`);
  console.log(
    '📌 Edite apenas os blocos <!-- PREENCHER_SECAO_1 --> a <!-- PREENCHER_SECAO_9 --> e <!-- PREENCHER_SECAO_11 --> com replace_file_content (sem precisar ler EXEMPLO_PLANO.html).'
  );
}

function generateModulo(moduloKeyRaw, args) {
  const forceFlag = args.includes('--force');
  const moduloKey = moduloKeyRaw.toUpperCase().trim();
  const titulo = getArgValue(args, '--titulo') || moduloKey;
  const today = new Date().toISOString().slice(0, 10);
  const fileName = `${moduloKey}.html`;
  const outPath = path.join(REPO_ROOT, 'docs', 'modulos', fileName);

  if (fs.existsSync(outPath) && !forceFlag) {
    console.error(
      `⚠️ O arquivo docs/modulos/${fileName} já existe. Use --force se desejar sobrescrevê-lo.`
    );
    process.exit(1);
  }

  const templatePath = path.join(REPO_ROOT, 'docs', 'modulos', 'EXEMPLO_MODULO.html');
  const styleBlock = extractStyleBlock(templatePath);

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(moduloKey)} — ${escapeHtml(titulo)} (Sistema Aratu)</title>
  ${styleBlock}
</head>
<body>

<h1>${escapeHtml(moduloKey)} — ${escapeHtml(titulo)}</h1>

<div class="meta-block">
  <p><strong>Módulo (chave):</strong> <code>${escapeHtml(moduloKey)}</code></p>
  <p><strong>Índice de referência:</strong> <code>docs/manuais/modulos.md</code></p>
  <p><strong>Camadas Backend (Express 5 / TS):</strong> <code>backend/src/routes/</code>, <code>backend/src/controllers/</code>, <code>backend/src/services/</code>, <code>backend/src/repositories/</code></p>
  <p><strong>Camadas Frontend (React 19 / TS):</strong> <code>frontend/src/pages/</code>, <code>frontend/src/components/</code>, <code>frontend/src/services/</code></p>
  <p><strong>Banco de Dados:</strong> <code>PostgreSQL 18</code> (container <code>db</code> — database <code>meubanco</code>)</p>
  <p><strong>Versão da documentação:</strong> ${today}</p>
</div>

<hr>

<h2>1. Visão Geral</h2>
<!-- PREENCHER_MODULO_SECAO_1: Propósito operacional para a FSPH e SVO -->
<p>[Descrever propósito operacional do módulo]</p>

<hr>

<h2>2. Regras de Negócio e Transições de Estado</h2>
<!-- PREENCHER_MODULO_SECAO_2: Invariantes, validações e métodos de Service -->
<ul>
  <li>[Regra 1]</li>
</ul>

<hr>

<h2>3. Escopo de Impacto e Matriz de Acesso (RBAC)</h2>
<!-- PREENCHER_MODULO_SECAO_3: Tabela de permissões por perfil RBAC -->
<table>
  <thead>
    <tr>
      <th scope="col">Perfil RBAC</th>
      <th scope="col">Ações Permitidas no Módulo</th>
      <th scope="col">Restrições de Escopo / Visibilidade</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><span class="badge-rbac">ADMIN</span></td>
      <td>[Ações]</td>
      <td>[Escopo]</td>
    </tr>
  </tbody>
</table>

<hr>

<h2>4. Tabelas do Banco de Dados (PostgreSQL 18)</h2>
<!-- PREENCHER_MODULO_SECAO_4: Tabelas, grão da linha, colunas e índices -->
<table>
  <thead>
    <tr>
      <th scope="col">Tabela</th>
      <th scope="col">Descrição Funcional (Grão da Linha)</th>
      <th scope="col">Colunas-Chave e Tipos</th>
      <th scope="col">Constraints e Índices</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><span class="badge-tabela">[tabela]</span></td>
      <td>[Descrição]</td>
      <td>[Colunas]</td>
      <td>[Índices]</td>
    </tr>
  </tbody>
</table>

<hr>

<h2>5. Contratos de API REST (Backend Express 5)</h2>
<!-- PREENCHER_MODULO_SECAO_5: Endpoints REST e status HTTP -->
<table>
  <thead>
    <tr>
      <th scope="col">Método</th>
      <th scope="col">Endpoint</th>
      <th scope="col">Controller / Método</th>
      <th scope="col">Perfis Autorizados</th>
      <th scope="col">Resumo do Contrato (Entrada → Saída)</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><span class="badge-http">GET</span></td>
      <td><code>/api/...</code></td>
      <td><code>Controller::metodo</code></td>
      <td>[Perfis]</td>
      <td>[Contrato]</td>
    </tr>
  </tbody>
</table>

<hr>

<h2>6. Camadas de Negócio e Persistência (Backend)</h2>
<!-- PREENCHER_MODULO_SECAO_6: Classes de Service, Repository e Types -->
<table>
  <thead>
    <tr>
      <th scope="col">Classe / Arquivo</th>
      <th scope="col">Camada</th>
      <th scope="col">Responsabilidade Principal</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><code>[Arquivo]</code></td>
      <td>[Camada]</td>
      <td>[Responsabilidade]</td>
    </tr>
  </tbody>
</table>

<hr>

<h2>7. Interface e Acessibilidade (Frontend React 19 + WCAG 2.2 AA)</h2>
<!-- PREENCHER_MODULO_SECAO_7: Páginas, os 5 estados visuais e critérios WCAG 2.2 AA -->
<ul>
  <li><strong>Páginas:</strong> [Descrever páginas e os 5 estados visuais]</li>
  <li><strong>Acessibilidade (WCAG 2.2 AA):</strong> [Descrever conformidade]</li>
</ul>

<hr>

<h2>8. Arquivos Principais (Referência Rápida)</h2>
<!-- PREENCHER_MODULO_SECAO_8: Caminho completo, camada e resumo -->
<table>
  <thead>
    <tr>
      <th scope="col">Caminho do Arquivo</th>
      <th scope="col">Camada</th>
      <th scope="col">Responsabilidade (Resumo)</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><code>[caminho]</code></td>
      <td>[Camada]</td>
      <td>[Resumo]</td>
    </tr>
  </tbody>
</table>

<hr>

<h2>9. Dependências, Integrações e Proteção de Dados (LGPD)</h2>
<!-- PREENCHER_MODULO_SECAO_9: Integrações com outros módulos e proteção LGPD/SVO -->
<ul>
  <li><strong>Integrações Internas:</strong> [Descrever]</li>
  <li><strong>Proteção de Dados (LGPD e Sigilo SVO):</strong> [Descrever]</li>
</ul>

</body>
</html>
`;

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, html, 'utf-8');
  console.log(`✅ Esqueleto de Módulo gerado com sucesso em: docs/modulos/${fileName}`);
  console.log(
    '📌 Edite os blocos <!-- PREENCHER_MODULO_SECAO_1 --> a <!-- PREENCHER_MODULO_SECAO_9 --> com replace_file_content (sem precisar ler EXEMPLO_MODULO.html).'
  );
}

function main() {
  const args = process.argv.slice(2);
  const tipo = (args[0] || '').toLowerCase();
  const alvo = args[1];

  if (!tipo || !alvo || !['plano', 'modulo'].includes(tipo)) {
    console.error(
      [
        'Uso:',
        '  node docs/scripts/gerar-esqueleto.mjs plano <CHAVE_JIRA> [--titulo "..."] [--modulo "..."] [--perfis "..."] [--force]',
        '  node docs/scripts/gerar-esqueleto.mjs modulo <CHAVE_MODULO> [--titulo "..."] [--force]',
      ].join('\n')
    );
    process.exit(1);
  }

  if (tipo === 'plano') {
    generatePlano(alvo, args.slice(2));
  } else {
    generateModulo(alvo, args.slice(2));
  }
}

main();
