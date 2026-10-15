# Standix Media

Plataforma modular de gerenciamento e operação de mídia para eventos,
conferências, espetáculos, transmissões e outros formatos de produção. Módulos
específicos — como recursos para igrejas — podem ser adicionados sem limitar o
produto a um único segmento.

## Stack e organização

- **Web:** Next.js App Router, React, TypeScript, Tailwind CSS 4, shadcn/ui,
  Zustand e TanStack Query.
- **API:** NestJS, TypeScript, Prisma, PostgreSQL, Redis e Socket.IO.
- **Mídia:** MinIO (S3 compatível, imagem Bitnami Legacy arquivada), com
  deduplicação de objetos por SHA-256.
- **Workspace:** pnpm workspaces e Turborepo.
- **Infraestrutura:** Docker Compose e Nginx; domínio previsto:
  `https://media.standix.net`.

```text
apps/
  api/                  # API NestJS, módulos, Prisma e migrations
  web/                  # Aplicação Next.js e rotas independentes de tela
packages/
  sdk/                  # Cliente HTTP TypeScript
  types/                # Contratos compartilhados
  ui/                   # Componentes e identidade visual compartilhados
infrastructure/
  minio/
  nginx/
  postgres/
  redis/
```

## Inicialização com Docker

Requisitos: Docker com o plugin Compose. Na primeira execução:

```sh
cp .env.example .env
```

Edite `.env` e substitua as senhas e os dois segredos JWT por valores fortes e
distintos. `BOOTSTRAP_ADMIN_EMAIL` e `BOOTSTRAP_ADMIN_PASSWORD` são opcionais;
quando ambos são informados, a inicialização cria o administrador inicial. A
senha precisa ter no mínimo 12 caracteres. Evite caracteres reservados de URL
na senha do PostgreSQL ou codifique-os no `DATABASE_URL`.
Em produção, ajuste `WEB_ORIGIN` para a origem pública da aplicação e defina
`NGINX_HTTP_BIND_IP` como o IP da interface onde o proxy reverso alcança este
servidor. Configure `MINIO_PUBLIC_URL` com a origem HTTP(S) que os navegadores
alcançam (por exemplo, `https://media.standix.net`); ela precisa corresponder
ao host público usado pelo proxy reverso para os links assinados de mídia.
`NEXT_PUBLIC_API_URL=/api` e `NEXT_PUBLIC_SOCKET_URL=/events` usam a origem
publicada e são passados ao build do frontend pelo Compose.

```sh
docker compose up --build
```

O Compose inicia PostgreSQL, Redis e MinIO; aplica migrations e permissões
iniciais antes da API; e publica a aplicação pelo Nginx na porta configurada em
`NGINX_HTTP_PORT` (8081 por padrão, para evitar conflito com proxies que já
escutam na porta 80). O bucket MinIO é criado pela API no primeiro upload de
mídia. Se usar um proxy reverso como Nginx Proxy Manager, encaminhe o domínio
para o IP de rede acessível pelo proxy nessa porta. Para o Nginx Proxy Manager
em outro servidor da tailnet, configure `media.standix.net` com esquema HTTP,
IP de encaminhamento `100.83.222.121` e porta `8081`; restrinja o acesso à
porta 8081 à rede Tailscale no firewall do VPS.

- Aplicação: `http://localhost:8081/`
- API e health check: `http://localhost:8081/api/health`
- Telas: `/screen/main`, `/screen/stage`, `/screen/live` e `/screen/aux`
- Console MinIO: `http://127.0.0.1:9001` no VPS; use um túnel SSH para acessá-lo
  remotamente.

Para servir o domínio de produção com HTTPS, configure DNS e TLS no proxy de
borda ou habilite certificados no Nginx antes de expor o serviço publicamente.
O Nginx deste scaffold termina HTTP; não configura TLS por conta própria.

## Desenvolvimento local

Requisitos: Node.js 20.19+ e pnpm 10.

```sh
cp .env.example .env
pnpm install
pnpm --filter @standix/api prisma:generate
pnpm --filter @standix/api prisma:migrate:deploy
pnpm --filter @standix/api prisma:seed
pnpm dev
```

Para executar todos os serviços localmente, primeiro inicie PostgreSQL, Redis e
MinIO e configure os respectivos endereços/credenciais para `localhost` no
`.env`. Para uma instância vazia, gere uma migration com
`pnpm --filter @standix/api exec prisma migrate dev --name init`.

Comandos na raiz: `pnpm dev`, `pnpm build`, `pnpm typecheck` e
`pnpm format:check`.

## Ativos de marca

Coloque o logo quadrado/fonte em `apps/web/public/branding/logo-source.png` e
execute `npm run branding:generate` (ou `pnpm branding:generate`) para regenerar
e sobrescrever `favicon.ico`, os ícones PNG de 16 a 512 px e
`apple-touch-icon.png` em `apps/web/public/`. A geração usa Sharp.

## Autenticação e controle de acesso

`POST /api/auth/login` recebe `{ "email": "...", "password": "..." }` e devolve
um access JWT e um refresh JWT. `POST /api/auth/refresh` rotaciona refresh
tokens; o hash SHA-256 do refresh token é persistido e o token anterior é
revogado atomicamente. `GET /api/auth/me` valida o access token e retorna o
usuário autenticado. `POST /api/auth/logout` revoga o refresh token informado.
Senhas são armazenadas com Argon2id. Access JWTs têm duração configurável e
refresh tokens têm duração em dias (`JWT_ACCESS_TTL`,
`JWT_REFRESH_TTL_DAYS`). A interface usa `/login`, protege as áreas da
plataforma, persiste os tokens no navegador, renova o access token quando
expira e permite encerrar a sessão. O escopo de equipe é enviado pelo painel
de sessão.

O guard global exige access JWT em todas as rotas, exceto as explicitamente
públicas. O decorator `@Permissions(...)` aplica permissões por ação; o escopo
de equipe vem de `x-team-id`, de `teamId` na rota ou no corpo. A autorização
consulta atribuições globais ou da equipe no banco em cada requisição.

| Papel         | Capacidades iniciais                                       |
| ------------- | ---------------------------------------------------------- |
| Admin         | Todas as permissões; escopo global                         |
| Editor        | Criar e editar assets, eventos e apresentações             |
| Operator      | Consultar eventos e controlar apresentações, telas e vídeo |
| AudioOperator | Consultar eventos e operar áudio e sampler                 |
| Viewer        | Leitura dos recursos disponíveis                           |

Papéis e permissões do sistema são semeados idempotentemente. Crie o primeiro
administrador por `BOOTSTRAP_ADMIN_EMAIL` e `BOOTSTRAP_ADMIN_PASSWORD` na
primeira inicialização. No Docker Compose, configure essas variáveis no `.env`;
o serviço da API as disponibiliza ao seed de inicialização. A senha deve ter
pelo menos 12 caracteres. Não deixe a senha de bootstrap no ambiente depois de
criar a conta.

Quando a plataforma ainda não tem equipes, o administrador global é direcionado
para `/setup` após entrar. O formulário cria a organização (workspace), a equipe
principal e a associação do administrador com o papel `Admin`. Depois disso, o
dashboard mostra a equipe atual e as quantidades reais de usuários ativos,
assets não excluídos, eventos e apresentações dessa equipe.

## Assets e apresentações

`POST /api/assets/upload` aceita multipart/form-data com o campo `file`, access
JWT e header `x-team-id`; exige `assets:create` e limita uploads a 100 MiB nesta
base. Links de download são assinados para `MINIO_PUBLIC_URL`; o Nginx encaminha
os caminhos de objetos SHA-256 diretamente ao MinIO, sem expor o endpoint
interno do container ao navegador.
O serviço calcula o SHA-256 do conteúdo, grava no MinIO sob uma chave
determinística e cria uma referência de biblioteca. `MediaBlob.sha256` único
impede blobs repetidos no banco; vários assets de equipes diferentes podem
referenciar o mesmo blob físico. Slides, cenas e cues referenciam registros de
asset existentes, sem anexar ou duplicar arquivos.

Apresentações e slides são nativos do produto: conteúdo e layouts iniciais são
JSON para evoluir sem dependência do PowerPoint. Importadores de PPTX e fontes
externas devem converter para esse formato interno em uma fase futura.

## Tempo real e telas

O gateway Socket.IO autenticado é exposto no namespace `/events`, sob
`/socket.io/`, e autoriza a entrada em salas de eventos antes de associar o
cliente à sala `event:<id>`. Ele é a base para sincronização de operação,
projeção e telas, não uma implementação completa do fluxo de produção. As
quatro rotas de tela são independentes e estão prontas para receber conteúdo.

Redis já está provisionado para filas, cache e coordenação distribuída futuras;
o gateway atual ainda não usa Redis adapter.

## Estrutura do domínio

O schema inicial cobre usuários, papéis, permissões, equipes e associações;
assets, blobs, pastas e tags; eventos; apresentações, slides, cenas e telas;
cues de áudio e vídeo; auditoria e sessões de refresh token. O schema Prisma e
a migration inicial ficam em `apps/api/prisma/`.

## Documentação técnica

- [ADR-001 — Monorepo modular e arquitetura inicial](docs/adr/001-monorepo-modular.md)
- [Roadmap técnico](docs/ROADMAP.md)

## Estado do produto

O frontend usa a API para autenticação, biblioteca de mídia, eventos,
apresentações e sampler. A agenda e os ativos refletem dados da equipe; o player
e o sampler usam links assinados de mídia e as apresentações sincronizam pelo
gateway Socket.IO. As telas ainda mantêm estado em memória para o fluxo de
operação, e automações, importadores e gestão administrativa permanecem fora
deste escopo.
