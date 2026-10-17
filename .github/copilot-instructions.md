# Copilot instructions for Aratu

## Project map

Aratu is a client/server system for FSPH fleet, institutional trips, and SVO operations. The root `docker-compose.yml` orchestrates PostgreSQL, the Express API, and the React app. The frontend is a React 19 + TypeScript + Vite SPA; the backend is Node.js + Express 5 + TypeScript with PostgreSQL via `pg`.

The implemented application is currently an early scaffold: `backend/src/index.ts` starts Express and exposes a health-style `/` response; the frontend implements authentication, session handling, API requests, and profile-specific home routing. Do not assume the planned fleet, trip, or SVO modules already exist in code.

The frontend flow is `AuthProvider` → `App` → `resolveRoute`, with profile destinations defined in `frontend/src/auth/profiles.ts`. Protected API requests are built by `frontend/src/api/client.ts`, which attaches the current bearer token and handles expiry/401 responses. Existing Node tests exercise frontend logic in `frontend/tests/` with the built-in test runner and fixtures.

For backend features, follow the documented target flow `Route → Middleware (authentication/RBAC/input validation) → Controller → Service → Repository → PostgreSQL`. Keep HTTP translation in controllers, domain rules in services, and SQL in repositories; services must not depend on Express. The architecture and domain patterns are documented in `docs/manuais/arquitetura-camadas.md`, `docs/manuais/padroes-projeto.md`, and `docs/manuais/padroes-backend.md`.

## Build, test, and lint

Run frontend commands from the repository root:

```bash
npm --prefix frontend ci
npm --prefix frontend run dev
npm --prefix frontend run build
npm --prefix frontend run lint
npm --prefix frontend test
```

Run one frontend test file or one named test from `frontend/`:

```bash
cd frontend
node --test tests/login.test.mjs
node --test --test-name-pattern="timeout" tests/login.test.mjs
```

Backend TypeScript check (from `backend/`):

```bash
npx tsc --noEmit
```

The backend currently has no configured build or lint script, and its `npm test` script is a placeholder that exits with an error. The frontend Node tests require Node.js 22 or newer, as described in `docs/manuais/ambiente-desenvolvimento.md`. For the local container stack, that manual documents `docker compose up -d --build`.

## Repository conventions

- Before planning, coding, refactoring, or reviewing, follow `AGENTS.md` and `.agents/skills/principios/SKILL.md`. Consult its relevant references; frontend work also follows `references/acessibilidade.md`, `references/ui-componentes.md`, and `references/ux-fluxo.md`. Project skills under `.agents/skills/` are subordinate to `principios`.
- If guidance conflicts, use `AGENTS.md` and the applicable project manuals as the operational source for agent work. In particular, `README.md` contains an older generic feature-branch Gitflow; the agent-specific workflow is the fixed `dev-<nome>` branch, PR to `develop` for QA, then promotion to `main`, as described in `AGENTS.md` and `docs/manuais/commits.md`.
- Preserve the one-way backend layer boundaries. Use parameterized PostgreSQL placeholders (`$1`, `$2`, …), select explicit columns, and put multi-step read/decide/write operations in transactions with appropriate row locks (`FOR UPDATE`). Keep RBAC enforcement on the API; frontend route decisions do not provide backend authorization.
- Keep domain/API contracts explicit with strict TypeScript types. On the frontend, use the centralized API/auth flow rather than scattering `fetch` calls. Reusable UI belongs in components and screen composition in pages, following existing code and the manuals.
- User-facing UI and feedback must meet WCAG 2.2 AA: associate form controls with labels (use `useId()` for reusable components), announce validation/status feedback accessibly, preserve keyboard operation and visible focus, and do not convey statuses by color alone. Operational mobile controls for drivers need 44×44px targets; async screens should account for loading, empty, error, partial, and successful states.
- Use only fictional/synthetic data in tests, fixtures, seeds, documentation, and commits. Never include real personal, driver, or SVO data.
- Follow Conventional Commit format `tipo(escopo): descrição curta`; see `docs/manuais/commits.md` for the project’s branch and PR workflow.
