# Auditoria técnica — Standix Media

- **Data:** 2026-10-15
- **Escopo:** `/opt/media` (código-fonte), containers em execução, banco PostgreSQL de produção (somente leitura)
- **Método:** leitura integral de schema, módulos NestJS, componentes Next.js, infraestrutura; consultas `SELECT` no banco; `tsc --noEmit` (api e web); `vitest run` (api); smoke test HTTP via Nginx. Nenhum código foi alterado.

---

## 0. Achados que mudam a leitura do problema

| # | Achado | Evidência |
|---|--------|-----------|
| A | **Produção está rodando um build anterior ao código-fonte.** O drawer de detalhes, renomear, mover, lixeira e restaurar **já existem no código**, mas não foram implantados. | `asset-library-view.tsx` modificado em 2026-10-06 16:22 UTC; imagem `media-web` construída às 16:15 UTC. A string "Detalhes do ativo" não existe em `.next` dentro do container. |
| B | **Migration pendente no banco.** `202610060002_library_asset_details` (coluna `Asset.displayName`) não foi aplicada. | `_prisma_migrations` não contém o registro; `\d "Asset"` não tem `displayName`. Será aplicada no próximo start da API (o `CMD` roda `migrate deploy`). |
| C | **Não há controle de versão.** `/opt/media` não é um repositório git. | `git status` → *not a git repository*. Não há como auditar diffs, reverter ou revisar mudanças. |
| D | **Metadados de PNG gravados errados.** O parser lê o tamanho do chunk e a assinatura `IHDR` em vez de largura/altura. | Todos os 3 assets: `"resolution": "13x1229472850"`. `assets.service.ts` → `readImageDimensions` usa offsets 8/12 (corretos: 16/20). |
| E | **`ffprobe` não existe na imagem da API.** Metadados de vídeo/áudio (duração, codec, resolução) são sempre `null`. | `docker exec standix-api which ffprobe` → ausente. |

Consequência: os itens 2–6 da lista "Problemas já identificados" são, em grande parte, **problema de implantação**, não de ausência de código. Mesmo assim, o código existente tem lacunas e bugs (seção 3) e não foi validado de ponta a ponta.

---

## 1. Estado validado do ambiente

| Item | Resultado |
|------|-----------|
| Containers | `standix-{web,api,nginx,postgres,redis,minio}` ativos há 8–9 dias |
| Nginx | escutando em `100.83.222.121:8081` (Tailscale) |
| `GET /api/health` | 200 |
| `GET /api/assets` sem token | 401 (guard ativo) |
| `GET /library` | 200 |
| Typecheck API / Web | OK / OK |
| Testes API (vitest) | 20/20 passando (todos com Prisma/MinIO mockados — não há teste de integração) |
| Dados | 1 workspace, 1 equipe, 1 usuário, 3 assets (todos IMAGE), 2 blobs (dedup funcionando), 1 pasta, 0 tags |
| Migrations | 7 aplicadas; 1 pendente (B); 1 registro `20261005_assets_module` falho e já marcado *rolled back* (inofensivo, só ruído) |

---

## 2. Classificação dos módulos

| Módulo | Status | Observação |
|--------|--------|------------|
| Login / Logout / Refresh / Sessão persistente | **IMPLEMENTADO** | Argon2id, rotação de refresh token, tokens em `localStorage` |
| Recuperação de senha | **PARCIAL** (e perigoso) | Ver S1. Hoje o endpoint rejeita qualquer corpo (DTO sem decorators) |
| Onboarding (`/setup`) | **IMPLEMENTADO** | Transação serializável, só admin global |
| Workspace | **PARCIAL** | Criado no setup; sem tela/API de gestão |
| Equipe | **PARCIAL** | Criação no setup + seletor de equipe. Sem API de membros, convites, papéis por equipe. "Administração" desabilitado no menu |
| RBAC | **IMPLEMENTADO** com bug | `hasPermissions` aceita *qualquer* permissão da lista, não *todas* (S4) |
| Dashboard | **IMPLEMENTADO** | Contagens reais por equipe |
| Biblioteca — upload + dedup SHA-256 + MinIO | **IMPLEMENTADO** | Validado no banco (3 assets → 2 blobs) |
| Biblioteca — grid/lista/favoritos/filtro por tipo | **IMPLEMENTADO** | Filtros feitos no cliente |
| Biblioteca — drawer, renomear, mover, lixeira, restaurar, excluir definitivo | **PARCIAL** | Código existe (API + UI), **não implantado** e não validado E2E. Faltam: baixar, favoritar no drawer, hash, MIME, última alteração, tags, referências completas |
| Biblioteca — pastas | **PARCIAL** | Criar e listar em árvore. Sem renomear/mover/excluir pasta, sem prevenção de ciclo, filtro não inclui subpastas |
| Biblioteca — tags | **PARCIAL** | Backend aceita tags só no upload; UI não envia; sem API para editar/listar tags |
| Biblioteca — thumbnails | **NÃO IMPLEMENTADO** | Cada card baixa o **original em resolução total** por URL assinada; vídeo não tem poster |
| Biblioteca — metadados técnicos | **PARCIAL** | Bug PNG (D), sem ffprobe (E), MIME confiado ao cliente |
| Eventos | **IMPLEMENTADO** (não validado E2E nesta auditoria) | CRUD, calendário, categorias, membros |
| Apresentações | **PARCIAL** | CRUD de slides, player e sincronização via socket. Importação PPTX é só interface |
| Sampler | **PARCIAL** | Bancos, cues, play; sem hotkeys globais/mixagem |
| Telas (`/screen/*`) | **PARCIAL** | Estado em memória, **global (não por equipe)**, textos fixos no serviço; model `Screen` do banco não é usado |
| Tempo real (Socket.IO) | **PARCIAL** | Auth no handshake; eventos `screen:*` sem checagem de permissão (S3); sem Redis adapter |
| Auditoria | **PARCIAL** | `AuditService` só registra auth; `AuditModule` vazio; operações de asset não são auditadas |
| Overlays, Tempo, Layers, PPTX, Igrejas | **NÃO IMPLEMENTADO** | Roadmap — ver seção 6 |

---

## 3. Débitos técnicos e problemas

### 3.1 Segurança (prioridade máxima)

| ID | Problema | Local | Impacto |
|----|----------|-------|---------|
| S1 | `forgotPassword` devolve `resetToken` **na resposta HTTP** de um endpoint público. Hoje está "seguro por acidente" porque o DTO não tem decorators e o `ValidationPipe` rejeita o corpo. Quem corrigir o DTO abre **tomada de qualquer conta** a partir do e-mail. Também permite enumeração de usuários e aceita senha de 8 caracteres (política é 12). | `auth/auth.service.ts` `forgotPassword`, `auth.controller.ts` DTOs | Crítico (latente) |
| S2 | Path traversal: `readMediaProbe` grava o upload em `join(tempDir, file.originalname)`. `originalname` vem do cliente; `../../` escapa do diretório temporário (escrita arbitrária como usuário da API). | `assets.service.ts` `readMediaProbe` | Alto |
| S3 | `screen:update-state` e `screen:join` não verificam permissão nem equipe: qualquer usuário autenticado altera a saída de tela de todos. | `realtime.gateway.ts` | Alto |
| S4 | `PolicyService.hasPermissions` usa `in` → basta **uma** das permissões exigidas. | `auth/policy.service.ts` | Médio (hoje todos os handlers pedem uma só) |
| S5 | MIME e `kind` vêm do header do cliente; não há sniffing de conteúdo. | `assets.service.ts` `create` | Médio |
| S6 | `.env` mantém `BOOTSTRAP_ADMIN_PASSWORD` após o bootstrap (o README pede para remover). | `.env` | Médio |

### 3.2 Biblioteca — bugs concretos

1. **Exclusão definitiva quebra com referências.** `Slide`, `Scene`, `AudioCue`, `VideoCue` têm `onDelete: Restrict` para `Asset`. `deleteAsset` não verifica isso → erro 500 do Prisma em vez de 409 com a lista de referências.
2. **Referências incompletas.** `getAssetUsage` só considera slides/cenas; ignora `AudioCue` e `VideoCue`.
3. **Remoção de blob sem transação.** `delete asset` → `count` → `removeObject` → `delete blob`, sem lock. Um upload concorrente do mesmo hash pode reaproveitar o blob que está sendo apagado.
4. `updateAsset` com `folderId: ""` grava `""` (FK inválida → 500).
5. `toggleFavorite` funciona em item na lixeira; `restoreAsset` não confere se já está ativo.
6. Lista sem paginação e sem filtro de "raiz" (`folderId` ausente = todas as pastas).
7. Busca no servidor existe (nome, arquivo, tag) mas **a UI não usa** — filtra localmente; busca por nome de pasta só no cliente.
8. Filtro e contadores de pasta consideram só filhos diretos; contadores são calculados sobre a lista carregada.
9. Thumbnails: N requisições de URL assinada (uma por card) + download do original. Em lista de 200 imagens de 10 MB isso é inviável.
10. Restrição `@@unique([teamId, parentId, name])` não impede pastas-raiz duplicadas (no PostgreSQL `NULL` ≠ `NULL`).
11. `AssetFolder.parent` com `onDelete: SetNull`: apagar pasta-mãe joga as filhas na raiz e pode colidir nomes.
12. Upload em memória limitado a 100 MiB na API, mas Nginx aceita 2 GB → erro tardio e confuso para vídeos.
13. Mensagens antigas "informe o ID da equipe" ainda presentes em 4 componentes (resquício do campo manual de team ID — origem provável do item 8 reportado).

### 3.3 Arquitetura, duplicações e inconsistências

- **Cliente MinIO duplicado** em `AssetsService` e `SamplerService` → extrair `StorageService`.
- **Validação de `x-team-id` repetida** em todos os handlers (~40 vezes) → decorator `@TeamId()`.
- **Sem DTOs** nos módulos de assets/setup (`Record<string, unknown>`), enquanto auth usa classes — mas sem decorators de validação (causa direta de S1).
- **React Query e Zustand instalados e não usados.** Cada componente reimplementa fetch/loading/erro com `useState`/`useEffect`; nada de cache ou invalidação.
- **Pacotes `@standix/types` e `@standix/sdk` não são usados**; o tipo `Asset` é redefinido no web → contrato API/web pode divergir silenciosamente.
- **`asset-library-view.tsx` com 1.200 linhas** misturando árvore, grid, lista, drawer e chamadas de API.
- **shadcn/ui praticamente ausente**: só `button`. Drawer, select e diálogos são feitos à mão (sem focus trap nem `Esc`).
- `getTeamAsset(…, includeBlob)` tem os dois ramos idênticos; `RolesGuard` registrado e nunca usado.
- `Event.category` (enum) e `Event.categoryId` (tabela `Category`) coexistem para o mesmo conceito.
- `Team.slug` é único global, gerado sem desambiguação → segunda equipe com o mesmo nome falha.
- Rota `/screen/*` fora da lista de rotas protegidas do `AuthProvider`.
- Testes só unitários com mocks; nenhum teste de integração contra PostgreSQL/MinIO.
- Sem CI, sem git, sem backup documentado de PostgreSQL/MinIO.

### 3.4 Oportunidades de simplificação

- Um `StorageModule` único (cliente interno + público, `ensureBucket`, URL assinada, remoção) usado por assets, sampler e apresentações.
- Um `useAssets`/`useFolders` com React Query substitui ~300 linhas de estado manual e dá invalidação automática após renomear/mover/excluir.
- Devolver `thumbnailUrl` já assinado na listagem elimina N requisições por página.

---

## 4. Proposta técnica para a Biblioteca (DAM)

### 4.1 Modelo de dados (incremental, sem quebrar o existente)

| Requisito | Situação | Mudança |
|-----------|----------|---------|
| Nome amigável | `displayName` (migration pendente) | aplicar |
| Nome físico | `filename` | — |
| Tipo / MIME / Tamanho / Hash | `kind`, `blob.mimeType`, `blob.sizeBytes`, `blob.sha256` | expor na UI |
| Datas | `createdAt`, `updatedAt` | expor `updatedAt` |
| Pasta (hierarquia ilimitada) | `AssetFolder.parentId` | CRUD + prevenção de ciclo (CTE recursiva) + índice único parcial para raiz |
| Tags | `AssetTag` N:N | endpoints de listar/atribuir/remover |
| Favoritos | `isFavorite` | — |
| Referências | parcial | incluir `AudioCue` e `VideoCue` |
| Lixeira | `deletedAt` | já existe; acrescentar `deletedAt` em `AssetFolder` (excluir pasta → lixeira dos itens) |
| Thumbnail | inexistente | `MediaBlob.thumbnailKey` (+ largura/altura). Derivado do conteúdo, então fica no blob e herda a deduplicação |

### 4.2 Thumbnails

- Imagens: **`sharp`** (já é dependência do monorepo para os ícones de marca) gera WebP 480 px no upload, gravado em `thumbs/<sha256>/480.webp`.
- Vídeos: **`ffmpeg`** (instalar na imagem da API; resolve também o item E) extrai um quadro.
- A listagem devolve `thumbnailUrl` assinado. Backfill para os assets já existentes, junto com correção dos metadados PNG.
- Upload síncrono por enquanto (limite de 100 MiB). Fila Redis/BullMQ só quando entrar upload grande — não adicionar agora.

### 4.3 Considerações para o roadmap (não implementar agora)

- **Overlays, Relógio/Timer, Layers:** o `Asset` deve continuar sendo só a mídia; overlays e relógios são *elementos* de uma composição, não assets. Um futuro modelo `Composition → Layer (ordem, tipo, assetId?, props JSON)` encaixa sem alterar a biblioteca. As referências (`getAssetUsage`) devem ser extensíveis para incluir layers.
- **PPTX:** `PresentationImportAdapter` já existe; o importador extrai mídias do PPTX e cria `Asset` via o mesmo serviço de upload (deduplicação gratuita).
- **Igrejas:** Bíblia, letras, cifras e ordem de culto como módulo NestJS separado, que referencia assets mas não é referenciado pelo core.
- **Telas:** persistir estado por equipe (model `Screen` já existe) antes de construir layers em cima dele.

---

## 5. Plano de execução

### Alta prioridade (antes ou junto com a Biblioteca)

1. **Inicializar git** em `/opt/media` e fazer o commit do estado atual (linha de base para tudo o que vem depois).
2. **Segurança:** S1 (nunca devolver token; DTOs com `class-validator`), S2 (nome temporário gerado pelo servidor), S3 (permissão + equipe nos eventos `screen:*`).
3. **Implantar o código atual** (rebuild API → aplica migration → rebuild web) e validar o fluxo existente E2E antes de mudar qualquer coisa.
4. **Biblioteca — backend:**
   - corrigir parser PNG/JPEG; backfill de metadados;
   - `StorageService` compartilhado;
   - thumbnails (sharp + ffmpeg) e `thumbnailUrl` na listagem;
   - referências completas (slides, cenas, cues de áudio e vídeo) e exclusão definitiva com 409 + transação;
   - pastas: renomear, mover (sem ciclo), excluir (para a lixeira), unicidade na raiz;
   - tags: listar, atribuir, remover; busca por nome, arquivo, tag e pasta no servidor;
   - paginação; `folderId` com opção de incluir subpastas.
5. **Biblioteca — frontend:**
   - dividir `asset-library-view.tsx` (árvore, grid, lista, drawer);
   - migrar para React Query;
   - drawer completo: preview, nome, tipo, dimensões, tamanho, MIME, hash, datas, tags, pasta, referências; ações renomear, baixar, favoritar, mover, excluir; `Esc` e foco;
   - grid com thumbnails proporcionais (`object-cover` em quadro fixo, original só no drawer);
   - remover mensagens "ID da equipe".
6. **Validação E2E** dos 10 critérios de sucesso, no ambiente real, com um arquivo real enviado pelo navegador.

### Média prioridade

7. Decorator `@TeamId()` e DTOs em todos os módulos; corrigir semântica de `hasPermissions` (todas).
8. Auditoria de operações de asset (upload, renomear, mover, lixeira, restaurar, excluir).
9. Usar `@standix/types` como contrato único entre API e web.
10. Testes de integração (PostgreSQL + MinIO em container) para a biblioteca.
11. Gestão de equipe: membros, convites e papéis por equipe.
12. Estado de telas persistido e isolado por equipe.

### Baixa prioridade

13. Upload multipart/resumível com URL assinada para arquivos > 100 MiB.
14. Purga automática da lixeira (retenção configurável) e reconciliação de blobs órfãos.
15. Unificar `Event.category`/`Category`; slug de equipe com desambiguação.
16. Redis adapter do Socket.IO; tokens fora do `localStorage`.
17. CI (typecheck, testes, build), backups de PostgreSQL/MinIO.
18. Módulos do roadmap (Overlays, Tempo, Layers, PPTX, Igrejas).
