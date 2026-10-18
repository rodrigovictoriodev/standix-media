# AUDIT — Standix Media

- **Data:** 2026-10-18 (atualizado após subir a stack e validar a biblioteca pela interface)
- **Commit analisado:** `0f1c1ef`
- **Método:** leitura estática, `tsc --noEmit`, `vitest run` (api), Docker, e validação ao vivo no navegador em `https://media.standix.net`.
- **Histórico:** a auditoria original (estática) não alterou código. Depois dela foram feitas três mudanças pontuais, descritas na seção 12.

## 0. Limites desta auditoria

| Limite                                                                       | Efeito                                                                                        |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Os 29 testes da API mockam Prisma e MinIO. Não há E2E automatizado.          | Os fluxos foram provados por validação manual (API e navegador), não por teste automatizado.  |
| A busca por consumidores de API é por chamadas literais a `apiRequest`.      | Chamadas montadas dinamicamente podem ter escapado. Confirmar antes de remover qualquer rota. |
| Os containers `standixai-*` pertencem a `/opt/standixai` (`ai.standix.net`). | Não fazem parte deste projeto e não foram tocados.                                            |

**Ambiente (confirmado):** `https://media.standix.net` → Nginx Proxy Manager (host 9, SSL forçado, WebSocket) → `100.83.222.121:8081` (nginx da stack) → web, api e minio. A stack `standix-*` está no ar e as 9 migrations estão aplicadas.

## 1. Estrutura

Monorepo pnpm com Turborepo. 165 arquivos rastreados, cerca de 10,5 mil linhas de TS/TSX, 5 commits.

```
apps/api        NestJS + Prisma (12 módulos, 9 migrations, 25 modelos)
apps/web        Next.js (App Router, Tailwind, 1 componente shadcn)
packages/ui     cn, Button, StandixLogo
packages/sdk    StandixApiClient (não usado)
packages/types  tipos de auth/asset (não usado por código)
infrastructure  nginx.conf + READMEs de minio/redis
docs            AUDITORIA-2026-10-15.md (desatualizada), ROADMAP.md, adr/
backups         2 dumps de produção
```

**Maiores arquivos:** `assets.service.ts` (720), `asset-library-view.tsx` (702), `presentation-studio.tsx` (584), `sampler-panel.tsx` (539), `asset-details-drawer.tsx` (492).

## 2. Arquitetura

- **API:** módulos por domínio. Guards globais de JWT, permissões (RBAC por equipe) e roles. `TeamId` decorator resolve o escopo de equipe. Socket.IO no namespace `/events`, com autorização por permissão e equipe em cada mensagem.
- **Web:** páginas finas que montam `DashboardShell` mais um componente "view". `AuthProvider` guarda usuário e equipes. Tokens ficam em `localStorage`, e `lib/api.ts` faz refresh com promise compartilhada.
- **Armazenamento:** blob físico identificado por SHA-256 (`MediaBlob`), com asset lógico por equipe (`Asset`) e deduplicação. Thumbnail WebP de 480 px derivada, guardada no mesmo bucket (`thumbnailKey`). Gerada com `sharp` (imagem) e `ffmpeg` (vídeo/áudio).
- **Deploy:** `docker-compose.yml` (postgres, redis, minio, api, web, nginx). O `CMD` da API roda `migrate deploy`, seed e a aplicação.

## 3. Banco de dados e Prisma

### Modelos

`User`, `Role`, `Permission`, `RolePermission`, `Team`, `Workspace`, `TeamMembership`, `UserRole`, `Asset`, `MediaBlob`, `AssetFolder`, `AssetTag`, `Category`, `Event`, `EventMember`, `Presentation`, `Slide`, `Scene`, `Screen`, `AudioCue`, `CueBank`, `VideoCue`, `AuditLog`, `RefreshToken`, `PasswordResetToken`.

### Uso real no código

| Modelo              | Uso                                                                     | Classe                                        |
| ------------------- | ----------------------------------------------------------------------- | --------------------------------------------- |
| `Screen`            | **Nenhuma** referência a `prisma.screen`. Telas usam estado em memória. | Supérfluo                                     |
| `Scene`, `VideoCue` | Só lidos em `getAssetReferences` (assets). Não existe API que os crie.  | Supérfluo (reservado a funcionalidade futura) |
| `AuditLog`          | Escrito só pelo fluxo de auth. Operações de asset não são auditadas.    | Parcial                                       |
| `Category`          | Usado por Eventos.                                                      | Necessário                                    |
| Demais              | Em uso.                                                                 | Necessário                                    |

### Pontos de atenção

1. **Índice único parcial fora do Prisma.** `AssetFolder_teamId_root_name_key` existe só no SQL da migration `202610150001`. O Prisma não o enxerga, então `migrate dev` ou `db push` podem tentar removê-lo. Há comentário no schema, mas é uma armadilha.
2. **Migration `202610150001_library_dam` tem `DROP CONSTRAINT` e recria a FK de `AssetFolder` com `RESTRICT`.** Sem efeito em dados, mas mudou a semântica de exclusão de pasta (agora só se vazia).
3. **Migrations:** as 9 estão aplicadas no banco real (`migrate deploy` no start da API).
4. **Histórico com ruído:** o doc de 15/10 cita um registro `20261005_assets_module` falho e marcado _rolled back_.
5. `Asset.displayName` tem default `""`. Código e UI precisam tratar vazio como "usar `filename`". Confirmado que `downloadName` e `present` fazem isso.
6. **Metadados antigos** (resolução PNG errada) existiam em assets anteriores a `c391e91`. O `reprocess-media` foi executado: 3 blobs reprocessados, com thumbnails e metadados corrigidos.

## 4. Módulos NestJS e rotas

| Módulo                           | Rotas                                                                                       | Observação                                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| auth                             | `me`, `login`, `refresh`, `logout`, `forgot-password`, `reset-password`, `change-password`  | Só `me`, `login`, `refresh`, `logout` têm consumidor no web. Os outros três não têm tela.                                    |
| initialization                   | `setup/status`, `setup`, `dashboard/summary`                                                | Usadas. O dashboard vive aqui, o que é um local estranho.                                                                    |
| assets                           | 17 rotas (upload, pastas, tags, url, usage, update, tags, favorite, trash, restore, delete) | Todas usadas pelo web, **exceto** `GET :id/usage`.                                                                           |
| events                           | 11 rotas                                                                                    | Web usa listagem, calendário, categorias (GET) e criação. Sem consumidor: detalhe, update, delete, members, criar categoria. |
| presentations                    | 11 rotas                                                                                    | Sem consumidor: `PATCH :id` e `DELETE :id`.                                                                                  |
| sampler                          | 10 rotas                                                                                    | Web usa cues e play. Sem consumidor claro: criação, edição e exclusão de banks. Confirmar.                                   |
| screens                          | 4 rotas (`groups`, `state`, `state`, `:screen`)                                             | Provavelmente sem consumidor. O estado trafega por Socket.IO.                                                                |
| health                           | `GET /health`                                                                               | Usada.                                                                                                                       |
| audit                            | **Vazio.**                                                                                  | Obsoleto. O `AuditService` real está em `auth/`.                                                                             |
| storage, media, prisma, realtime | Infra interna                                                                               | Necessários.                                                                                                                 |

**Consumidores sem API:** nenhum.

## 5. Rotas Next.js e componentes

### Rotas

`/` (landing), `/login`, `/setup`, `/dashboard`, `/library`, `/events`, `/presentations`, `/presentations/[id]/play`, `/sampler`, `/screen/[screen]`.

Menu lateral: Dashboard, Biblioteca, Eventos, Apresentações, Telas (`/screen/main`) e Sampler. O item "Administração" está desabilitado.

### Componentes

Todos os componentes de `apps/web/src/components` são importados por pelo menos uma página. **Não achei componente órfão.**

Exceções:

- `lib/utils.ts`: nenhum import por `@/lib/utils` ou `lib/utils`.
- `components/ui/button.tsx`: wrapper que só reexporta o `Button` de `@standix/ui`.

### Duas formas de buscar dados

| Área                                        | Padrão                           |
| ------------------------------------------- | -------------------------------- |
| Biblioteca (`use-library.ts`)               | React Query                      |
| Eventos, Dashboard, Studio, Sampler, Player | `useState` + `useEffect` manuais |

Foi introduzido React Query só na biblioteca, no commit `0f1c1ef`. O restante não migrou, então há dois padrões convivendo.

## 6. Integração frontend/backend

- Todos os endpoints chamados existem no backend.
- A biblioteca usa `GET /assets` com filtros de servidor (busca, pasta, tag, favorito, lixeira). O doc antigo dizia que a busca era local. **Não é mais.**
- Thumbnail: `asset-thumbnail.tsx` consome URL assinada de thumbnail em vez do original. Isso resolve o problema N+1 de download de originais, mas ainda é uma URL assinada por card. O preview do drawer carrega o **original**, não a miniatura.
- Nome da equipe aparece no cabeçalho ("Equipe: Administradores") e no dashboard. **Verificado na interface:** o ID não é exibido. O item 11 do roadmap está resolvido.

## 7. Código morto e duplicações

| #   | Item                                                                        | Classe                | Ação sugerida                                                                |
| --- | --------------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------- |
| 1   | `packages/sdk`                                                              | Obsoleto              | Remover. Duplica `lib/api.ts` e não faz refresh de token.                    |
| 2   | `packages/types`                                                            | Supérfluo             | Remover junto com o sdk, depois de limpar `package.json` e `next.config.ts`. |
| 3   | `apps/api/src/audit/audit.module.ts`                                        | Obsoleto              | Remover. Retirar de `app.module.ts`.                                         |
| 4   | `sampler/sampler-input-adapter.ts`                                          | Obsoleto              | Só tipos para MIDI e Stream Deck, que estão fora de escopo. Remover.         |
| 5   | `presentations/import-adapter.ts`                                           | Obsoleto              | Só tipos para PPTX, fora de escopo. Remover.                                 |
| 6   | `apps/web/src/lib/utils.ts`                                                 | Provável código morto | Confirmar e remover.                                                         |
| 7   | `packages/ui` (`cn`, `Button`) mais o wrapper em `components/ui/button.tsx` | Duplicado             | Manter só o logo no pacote, ou colapsar o pacote em `apps/web`.              |
| 8   | `api()` em `presentation-studio.tsx`                                        | Duplicado             | É só `apiRequest`. Substituir.                                               |
| 9   | `api()` em `sampler-panel.tsx`                                              | Duplicado             | Só acrescenta validação de token e equipe, que `apiRequest` já cobre.        |
| 10  | `useApiSession` e `AuthProvider`                                            | Duplicado             | Duas fontes para sessão e equipe. Unificar.                                  |
| 11  | Models `Screen`, `Scene`, `VideoCue`                                        | Supérfluo             | Decidir se remove (migration) ou assume que são reserva para o futuro.       |
| 12  | Rotas sem consumidor (seção 4)                                              | Verificar             | Não remover antes de confirmar.                                              |
| 13  | `.env.example` tem 17 variáveis que o `.env` não tem                        | Redundante            | Alinhar. Confirmar também o motivo de o `.env` real ter só 592 bytes.        |
| 14  | `infrastructure/minio` e `redis` READMEs, `postgres/init/.gitkeep`          | Supérfluo             | Opcional.                                                                    |
| 15  | `apps/web/tsconfig.tsbuildinfo`                                             | Lixo                  | Está no `.gitignore`. Apagar do disco.                                       |
| 16  | `backups/*.dump`                                                            | Risco                 | Dumps de produção dentro do projeto. Mover para fora. Estão no `.gitignore`. |
| 17  | `scripts/reprocess-media.ts`                                                | Pontual               | Manter até rodar o backfill, depois remover.                                 |

## 8. Complexidade excessiva

| Local                                                       | Problema                                                                                                                                                              |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `asset-library-view.tsx` (702 linhas)                       | Sidebar, toolbar, breadcrumb, formulário de pasta, upload, grid e tabela num só arquivo. O commit `0f1c1ef` já extraiu hooks e drawer, mas o arquivo continua grande. |
| `assets.service.ts` (720 linhas)                            | Assets, pastas, tags, referências, reprocessamento e locks. Quatro responsabilidades.                                                                                 |
| `asset-details-drawer.tsx` (492 linhas)                     | Maior que a soma de `folder-tree` e `asset-thumbnail`. Vale conferir se está duplicando formulário ou estado.                                                         |
| Três pacotes `packages/*`                                   | Estrutura pesada para um web e uma API. Só o logo é de fato compartilhado.                                                                                            |
| `presentation-studio.tsx` (584) e `sampler-panel.tsx` (539) | Componentes monolíticos com muito `useState`. Estão fora do foco atual.                                                                                               |
| Compose, nginx e Dockerfiles                                | Não confirmei se refletem a produção real (ver seção 0).                                                                                                              |

## 9. Consequências das últimas alterações

### Commit `c391e91` — backend DAM

- Reescreveu `assets.service.ts` (919 linhas alteradas) e o `schema.prisma` (191 linhas).
- **Adicionou** `sharp` e `ffmpeg` (Dockerfile). A imagem da API fica maior e passa a depender de binário do sistema.
- **Introduziu** `StorageService`, `MediaProcessingService` e `TeamId` decorator.
- **Corrigiu** os achados da auditoria de 15/10: path traversal, `hasPermissions` agora exige todas as permissões, exclusão com 409 em vez de 500, ciclo de pastas, ffprobe ausente e bug do PNG.
- Alterou `nginx.conf` e `sampler.service.ts` (efeito colateral a verificar).

### Commit `0f1c1ef` — frontend DAM

- Reescreveu `asset-library-view.tsx` (de 1075 linhas removidas para 1644 linhas alteradas) e criou `components/library/*`.
- **Adicionou** React Query. Ele passou a ser o padrão da biblioteca, mas só dela.
- Fez edições de uma linha em `events-dashboard`, `presentation-player` e `sampler-panel`. Verificar qual foi o motivo.

### Efeitos que estavam abertos

1. ~~Ambiente não implantado~~ — **resolvido.** Stack no ar, com migrations aplicadas.
2. ~~Backfill de thumbnails~~ — **resolvido.**
3. **Thumbnails davam 404 em produção** — **resolvido** (seção 12): o nginx só encaminhava `/sha256/` ao MinIO, e as miniaturas ficam em `/thumbnails/`.
4. **`docs/AUDITORIA-2026-10-15.md` e `docs/ROADMAP.md` contradizem o código.** Ainda abertos.
5. **Cobertura de testes parada no mock.** Ainda aberta.

## 10. Validação dos fluxos

Base: execução real (API com `curl` e interface no navegador) contra a stack no ar.

| Fluxo                                      | Estado                       | Observação                                                                                         |
| ------------------------------------------ | ---------------------------- | -------------------------------------------------------------------------------------------------- |
| Login, logout e sessão persistente         | **FUNCIONA**                 | Login pela UI e pela API, logout com revogação de token.                                           |
| Onboarding / setup                         | **FUNCIONA** (por código)    | Não reexecutado: o sistema já está inicializado.                                                   |
| Workspace                                  | **PARCIAL**                  | Criado no setup. Sem tela ou API de gestão.                                                        |
| Equipe                                     | **PARCIAL**                  | Nome exibido. Sem membros, convites ou papéis por equipe na UI.                                    |
| Dashboard                                  | **FUNCIONA**                 | Dados reais por equipe.                                                                            |
| Upload                                     | **FUNCIONA**                 | Pela UI. Dedup por SHA-256, thumbnail e metadados.                                                 |
| Biblioteca: grid, lista, busca e favoritos | **FUNCIONA**                 | Favorito sincroniza card, drawer e a visão Favoritos.                                              |
| Biblioteca: drawer e preview               | **FUNCIONA**                 |                                                                                                    |
| Biblioteca: renomear, mover                | **FUNCIONA**                 |                                                                                                    |
| Biblioteca: excluir, lixeira, restaurar    | **FUNCIONA**                 | Restaurar mantém pasta, favorito e tags. Exclusão definitiva pede confirmação.                     |
| Biblioteca: pastas e breadcrumb            | **FUNCIONA**                 | Criar, abrir, subpasta, excluir. Ciclo de pastas (400) e pasta não vazia (409) confirmados na API. |
| Biblioteca: tags                           | **FUNCIONA**                 | Chips, contadores e filtro.                                                                        |
| Biblioteca: console limpo                  | **FUNCIONA** (após correção) | Havia 404 após exclusão definitiva. Corrigido (seção 12).                                          |
| Eventos, apresentações, sampler e telas    | **PARCIAL**                  | Fora do foco desta fase e não exercitados ao vivo.                                                 |

### Observações de UX (não são defeitos)

- Excluir asset (drawer) e excluir pasta vão direto, **sem confirmação**. A exclusão definitiva pede.
- Os contadores de pasta e de tag não contam assets na lixeira.
- Tags com 0 assets continuam listadas.
- `ERR_ABORTED` em `/screen/main?_rsc=` é prefetch do Next, benigno.

## 11. Recomendações (em ordem)

1. ~~Descobrir onde o domínio roda, validar a biblioteca e rodar o backfill~~ — **feito.**
2. Remover o que é seguramente morto (itens 1 a 6 da seção 7). Não muda comportamento.
3. Unificar sessão (item 10) e remover os wrappers duplicados (itens 8 e 9).
4. Adicionar confirmação ao excluir pasta e ao mover asset para a lixeira (opcional).
5. Dividir `asset-library-view.tsx` apenas quando mexer na biblioteca de novo.
6. Atualizar `docs/ROADMAP.md` e arquivar a auditoria de 15/10.
7. Tratar o índice parcial de pasta com um teste de integração.
8. Segurança operacional:
   - Rotacionar a senha do Redis do `standixai`, que apareceu em texto no `docker inspect`.
   - Trocar a senha do admin `hello@standix.net`, que passou por chat e histórico de shell.
   - Mover os dumps de `backups/` para fora do projeto.

## 12. Mudanças feitas depois da auditoria

| Mudança                                                | Arquivos                                                 | Motivo                                                                                                                                                                                                              |
| ------------------------------------------------------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Proxy de thumbnails                                    | `infrastructure/nginx/nginx.conf`                        | A regex do location passou de `sha256` para `(sha256\|thumbnails)`. Antes, as miniaturas caíam no Next.js e davam 404.                                                                                              |
| Comando `npm run admin:reset-password <email> <senha>` | `apps/api/src/scripts/reset-password.ts`, `package.json` | Redefine a senha com Argon2, o mesmo algoritmo do login. Altera só `passwordHash`, exige 12 ou mais caracteres e **não revoga refresh tokens**. A senha aparece nos argumentos do processo e no histórico do shell. |
| Fim dos 404 após exclusão definitiva                   | `apps/web/src/components/library/use-library.ts`         | A mutação `destroy` invalidava tudo e a UI buscava de novo o asset apagado. Agora remove o asset das listas, cancela e remove suas queries e invalida só o restante.                                                |

O banco só recebeu dados de teste, e todos foram removidos. Restaram os 4 assets e a pasta "Teste" do usuário.
