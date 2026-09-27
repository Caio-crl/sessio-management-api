# Session Management API

## Descrição

API NestJS em preparação para gerenciamento de sessões.

## MySQL local e testes

Instale as dependências com `npm ci` e configure as variáveis de `.env.example`
no ambiente. A aplicação não carrega arquivos `.env` automaticamente. Use uma
senha local própria em `DB_PASSWORD` e um segredo aleatório de pelo menos 32
bytes em `JWT_ACCESS_SECRET`; não versione esses valores. O Compose usa
`DB_NAME=session_management_e2e` e `DB_PORT=3307` por padrão, publica MySQL
somente em `127.0.0.1` e exige `DB_PASSWORD`. O banco E2E é descartável: a
suite apaga `sessions` e `users` entre os cenários.

Com essas variáveis configuradas no mesmo terminal, execute:

```sh
docker compose up -d mysql
docker compose ps
npm run migration:run
npm run start:dev
```

Aguarde o estado `healthy` em `docker compose ps` antes da migration. O schema
vem somente das migrations TypeORM; `synchronize` permanece `false`. Para
reverter e recriar a migration **somente nesse banco local descartável**:

```sh
npm run migration:revert
npm run migration:run
```

Os testes unitários não precisam do MySQL. Os E2E exigem o banco migrado e
recusam qualquer `DB_HOST` fora de `127.0.0.1`/`localhost` ou `DB_NAME`
diferente de `session_management_e2e`:

```sh
npm test -- --runInBand
npm run test:e2e
```

## Access JWT

Configure `JWT_ACCESS_SECRET` com pelo menos 32 bytes aleatórios, além de
`JWT_ISSUER` e `JWT_AUDIENCE`, antes de iniciar a aplicação. O exemplo deixa o
segredo vazio para evitar o uso acidental de uma chave publicada. O access JWT
expira em 10 minutos.

Endpoints protegidos validam o JWT sem consultar User ou Session. Revogar uma
Session impedirá futuros refreshes, mas um access JWT já emitido continuará
válido até sua expiração.

`POST /auth/refresh` recebe `{ "refreshToken": "<sessionId>.<secret>" }` e
retorna novos access e refresh tokens. Cada rotação mantém o mesmo `sessionId`
e a expiração absoluta da Session. O token imediatamente anterior é lembrado
apenas para detectar reuse e revogar a Session; tokens desconhecidos são
rejeitados sem revogação. A linha da Session é bloqueada durante a rotação para
serializar refreshes concorrentes.

`POST /auth/logout` revoga somente a Session identificada pelo access JWT.
`GET /sessions` lista as Sessions ativas do usuário, e
`DELETE /sessions/:id` revoga uma Session própria. Essas operações exigem
Bearer access JWT. A revogação bloqueia imediatamente novos refreshes, mas
o access JWT já emitido permanece válido até seu TTL de 10 minutos.

## Proteções HTTP

`POST /auth/register`, `POST /auth/login` e `POST /auth/refresh` aceitam até
20 requests por minuto, por IP e por endpoint. O contador do `@nestjs/throttler`
fica em memória: reiniciar a aplicação o zera e várias instâncias não
compartilham limites. O MVP não confia automaticamente em headers de proxy
para identificar o IP do cliente.

Helmet adiciona headers de segurança. Corpos JSON e URL encoded são limitados
a 8 KiB; entradas maiores recebem 413. O `ValidationPipe` global rejeita
campos extras e transforma DTOs. CORS permanece desabilitado, pois não há
frontend no MVP. Swagger fica disponível em `/v1/docs/swagger` quando
`NODE_ENV` não é `production`.
