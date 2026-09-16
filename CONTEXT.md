# SupaPanel

Vocabulário para a evolução do painel para gerenciamento unificado de projetos e ambientes Supabase.

## Linguagem

**Company**: Uma organização que reúne membros e projetos. Um usuário pode criar e participar de várias Companies; cada projeto pertence a uma única Company.
_Evitar_: Alternar Company, workspace e equipe para o mesmo conceito na interface.

**Membro da Company**: Um usuário com um papel e permissões dentro de uma Company específica. Participar de uma Company não concede acesso às demais.

**Projeto**: Uma aplicação ou produto pertencente a uma Company que reúne seus ambientes Supabase, como produção e desenvolvimento.
_Evitar_: Usar projeto como sinônimo de instalação física.

**Instância**: Uma instalação isolada do Supabase, com banco, serviços, credenciais e dados próprios.

**Branch**: Um ambiente de um projeto, com uma instância própria e uma origem identificada para suas alterações. A branch principal representa o ambiente de produção; branches adicionais permitem desenvolvimento e testes independentes.

**Migração**: Uma alteração versionada da estrutura do banco que pode ser aplicada a ambientes diferentes.

**Merge de branch**: A promoção das alterações revisadas de uma branch para outra. Não significa combinar automaticamente os registros dos dois bancos.

**Branch de preview**: Um ambiente temporário de um projeto para validar uma mudança, que futuramente poderá acompanhar um pull request. Uma branch do SupaPanel pode existir sem uma branch Git correspondente.
