# Relatórios Operacionais e Exportações — Sistema Aratu

Este documento define a arquitetura, os padrões de consulta e os requisitos de acessibilidade e proteção de dados (LGPD) para a geração de relatórios gerenciais, comprovantes operacionais e exportações (PDF, CSV e planilhas) no **Sistema Aratu** (**FSPH** e **SVO**).

---

## 1. Contexto Operacional dos Relatórios no Aratu

Os relatórios e documentos emitidos pelo sistema atendem a duas frentes distintas:

1. **Gestão de Frota e Viagens (FSPH):**
   - Histórico de viagens por unidade solicitante, veículo ou motorista;
   - Indicadores de quilometragem rodada, consumo, taxa de ocupação e disponibilidade da frota;
   - Histórico de manutenções preventivas e corretivas por viatura.
2. **Operações do Serviço de Verificação de Óbito (SVO):**
   - Relatórios operacionais de chamados atendidos, tempo médio de remoção e deslocamento;
   - Termos formais de custódia de pertences e protocolos de liberação de corpo (documentos com alto rigor legal e sigilo absoluto).

---

## 2. Arquitetura de Implementação em Camadas

A geração de relatórios e exportações segue estritamente a divisão de camadas do projeto:

| Camada | Responsabilidade no Relatório |
|---|---|
| **Repository (`backend/src/repositories/`)** | Executa a consulta SQL parametrizada (`$1, $2`), aplicando filtros sargáveis (intervalos de data `>=` e `<`), agregações no próprio PostgreSQL 18 (`COUNT`, `SUM`, `AVG`) e ordenação explícita. Proibido `SELECT *`. |
| **Service (`backend/src/services/`)** | Valida os filtros solicitados (ex: período máximo permitido), aplica regras de negócio, verifica permissões de escopo e estrutura os dados consolidados (DTO do relatório). |
| **Controller (`backend/src/controllers/`)** | Recebe os parâmetros de filtro via query string, aciona o Service e retorna o payload JSON (para visualização em tela) ou o stream do arquivo com os cabeçalhos HTTP apropriados (`Content-Type`, `Content-Disposition`). |
| **Frontend (`frontend/src/pages/` e `components/`)** | Exibe formulário de filtros acessível (`useId()`), tabela de pré-visualização com os 5 estados visuais e botões claros de exportação (`"Exportar PDF"`, `"Exportar CSV"`). |

---

## 3. Boas Práticas de Consulta SQL para Relatórios

- **Filtros de período sargáveis:** nunca aplique `DATE(data_saida)` ou `EXTRACT(MONTH FROM data_saida)` na cláusula `WHERE`. Utilize intervalos semiabertos para preservar o uso de índices B-tree:
  ```sql
  WHERE v.data_saida >= $1
    AND v.data_saida < $2
  ```
- **Agregação no banco, não no Node.js:** totalizadores de quilometragem, contagens por status e médias devem ser calculados pelo PostgreSQL 18, evitando carregar milhares de registros na memória da API.
- **Tratamento de Nulos:** medidas ainda não informadas (como `quilometragem_final` de uma viagem em andamento) permanecem `NULL` no banco para não distorcer médias (`AVG`) com zeros artificiais.

---

## 4. Acessibilidade em Relatórios e Documentos (WCAG 2.2 AA)

Conforme diretriz de acessibilidade do projeto, qualquer relatório — em tela ou exportado para PDF/impressão — é lido por pessoas e deve cumprir:

1. **Não depender exclusivamente de cor:** indicadores de situação (`Aprovada`, `Cancelada`, `Manutenção`, `Urgente`) devem trazer sempre o texto explícito na coluna ou célula, nunca apenas cores de fundo.
2. **Contraste e Legibilidade:** textos e cabeçalhos de tabelas devem manter relação de contraste mínima de **4.5:1**, fontes legíveis e cabeçalhos semânticos (`<th scope="col">`).
3. **Metadados Claros:** todo relatório gerado deve exibir no cabeçalho o título do relatório, os filtros aplicados (período, unidade, status), a data/hora de emissão (com fuso horário) e o usuário emissor.

---

## 5. Proteção de Dados, LGPD e Sigilo do SVO

- **Controle de Acesso Estrito (RBAC):**
  - Relatórios nominais ou operacionais do **SVO** são estritamente restritos aos perfis autorizados (`OPERADOR_SVO` e `ADMIN`, conforme escopo de negócio). Um `SOLICITANTE` ou `MOTORISTA` nunca pode acessar listagens ou exportações de registros de óbito.
- **Minimização de Dados:** exporte apenas as colunas estritamente necessárias para a finalidade administrativa do relatório.
- **Rastreabilidade:** a emissão de comprovantes e relatórios sensíveis do SVO deve registrar quem gerou o documento e o instante da emissão (`TIMESTAMPTZ`).
