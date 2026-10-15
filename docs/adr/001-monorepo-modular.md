# ADR-001: Monorepo modular e fundação inicial

- **Status:** Aceito
- **Data:** 2026-10-05

## Contexto

Standix Media precisa atender a diferentes tipos de produção de eventos e
oferecer módulos opcionais sem acoplar o núcleo a um segmento específico. Web,
API, contratos, biblioteca visual e infraestrutura evoluirão em conjunto, mas
precisam manter limites claros.

## Decisão

Adotar um monorepo pnpm/Turborepo com aplicações Next.js (`apps/web`) e NestJS
(`apps/api`), mais pacotes compartilhados `ui`, `types` e `sdk`. O backend é
organizado por módulos NestJS; o schema Prisma separa entidades de biblioteca
de mídia das referências usadas em apresentações, cenas e cues.

PostgreSQL mantém dados transacionais, RBAC e auditoria; Redis fica reservado
para cache, filas e coordenação; MinIO armazena objetos. `MediaBlob` representa
um objeto físico global identificado pelo SHA-256 e `Asset` é a referência
lógica, pertencente a uma equipe. A unicidade do hash e as chaves de objeto
determinísticas permitem deduplicar conteúdo sem copiar o arquivo por equipe.

JWT de acesso curto e refresh JWT rotativo são usados na API e no handshake
Socket.IO. Senhas usam Argon2id. Permissões são atribuídas a papéis e verificadas
com escopo global ou de equipe. O gateway autentica o cliente e exige
associação à equipe do evento para entrar na sala de operação.

Apresentações e slides são nativos e referenciam assets existentes. Integrações
futuras devem normalizar apresentações externas para o modelo interno, sem
exigir software de apresentação instalado.

## Consequências

- Pacotes e módulos podem ser desenvolvidos e compilados em conjunto, com
  fronteiras definidas e contratos compartilhados.
- Módulos específicos de segmento podem ser adicionados como módulos opcionais
  sem mudar o foco do domínio central.
- A unicidade do objeto é global: equipes podem ter referências lógicas
  distintas para os mesmos bytes, mas o conteúdo físico é compartilhado.
- A autorização baseada em banco reflete alterações de permissões sem aguardar
  expiração de access JWT; ela aumenta uma leitura de RBAC por requisição
  protegida.
- O adapter Socket.IO para Redis, filas e workers de mídia devem ser
  implementados antes de escalar API horizontalmente ou processar tarefas
  longas.
- TLS, políticas de retenção, malware scanning, quotas, URLs assinadas,
  limitação de taxa e observabilidade de produção continuam necessários antes
  da exposição pública.

## Alternativas consideradas

- **Aplicações em repositórios separados:** rejeitadas nesta fase por
  multiplicarem o custo de versionamento e sincronização dos contratos.
- **Apresentações baseadas em PowerPoint:** rejeitadas por acoplarem o runtime
  a uma aplicação desktop e dificultarem a projeção consistente.
- **Copiar assets por equipe:** rejeitada por duplicar armazenamento e contrariar
  a deduplicação exigida.
- **Somente papéis codificados no JWT:** rejeitada porque alterações de papel
  permaneceriam efetivas apenas após expiração do token.
