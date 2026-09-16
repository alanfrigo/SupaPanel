# Validação da integração Dokploy e atualização Supabase

Executada localmente em 16/09/2026 com banco de metadados e projetos de teste separados dos dados existentes.

## Verificações concluídas

- `npm test`: geração de Composes isolados, roteamento pelo gateway, assinatura HS256, serialização de variáveis e separação de portas internas/externas.
- `npm run lint` e `npm run type-check` sem erros.
- Build Next.js e imagem Docker de produção construídos com sucesso. Docker Compose disponível dentro da imagem. O container de produção iniciou, sincronizou o schema e respondeu ao healthcheck.
- `docker compose config` validou o Compose de instalação e dois Composes Supabase gerados. As 11 imagens de cada stack correspondem exatamente à lista solicitada.
- Duas stacks Supabase simultâneas: 22 containers com healthchecks saudáveis, redes privadas e volumes PostgreSQL próprios.
- Studio retornou 401 sem autenticação e permitiu acesso com suas credenciais.
- Uma tabela de teste em cada PostgreSQL retornou marcadores diferentes pela API REST autenticada, comprovando a separação dos dados.
- Implantação, pausa e retomada pela API do painel: a outra instância permaneceu disponível e os dados persistiram após a retomada.
- Exclusão pela API removeu os containers, volumes e arquivos das duas instâncias temporárias; o ambiente de teste foi encerrado.
- Oito endpoints rejeitaram leitura/mutação de um projeto por outro usuário autenticado.
- Traefik local, em rede de teste externa: os dois domínios HTTPS encaminharam as consultas para suas respectivas APIs. Nesse teste foram usados certificados locais, não ACME.
- Playwright: cadastro inicial, criação de instância, edição de domínios e URL da aplicação, busca e filtro no dashboard, configurações do Dokploy e layouts desktop/mobile.

## Limites

O Dokploy de produção não foi acessado. A instalação final ainda deve verificar DNS, emissão/renovação ACME, persistência após reinício do servidor e recursos disponíveis no host. O teste do proxy local preservou os labels de roteamento gerados, adaptando apenas o nome da rede e a configuração TLS para o ambiente de teste.

Instâncias existentes não foram migradas. O novo template usa PostgreSQL 17; trocar a imagem de uma instância PostgreSQL 15 exige migração e backup específicos, não apenas uma alteração de tag.

Os testes não cobrem todas as funcionalidades internas do Supabase (por exemplo, envio SMTP, provedores OAuth e código das Edge Functions do usuário).

## Conexões SQL, CNAME e documentação

- Testes de conexão direta, Session Pooler e Transaction Pooler: usuários, portas internas/publicadas, restrições de rede e codificação de senhas na URI.
- API validada com duas instâncias de demonstração: três conexões privadas por instância, extraídas do Compose salvo.
- Destino CNAME: hostname normalizado e persistido; IP, protocolo, porta e localhost rejeitados.
- Browser em build de produção: abas de conexão, cópia da URI com confirmação, registros CNAME da API/Studio e prints atualizados no README.
- `npm test` (8 testes), lint, type-check e build aprovados.

## Companies e projetos — 16/09/2026

Primeira entrega do Studio unificado: schema aditivo de Company, CompanyMember,
ManagedProject e Branch; preservação de Project como instância física; branch main.
A comparação do schema anterior com o novo gera somente novos tipos, tabelas,
índices e chaves estrangeiras, sem remover ou alterar colunas existentes.

Validação automatizada em PostgreSQL 16 isolado:

```sh
# DATABASE_URL deve apontar para uma base exclusiva de testes com o schema aplicado.
COMPANY_INTEGRATION=1 DATABASE_URL=postgresql://... npm test
```

O teste de integração cobre adoção concorrente/idempotente de instalação antiga,
preservação de slug, domínio, status e segredo, várias Companies por usuário,
filtragem de projetos, bloqueio de acesso cruzado a endpoints de instância,
viewer sem acesso a credenciais, promoção a developer, revogação de acesso,
proteção do último owner e impedimento de admin promover a si mesmo a owner.
O teste é ignorado na execução padrão sem COMPANY_INTEGRATION=1.

No navegador, em base isolada: cadastro do administrador, criação de uma segunda
Company, criação real da configuração de um projeto nela, navegação com contexto
Company/projeto/main e cadastro de uma conta viewer pela tela de membros.
Nenhuma stack Supabase de produção foi modificada ou implantada nesta validação.

Esta entrega ainda não valida edição de tabelas, SQL, criação/clonagem de branches
adicionais ou integração GitHub, pois essas funcionalidades não foram implementadas.

## Editor de banco integrado — segunda entrega

O editor usa o postgres-meta v0.96.6 dentro da rede de cada instância. O transporte
executa um cliente HTTP fixo pelo Docker Compose; SQL e parâmetros seguem por stdin.
A API verifica sessão e permissão da Company antes de acessar qualquer container.
O endpoint foi incluído nos testes de acesso cruzado e de restrição de viewers.

Teste reproduzível com Docker:

```sh
npm run test:database
```

O comando cria duas stacks temporárias (PostgreSQL 16 e postgres-meta v0.96.6),
sem portas públicas, e remove containers, volumes e arquivos ao terminar. Valida
isolamento entre bancos, CRUD com tipagem do PostgreSQL, precisão numérica,
Unicode, recusa de alteração concorrente, confirmação SQL, limite de resultados
e timeout real. Os nomes dessas stacks são exclusivos por execução.

Fluxos conferidos no navegador: criar tabela com RLS ativada, inserir registro com
valores padrão, editar e excluir registros, confirmar SQL de escrita e navegar por duas páginas de registros no mesmo contexto Company/projeto/main.
A validação utiliza bancos de teste; não equivale a uma implantação no Dokploy real.

Limites desta entrega: uma instrução SQL por execução, 200 resultados no SQL,
50 registros por página e resposta de até 2 MB. As alterações avançadas de schema e
políticas usam SQL. Ainda não há histórico de consultas, cancelamento manual,
clonagem de branches ou integração GitHub.

Referência de compatibilidade: [rotas de query do postgres-meta v0.96.6](https://github.com/supabase/postgres-meta/blob/v0.96.6/src/server/routes/query.ts).
