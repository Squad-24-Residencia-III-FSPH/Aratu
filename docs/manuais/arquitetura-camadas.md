# Estrutura e Padrões de `src/` — Sistema Aratu

Este documento detalha como organizar arquivos, responsabilidades e contratos dentro de `backend/src/` e `frontend/src/` no **Sistema Aratu**, com exemplos práticos em TypeScript seguindo **Clean Code, SOLID, DRY**, código em inglês e o padrão SQL em **Schemas Nativos de Domínio** (`auth`, `audit`, `fleet`, `trip`, `svo`).

---

## 1. Backend (`backend/src/`)

O fluxo de uma requisição no servidor segue estritamente a cadeia:
**`Route` → `Middleware (Auth/RBAC)` → `Controller` → `Service` → `Repository` → `PostgreSQL 18`**.

### 1.1 Types e DTOs (`backend/src/types/`)

Definem entidades, union types em inglês (`UPPER_SNAKE_CASE`) e contratos de entrada/saída em `camelCase`. Nunca use `any`.

```typescript
// backend/src/types/vehicle.types.ts
export type ServiceCategory = 'PASSENGER' | 'BODY' | 'OTHER';

export interface Vehicle {
  id: number;
  licensePlate: string;
  categories: ServiceCategory[];
  seats: number;
  bodyLimit: number;
  weightLimit: number | null;
  isActive: boolean;
  revision: number;
}

export interface CreateVehicleInput {
  licensePlate: string;
  categories: ServiceCategory[];
  seats: number;
  bodyLimit: number;
  weightLimit?: number | null;
}
```

### 1.2 Repositories (`backend/src/repositories/`)

Encapsulam o acesso ao PostgreSQL 18 via `pg.Pool` em Schemas Nativos (`fleet.vehicles`, `auth.users`). As colunas no banco usam nomes limpos em `snake_case`, e o `SELECT` projeta aliases `camelCase` quando necessário para o TypeScript. Proibido usar `SELECT *` ou interpolar strings.

```typescript
// backend/src/repositories/vehicle.repository.ts
import { Pool, PoolClient } from 'pg';
import { CreateVehicleInput, Vehicle } from '../types/vehicle.types';

const VEHICLE_COLUMNS = `
  id,
  license_plate AS "licensePlate",
  categories,
  seats,
  body_limit AS "bodyLimit",
  weight_limit AS "weightLimit",
  is_active AS "isActive",
  revision
`;

export class VehicleRepository {
  constructor(private readonly pool: Pool) {}

  async findByLicensePlate(licensePlate: string): Promise<Vehicle | null> {
    const query = `
      SELECT ${VEHICLE_COLUMNS}
      FROM fleet.vehicles
      WHERE license_plate = $1
      LIMIT 1;
    `;
    const result = await this.pool.query<Vehicle>(query, [licensePlate]);
    return result.rows[0] ?? null;
  }

  async findByIdForUpdate(id: number, client: PoolClient): Promise<Vehicle | null> {
    const query = `
      SELECT ${VEHICLE_COLUMNS}
      FROM fleet.vehicles
      WHERE id = $1
      FOR UPDATE;
    `;
    const result = await client.query<Vehicle>(query, [id]);
    return result.rows[0] ?? null;
  }

  async create(input: CreateVehicleInput): Promise<Vehicle> {
    const query = `
      INSERT INTO fleet.vehicles (
        license_plate,
        categories,
        seats,
        body_limit,
        weight_limit,
        is_active
      )
      VALUES ($1, $2, $3, $4, $5, true)
      RETURNING ${VEHICLE_COLUMNS};
    `;
    const values = [
      input.identification,
      input.categories,
      input.seats,
      input.bodyLimit,
      input.weightLimit ?? null,
    ];
    const result = await this.pool.query<Vehicle>(query, values);
    return result.rows[0];
  }
}
```

### 1.3 Services (`backend/src/services/`)

Concentram todas as regras de negócio, validações de domínio e orquestração de transações. Não importam `Request` nem `Response` do Express.

```typescript
// backend/src/services/vehicle.service.ts
import { VehicleRepository } from '../repositories/vehicle.repository';
import { CreateVehicleInput, Vehicle } from '../types/vehicle.types';

export class VehicleService {
  constructor(private readonly vehicleRepository: VehicleRepository) {}

  /**
   * Cadastra uma nova viatura garantindo unicidade de identificação e limites válidos.
   */
  async createVehicle(input: CreateVehicleInput): Promise<Vehicle> {
    const normalizedIdentification = input.identification.trim().toUpperCase();

    if (!normalizedIdentification) {
      throw new Error('A identificação da viatura é obrigatória.');
    }

    if (input.seats < 0 || input.bodyLimit < 0) {
      throw new Error('Os limites de assentos e de corpos não podem ser negativos.');
    }

    const existing = await this.vehicleRepository.findByIdentification(normalizedIdentification);
    if (existing) {
      throw new Error(`Já existe um veículo cadastrado com a identificação ${normalizedIdentification}.`);
    }

    return this.vehicleRepository.create({
      ...input,
      identification: normalizedIdentification,
    });
  }
}
```

### 1.4 Controllers e Routes (`backend/src/controllers/` e `backend/src/routes/`)

Traduzem requisições HTTP em endpoints em inglês (`/api/vehicles`) para chamadas ao Service e devolvem status HTTP semânticos com mensagens em português para a UI.

```typescript
// backend/src/controllers/vehicle.controller.ts
import { Request, Response } from 'express';
import { VehicleService } from '../services/vehicle.service';

export class VehicleController {
  constructor(private readonly vehicleService: VehicleService) {}

  create = async (req: Request, res: Response): Promise<void> => {
    try {
      const vehicle = await this.vehicleService.createVehicle(req.body);
      res.status(201).json(vehicle);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro inesperado ao cadastrar veículo.';
      res.status(400).json({ error: message });
    }
  };
}
```

---

## 2. Frontend (`frontend/src/`)

O fluxo no frontend React 19 segue a separação:
**`Page` → `Hook / State` → `API Service` → `Reusable Components (components/ui/)`**.

### 2.1 Serviços de API (`frontend/src/services/`)

Centralizam a comunicação com o backend Express via `fetch` tipado em inglês. Nenhuma página deve montar URLs da API manualmente.

```typescript
// frontend/src/services/api.ts
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || 'Não foi possível concluir a operação. Tente novamente.');
  }

  return response.json() as Promise<T>;
}
```

### 2.2 Componentes UI Acessíveis (`frontend/src/components/ui/`)

Todo componente de formulário ou ação deve ser construído em `src/components/ui/` seguindo a **WCAG 2.2 Nível AA** (uso de `useId()`, `aria-invalid`, `aria-describedby`, `role="alert"` e alvo mínimo de 44×44px). Consulte [`docs/manuais/padroes-frontend.md`](padroes-frontend.md).

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
