# Proposta: Studio unificado no SupaPanel

Status: desenvolvimento iniciado em 16/09/2026. Primeira entrega implementa Companies, membros, agrupamento de projetos e branch `main`, com adoção compatível das instâncias existentes. A segunda entrega adiciona banco integrado: tabelas, CRUD de registros e SQL. Criação de branches adicionais, jobs e GitHub ainda não estão implementados.

## Experiência desejada

Uma sessão no SupaPanel permite criar várias Companies e acessar aquelas das quais o usuário é membro. Cada Company reúne vários projetos; cada projeto possui suas branches. Dentro de cada projeto, o usuário escolhe a branch e acessa tabelas, SQL, Auth, Storage, configurações e credenciais sem abrir um Studio separado.

Exemplo: Company Minha Empresa → Projeto Loja → main (produção), development e feature-checkout. A mesma Company pode ter outros projetos, e o mesmo usuário pode administrar outras Companies. Cada ambiente possui banco e serviços isolados. Projetos diferentes nunca compartilham dados ou credenciais implicitamente.

## Estado atual e viabilidade

O modelo Prisma `Project` representa atualmente uma instância: possui domínios, variáveis e ciclo de vida da stack. Ainda não existe agrupamento lógico de instâncias por projeto nem histórico de branches/migrações.

O Studio self-hosted suporta apenas um projeto. Branching e a API de gerenciamento da plataforma não estão incluídos nessa distribuição. Fonte: [documentação oficial de self-hosting](https://supabase.com/docs/guides/self-hosting).

No checkout local de referência do Studio, as rotas de pg-meta, Auth e Storage utilizam configurações globais como `STUDIO_PG_META_URL` e `SUPABASE_URL`, mesmo em caminhos com `[ref]`. O componente de criação de branches chama a API de gerenciamento `/v1/projects/{ref}/branches`. Essa investigação não substitui uma auditoria da revisão exata do Studio que vier a ser adaptada.

Portanto, habilitar um seletor ou uma flag do Studio não entrega gerenciamento multi-instância. O SupaPanel precisa fornecer a camada de gerenciamento e resolver os serviços de cada ambiente.

## Direção recomendada

Manter o SupaPanel como aplicação principal e construir módulos integrados para tabelas, SQL e gerenciamento dos serviços. Reaproveitar componentes do Studio seletivamente, avaliando dependências e preservando os avisos de licença aplicáveis. Um fork completo oferece mais telas prontas, mas exige adaptar endpoints globais e manter compatibilidade com mudanças do monorepo; não é a opção inicial recomendada.

O backend resolve `Company → projeto → branch → instância` usando o cadastro interno e verifica autorização em cada operação. O navegador não escolhe URLs arbitrárias de pg-meta nem recebe credenciais administrativas para executar operações do painel. Ao trocar de branch, caches, consultas pendentes e editores precisam manter o contexto explícito para impedir que uma ação seja aplicada ao ambiente errado.

O acesso ao pg-meta e ao banco deve ocorrer por uma camada interna autenticada, com destino restrito à instância autorizada. A topologia atual conecta somente Kong à rede do proxy; o gateway implementado executa um cliente HTTP fixo dentro do container `meta` autorizado, via Docker Compose. O payload segue por stdin, sem interpolação no shell ou argumentos do processo. Isso mantém o acesso na rede privada existente. Um agente persistente poderá substituir esse transporte se o volume de operações justificar. Publicar pg-meta na internet não faz parte da solução.

## Evolução dos dados e operações

- Introduzir Company, CompanyMember, agrupamento lógico de projetos, branches e vínculo com as instâncias existentes, por migração aditiva. A associação de usuário a Company é muitos-para-muitos, com papel por associação.
- Criar uma Company inicial por proprietário existente e associar seus projetos a ela. Não converter o atual TeamMember global em acesso a todas as Companies; qualquer associação adicional exige uma regra explícita.
- Transformar cada instalação existente no ambiente `main` de seu projeto sem recriar containers, renomear volumes ou trocar credenciais/domínios.
- Manter identificadores antigos compatíveis durante a transição das rotas e testar a migração sobre cópia da base de metadados.
- Persistir operações longas em jobs com progresso, logs sem segredos, exclusão mútua por instância e recuperação após reinício. Uma requisição HTTP não deve sustentar todo o provisionamento de uma branch.
- Registrar ações administrativas por usuário, Company, projeto e branch; aplicar permissões no backend, inclusive para SQL e mutações de estrutura.

## Entregas incrementais

1. **Companies, projetos e navegação:** criação de Companies, gestão de membros, migração compatível, seleção de Company/projeto/ambiente, autorização contextual e estado real das operações. Nenhum botão de recurso futuro deve parecer funcional.
2. **Banco integrado:** listar schemas/tabelas, paginação e filtros, visualizar/inserir/editar/excluir registros, criar/alterar tabelas e editor SQL. Consultas têm limite de resultado, timeout e cancelamento; tabelas sem chave identificadora não admitem edição ambígua de linhas. Mutação destrutiva apresenta impacto e contexto de destino.
3. **Serviços integrados:** usuários Auth, buckets/arquivos, políticas RLS, extensões e configuração, com as mesmas regras de autorização. Functions e logs exigem fluxos próprios de implantação e acesso.
4. **Branches isoladas:** criar, acompanhar, pausar e excluir ambientes; cada branch recebe serviços, credenciais, volumes e domínios próprios. Começar por estrutura versionada e seed opcional. Para projetos existentes sem migrações, produzir e validar um baseline antes de permitir derivação.
5. **Promoção de alterações:** histórico, detecção de divergência, prévia SQL e aplicação de migrações revisadas. Definir recuperação e backup antes da promoção; não prometer rollback automático de migrações destrutivas. Integração Git e previews automáticos são uma entrega posterior.

Uma branch consome recursos adicionais de uma stack Supabase. Antes de provisionar, mostrar a capacidade disponível e permitir remover ambientes temporários. Copiar dados completos é um fluxo separado: banco, usuários Auth, objetos de Storage e segredos exigem políticas explícitas; copiar apenas o schema não equivale a clonar todo o projeto.

A referência conceitual é o [branching oficial](https://supabase.com/docs/guides/deployment/branching), em que ambientes possuem instâncias e credenciais próprias e não recebem dados de produção por padrão. O comportamento do SupaPanel será implementado localmente, sem depender da API do Supabase Cloud.

## Companies e permissões

- Cada projeto pertence a uma única Company; cada branch pertence a um único projeto. Um usuário pode ser proprietário de várias Companies e membro de outras.
- Proposta de papéis: owner gerencia propriedade e exclusão da Company; admin gerencia membros e projetos; developer opera projetos e ambientes; viewer consulta informações operacionais sem acesso implícito aos dados ou credenciais administrativas. Detalhar a matriz por operação antes de implementar os endpoints.
- Validar a cadeia Company/projeto/branch no backend em toda operação. Ao trocar Company, limpar seleção e caches dependentes; manter Company, projeto e branch visíveis na navegação.
- Slugs de projetos são únicos dentro da Company; nomes de branches, dentro do projeto. Identificadores de containers, volumes e roteadores continuam globalmente únicos.
- Não permitir remover o último owner. Excluir uma Company exige tratar seus projetos e dados explicitamente, sem apagar somente metadados por cascata.
- Administração do servidor e proxy é uma permissão da instalação, distinta de ser owner de uma Company. Criar uma Company não concede acesso global ao host.

## GitHub: extensão futura, fora da entrega inicial

Este é um contrato de evolução proposto, sem integração, webhook ou credencial GitHub implementados agora. A experiência futura será conectar GitHub, escolher um repositório no projeto e habilitar previews para pull requests.

- Prever uma conexão de provedor pertencente à Company, com instalação externa identificada; cada projeto poderá vincular um repositório autorizado e uma branch Git de produção. Preferência arquitetural por GitHub App com acesso restrito aos repositórios escolhidos; permissões e APIs exatas serão verificadas na implementação.
- Manter a branch SupaPanel independente de Git. Uma associação opcional registra provedor, ID estável do repositório, número do pull request, referência Git e último commit aplicado. Não usar apenas o nome da branch como identidade.
- Abertura ou atualização de PR poderá criar ou atualizar uma branch de preview com migrações e seed. Fechamento poderá removê-la conforme política do projeto. Merge não promoverá mudanças para produção sem uma política explícita.
- Reutilizar o serviço de provisionamento e a fila de jobs da criação manual. Um adaptador transforma eventos externos em comandos internos; a camada de provisionamento não depende de payloads GitHub.
- Validar assinatura de eventos, deduplicar entregas, ordenar atualizações por revisão e reconciliar eventos perdidos. PR fechado durante provisionamento deve terminar com limpeza consistente, sem recriar um preview já encerrado.
- Não executar código de PRs não confiáveis com segredos do painel, produção ou acesso ao socket Docker. Definir isolamento de execução, política para forks e aprovação antes de habilitar automação.
- Prever limites de previews por projeto/Company, expiração, limpeza após falhas e estado visível no painel. A desconexão do GitHub interrompe novas automações sem apagar silenciosamente ambientes existentes.
- Não criar botões ativos ou tabelas especulativas para GitHub nesta entrega. Preservar a separação entre comandos de provisionamento, jobs e origem manual/externa; introduzir o schema da integração quando o recurso for implementado.

## Critérios de aceite

- Um usuário cria várias Companies, cada uma com vários projetos e branches, e troca entre elas sem perder o contexto.
- Membros de uma Company não acessam dados, credenciais ou operações de outra; testar também projetos com o mesmo slug em Companies diferentes e revogação de associação.
- Dois projetos com tabelas de nomes iguais continuam isolados em leituras, escritas, SQL, cache e troca de contexto.
- Um usuário não acessa outra instância alterando IDs, rotas ou parâmetros; APIs administrativas internas também recusam acesso indevido.
- Registros, schemas e SQL são operados dentro do painel, com erros e progresso visíveis e sem segredos em logs.
- As instâncias atuais continuam funcionando após a migração, inclusive domínios, dados e conexões publicadas.
- Uma branch criada reproduz a estrutura esperada e não modifica produção; falhas/reinícios durante provisionamento podem ser retomados ou limpos sem apagar a origem.
- A promoção bloqueia divergências não resolvidas e registra precisamente quais migrações foram aplicadas.
- Validar navegação e fluxos no navegador e isolamento em pelo menos duas stacks reais antes de declarar cada entrega pronta.
