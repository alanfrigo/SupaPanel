# SupaPanel no Dokploy

## Instalação

1. Crie um serviço **Docker Compose** apontando para este repositório e para `docker-compose.yml`.
2. Em **Environment**, configure:

   ```dotenv
   POSTGRES_PASSWORD=senha-aleatoria-alfanumerica
   NEXTAUTH_SECRET=segredo-aleatorio-longo
   NEXTAUTH_URL=https://panel.exemplo.com
   DATA_PATH=/etc/supapanel
   PROXY_NETWORK=dokploy-network
   PROXY_ENTRYPOINT=websecure
   PROXY_CERT_RESOLVER=letsencrypt
   ```

   Gere os segredos separadamente com `openssl rand -hex 32`. O password deve ser alfanumérico para uso na URL PostgreSQL.
3. Em **Domains**, adicione o domínio do painel ao serviço `panel`, porta `3000`, com HTTPS. Implante usando Compose, não `docker stack deploy`.
4. Abra o painel e cadastre o administrador. Crie uma instância; o template Supabase é baixado automaticamente na primeira criação.
5. Aponte `api.projeto.exemplo.com` e, opcionalmente, `studio.projeto.exemplo.com` para o servidor. Informe os domínios na instância e clique em **Salvar e implantar**.

O Compose instala somente o painel e seu banco de metadados. O Traefik e os certificados são fornecidos pelo Dokploy. Não execute `install.sh` nesse servidor.

## Domínios com CNAME

Em Configurações, defina um hostname central, como `infra.seudominio.com`, apontando por A/AAAA para o servidor do proxy. Alternativamente, configure `INSTANCE_DNS_TARGET` no Environment do Dokploy. Sem um valor explícito, o painel utiliza o hostname válido de `NEXTAUTH_URL`.

Para cada instância, crie `api.cliente.com CNAME infra.seudominio.com` e `studio.cliente.com CNAME infra.seudominio.com`. A tela da instância mostra os registros e permite copiar o destino. Os registros precisam ser criados no provedor DNS; salvar no painel não altera DNS. Depois, salve e implante para aplicar o roteamento e emitir os certificados dos domínios da instância.

Ao mudar somente o IP do servidor, atualize o A/AAAA central. Ao mudar o próprio hostname central, atualize os CNAMEs existentes. CNAME no domínio raiz depende de suporte ALIAS/ANAME do provedor.

## Informações de conexão SQL

Na aba Credenciais, escolha Conexão direta, Session Pooler ou Transaction Pooler. Os dados vêm do Compose salvo, incluindo nomes reais dos containers e portas publicadas. Você pode copiar a URI completa ou host, porta, banco, usuário e senha separadamente.

No Dokploy padrão, as três opções são privadas, acessíveis por containers conectados à rede da instância. Use **Credenciais → Expor conexões no host** para ativar as portas desejadas, escolher números exclusivos por instância e selecionar acesso remoto ou somente servidor/túnel SSH. **Salvar e implantar** aplica o Compose e pode reiniciar banco/pooler; **Salvar portas** deixa a aplicação pendente. A UI verifica os mapeamentos ativos no Docker. Para acesso remoto, informe o hostname/IP real do servidor e restrinja os IPs no firewall. Desmarque e implante novamente para remover a publicação. O domínio CNAME/HTTPS do Studio ou da API não fornece conexão SQL.

## Múltiplas instâncias

Cada projeto criado pelo painel é uma stack Compose independente no mesmo Docker daemon, com nome único, rede privada, volumes e segredos próprios. Essas stacks são gerenciadas pelo SupaPanel, não cadastradas como aplicações separadas no Dokploy.

Somente Kong entra na rede externa `dokploy-network`. Postgres, Auth, Studio, Storage, Realtime e demais serviços permanecem na rede do projeto. Por padrão, não são publicadas portas do Supabase no host no modo Dokploy. A publicação SQL é opcional e gerenciada na aba Credenciais, diretamente no Compose da instância, sem alterar as portas internas ou as redes. API e Studio são roteados por labels Traefik exclusivos de cada projeto; ambos passam por Kong, que protege o dashboard com usuário e senha. O Studio também pode ser aberto no domínio da API.

A configuração padrão não publica acesso TCP externo ao PostgreSQL. As aplicações podem usar a API HTTPS; acesso SQL direto exige uma configuração de rede/túnel separada. O número de instâncias depende da memória, CPU e disco disponíveis: cada instância executa a stack completa.

Alterar domínios/variáveis salva a configuração; **Salvar e implantar** recria os serviços para aplicá-la. Pausar preserva dados. Excluir remove containers, volumes e diretório de dados; falhas de limpeza interrompem a exclusão para permitir uma nova tentativa.

## Persistência e permissões

`DATA_PATH` deve ser um caminho absoluto **idêntico no host e dentro do container**. Isso é necessário porque o painel usa o socket Docker do host e os serviços Supabase montam arquivos relativos ao Compose gerado. Não substitua esse bind por um volume nomeado ou por `/data` apenas dentro do painel. Escolha um caminho exclusivo se instalar mais de um SupaPanel.

O socket Docker concede ao painel controle administrativo do host. Restrinja o acesso ao painel. O banco de metadados persiste em `panel-database`; os arquivos/configurações das instâncias ficam em `${DATA_PATH}/projects`; novas instâncias usam `<slug>_storage-data` para arquivos Storage, e as antigas preservam o bind original. Cada PostgreSQL usa um volume Docker `<slug>_postgres-data`, além dos volumes auxiliares definidos pelo template. Faça backup do banco de metadados, dos diretórios e de todos os volumes das instâncias. Remover apenas o serviço do painel no Dokploy não remove as stacks Supabase.

## Versões e atualização

`SUPABASE_CORE_REF` fixa o commit ou tag do repositório oficial usado para **novas** instâncias. O cache fica em `core/releases/<ref>`. Instâncias existentes conservam seus próprios arquivos e imagens; inicializar um novo template nunca substitui dados de uma instância existente.

O padrão usa o commit oficial `9e225a279b33e4e6e1452e573a40a6a25aa2cb2f` (atualização de 03/08/2026), que contém exatamente o conjunto solicitado:

| Serviço | Imagem |
|---|---|
| Studio | `supabase/studio:2026.08.03-sha-022b374` |
| Kong | `kong/kong:3.9.3` |
| Auth | `supabase/gotrue:v2.189.0` |
| REST | `postgrest/postgrest:v14.12` |
| Realtime | `supabase/realtime:v2.102.3` |
| Storage | `supabase/storage-api:v1.60.4` |
| imgproxy | `darthsim/imgproxy:v3.30.1` |
| Meta | `supabase/postgres-meta:v0.96.6` |
| Functions | `supabase/edge-runtime:v1.74.0` |
| PostgreSQL | `supabase/postgres:17.6.1.136` |
| Supavisor | `supabase/supavisor:2.9.5` |

O template inclui os scripts e volumes oficiais compatíveis. Cada nova instância registra o ref em `supapanel-version.json`. O conjunto usa autenticação JWT HS256; as novas chaves assimétricas opcionais não são habilitadas automaticamente.

Atualizar somente Studio não atualiza a stack inteira. Uma atualização existente, especialmente de Postgres 15 para 17, exige backup, plano de migração e validação de compatibilidade. Não substitua a imagem sobre um volume de outra versão principal de PostgreSQL.

## Verificação

```sh
npm ci
npm test
npm run type-check
npm run build
docker compose config --quiet
```

No servidor Dokploy, valide criando **duas instâncias**, acessando Studio/API, escrevendo dados diferentes em ambas, pausando uma sem afetar a outra e reiniciando o painel para confirmar persistência. Os testes locais de geração de Compose não substituem essa validação de HTTPS, DNS e containers reais.

Referências: [Compose e domínios no Dokploy](https://docs.dokploy.com/docs/core/docker-compose/domains), [exemplo de labels e redes](https://docs.dokploy.com/docs/core/docker-compose/example), [Supabase self-hosted](https://github.com/supabase/supabase/tree/master/docker).
