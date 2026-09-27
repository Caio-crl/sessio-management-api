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
