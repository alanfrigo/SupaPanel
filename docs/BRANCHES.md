# Branches e clonagem

Abra um projeto e use **Gerenciar branches**. Cada branch pertence ao mesmo projeto lógico e Company, mas recebe uma instância Supabase separada, credenciais novas, volumes próprios e nenhuma publicação de portas ou domínio herdado. A nova branch é implantada em rede privada; configure domínios/portas depois nas configurações dela.

## Modos

| Modo | Conteúdo |
| --- | --- |
| Ambiente vazio | Stack nova com schemas e serviços padrão do Supabase |
| Somente estrutura | Objetos dos schemas selecionados: tabelas, funções, índices, triggers, constraints, grants e políticas RLS; sem registros |
| Estrutura + dados | Estrutura e registros dos schemas da aplicação selecionados |
| Aplicação + Auth + Storage | Schemas selecionados, schemas Auth/Storage com seus dados e arquivos do Storage local |

O padrão é `public`. Informe schemas adicionais da aplicação separados por vírgula. Schemas internos não podem ser escolhidos manualmente; Auth e Storage são incluídos somente no modo completo. Vault, Edge Functions, segredos/configurações externos, roles personalizados globais, extensões adicionais e publicações/subscrições de replicação não são copiados. Dependências ausentes fazem a restauração falhar, sem liberar uma cópia parcial para uso.

A implementação usa um archive `pg_dump` e restauração transacional com `pg_restore`. Dependências fora dos schemas escolhidos não são incluídas automaticamente ([PostgreSQL pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html), [pg_restore](https://www.postgresql.org/docs/17/app-pgrestore.html)). A origem precisa usar o mesmo template e imagens compatíveis com o template atual. Bancos personalizados diferentes de `postgres` não são suportados nesta entrega.

## Clonagem completa

Os serviços da origem, exceto PostgreSQL, são pausados durante a exportação e cópia dos arquivos. Interrompa também clientes SQL e processos externos que gravem no banco durante essa janela. Os serviços previamente em execução são retomados depois da cópia, inclusive em caso de erro recuperável. A UI exige reconhecer essa pausa antes de criar a branch.

Somente Storage com backend local `file` no caminho padrão é suportado; buckets S3 externos exigem um fluxo de cópia separado. O namespace interno de Storage é preservado, mas os volumes são independentes. As novas stacks usam volumes Docker para preservar atributos estendidos dos arquivos. A cópia usa um container auxiliar `debian:bookworm-slim`, sem rede e com o volume da origem somente para leitura, preservando atributos, permissões e proprietários. Instâncias existentes não têm seus volumes migrados automaticamente.

Usuários e hashes de senha são copiados. JWT e credenciais de serviço são novos; sessões e refresh tokens são removidos na cópia, exigindo novo login. Configurações OAuth/SMTP, domínios e integrações externas devem ser configurados no destino. Auth com chave de criptografia personalizada é recusado até existir um fluxo específico para migrá-la.

## Jobs, falhas e exclusão

A criação devolve um job persistente imediatamente. É possível fechar a página e acompanhar depois. O worker roda no processo Node do painel via instrumentation, com uma operação por vez por instalação. As instâncias existentes não são reprovisionadas por esse worker. O banco de metadados precisa permitir pelo menos duas conexões simultâneas: uma para eleger o worker e outras para progresso e operações do painel.

Em reinício, jobs na fila continuam disponíveis; uma operação já em execução é marcada como interrompida. O worker tenta retomar os serviços da origem, interrompe os serviços da cópia e remove seu archive temporário. Não repete uma restauração silenciosamente. Se a origem não puder ser retomada, aparece **Retomar origem**; resolva a disponibilidade do Docker e use essa ação. Depois, exclua a cópia incompleta e crie outra branch.

Exclusão remove containers, volumes e arquivos somente da branch escolhida. `main` não pode ser excluída enquanto houver branches adicionais. O acesso segue os papéis da Company: owner/admin/developer operam; viewer apenas consulta. Operações pelo painel são bloqueadas na origem/destino durante a criação. A fila registra solicitante, origem, destino, modo, schemas, etapa e datas, sem logs SQL ou segredos.

A implantação Docker aplica o schema de metadados via entrypoint. Em desenvolvimento, execute `npx prisma generate` e `npx prisma db push` no banco de desenvolvimento. `BRANCH_WORKER_DISABLED=1` desabilita o worker para testes/ferramentas; não use no painel que deverá processar a fila.

Cada branch consome recursos de uma stack completa. Não há merge/promoção automática nem integração GitHub nesta entrega. O comando interno de criação e a fila podem ser reutilizados por uma integração futura.

Large objects nativos do PostgreSQL (referenciados por OID, fora de colunas `bytea`) não são incluídos na cópia por schemas; exigem migração específica. Os arquivos do Storage Supabase são tratados separadamente pelo modo completo.
