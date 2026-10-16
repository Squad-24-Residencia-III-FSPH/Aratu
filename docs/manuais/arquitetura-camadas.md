# Estrutura e Padrões de `src/` — Sistema Aratu

Este documento detalha como organizar arquivos, responsabilidades e contratos dentro de `backend/src/` e `frontend/src/` no **Sistema Aratu**, com exemplos práticos em TypeScript seguindo **Clean Code, SOLID e DRY**.

---

## 1. Backend (`backend/src/`)

O fluxo de uma requisição no servidor segue estritamente a cadeia:
**`Route` → `Middleware (Auth/RBAC)` → `Controller` → `Service` → `Repository` → `PostgreSQL 18`**.

### 1.1 Types e DTOs (`backend/src/types/`)

Definem entidades, enums de domínio e contratos de entrada/saída. Nunca use `any`.

```typescript
// backend/src/types/veiculo.types.ts
export type StatusVeiculo = 'disponivel' | 'em_viagem' | 'manutencao' | 'inativo';

export type TipoVeiculo = 'administrativo' | 'ambulancia' | 'remocao_svo';

export interface Veiculo {
  id: string;
  placa: string;
  modelo: string;
  tipoVeiculo: TipoVeiculo;
  capacidadePassageiros: number;
  quilometragemAtual: number;
  status: StatusVeiculo;
  createdAt: Date;
  updatedAt: Date;
}

export interface CriarVeiculoInput {
  placa: string;
  modelo: string;
  tipoVeiculo: TipoVeiculo;
  capacidadePassageiros: number;
  quilometragemAtual: number;
}
```

### 1.2 Repositories (`backend/src/repositories/`)

Encapsulam o acesso ao PostgreSQL 18 via `pg.Pool`. Proibido usar `SELECT *` ou interpolar strings.

```typescript
// backend/src/repositories/veiculo.repository.ts
import { Pool, PoolClient } from 'pg';
import { CriarVeiculoInput, StatusVeiculo, Veiculo } from '../types/veiculo.types';

const COLUNAS_VEICULO = `
  id,
  placa,
  modelo,
  tipo_veiculo AS "tipoVeiculo",
  capacidade_passageiros AS "capacidadePassageiros",
  quilometragem_atual AS "quilometragemAtual",
  status,
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

export class VeiculoRepository {
  constructor(private readonly pool: Pool) {}

  async buscarPorPlaca(placa: string): Promise<Veiculo | null> {
    const query = `
      SELECT ${COLUNAS_VEICULO}
      FROM veiculos
      WHERE placa = $1
      LIMIT 1;
    `;
    const resultado = await this.pool.query<Veiculo>(query, [placa]);
    return resultado.rows[0] ?? null;
  }

  async buscarPorIdComTrava(id: string, client: PoolClient): Promise<Veiculo | null> {
    const query = `
      SELECT ${COLUNAS_VEICULO}
      FROM veiculos
      WHERE id = $1
      FOR UPDATE;
    `;
    const resultado = await client.query<Veiculo>(query, [id]);
    return resultado.rows[0] ?? null;
  }

  async criar(dados: CriarVeiculoInput): Promise<Veiculo> {
    const query = `
      INSERT INTO veiculos (placa, modelo, tipo_veiculo, capacidade_passageiros, quilometragem_atual, status)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING ${COLUNAS_VEICULO};
    `;
    const statusInicial: StatusVeiculo = 'disponivel';
    const valores = [
      dados.placa,
      dados.modelo,
      dados.tipoVeiculo,
      dados.capacidadePassageiros,
      dados.quilometragemAtual,
      statusInicial,
    ];
    const resultado = await this.pool.query<Veiculo>(query, valores);
    return resultado.rows[0];
  }
}
```

### 1.3 Services (`backend/src/services/`)

Concentram todas as regras de negócio, validações de domínio e orquestração de transações. Não importam `Request` nem `Response` do Express.

```typescript
// backend/src/services/veiculo.service.ts
import { VeiculoRepository } from '../repositories/veiculo.repository';
import { CriarVeiculoInput, Veiculo } from '../types/veiculo.types';

const REGEX_PLACA_BR = /^[A-Z]{3}-?[0-9][A-Z0-9][0-9]{2}$/;

export class VeiculoService {
  constructor(private readonly veiculoRepository: VeiculoRepository) {}

  async cadastrarVeiculo(entrada: CriarVeiculoInput): Promise<Veiculo> {
    const placaNormalizada = entrada.placa.trim().toUpperCase();

    if (!REGEX_PLACA_BR.test(placaNormalizada)) {
      throw new Error('Formato de placa inválido. Informe o padrão ABC-1234 ou Mercosul ABC1D23.');
    }

    if (entrada.quilometragemAtual < 0) {
      throw new Error('A quilometragem atual não pode ser negativa.');
    }

    const existente = await this.veiculoRepository.buscarPorPlaca(placaNormalizada);
    if (existente) {
      throw new Error(`Já existe um veículo cadastrado com a placa ${placaNormalizada}.`);
    }

    return this.veiculoRepository.criar({
      ...entrada,
      placa: placaNormalizada,
    });
  }
}
```

### 1.4 Controllers e Routes (`backend/src/controllers/` e `backend/src/routes/`)

Traduzem requisições HTTP para chamadas ao Service e devolvem status HTTP semânticos.

```typescript
// backend/src/controllers/veiculo.controller.ts
import { Request, Response } from 'express';
import { VeiculoService } from '../services/veiculo.service';

export class VeiculoController {
  constructor(private readonly veiculoService: VeiculoService) {}

  cadastrar = async (req: Request, res: Response): Promise<void> => {
    try {
      const veiculo = await this.veiculoService.cadastrarVeiculo(req.body);
      res.status(201).json(veiculo);
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : 'Erro inesperado ao cadastrar veículo.';
      res.status(400).json({ erro: mensagem });
    }
  };
}
```

---

## 2. Frontend (`frontend/src/`)

O fluxo no frontend React 19 segue a separação:
**`Page` → `Hook / Estado` → `Service de API` → `Componentes Reutilizáveis (components/ui/)`**.

### 2.1 Serviços de API (`frontend/src/services/`)

Centralizam a comunicação com o backend Express via `fetch` tipado. Nenhuma página deve montar URLs da API manualmente.

```typescript
// frontend/src/services/api.ts
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export async function requisicaoApi<T>(caminho: string, opcoes?: RequestInit): Promise<T> {
  const resposta = await fetch(`${API_BASE_URL}${caminho}`, {
    headers: {
      'Content-Type': 'application/json',
      ...opcoes?.headers,
    },
    ...opcoes,
  });

  if (!resposta.ok) {
    const corpoErro = await resposta.json().catch(() => ({}));
    throw new Error(corpoErro.erro || 'Não foi possível concluir a operação. Tente novamente.');
  }

  return resposta.json() as Promise<T>;
}
```

### 2.2 Componentes UI Acessíveis (`frontend/src/components/ui/`)

Todo componente de formulário ou ação deve ser construído em `src/components/ui/` seguindo a **WCAG 2.2 Nível AA** (uso de `useId()`, `aria-invalid`, `aria-describedby`, `role="alert"` e alvo mínimo de 44×44px). Consulte `docs/manuais/padroes-frontend.md`.

### 2.3 Páginas (`frontend/src/pages/`)

As páginas compõem componentes de `src/components/`, conectam-se aos serviços de API e tratam obrigatoriamente os **cinco estados visuais**:
1. **Ideal** (dados carregados)
2. **Carregando** (`aria-busy="true"`)
3. **Vazio** (orientação clara quando não há registros)
4. **Erro** (mensagem orientadora + opção de tentar novamente)
5. **Parcial** (feedback detalhado em ações de lote)

---

## 3. Padrões de Projeto (Design Patterns)

A divisão de camadas do Aratu implementa formalmente os padrões **Layered Architecture com Inversão Leve**, **Repository Pattern**, **State Pattern (FSM)**, **Strategy**, **Chain of Responsibility** e **Compound Components**.
Consulte o guia canônico completo em:
👉 **[`docs/manuais/padroes-projeto.md`](padroes-projeto.md)**

