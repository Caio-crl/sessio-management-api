# Session Management API

## Descrição

API NestJS em preparação para gerenciamento de sessões.

## Persistência

Configure `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` e `DB_NAME` no ambiente
antes de iniciar a aplicação ou executar migrations. `.env.example` contém apenas
nomes e exemplos não sensíveis; a aplicação não carrega arquivos `.env`
automaticamente.

O schema é criado por migrations do TypeORM, com `synchronize: false`.
Após configurar um MySQL local, execute:

```sh
npx typeorm-ts-node-commonjs -d src/database/data-source.ts migration:run
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
