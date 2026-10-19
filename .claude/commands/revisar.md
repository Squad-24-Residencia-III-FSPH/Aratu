---
description: Revisão automatizada de código da branch da tarefa contra develop — Sistema Aratu
argument-hint: "[chave ou URL da issue no Jira (ex: FROTA-27), branch da tarefa (ex: feat/controle-sessao-token) ou vazio para a branch atual]"
---

Carregue e aplique obrigatoriamente a skill canônica `.agents/skills/principios/SKILL.md` (e todas as suas referências em `.agents/skills/principios/references/`) e execute integralmente o fluxo da skill `.agents/skills/revisar/SKILL.md`.
Ao finalizar o relatório de revisão, abra o arquivo HTML gerado no navegador padrão do desenvolvedor (`Start-Process` no Windows ou `open`/`xdg-open`).

Contexto / Argumentos da solicitação:
$ARGUMENTS
