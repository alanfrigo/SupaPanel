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
