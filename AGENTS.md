# AGENTS.md

Este repositório usa agentes de codificação com regras explícitas de engenharia, segurança, domínio e documentação.

Antes de planejar ou implementar qualquer alteração, leia este arquivo inteiro e siga as referências obrigatórias.

## Leitura obrigatória

Antes de qualquer planejamento ou implementação, leia e siga:

1. `robots/ENGINEERING_RULES.md`
2. `robots/SECURITY_RULES.md`
3. `robots/domain/PROJECT_PRINCIPLES.md`
4. `robots/domain/EXAMPLE.md`

Para tarefas de UI/frontend, também leia:

5. `robots/UI_ENGINEERING_RULES.md`

Se o projeto for orientado a eventos, também leia:

6. `robots/domain/AGENT_EVENTS.md`

## Regra geral de execução

- Não implemente antes de entender o escopo.
- Não altere arquivos fora do escopo aprovado.
- Não crie arquitetura nova, quality gate novo, abstrações grandes ou padrões globais sem aprovação explícita.
- Não leia, liste, imprima, copie, versione ou exponha arquivos sensíveis por padrão.
- Em caso de dúvida relevante, pergunte antes de modificar.
- Ao final, reporte apenas resumo conciso, arquivos alterados, validações executadas e pendências reais.

## Planejamento

Quando solicitado a planejar:

- Escreva o plano em `PLANO_EXECUCAO.md`, salvo se o usuário indicar outro arquivo.
- Não implemente durante a etapa de planejamento.
- Aguarde aprovação explícita antes de qualquer alteração funcional.
- O plano deve citar escopo, arquivos previstos, riscos, validações e itens fora de escopo.

## Implementação

Quando solicitado a implementar:

- Siga o plano aprovado.
- Respeite o escopo.
- Altere somente os arquivos necessários.
- Execute validações compatíveis com o escopo.
- Não misture refatoração, melhoria visual, mudança arquitetural ou correção oportunista sem autorização.
- Não crie novos padrões globais se uma solução local e simples resolver o problema.

## Segurança

- Siga `robots/SECURITY_RULES.md` para entradas, saídas, autenticação, autorização, segredos, logs, dependências, arquivos e APIs perigosas.
- Não deixe `TODO: secure later` ou equivalente.
- Não use `npm audit fix --force` ou comandos equivalentes de correção forçada sem aprovação explícita.
- Não exponha payload bruto, secrets, tokens, credenciais, dados pessoais, stack traces ou prompts privados.

## UI/frontend

Para tarefas de UI/frontend:

- Leia `robots/UI_ENGINEERING_RULES.md` antes de planejar ou implementar.
- Não renderize HTML, Markdown ou payload bruto sem sanitização e aprovação explícita.
- Preserve acessibilidade, estados de carregamento, erro, vazio e permissão negada.
- Não exponha dados sensíveis em telas, logs do browser ou mensagens de erro.

## Domínio

- Use `robots/domain/PROJECT_PRINCIPLES.md` para entender objetivos, limites, vocabulário e decisões do projeto.
- Use `robots/domain/EXAMPLE.md` para interpretar exemplos reais de negócio, aplicar regras de domínio e produzir saídas esperadas.
- Use `robots/domain/AGENT_EVENTS.md` apenas quando o projeto for orientado a eventos ou quando eventos forem parte relevante do domínio.

## Checkpoints

Quando criar checkpoint:

- Crie um único arquivo de checkpoint para o bloco solicitado.
- Não crie múltiplos checkpoints para o mesmo bloco, salvo instrução explícita.
- Registre objetivo, arquivos alterados, decisões, validações e o que não foi alterado.
- Não inclua conteúdo sensível, payload bruto, secrets, prompts privados ou dados pessoais.

## Resposta final ao usuário

Ao finalizar uma tarefa, reporte apenas:

- resumo conciso;
- arquivos alterados;
- validações executadas com resultado real;
- pendências reais, se existirem.

Não narre progresso irrelevante, não inclua logs longos e não invente validações não executadas.
