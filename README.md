# Boteco do Turde — Reservas de mesa

Um link. O cliente clica, escolhe dia, horário e mesa, e pronto. O bar acompanha
tudo num painel, aprova o que precisa aprovar e responde no WhatsApp com um
clique.

Feito para rodar **de graça**: Supabase (banco) + Vercel (site), os dois no plano
gratuito. Sem mensalidade, sem cartão de crédito.

---

## Índice

1. [Como funciona](#como-funciona)
2. [Antes de começar](#antes-de-começar)
3. [Passo 1 — Criar o banco no Supabase](#passo-1--criar-o-banco-no-supabase)
4. [Passo 2 — Criar as tabelas](#passo-2--criar-as-tabelas)
5. [Passo 3 — Criar o usuário do painel](#passo-3--criar-o-usuário-do-painel)
6. [Passo 4 — Rodar no seu computador](#passo-4--rodar-no-seu-computador)
7. [Passo 5 — Publicar na internet](#passo-5--publicar-na-internet)
8. [Passo 6 — Divulgar o link](#passo-6--divulgar-o-link)
9. [O dia a dia no bar](#o-dia-a-dia-no-bar)
10. [Ajustes sem mexer no código](#ajustes-sem-mexer-no-código)
11. [Testes](#testes)
12. [Limites do plano gratuito](#limites-do-plano-gratuito)
13. [Estrutura do projeto](#estrutura-do-projeto)
14. [Deu problema?](#deu-problema)

---

## Como funciona

**Para o cliente** (`/reservar`, sem login, sem cadastro, 3 telas):

1. Escolhe o dia e quantas pessoas são
2. Escolhe o horário de chegada — só aparecem horários que ainda comportam o
   grupo dele
3. Põe nome e WhatsApp
4. Recebe um código (`TURDE-4K7Q`) e um link pessoal para acompanhar ou cancelar

**Nada é confirmado sem o bar aprovar.** Toda reserva entra como *pendente* e só
vale depois que alguém aprova no painel. O cliente vê isso com todas as letras
na tela de sucesso: "sua mesa ainda não está garantida".

Enquanto está pendente, a mesa fica guardada por até 12 horas — nunca além da
hora da própria reserva. Se ninguém decidir nesse prazo, expira sozinha e a mesa
volta a ficar livre. O prazo é configurável no painel.

**O cliente não escolhe a mesa.** Ele diz quantas pessoas são e o sistema separa
a menor mesa livre que comporta o grupo — para não gastar a mesa de 10 com um
casal e deixar a turma sem lugar. O número da mesa não aparece em lugar nenhum
do site público: é ferramenta interna do bar, que pode trocar a mesa a qualquer
momento pelo painel.

**Para o bar** (`/admin`, com login):

- Agenda do dia, com linha do tempo por mesa
- Fila de pendentes com botões grandes de aprovar e recusar
- Botão de WhatsApp com a mensagem já escrita
- **Trocar mesa**: o sistema separou a 3, você prefere a 7 — dois cliques
- Marcar quem chegou e quem não veio, criar reserva de quem apareceu na porta
- Cadastro de mesas, horários, datas especiais e configurações
- Atualiza em tempo real — dá para duas pessoas usarem ao mesmo tempo

### A parte que resolve a confusão

O problema original é mesa reservada duas vezes. Isso é impedido **no banco de
dados**, com uma `EXCLUDE` constraint sobre *mesa + intervalo de tempo*
(`supabase/migrations/…_init.sql`). Não é validação de tela: mesmo que duas
pessoas cliquem no mesmo segundo, ou que alguém chame a API por fora, o Postgres
recusa a segunda.

É por isso que o sistema separa uma mesa já no pedido, mesmo antes de você
aprovar: sem mesa atribuída não existe o que travar, e o overbooking volta. Se
duas pessoas disputam a última mesa no mesmo instante, uma ganha e a outra recebe
"as mesas desse horário acabaram enquanto você preenchia".

---

## Antes de começar

Você vai precisar de:

- **Node.js 20 ou mais novo** — <https://nodejs.org> (baixe a versão LTS)
- Uma conta no **Supabase** — <https://supabase.com> (grátis, entra com o GitHub)
- Uma conta na **Vercel** — <https://vercel.com> (grátis, entra com o GitHub)
- Uma conta no **GitHub** — <https://github.com> (grátis)

Para conferir se o Node instalou, abra o terminal e digite:

```bash
node --version
```

Se aparecer algo como `v20.11.0`, está tudo certo.

---

## Passo 1 — Criar o banco no Supabase

1. Entre em <https://supabase.com> e clique em **New project**
2. Dê um nome (ex.: `boteco-do-turde`)
3. **Anote a senha do banco** que ele gerar — você vai precisar dela depois
4. Em *Region*, escolha **South America (São Paulo)** — fica mais rápido
5. Clique em **Create new project** e espere uns 2 minutos

Depois que o projeto subir, vá em **Project Settings → Data API** e deixe esta
aba aberta. Você vai precisar de dois valores dali:

- **Project URL** — parecido com `https://abcdefgh.supabase.co`
- **anon public** — uma chave comprida que começa com `eyJ...`

> A chave `anon` pode aparecer no navegador sem problema: quem protege os dados
> é o Row Level Security, configurado nas migrations. **Nunca** use a chave
> `service_role` neste projeto.

---

## Passo 2 — Criar as tabelas

### Caminho A — copiar e colar (mais simples)

No painel do Supabase, abra o **SQL Editor** (ícone de terminal na barra
esquerda) e rode os arquivos **nesta ordem**, um de cada vez. Para cada um:
abra o arquivo, copie tudo, cole no editor e clique em **Run**.

1. `supabase/migrations/20260101000000_init.sql`
2. `supabase/migrations/20260101000001_functions.sql`
3. `supabase/migrations/20260101000002_rls.sql`
4. `supabase/seed.sql`

Deve aparecer *Success. No rows returned* em cada um.

### Caminho B — pela linha de comando

Se preferir o Supabase CLI:

```bash
npx supabase init
```

```bash
npx supabase link --project-ref SEU_PROJECT_REF
```

```bash
npx supabase db push
```

O `project ref` é aquele pedaço da URL: em `https://abcdefgh.supabase.co`, o ref
é `abcdefgh`.

### O que o seed já deixa pronto

- **Horário real do bar**: terça a domingo a partir das 17:30, fechando 22:30
  (23:30 na sexta e no sábado). Segunda-feira fechado.
- **14 mesas de exemplo** — 6 de 4 lugares, 2 de 2, 4 de 6 e 2 de 8.

> ⚠️ **As mesas são um chute.** Ajuste com o salão real em **/admin/mesas** —
> número e quantos lugares cada uma tem. Não precisa mexer no código.

O que importa de verdade é a **capacidade** de cada mesa: é ela que decide
quantos grupos de cada tamanho cabem em cada horário. O número serve só para
você se achar no salão.

> **Se você junta mesas** para grupo grande, cadastre a junção como se fosse uma
> mesa só (ex.: mesa 20, 12 lugares). Senão o site nunca vai aceitar o grupão —
> ele só conhece as mesas que estão cadastradas.

---

## Passo 3 — Criar o usuário do painel

Não existe tela de cadastro: os usuários da equipe são criados na mão, de
propósito.

No Supabase, vá em **Authentication → Users → Add user → Create new user**:

- E-mail: o do seu cunhado
- Senha: uma senha forte
- **Marque a opção "Auto Confirm User"** — sem isso ele não consegue entrar

Repita para cada pessoa do bar que vai mexer no painel.

---

## Passo 4 — Rodar no seu computador

Abra o terminal na pasta do projeto e rode:

```bash
npm install
```

Copie o arquivo de exemplo de configuração:

```bash
cp .env.example .env.local
```

Abra o `.env.local` num editor de texto e preencha com os valores do Passo 1:

```
NEXT_PUBLIC_SUPABASE_URL=https://abcdefgh.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Agora suba o site:

```bash
npm run dev
```

Abra <http://localhost:3000> no navegador. Teste fazer uma reserva, depois entre
em <http://localhost:3000/admin> com o usuário do Passo 3 e veja ela aparecer.

---

## Passo 5 — Publicar na internet

1. Suba o projeto para um repositório no GitHub
2. Entre em <https://vercel.com>, clique em **Add New → Project** e escolha o
   repositório
3. Em **Environment Variables**, cadastre as três variáveis:

   | Nome | Valor |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | a mesma do `.env.local` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | a mesma do `.env.local` |
   | `NEXT_PUBLIC_SITE_URL` | deixe em branco por enquanto |

4. Clique em **Deploy** e espere
5. A Vercel te dá um endereço, tipo `https://boteco-do-turde.vercel.app`
6. Volte em **Settings → Environment Variables**, preencha `NEXT_PUBLIC_SITE_URL`
   com esse endereço e clique em **Redeploy**

Esse último passo importa: é o endereço que entra no link pessoal que o cliente
recebe. Se ficar errado, o link de acompanhamento aponta para o lugar errado.

---

## Passo 6 — Divulgar o link

O link que o bar divulga é:

```
https://boteco-do-turde.vercel.app/reservar
```

Onde colocar:

- **WhatsApp** — na mensagem automática de saudação e na descrição do perfil
  comercial
- **Instagram** — no link da bio
- **Na porta e nas mesas** — um QR code impresso. Dá para gerar de graça em
  qualquer site de QR code, apontando para o endereço acima
- **Status do WhatsApp** na quinta-feira, antes do fim de semana

---

## O dia a dia no bar

**Chegou uma reserva:** ela aparece no topo do painel, em âmbar, na área
*Esperando sua resposta* — junto com o número da mesa que o sistema separou.
Toque em **Aprovar** ou **Recusar** (a recusa aceita um motivo curto). Depois
toque em **WhatsApp** — a mensagem já vai escrita, é só apertar enviar.

Como nada é confirmado sem você, vale abrir o painel ao menos uma vez por dia.
O que você não responder em 12 horas expira sozinho e libera a mesa.

**A mesa que o sistema escolheu não te agradou:** botão **Trocar mesa** no
cartão. A lista só mostra mesas que comportam aquele grupo, e o banco recusa se
a mesa escolhida já estiver ocupada naquele horário.

**Cliente ligou ou apareceu na porta:** botão **Reserva na porta**, na área
*Reservas do dia*. Cria já confirmada.

**Cliente chegou:** botão **Chegou**. **Não apareceu:** botão **Não veio** — e
aí dá para bloquear o telefone de quem faz isso sempre.

**Vai ter show ou o bar não vai abrir:** cadastre em **Horários → Data especial**.
Marcando *bar fechado*, aquele dia some do calendário do cliente.

---

## Ajustes sem mexer no código

Tudo em **/admin/configuracoes**:

| Ajuste | Padrão | Para que serve |
| --- | --- | --- |
| Horas para você aprovar | 12 | Passou o prazo, a mesa é liberada |
| Duração da reserva | 120 min | Quanto tempo a mesa fica bloqueada |
| Intervalo entre horários | 30 min | De quanto em quanto o cliente escolhe |
| Último horário antes de fechar | 60 min | Fecha 22:30 → último horário 21:30 |
| Antecedência mínima | 60 min | Impede reserva para daqui a 5 minutos |
| Janela de reserva | 30 dias | Tamanho do calendário |
| Maior grupo pelo site | 20 | Acima disso, só falando com o bar |
| Reservas em aberto por telefone | 3 | Segura quem reserva "por garantia" |

As mensagens de WhatsApp também são editáveis. Elas aceitam `{nome}`, `{codigo}`,
`{data}`, `{hora}`, `{pessoas}`, `{mesa}` e `{motivo}`. O `{mesa}` é a mesa que o
sistema separou — o cliente só descobre o número se você colocar na mensagem.

---

## Testes

Os testes de unidade rodam sem nada instalado além das dependências:

```bash
npm test
```

Cobrem validação de telefone e nome, contas de fuso horário, sobreposição de
horário, filtro de horários por tamanho de grupo e os templates de WhatsApp.

Para rodar também os testes de integração — que sobem o schema num Postgres de
verdade e testam a `EXCLUDE` constraint, a atribuição automática de mesa, a
lotação e a expiração de pendentes — você precisa do Docker e do Supabase CLI:

```bash
npx supabase start
```

```bash
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm test
```

Não precisa ser o Supabase CLI: serve **qualquer Postgres 15 ou mais novo**. O
próprio teste cria os papéis `anon`/`authenticated` e um `auth.users` mínimo
quando eles não existem. O banco precisa estar em **UTF8** — o padrão do
Supabase — porque as mensagens de WhatsApp usam emoji.

> Os testes de integração **apagam e recriam** o schema do banco apontado. Nunca
> aponte `TEST_DATABASE_URL` para o banco de produção.

Sem a variável, esses testes são pulados e o `npm test` continua verde.

---

## Limites do plano gratuito

- **Supabase grátis**: 500 MB de banco e 50.000 usuários ativos por mês. Um bar
  com algumas centenas de reservas por mês não chega perto disso.
- **Pausa por inatividade**: projetos Supabase gratuitos hibernam depois de uma
  semana sem nenhum acesso. Como o bar entra no painel toda semana, na prática
  não acontece. Se acontecer, é só abrir o painel do Supabase e clicar em
  *Restore*.
- **Vercel Hobby**: mais do que suficiente para esse volume. O plano gratuito é
  para uso não comercial — para um bar pequeno divulgando o próprio link, está
  dentro; se um dia virar um serviço vendido para outros bares, aí muda o plano.
- **WhatsApp**: as mensagens saem por links `wa.me` disparados com um clique
  humano no painel. Não usamos a API oficial, que é paga. Por isso o envio não é
  automático — e nem deveria ser: mensagem de bar mandada por gente funciona
  melhor.

### Expiração automática (opcional)

Os pendentes vencidos são expirados de forma preguiçosa: toda consulta de
disponibilidade e toda nova reserva chamam `expire_stale_reservations()` antes
de qualquer coisa. Na prática isso basta.

Se quiser garantir a limpeza mesmo em dias sem nenhum acesso, habilite o
`pg_cron` no Supabase (**Database → Extensions**) e rode no SQL Editor:

```sql
select cron.schedule('expirar-pendentes', '*/15 * * * *',
                     $$ select public.expire_stale_reservations() $$);
```

---

## Estrutura do projeto

```
supabase/
  migrations/
    …_init.sql        tabelas, enum, EXCLUDE constraint, auditoria, realtime
    …_functions.sql   toda a regra de negócio (criar, consultar, cancelar)
    …_rls.sql         Row Level Security e permissões
  seed.sql            horários reais do bar, mesas de exemplo, configurações

src/
  app/
    page.tsx                  vitrine com horários e botão de reservar
    reservar/                 fluxo público em 3 etapas
    reserva/[token]/          página pessoal do cliente (ver e cancelar)
    admin/                    painel do bar
      page.tsx                agenda do dia, pendentes, linha do tempo
      mesas/                  cadastro de mesas
      horarios/               semana e datas especiais
      configuracoes/          ajustes e telefones bloqueados
  components/ui/              botão, campos, cartões
  lib/                        formatação, fuso, disponibilidade, WhatsApp
  middleware.ts               protege /admin e renova a sessão

tests/
  unidade.test.ts   sem banco
  banco.test.ts     integração com Postgres
```

### Onde mora cada regra

Quase toda a regra de negócio está **no banco**, nas funções
`create_reservation`, `get_day_availability` e `cancel_reservation`. O site é a
casca. Isso é de propósito: se alguém chamar a API por fora, as mesmas regras
valem. O que existe no TypeScript (`src/lib/availability.ts`) é só um espelho,
para avisar o cliente antes de ele enviar o formulário.

O público (`anon`) **não tem acesso direto a nenhuma tabela**. Tudo passa pelas
funções `SECURITY DEFINER`, que devolvem só o necessário. A consulta de
disponibilidade devolve, de cada mesa, apenas quanta gente cabe e quais
intervalos estão ocupados — sem número de mesa, sem nome, sem telefone. Tem
teste garantindo isso.

---

## Deu problema?

**"Variável de ambiente NEXT_PUBLIC_SUPABASE_URL não configurada"**
O `.env.local` não existe ou está vazio. Volte ao Passo 4. Depois de mexer
nele, pare o `npm run dev` (Ctrl+C) e suba de novo.

**Não consigo entrar no painel**
Confirme que o usuário foi criado com **Auto Confirm User** marcado
(Authentication → Users no Supabase).

**O calendário aparece vazio**
O `seed.sql` não rodou, ou todos os dias estão desativados. Confira em
**/admin/horarios**.

**"As mesas desse horário acabaram enquanto você preenchia"**
É o sistema funcionando. Duas pessoas pediram a última mesa quase ao mesmo tempo
e o banco recusou a segunda.

**Um grupo grande não consegue reservar de jeito nenhum**
Nenhuma mesa cadastrada tem lugares suficientes. Se na prática você junta mesas,
cadastre a junção como uma mesa só em **/admin/mesas**.

**O cliente reclamou que a reserva "não confirmou"**
Toda reserva é um pedido até alguém aprovar no painel. Se ninguém aprovar em 12
horas, ela expira e a mesa é liberada.

**O link pessoal do cliente aponta para localhost**
`NEXT_PUBLIC_SITE_URL` não foi preenchida na Vercel. Volte ao Passo 5, item 6.

**O painel não atualiza sozinho**
O Realtime precisa estar ligado para a tabela `reservations`. A migration já faz
isso; se não pegou, vá em **Database → Replication** no Supabase e marque a
tabela.
