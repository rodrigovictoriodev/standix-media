# Roadmap técnico

## Fase 0 — Fundação (entregue)

- Monorepo pnpm/Turborepo com apps e pacotes compartilhados.
- Compose para PostgreSQL, Redis, MinIO, provisionamento de bucket, API, web e
  Nginx.
- Schema de domínio Prisma, migration inicial e seed de papéis/permissões.
- Login, JWT de acesso, rotação/revogação de refresh token e Argon2id.
- Guards RBAC com escopo global/equipe e gateway Socket.IO autenticado.
- Upload inicial no MinIO com identidade por SHA-256 e referência lógica de
  asset.
- Identidade visual dark e rotas independentes das telas main, stage, live e aux.

## Fase 1 — Identidade, equipes e governança

- Fluxos de convite, criação segura da primeira equipe e gestão de membros.
- CRUD administrativo de usuários, papéis e atribuições por equipe.
- Endpoints de auditoria, retenção configurável, metadados de sessão e
  revogação de todas as sessões.
- Rate limiting para autenticação, política de senha, recuperação de acesso e
  MFA opcional.
- Testes unitários e de integração para auth, permissões e isolamento entre
  equipes.

## Fase 2 — Biblioteca de mídia

- CRUD de pastas, assets e tags, busca/filtros e paginação.
- Upload multipart/resumível para arquivos grandes, quotas e URLs de upload
  assinadas.
- Metadados técnicos, thumbnails e transcodificação assíncrona com filas Redis.
- Reconciliação de blobs órfãos e política segura de exclusão após remoção da
  última referência.
- Antivírus, limites operacionais, métricas de armazenamento e testes de
  concorrência da deduplicação.

## Fase 3 — Eventos e conteúdo

- CRUD de eventos, categorias, estados, sessões e associação de equipes.
- Editor de apresentações e slides com layouts, temas, transições e referências
  a assets.
- Versionamento, autosave, templates e validação do documento interno.
- Importação PPTX e formatos externos por adaptadores que convertem para o
  modelo nativo.
- Testes de consistência para slides/cenas que referenciam mídia existente.

## Fase 4 — Operação e projeção

- Console de operação com fila de cenas, preview e comandos de operador.
- Estado de tela, pairing seguro, heartbeat, reconexão, comando atual e
  sincronização pelo namespace Socket.IO.
- Players independentes de vídeo e áudio, saída de palco/live/aux e latência
  observável.
- Redis Socket.IO adapter, presença e coordenação entre instâncias.
- Testes de carga e recuperação de sessão para operadores simultâneos.

## Fase 5 — Sampler e automações

- Categorias, hotkeys, mixagem simultânea, volume, loop e controle por usuário.
- Permissões específicas de operador de áudio, atalhos configuráveis e
  proteções contra acionamento duplicado.
- Automações agendadas e gatilhos por evento/cena, com trilha de auditoria.
- Módulos opcionais de domínio (incluindo igreja) sem dependências obrigatórias
  no core.

## Fase 6 — Preparação para produção

- TLS, política de cookies/tokens, gestão de segredos e hardening de containers.
- Backups e restauração ensaiada de PostgreSQL/MinIO, RPO/RTO e retenção.
- Observabilidade com logs estruturados, métricas, tracing e alertas.
- CI com lint, typecheck, testes, migrações verificadas, análise de dependências
  e build de imagens reproduzível.
- Revisão de segurança e privacidade, proteção contra abuso, capacidade e
  requisitos de disponibilidade.
