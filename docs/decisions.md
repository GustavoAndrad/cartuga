# Decisões de arquitetura

Registro das decisões tomadas para ambiguidades não explicitadas na especificação
original, seguindo a diretriz de "escolher a solução mais segura, simples e consistente".

> **Contexto:** o Cartuga é um MVP construído como prova de conceito, para rodar
> localmente. O que está no escopo e os limites conhecidos estão no
> [README](../README.md#-status-mvp-para-prova-de-conceito).

## Autenticação (JWT)

- Access token: 15 min, JWT assinado HS256, mantido em memória no frontend (nunca em
  localStorage/sessionStorage).
- Refresh token: 7 dias, opaco, armazenado com hash SHA-256 no banco (`refresh_tokens`),
  entregue ao browser como cookie httpOnly + Secure + SameSite=Strict. Rotacionado a cada
  uso.
- Troca de senha revoga todos os refresh tokens ativos do usuário (invalida sessões
  anteriores).

## Modelo de dados

- `Expense` ganhou `start_date`/`end_date` (não listados na §29 da spec original, mas
  exigidos pela §12 para despesas fixas) — mesma semântica de `Entry`.
- `Installment` só é gerado para despesas com `payment_method = CREDITO`. Despesas
  `CONTA` são aplicadas diretamente pelo motor financeiro, sem parcela associada.

## Moeda

- BRL é sempre a moeda armazenada (`Entry.amount`/`Expense.amount`). Uma entrada/saída
  em USD/EUR guarda também `original_amount`/`currency`/`exchange_rate`/
  `exchange_rate_date` — o valor efetivamente convertido e a cotação usada, congelados
  no momento da criação/edição. Editar `date` recalcula a cotação (é a data que define
  qual cotação vale); qualquer outra edição não mexe nesse snapshot.
- Fonte da cotação: **PTAX de fechamento do Banco Central do Brasil**
  (`exchange_rate_service`, endpoint OData público do BACEN) — é a referência oficial/
  legal pra conversão de moeda estrangeira no Brasil (a Receita Federal a exige pra
  fins fiscais), e o que uma busca no Google por "dólar hoje"/"euro hoje" no Brasil
  normalmente reflete. Antes dessa correção o sistema usava a cotação do Banco Central
  Europeu (via Frankfurter, triangulada por EUR) — oficial também, mas
  sistematicamente ~0.5-1%+ diferente da PTAX no mesmo dia, por ser fixada por outra
  instituição, em outro horário, com outra metodologia.
- A PTAX tem cotação de compra e de venda (spread do dia); usa-se **venda** para tudo
  (entradas e saídas), por simplicidade — é o número que a maioria das pessoas chama de
  "o dólar/euro do dia". A alternativa mais precisa contabilmente (compra pra entradas,
  venda pra saídas) foi descartada por complexidade desproporcional ao ganho de
  precisão nesse contexto.
- PTAX não é publicada em fins de semana/feriados. `get_rate_for_date` busca primeiro a
  cotação do dia exato; se não houver (dia sem pregão), busca no período dos 10 dias
  anteriores e usa o fechamento do dia útil mais recente antes da data pedida — mesmo
  princípio que já existia com o Frankfurter (nunca falha silenciosamente pra uma data
  sem pregão, sempre resolve pro último dia útil disponível).
- `EXCHANGE_RATE_USD`/`EXCHANGE_RATE_EUR` (env) são só o **fallback** estático usado se
  a API do BACEN estiver fora do ar — nunca a fonte primária. Isso já era assim com o
  Frankfurter também; o nome das variáveis não mudou para não quebrar `.env` já
  configurados.
- `GET /config/exchange-rates`/`/config/exchange-rates/history` expõem cotações
  "BRL → moeda estrangeira" (quantas unidades de USD/EUR vale 1 BRL) — usadas só pelo
  frontend pra exibir valores já convertidos em outra moeda; nunca influenciam o que é
  gravado no banco. Essa é uma conversão totalmente separada da que vale ao
  criar/editar uma entrada/saída (que sempre usa a cotação da data escolhida, nunca a
  atual).
- `GET /config/exchange-rates/date/{data}` expõe a cotação (mesmo formato "BRL →
  moeda estrangeira") de uma data específica no passado — usado pelo seletor de "ver
  equivalente em outra moeda" no modal de detalhe de entrada/saída, pra mostrar o valor
  de fato equivalente naquele dia (nunca hoje). `entry.amount`/`expense.amount`
  (BRL, já congelado) multiplicado pela cotação da própria `exchange_rate_date` do
  registro é o cálculo — nunca refaz a conversão original, só espelha o mesmo valor em
  BRL para outra moeda usando a cotação do mesmo dia.

## Exportação/Importação

- `password_hash` nunca é exportado no xlsx.
- Usuários importados recebem senha temporária aleatória segura; o texto plano é
  retornado uma única vez na resposta de confirmação da importação (nunca persistido,
  nunca logado).
- Backup via `mysqldump` roda antes de qualquer alteração, fora da transação de
  substituição — se o dump falhar, a importação não começa.

## Motor financeiro e edição

- `date`/`start_date`/`end_date` de entradas e saídas fixas/excepcionais são comparados
  por (ano, mês), não por dia exato — "início em janeiro" cobre o mês inteiro
  independente do dia cadastrado.
- Após criada, uma compra `CREDITO` tem `date`, `amount`, `type` e `payment_method`
  imutáveis via `PUT /expenses/:id` (só `description`/`source` são editáveis) — mudar
  esses campos invalidaria as parcelas já geradas e eventuais ajustes já aplicados a
  elas. Para mudar o valor/parcelamento, a compra deve ser excluída e recriada.
- Divisão de parcelas: `total / count` truncado a centavos para as N-1 primeiras
  parcelas; a última recebe o restante exato, garantindo soma fiel ao total.
- Saldo acumulado começa do primeiro mês com qualquer dado do usuário (não de uma data
  fixa arbitrária) e soma mês a mês até o mês solicitado.
- Dashboard: `history_months`/`projection_months` (default 6/6) controlam a janela da
  série temporal; "valor comprometido com parcelas" soma todas as parcelas com
  vencimento a partir do mês atual, sem limite pela janela de projeção exibida.
- "Ver Impacto" (`GET /entries/:id/impact`, `GET /expenses/:id/impact`) calcula o
  efeito real de um único registro no saldo: roda `get_balance_series` duas vezes,
  uma normal e outra com esse registro excluído (`exclude_entry_id`/
  `exclude_expense_id` em `finance_engine`), e a diferença entre as duas séries
  acumuladas é o "impacto" - nunca pode divergir do que o dashboard já mostra, porque é
  o mesmo cálculo com um registro a menos. Uma entrada/saída `FIXED` sem `end_date`
  (indefinida) é exibida só até `MAX_HORIZON_MONTHS` (60, o mesmo teto de
  `projection_months`) à frente de hoje - nunca como um gráfico sem fim. O gráfico
  também se estende até esse horizonte mesmo quando o registro já tem um fim definido
  mais cedo, pra mostrar que o impacto acumulado não some quando o registro para de
  contribuir, só para de crescer (plateau). Uma entrada "vinda do Cofre" que não conta
  pro dashboard (`counts_toward_dashboard=False`) não tem endpoint de impacto
  significativo - rejeitado com 422.
- Admin não pode excluir a própria conta (evita lockout).

## Planejado

- `is_planned` (entradas e saídas) marca um registro especulativo/estimado, ainda não
  confirmado - mas ele **conta normalmente** em todo cálculo/saldo/dashboard desde o
  início; é só um marcador de fluxo de revisão, nunca um segundo estado paralelo tipo
  o `counts_toward_dashboard` do Cofre.
- Permitido para entradas `EXCEPTIONAL`/`FIXED` e para saídas `CONTA` de qualquer tipo
  (nunca `CREDITO` - já tem o valor travado após a criação via
  `_CREDIT_IMMUTABLE_FIELDS`, o que inviabilizaria "confirmar o valor real" nela). Uma
  regra `FIXED` não tem um único momento de "aconteceu ou não" como uma `EXCEPTIONAL`
  tem no seu próprio `date` - por isso é revisada mês a mês (ver subseção abaixo) em
  vez de ter um único Confirmar/Recusar.
- No formulário, o campo "Planejado" aparece: pra `EXCEPTIONAL`, só quando a data
  escolhida não é hoje (reage a cada mudança de data, recalculando o estado em vez de
  preservar uma marcação manual anterior); pra `FIXED` (entrada, ou saída em `CONTA`),
  sempre - é uma marcação manual, sem heurística automática por data (a regra é
  contínua, não tem uma única data de referência). Trocar o meio de pagamento de uma
  saída pra `CREDITO` esconde o campo (mas não força `is_planned=false` sozinho - a
  validação do schema já rejeita a combinação no submit).
- "Confirmar" (no modal de inspeção ou na tela de Planejamentos) só é oferecido ali
  para uma `EXCEPTIONAL`: abre o formulário de edição pré-preenchido com "Planejado"
  já desmarcado - só é efetivado quando o usuário salva, o que dá a chance de ajustar o
  valor pro real antes de finalizar. "Recusar" exclui o registro de verdade (mesmo
  fluxo de `DELETE /entries|expenses/:id`), impactando os cálculos normalmente, como
  qualquer exclusão. Uma `FIXED` planejada não mostra esse botão ali (ver abaixo).
- Fila de revisão (`GET /planning/pending`, tela "Planejamentos"): uma `EXCEPTIONAL`
  entra quando `date <= hoje + 1 dia` - a partir do dia anterior à data planejada - e
  continua aparecendo (mesmo atrasada) até ser Confirmada ou Recusada; a passagem do
  tempo sozinha nunca limpa a marcação. A bolinha de notificação ao lado do menu
  hamburguer conta exatamente esses itens (mais as ocorrências de `FIXED` da subseção
  abaixo).
- "Saldo com/sem planejados" (`GET /planning/comparison`) reaproveita o mesmo
  mecanismo de contrafactual do "Ver Impacto", mas excluindo TODOS os registros
  planejados de uma vez (`exclude_planned` em `finance_engine`) em vez de um só
  registro - dá o mesmo par "saldo real" vs. "saldo sem as estimativas" em toda a
  janela de meses, não só para um registro específico. O gráfico de "Planejado" por mês
  soma qualquer entrada/saída com `is_planned=true` naquele mês, mesmo uma ocorrência
  `FIXED` já Confirmada/Recusada naquele mês específico (a regra continua marcada como
  um todo) - uma simplificação deliberada: a fila de pendências e o dinheiro (abaixo)
  já refletem corretamente o estado por mês; esse gráfico responde só "essa regra é uma
  estimativa", não "esse mês específico já foi revisado".

### Planejado em uma entrada/saída `FIXED`

Uma regra `FIXED` marcada como Planejada é revisada **um mês de cada vez**, não de uma
vez só - cada mês em que a regra está ativa vira um item separado na fila de revisão,
recorrendo indefinidamente (ou até a regra deixar de ser Planejada/ser excluída).

- `is_planned_since` (data, só relevante pra `FIXED`) é gravado pelo `entry_service`/
  `expense_service` no exato momento em que `is_planned` vira `true` numa `FIXED`
  (limpo se voltar a `false`) - é o ponto de partida de onde `planning_service` procura
  ocorrências não revisadas. Sem isso, marcar uma regra antiga (ativa há anos) como
  Planejada inundaria a fila com todo mês desde o `start_date` original; com isso, só
  os meses a partir de agora entram na fila.
- `entry_occurrence_reviews`/`expense_occurrence_reviews` (uma linha por
  `entry_id`/`expense_id` + `year` + `month`) registram a decisão de cada mês. Ausência
  de linha = ainda pendente (e o mês conta normalmente, com o valor da regra - o
  princípio de "Planejado nunca é excluído dos cálculos" vale até aqui: só entra em
  jogo depois que o usuário decide).
  - **Confirmar** um mês grava `status=CONFIRMED` e, opcionalmente, um
    `override_amount` diferente do valor da regra - só pra aquele mês específico; a
    regra e os outros meses continuam intactos. Endpoint:
    `POST /entries|expenses/:id/occurrences/:year/:month/confirm`.
  - **Recusar** um mês grava `status=REJECTED` - esse mês específico deixa de contar
    em todo cálculo daquele mês (é como se a regra não tivesse existido só naquele
    mês); os outros meses continuam normais. Endpoint:
    `POST /entries|expenses/:id/occurrences/:year/:month/reject`.
  - `finance_engine.get_applicable_entries`/`get_applicable_direct_expenses` resolvem
    isso centralizadamente: pra cada `FIXED`+Planejada aplicável a um mês, buscam a
    revisão daquele mês (se houver) e retornam a entrada/saída sem revisão (conta
    normal), com o valor sobrescrito (cópia transiente, nunca persistida - ver
    `_copy_entry_with_amount`/`_copy_expense_with_amount`, criada só pra não arriscar
    mutar o objeto ORM real numa flush futura), ou omitida (Recusada). Todo consumidor
    (dashboard, dashboard de mês, dashboard de saldo, dashboard de planejados) herda
    isso automaticamente, sem lógica duplicada.
  - Confirmar/Recusar exigem que o mês esteja dentro do período ativo da regra: não
    antes de `max(is_planned_since, start_date)`, nem depois de `end_date` (se houver).
- A fila de pendências gera, pra cada `FIXED`+Planejada, um item por mês sem revisão
  entre `max(is_planned_since, start_date)` e o mês do limite de antecedência (mesma
  regra de 1 dia da `EXCEPTIONAL` - inclusive pode adiantar o mês seguinte no último
  dia do mês corrente), capado no `end_date` se houver. Isso pode gerar mais de um item
  pendente pra mesma regra (ex.: usuário ausente por alguns meses) - cada mês é
  revisado independentemente.
- `EntryDetailModal`/`ExpenseDetailModal` (usados em Entradas/Saídas/Dashboard, não só
  em Planejamentos) só mostram o atalho "Confirmar" pra uma `EXCEPTIONAL` Planejada -
  uma `FIXED` não tem um único registro pra "confirmar" ali (editar o formulário
  mudaria a regra inteira, não um mês). A revisão mês a mês de uma `FIXED` só acontece
  pela tela de Planejamentos, onde cada ocorrência aparece com a data do 1º dia do mês
  e uma marcação "Mensal".

## Cofre

- Retirada (`WITHDRAWAL`) não pode exceder o saldo atual do cofre (`total_deposited -
  total_withdrawn`) — sem esse limite seria possível gerar uma entrada real no
  dashboard com dinheiro que nunca foi guardado. Validado em `vault_service`, contra o
  saldo calculado antes da própria retirada.
- Só é possível recortar (`DEPOSIT_CARVE`) de entradas `EXCEPTIONAL`. O teto cumulativo
  de 100% do valor recortado só faz sentido para um evento único; uma entrada `FIXED`
  repete o mesmo valor todo mês, então "quanto ainda posso recortar" não tem resposta
  coerente para ela. Entradas fixas nunca aparecem em `GET /vault/carveable-entries`.
- A entrada/saída que uma transação do cofre gera (`DEPOSIT_FRESH`/`WITHDRAWAL`/
  `DEPOSIT_CARVE`) tem `date`, `amount`, `currency`, `type` e `source` imutáveis via
  `PUT /entries/:id`/`PUT /expenses/:id` (só `description` é editável) — mesmo
  princípio da trava de compras `CREDITO` acima: `vault_transactions` guarda uma cópia
  desses valores tomada na criação (não recalculada a partir da entrada/saída real), e
  editá-los por fora dessincronizaria as duas tabelas. Travar `type` também evita que
  uma entrada `EXCEPTIONAL` do cofre vire `FIXED` e passe a contar todo mês no
  dashboard enquanto o cofre ainda a trata como evento único. Para desfazer, a
  movimentação deve ser excluída pela tela do Cofre.
- `"Investimento"` é a fonte reservada que toda entrada/saída gerada pelo cofre recebe
  (é o que aciona o ícone de cofre nas telas de Entradas/Saídas) — `entry_service`/
  `expense_service` rejeitam essa fonte em criações/edições feitas fora do cofre, para
  que o ícone nunca apareça em um registro manual comum.
- Editar a descrição de uma entrada/saída gerada pelo cofre pelas telas de
  Entradas/Saídas também atualiza `vault_transactions.description` (mesma cópia
  mencionada acima) — sem isso, o Cofre continuaria mostrando o texto antigo.
- Excluir diretamente pelas telas de Entradas/Saídas a entrada/saída que uma transação
  do cofre gerou é equivalente a excluir a própria transação na tela do Cofre: a FK
  `vault_transactions.entry_id`/`expense_id` tem `ON DELETE CASCADE`, então o banco
  remove a linha do cofre junto, sem exigir nenhuma lógica extra na aplicação (não há
  como excluir só a entrada/saída e deixar uma transação de cofre órfã apontando para
  nada). O inverso (excluir pela tela do Cofre) também remove a entrada/saída real —
  ver `vault_service.delete_vault_transaction`.

## Importação/Exportação

- Formato de interchange: `amount`/`base_amount` são exportados como **texto** exato
  (`str(Decimal(...))`), nunca como célula numérica do xlsx — evita qualquer risco de
  arredondamento binário no round-trip, mesmo sendo só um detalhe de serialização.
- `execute_import` roda `DELETE` + `INSERT` (nunca `ALTER TABLE`) dentro da transação de
  substituição. Motivo: DDL causa **commit implícito** no MySQL — um `ALTER TABLE
  ... AUTO_INCREMENT` no meio da transação quebraria silenciosamente a garantia de
  rollback atômico. Isso não é hipotético: uma tentativa inicial com esse `ALTER TABLE`
  loop causou um commit parcial real durante o desenvolvimento (senha do admin foi
  trocada mas a transação continuou "pendente" e travou em outro ponto) — só foi
  recuperável porque o backup pré-importação já tinha sido gerado. O reset de
  AUTO_INCREMENT também é desnecessário: o InnoDB já avança o contador sozinho quando
  um id explícito maior é inserido.
- O endpoint `/database/import` é `async def` (por causa do upload de arquivo), mas todo
  o trabalho bloqueante (parse do xlsx, `mysqldump`, a transação de substituição) roda
  via `run_in_threadpool` — chamado direto no event loop, uma única requisição de
  import travaria o servidor inteiro para todos os outros usuários pelo tempo da
  operação.
- O engine usado pela substituição transacional é injetado via `Depends(get_engine)`
  (mesmo padrão do `get_db`), para permitir override em teste. O backup via `mysqldump`
  continua mirado no banco configurado globalmente — não foi injetado — então o fluxo
  `confirm=true` completo só é testado na camada de serviço, não via HTTP.

## Frontend

- Auth: access token só em memória (contexto React), nunca em localStorage; refresh
  token fica inteiramente no cookie httpOnly do backend. No boot da aplicação, o
  `AuthProvider` chama `POST /auth/refresh` silenciosamente para restaurar a sessão
  após reload de página.
- Câmbio: `CurrencyContext` busca `GET /config/exchange-rates` (autenticado) e faz a
  conversão só na exibição — nenhum valor convertido é persistido ou enviado ao
  backend.
- Bug real encontrado e corrigido durante o teste em navegador: o watcher de arquivos
  do Vite não detecta mudanças através do bind mount do Docker Desktop no Windows
  (`chokidar` silenciosamente não recebe os eventos do host). Corrigido com
  `server.watch.usePolling: true` no `vite.config.ts` — sem isso, o container serve
  código desatualizado indefinidamente sem erro visível.
- Bug real encontrado e corrigido: mutações de entradas/saídas/parcelas/ajustes só
  invalidavam a própria query (`['entries']`, `['expenses']`), deixando o dashboard
  (`['dashboard']`) com números desatualizados ao navegar de volta. Toda mutação que
  afeta o saldo agora também invalida `['dashboard']`.

## Navegação mês a mês nos gráficos

- Cada gráfico com eixo de meses (os 3 do Dashboard, os 3 de Planejamentos e o do
  Cofre) tem setas ‹ › que deslizam a janela **um mês por clique**. O tamanho da
  janela nunca muda, só os meses mostrados. O estado é **por gráfico**
  (`useMonthWindow`): mover um não move os outros, mesmo os que compartilham a mesma
  série de dados.
- **Limites** (`finance_engine.get_navigable_range`, exposto como `navigable_range`
  em `GET /dashboard` e `GET /planning/comparison`):
  - para trás: o primeiro mês com dados (`get_earliest_data_month`, o mesmo marco
    zero do saldo acumulado);
  - para a frente: o último mês em que algum lançamento ainda muda o saldo, seguindo
    as mesmas regras de aplicabilidade do motor (`end_date` de uma `FIXED`, `date` de
    uma `EXCEPTIONAL`, mês efetivo da última parcela de uma compra `CREDITO`, nunca a
    data da compra em si). Depois desse mês o saldo só se repete, então não há o que
    navegar (`last_reason = "LAST_RECORD"`). Se existir uma regra `FIXED` sem
    `end_date`, a projeção é infinita e o limite vira o teto global de
    `MAX_HORIZON_MONTHS` (60, o mesmo do seletor de projeção e do "Ver impacto",
    `last_reason = "HORIZON"`). O limite nunca termina antes do mês atual.
- No limite, a seta continua clicável (`aria-disabled`, não `disabled`) e o clique
  mostra uma mensagem explicando o motivo, diferente para cada caso: primeiro mês
  com dados, teto de 60 meses ou "a partir daí o saldo não muda mais". Um botão
  desabilitado de verdade não explicaria nada.
- Dados: a janela padrão reaproveita o que a página já carregou. Qualquer outra janela
  é buscada sozinha (`GET /dashboard/series`, ou `GET /planning/comparison` com
  `from_year`/`from_month`/`months`), mantendo a janela anterior na tela até a nova
  chegar (`keepPreviousData`). A busca espera 250 ms sem cliques, porque cada janela é
  um recálculo completo do saldo no servidor: sem essa espera, 9 cliques rápidos
  geravam 9 recálculos enfileirados. As queries ficam sob `["dashboard", ...]`/
  `["planning", ...]`, então as invalidações que já existiam também atualizam as
  janelas deslocadas.
- Os endpoints de janela recusam (422) períodos que passem do horizonte de projeção,
  para uma única requisição não varrer séculos de meses.
- O Cofre já recebe a série inteira (só o passado, sem projeção), então a navegação
  dele é um recorte local de 12 meses, sem nova requisição.
- Não receberam navegação: o "Ver impacto" (o objetivo é ver o ciclo de vida inteiro
  do registro de uma vez) e o câmbio (escala em dias, com seletor de período próprio).
- Bug encontrado e corrigido ao extrair os gráficos de Planejamentos: a linha "com
  planejados" fica tracejada nos meses projetados, mas uma janela composta só de
  meses futuros (possível agora, com a navegação) aparecia toda sólida, porque o
  índice do primeiro mês projetado era 0 e o código tratava isso como "sem
  projeção".

## Exportação

### Dashboard em PDF

- **Gerado no navegador, a partir de uma pré-visualização**: o relatório é um
  componente React com páginas A4 de tamanho fixo (794×1123 px), renderizado no modal.
  O PDF é a captura dessas mesmas páginas (`html-to-image` → `jspdf`), uma de cada
  vez, então o que o usuário confere é exatamente o que baixa. A alternativa
  (gerar no servidor com um Chrome headless) duplicaria a camada de gráficos e
  pesaria a imagem do backend. Contrapartida: o texto do PDF é imagem (não
  selecionável); por isso a 1ª página escreve por extenso todas as configurações.
- **Mesma fonte dos gráficos**: as opções do Highcharts de cada gráfico do dashboard
  viraram funções puras (`charts/dashboardCharts.ts`), usadas pela tela e pelo
  relatório. O relatório só liga o modo `print` (sem animação, tooltip ou clique)
  e o tema claro. Os dados vêm das mesmas chaves de cache do React Query
  (`["dashboard", projeção]`, `["dashboard", "series", início, tamanho]`), então o
  que já está na tela não é buscado de novo e o PDF não tem como divergir dele.
- **"Naquele momento"**: o estado que antes vivia dentro de cada gráfico subiu para
  o `DashboardPage`: janela de cada gráfico (via `onWindowChange`) e Fonte/Tipo das
  pizzas (agora controlado). Assim o modal abre já com essas escolhas. Mudanças no
  modal valem só para o PDF. Trocar a projeção ali recoloca os gráficos na janela
  padrão, igual ao dashboard (o tamanho da janela depende da projeção).
- Moeda: o relatório pode usar uma moeda diferente da tela (formatador próprio,
  `makeCurrencyFormatter`). A cotação usada é escrita no PDF.
- Paginação: blocos de altura fixa (cabeçalho, resumo, cada gráfico, pizzas) nunca
  se dividem; as tabelas de lançamentos quebram por linha, com "(continuação)".
- Bug encontrado e corrigido no caminho: com a moeda em USD/EUR, os eixos dos
  gráficos (no dashboard também) mostravam marcas quebradas, como "$3,008.48",
  porque o Highcharts calculava as marcas redondas em reais e só o rótulo era
  convertido. Agora os valores são convertidos antes de desenhar
  (`ChartContext.convert`) e o rótulo só formata, então as marcas caem em números
  redondos da moeda exibida.
- Dependência: `jspdf` 4.x. A 2.x trazia um DOMPurify vulnerável; a 4.x resolve para
  uma versão corrigida. As dependências opcionais dela (`canvg`, `html2canvas`,
  `dompurify`) precisam ser instaladas mesmo sem uso, porque o pré-empacotamento do
  Vite resolve os `import()` dinâmicos do `jspdf` e falha sem elas.

### Dados em CSV

- **Onde fica**: em Perfil → "Exportar meus dados", e não no dashboard. É uma
  operação sobre os *seus dados* (portabilidade), não sobre a visualização atual. O
  Perfil é onde o usuário procura o que é dele, e ali ela não compete com as ações
  do dia a dia.
- **Gerada no servidor** (`data_export_service`), reaproveitando o `finance_engine`:
  meses projetados, revisões mês a mês de planejados, parcelas antecipadas e
  conversões de moeda saem exatamente como o dashboard calcula. O resumo mensal é
  testado contra `GET /dashboard/series`.
- Período: qualquer intervalo dentro do `navigable_range` (do primeiro registro ao
  limite calculado da projeção), no máximo 121 meses, recusando (422) quem passar do
  horizonte de 60 meses.
- O preview (`POST /exports/data/preview`) roda o mesmo cálculo da exportação e
  devolve as primeiras 8 linhas e o total de cada arquivo. No frontend ele espera
  400 ms sem mudanças antes de recalcular, porque cada prévia refaz o cálculo mês a
  mês.
- Formato: `excel_br` (`;` e vírgula decimal, que abre direto num Excel em
  português) ou `standard` (`,` e ponto). Sempre UTF-8 com BOM, para o Excel não
  quebrar os acentos. Datas em ISO. Valores em BRL (como guardados), e o cadastro
  traz também moeda, valor original e cotação.
- Um conjunto → `.csv`; vários → `.zip` (`zipfile` da biblioteca padrão). O nome
  do arquivo vem do servidor em `Content-Disposition`, liberado no CORS via
  `expose_headers` (o frontend roda em outra origem).
- Meses com revisão "Recusada" de um planejado fixo não aparecem em
  `lancamentos_por_mes.csv`: o arquivo lista o que *conta* no saldo, para a soma
  bater com o resumo mensal. As revisões confirmadas aparecem na coluna
  `revisao_do_mes`.
- Acesso: qualquer usuário autenticado, sempre só os próprios registros (testado
  com dois usuários). A exportação completa do banco em xlsx continua sendo só do
  ADMIN.

## Assistente Cartuga

Documentado em detalhe no anexo [`assistente.md`](assistente.md). Decisões principais:

- **O LLM não calcula.** Ele só escolhe *tools* e redige a resposta. Os números vêm
  de ferramentas determinísticas, somente leitura e escopadas no usuário, construídas
  sobre o `finance_engine`, para o assistente não ter como discordar das telas. Depois
  da resposta, uma verificação (`grounding.py`) compara cada "R$" com os números das
  ferramentas e da pergunta, e marca o que não bate. Simulações recebem um aviso de
  cautela fixo, aplicado pelo backend (não depende do modelo obedecer).
- **Provedor plugável, custo zero:** um cliente HTTP único no formato OpenAI
  (`httpx`, sem SDK). O padrão é o plano gratuito do Groq com `openai/gpt-oss-120b`
  e reserva em `gpt-oss-20b`. O Llama 3.3 70B, a escolha óbvia antes, foi desligado
  no Groq em 16/08/2026. Ollama é a alternativa 100% local. Sem chave configurada, o
  assistente aparece mas explica o que falta, em vez de quebrar.
- **Orçamento de tokens** (o limite de tokens/minuto do plano gratuito é o que aperta):
  prompt compacto; só as 8 últimas mensagens visíveis vão de contexto, sem os
  resultados de ferramentas de turnos anteriores; resultado de ferramenta truncado;
  teto de 5 rodadas de ferramentas; limite de perguntas por usuário/hora.
- **Manual por busca local**, não embeddings: palavras-chave com idf sobre Markdown
  versionado. É gratuito, instantâneo e determinístico.
- **Histórico:** só mensagens visíveis e as fontes, apagadas após 7 dias por limpeza
  lazy a cada requisição (sem agendador), medida no relógio do banco. Se o provedor
  falha, nada é gravado, para não deixar pergunta sem resposta no histórico.
- **Mudança em código existente:** a importação do admin roda com
  `FOREIGN_KEY_CHECKS=0`, então o `ON DELETE CASCADE` das tabelas novas não dispararia.
  Sem ajuste, conversas sobreviveriam e apareceriam para outro usuário importado com o
  mesmo id. As tabelas do chat entraram na lista de limpeza da importação (com teste).
- **Interface:** pop-up flutuante em todas as telas, com chat expansível. A primeira
  versão usava um avatar ilustrado com anel branco que destoava do resto. O botão agora
  segue os botões principais do sistema (pílula verde da marca), com a silhueta plana do
  logo e óculos vazados. Uma versão intermediária com o botão no cabeçalho foi
  descartada: o pop-up em todas as telas é o comportamento desejado. Os toasts sobem para
  ficar acima do botão, e o conteúdo ganha `pb-24` no fim. O Markdown das respostas vira
  elementos React, nunca HTML, então não há superfície de XSS.
- **Prompt com as telas reais:** com o modelo real, o assistente chegou a inventar telas
  ("Ranking de despesas") e a vazar nomes de campos em inglês dos resultados
  ("card installments"). O prompt passou a listar as telas que existem, a proibir
  inventar outras e a proibir nomes técnicos, e diz que o assistente não gera
  gráficos (para isso, indicar o Dashboard).
- **Cabeçalho em celulares muito estreitos:** abaixo de 360 px o avatar do usuário some
  do cabeçalho (o Perfil continua no menu). Antes disso, em 320 px, o botão do menu ☰
  ficava fora da tela, um problema anterior ao assistente.
- **Rastreio do pipeline** (`trace.py`): cada etapa vira um passo cronometrado, com o
  mesmo `trace_id` em dois destinos. O primeiro é a própria mensagem
  (`chat_messages.trace`), completo, porque são os dados do usuário no histórico dele e
  expiram junto. O segundo são os logs, uma linha JSON por passo, inclusive quando o
  turno falha e nada é gravado; o erro mostrado cita o `trace_id`. Os logs
  sobrevivem aos 7 dias, então no padrão (`summary`) só levam a forma do pipeline,
  sem pergunta, resposta, dados ou raciocínio. `full` é para depuração. O cliente de LLM
  passou a registrar cada tentativa (modelo, resultado, tempo), o uso de tokens e o
  raciocínio devolvido pelo provedor; a verificação de valores passou a expor cada
  valor com o resultado.
- **Chave própria por usuário** (Perfil → Assistente): a configuração do usuário
  prevalece sobre o padrão do servidor. Uma configuração própria inválida desativa o
  assistente *com o motivo*, sem cair na chave do servidor (não gasta cota alheia sem
  aviso). A chave é criptografada (Fernet), nunca volta para o cliente, fica presa a um
  provedor e é apagada ao voltar ao padrão. O limite por hora vale só para quem usa a
  cota do servidor. URLs personalizadas exigem https e IP público (anti-SSRF),
  checados ao salvar e a cada uso; Groq e Ollama não aceitam URL do usuário. As
  configurações salvas também entram na limpeza da importação do admin.
- **Rastreio em três destinos, legível:** além da mensagem e do terminal, cada turno
  (respondido, com falha ou teste de conexão) vai para `assistant_logs`, exibido em
  Gerenciamento → Logs do Assistente. O terminal deixou de ser só JSON: o padrão é texto
  legível, impresso no momento de cada etapa, com uma linha "aguardando o modelo" antes
  das chamadas lentas (`trace_text.py`); `ASSISTANT_TRACE_FORMAT=json` mantém o formato
  anterior para ferramentas de log. O usuário vê o rastro sem o prompt de sistema.
- **Logs só do próprio administrador:** a primeira versão da tela mostrava os registros
  de todos os usuários. Como eles contêm perguntas e dados financeiros, ser
  administrador não pode bastar: leitura, busca e exclusão são sempre filtradas pelo
  administrador logado, e o registro de outra pessoa responde 404 (sem revelar que
  existe).
- **Isolamento entre usuários no código:** além do `user_id` vir sempre da sessão, os
  argumentos que a ferramenta não declara são descartados antes da chamada (e
  aparecem no rastro), para que uma injeção de prompt não consiga nem tentar passar
  outro usuário. Um teste executa todas as ferramentas como outro usuário e falha se
  surgir ferramenta nova sem essa verificação.
- **Dados pessoais e o provedor do modelo:** revisando o que sai do servidor, o risco
  real não estava nos campos estruturados (e-mail, IDs e chaves já não eram enviados),
  mas no **texto livre**: a pergunta e as descrições e fontes dos lançamentos iam
  literalmente para a API externa, inclusive CPF, cartão ou e-mail que o usuário
  tivesse digitado. Criado `privacy.py`, que mascara esses identificadores na pergunta,
  no histórico e em cada resultado de ferramenta antes do envio (e antes do corte de
  tamanho). Sequências soltas de dígitos só contam com dígitos verificadores válidos
  (CPF, CNPJ, Luhn), para não mascarar valores nem números de pedido. A cópia do
  usuário fica original; o rastro conta o que foi mascarado. Nomes de pessoas ficaram
  de fora de propósito: reconhecê-los exigiria um modelo de NER, com falsos positivos
  em descrições comuns; o risco residual está documentado e o Ollama é a opção sem
  saída de dados.
- **Ollama:** o serviço do Compose só sobe com `--profile ollama`; sem ele, o backend
  não encontrava o nome `ollama` e o erro era genérico. Agora as mensagens dizem o que
  fazer (subir o serviço, baixar o modelo, escolher um menor por falta de memória), o
  endereço tem variável própria (`ASSISTANT_OLLAMA_URL`) e o raciocínio dos modelos
  locais é desligado: na CPU ele levava minutos e consumia o limite de saída sem chegar
  à resposta.

## Gráficos (Highcharts)

- Paleta categórica: a paleta de referência validada da skill de dataviz (8 tons),
  validada com `validate_palette.js` contra as superfícies reais do Cartuga
  (`#ffffff` claro / `#17301d` escuro) — todos os gates obrigatórios passam.
- Mapeamento fixo de cor por série (nunca alterna): entradas = verde, saídas =
  vermelho, saldo = azul — usado de forma consistente em todos os gráficos que
  mostram essas três séries juntas.
- Barras de saldo acumulado usam a paleta de status (verde=positivo,
  vermelho=negativo) em vez de cor categórica, já que o sinal do saldo é
  literalmente um status. Meses projetados usam a mesma cor a 50% de opacidade —
  diferenciação sutil por opacidade, não por um hue novo, conforme pedido na
  spec (seção 19).
- Gráfico 1 (série temporal) usa o saldo **mensal** (não acumulado); gráfico 2
  (barras) usa o saldo **acumulado**. Misturar as duas escalas num único eixo
  gráfico distorceria a leitura de ambas — por isso ficaram em gráficos
  separados, não porque a spec exigisse duas métricas diferentes.
- Distribuições (pizza) agrupam por fonte ou tipo (toggle), com até 6 fatias
  diretas e o restante dobrado em "Outros".
- Bug real encontrado e corrigido: o tooltip do gráfico de barras acessava
  `point.custom.isProjected` sem guarda, e podia ser chamado pelo Highcharts
  fora de um hover normal (ex.: no probing inicial do módulo de acessibilidade),
  quebrando a página com um erro não tratado. Corrigido guardando contra
  `custom` ausente e embutindo o rótulo do mês (`custom.label`) diretamente no
  ponto, em vez de depender de `point.category`/`point.x`, que não resolviam
  de forma confiável.

## UX e responsividade (Fase 6)

- Auditoria feita testando de verdade em viewports mobile (375px) e tablet (768px)
  via Playwright, não só revisando o CSS. Nenhum overflow horizontal na página em
  nenhuma tela testada (login, dashboard, entradas, saídas, perfil, admin).
- Bug real encontrado e corrigido: o cabeçalho do gráfico "Saldo acumulado por mês"
  usava `flex justify-between` fixo, fazendo o texto de dica ("Clique em um mês...")
  sobrepor o título em telas estreitas. Corrigido para empilhar verticalmente abaixo
  de `sm:`.
- Tabelas de entradas/saídas/usuários usam scroll horizontal (`overflow-x-auto`) no
  mobile em vez de um layout em cards — verificado que o conteúdo continua
  totalmente acessível via swipe (nada é cortado/perdido), só não é o padrão mais
  descobrível; aceito como suficiente para o requisito de "design responsivo" da
  spec.
- Textos de loading padronizados para bater com o vocabulário da spec (seção 21):
  botões de salvar mostram "Salvando...", exclusão mostra "Excluindo...",
  confirmação de importação mostra "Importando...", restauração mostra
  "Restaurando...".
- Estados de loading, erro (com retry) e vazio verificados renderizando
  corretamente via mock de rede (não só lidos no código) nas telas de Entradas.

## Revisão de segurança (Fase 7)

Três problemas reais encontrados e corrigidos numa auditoria manual (não só
checklist — cada um foi explorado/reproduzido antes de corrigir):

1. **XSS armazenado nos tooltips dos gráficos de distribuição.** O tooltip do
   `DistributionPieChart` usava `useHTML: true` e interpolava `point.name` (que vem
   do campo `source` digitado pelo usuário numa entrada/saída) direto numa string
   HTML, sem escapar. Um `source` como `<img src=x onerror=alert(1)>` seria
   executado no navegador de quem passasse o mouse sobre a fatia. Corrigido com um
   helper `escapeHtml()` aplicado no ponto de interpolação; confirmado que
   `TimeSeriesChart` e `MonthlyBalanceChart` não têm o mesmo problema (só
   interpolam nomes de série fixos e labels de mês computados, nunca texto do
   usuário).
2. **`JWT_SECRET` com valor padrão fraco no código.** `Settings.jwt_secret` tinha
   fallback `"dev-secret-change-me"` — um valor público (está no código-fonte) que,
   se `JWT_SECRET` fosse esquecido em produção, permitiria forjar tokens JWT
   válidos para qualquer usuário, incluindo ADMIN. Removido o valor padrão: agora a
   aplicação falha ao subir (erro de validação do Pydantic) se a variável não for
   definida, em vez de subir silenciosamente insegura.
3. **Sem validação de tamanho mínimo de senha na criação de usuário pelo admin.**
   `POST /users` aceitava qualquer string como senha (incluindo vazia) — só
   `PUT /users/me/password` tinha a checagem de 8 caracteres. Corrigido com
   `Field(min_length=8)` no schema `UserCreate`; teste adicionado cobrindo senha
   vazia e de 7 caracteres.

Também confirmado (sem necessidade de correção): nenhuma query SQL usa
interpolação de string com dado de usuário (todas via SQLAlchemy Core/ORM
parametrizado, exceto nomes de tabela fixos/hardcoded no `DELETE FROM` da
importação); nenhuma chamada `subprocess` usa `shell=True`; CORS restrito à lista
de origens configurada (não usa `*` com `allow_credentials=True`); todos os 23
endpoints protegidos exigem `get_current_user` ou `require_admin`, confirmado
lendo cada router; refresh token cookie com `httponly+secure+samesite=strict`.

## Revisão de segurança (Fase 8, preparação para o portfólio)

Revisão completa antes de publicar o código no GitHub (o projeto é distribuído para
rodar localmente, com a conta demo de credenciais públicas). Corrigido:

1. **`JWT_SECRET` de exemplo aceito.** A Fase 7 removeu o padrão do código, mas o
   problema voltou pelo `.env.example`: quem seguisse `cp .env.example .env` assinava
   tokens com um valor publicado no repositório, e qualquer pessoa poderia forjar uma
   sessão de ADMIN. Agora `Settings` recusa valores públicos conhecidos e segredos com
   menos de 32 caracteres (também `ASSISTANT_ENCRYPTION_KEY`, se definida), e a
   mensagem de erro sugere um valor aleatório pronto. Escolhido falhar em vez de gerar
   um segredo efêmero: um segredo que muda a cada reinício derrubaria sessões e
   tornaria ilegíveis as chaves de API salvas (derivadas dele).
2. **Login sem limite de tentativas.** Adicionado limite em memória (`rate_limit.py`):
   5 falhas por IP+e-mail e 20 por IP numa janela de 15 minutos, com 429 até a janela
   passar, mesmo com a senha certa. Login com sucesso zera o par IP+e-mail.
3. **Enumeração de contas pelo tempo de resposta.** E-mail inexistente respondia sem
   calcular Argon2, bem mais rápido que senha errada. Agora calcula contra um hash
   fictício.
4. **Entradas sem limite de tamanho.** Descrições, fontes e nomes maiores que a coluna
   viravam erro 500 do MySQL; a foto de perfil aceitava qualquer texto (inclusive
   `javascript:`). Tipos compartilhados (`schemas/common.py`) aplicam os limites das
   colunas (422), a foto só aceita URL `http(s)` e as senhas têm teto de 128
   caracteres (limita o custo de Argon2 por requisição).
5. **Dependências com vulnerabilidades conhecidas** (`pip-audit`/`npm audit`):
   `starlette` (via FastAPI 0.115 → 0.143), `python-multipart`, `python-dotenv`,
   `cryptography`, `PyJWT`, `pytest` e `axios`. Atualizados com a suíte inteira
   passando. Restam alertas só no ferramental de build do Tailwind 3 (nada vai para o
   navegador); corrigi-los exige migrar para o Tailwind 4.
6. **Banco e API expostos na rede local.** O Compose publicava MySQL (com a senha de
   exemplo), API e frontend em todas as interfaces. Agora só em `127.0.0.1`.
7. **Builds não reprodutíveis.** O `Dockerfile` do frontend copiava só o
   `package.json` e rodava `npm install`, ignorando o lockfile (e as versões corrigidas).
   Agora usa `package-lock.json` + `npm ci`.
8. **Arquivos gerados no repositório.** `tsc -b` gravava `vite.config.js` ao lado do
   `.ts`, e o Vite carrega o `.js` primeiro: editar o `.ts` deixaria de ter efeito.
   As saídas foram para `node_modules/.tmp` e entraram no `.gitignore`. O script
   `lint` chamava um ESLint que não está instalado e foi trocado por `typecheck`.

Também adicionados: cabeçalhos `X-Content-Type-Options`, `X-Frame-Options` e
`Referrer-Policy` em todas as respostas da API, e um aviso no log quando a senha
pública da demo é usada com `CORS_ORIGINS` fora de localhost.

Confirmado sem necessidade de correção: nenhum segredo real fora do `.env` (que é
ignorado pelo git); a exportação do banco não inclui hashes de senha; todos os
endpoints, exceto login e refresh, exigem sessão; todas as buscas por id filtram pelo
dono (incluindo as indiretas, como ajustes de parcela e revisões de planejados); o
token de acesso fica só em memória no frontend; nenhum `dangerouslySetInnerHTML`.

## Dados de demonstração

- Os dados ficam em **mocks JSON** (`app/seeds/mocks/`), separados do executor
  (`app/seeds/__main__.py`). Assim, mudar a demo é editar dados, sem mexer em código.
  Os mocks usam o mesmo formato dos payloads da API. Vínculos entre registros (o
  recorte do Cofre e sua entrada de origem) são feitos por `ref`/`source_ref`, nunca
  por ID, porque IDs dependem da ordem de inserção.
- As seeds cadastram tudo na conta `INITIAL_ADMIN_EMAIL` **pela API HTTP**, não pelo
  ORM. Assim conversão PTAX, geração de parcelas, limites do Cofre e o fluxo de
  Planejados são aplicados exatamente como pela interface, sem uma segunda
  implementação das regras para manter sincronizada.
- Datas **relativas ao dia em que a seed roda**: `{"month": -12, "day": 5}`,
  `{"days": -2}`. Assim a demo sempre cobre os últimos 12 meses até o mês atual,
  com projeção à frente, em vez de envelhecer. Por isso os nomes dos registros evitam
  épocas do ano ("Natal", "13º", "IPVA"): o mês real de cada registro muda conforme
  a data de execução.
- Um registro realizado (não Planejado) nunca fica no futuro: se a data resolvida
  cair depois de hoje no mês corrente, ela é trazida para hoje. Sem isso, rodar a
  seed no começo do mês criaria gastos "já pagos" com data futura.
- Gastos do dia a dia são **padrões** (faixa de valor, descrições possíveis,
  ocorrências por mês) expandidos em tempo de execução, e não registros
  individuais: com datas relativas, uma lista fixa de dias não faria sentido para
  todo mês. O aleatório usa semente fixa, então o resultado é reproduzível para a
  mesma data de execução.
- Duas regras do próprio sistema limitam o que os mocks podem expressar:
  - A revisão mês a mês de um `FIXED` Planejado só é aceita a partir de
    `is_planned_since`, que é o dia da criação. Por isso `reviews` só usa
    `month >= 0`.
  - A antecipação de parcelas exige parcelas futuras. Por isso
    `advance_next_installments` antecipa as próximas que ainda não venceram.
- `--undo` apaga **todos** os lançamentos da conta demo, não só os que vieram dos
  mocks: a conta é dedicada à demonstração, e rastrear quais registros foram
  criados pela seed exigiria uma marcação no schema só para isso. A ordem de exclusão
  é Cofre → saídas → entradas: excluir uma movimentação do Cofre já remove o
  lançamento que ela gerou, e parcelas, ajustes e revisões caem por `ON DELETE
  CASCADE`.
- Aplicar recusa rodar se a conta já tiver lançamentos, para não duplicar dados;
  `--reset` = `--undo` + aplicar.
- Credenciais padrão do ADMIN (`config.py`/`.env.example`) são as da conta demo
  pública documentada no README, nunca dados pessoais reais.

## Variáveis de ambiente

- O container do frontend recebe só `VITE_API_BASE_URL`, via `environment:` no
  Compose, e não o `.env` inteiro (`env_file`). Antes ele recebia `JWT_SECRET` e as
  senhas do banco sem usar nenhuma delas.
- `DATABASE_URL` é sempre montada pelo `docker-compose.yml` a partir de `MYSQL_*`
  (`environment:` tem precedência sobre `env_file`). Por isso ela fica comentada no
  `.env.example` como opcional: só tem efeito ao rodar o backend fora do Compose.
- Variáveis cujo valor recomendado é igual ao padrão do código (`JWT_ALGORITHM`,
  `MYSQL_HOST`/`MYSQL_PORT`, `MYSQLDUMP_PATH`/`MYSQL_RESTORE_PATH`) ficam comentadas
  numa seção "Opcionais", para deixar claro o que precisa ser configurado de fato.

## Stack

- Backend: FastAPI + SQLAlchemy 2.0 + Alembic + Pydantic v2, Argon2id (`argon2-cffi`),
  PyJWT, `openpyxl`.
- Frontend: Vite + React 18 + TypeScript + TanStack Query + React Router + Tailwind CSS +
  `highcharts-react-official` + Axios.
