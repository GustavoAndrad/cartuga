# Manual do Cartuga

## O que é o Cartuga
O Cartuga é um sistema de controle financeiro pessoal. Você registra o dinheiro que entra (entradas) e o que sai (saídas), acompanha compras parceladas no cartão, separa uma reserva no Cofre e vê a projeção do saldo para os próximos meses. Todos os valores são guardados em reais (BRL). O menu fica no ícone ☰ no canto superior direito: Dashboard, Entradas, Saídas, Cofre, Planejamentos, Assistente e Perfil (e Admin, para administradores).

## Entradas: o que são e como cadastrar
Entrada é todo dinheiro que chega: salário, freelas, vendas, bônus, restituição de imposto. Fica no menu "Entradas", botão "+ Nova entrada" (também há atalho na seção do mês atual no Dashboard). Campos: data, valor, moeda, descrição, fonte (de onde veio o dinheiro, ex.: nome da empresa) e tipo. O tipo pode ser Fixa (repete todo mês entre a data de início e, opcionalmente, a de término, como um salário) ou Excepcional (acontece uma vez só, como uma venda). Clicar numa entrada da lista abre o detalhe, com editar, excluir e "Ver impacto".

## Saídas: o que são e como cadastrar
Saída é todo dinheiro que sai: contas, compras, assinaturas. Fica no menu "Saídas", botão "+ Nova saída". Além de Fixa ou Excepcional, toda saída tem meio de pagamento: Conta (débito, à vista, Pix) ou Crédito (cartão, parcelado de 1 a 24 vezes). Saídas fixas são sempre em Conta. Compras no crédito são sempre excepcionais e geram parcelas.

## Fixa x Excepcional
Fixa: um valor que se repete todo mês, do mês de início até o mês de término (ou para sempre, se não houver término). O sistema considera o mês inteiro, não o dia exato: começar no dia 20 vale para o mês todo. Excepcional: um valor que acontece uma única vez, no mês da sua data.

## Compras parceladas no crédito
Ao cadastrar uma saída no Crédito com N parcelas, o sistema divide o valor em N partes com precisão de centavos (a última parcela absorve a diferença do arredondamento, então a soma sempre bate com o total). A primeira parcela cai no mês da compra, e cada parcela conta no mês em que vence. Depois de criada, a compra no crédito tem valor, data e parcelamento travados (só descrição e fonte podem ser editadas); para mudar o valor, exclua e recrie. No detalhe da compra, "Ver todas as parcelas" mostra cada parcela e permite: adicionar ajustes (um estorno, juros ou cobrança extra numa parcela específica, sem mexer nas outras) e antecipar parcelas futuras (pagar adiantado; elas passam a contar no mês atual, em ordem, e a antecipação pode ser desfeita).

## Como o saldo é calculado
Saldo do mês = entradas do mês − saídas do mês (saídas em conta + parcelas que vencem no mês). Saldo acumulado = soma dos saldos de todos os meses, começando do zero no seu primeiro registro. Meses futuros usam exatamente a mesma regra: repetem as entradas e saídas fixas e as parcelas já cadastradas. Isso é uma projeção do que acontece se nada mudar, não uma previsão: gastos que você ainda não registrou não aparecem. Todo cálculo é feito num único lugar do sistema, então dashboard, detalhe do mês, "Ver impacto" e exportações sempre batem.

## Dashboard: cards
Saldo atual: saldo acumulado até o fim deste mês. Total recebido e total gasto no mês: só os valores deste mês (não acumulados). Saldo do mês anterior: o acumulado até o fim do mês passado. Saldo projetado: o acumulado no fim da janela de projeção escolhida no seletor "Projeção" (3, 6, 12, 24 meses ou personalizado). Comprometido com parcelas: soma de todas as parcelas de cartão que ainda vão vencer, sem limite de tempo. Saldo em investimentos: quanto há no Cofre (não faz parte do saldo acima).

## Dashboard: gráficos
"Entradas e Saídas por mês" e "Saldo mensal" mostram cada mês; "Saldo acumulado por mês" mostra o acumulado em barras (verde positivo, vermelho negativo; meses projetados em tom mais claro). Clicar num mês abre o detalhe completo daquele mês, com listas paginadas. Cada gráfico tem setas ‹ › para andar um mês para trás ou para frente, sem mudar a quantidade de meses visíveis, e cada gráfico anda sozinho. O limite para trás é o primeiro mês com registros; para frente, o último mês em que algum lançamento ainda muda o saldo (ou 60 meses, se houver lançamento fixo sem fim). O botão ↺ volta ao período padrão. As pizzas de distribuição mostram o mês atual por fonte ou por tipo.

## Ver impacto
No detalhe de uma entrada ou saída, "Ver impacto" mostra o quanto aquele registro muda o seu saldo acumulado ao longo do tempo: o sistema calcula o saldo com e sem o registro e mostra a diferença.

## Planejados
Uma entrada, ou uma saída em Conta, pode ser marcada como "Planejado": um valor estimado, ainda não confirmado. Ela conta normalmente nos cálculos desde já. A partir da véspera da data prevista, aparece na tela "Planejamentos" (e o menu mostra uma bolinha com o número de pendências), onde você Confirma (pode ajustar para o valor real) ou Recusa (o registro deixa de contar). Uma saída ou entrada fixa planejada é revisada mês a mês: por exemplo, a conta de luz estimada em R$ 170 pode ser confirmada como R$ 186,32 só naquele mês. A tela Planejamentos também tem gráficos comparando o saldo com e sem os planejados.

## Cofre
O Cofre separa o dinheiro guardado (reserva) do dinheiro disponível, no menu "Cofre". Três movimentações: "Guardar do zero" (dinheiro que já existia fora do sistema; não afeta o saldo do dashboard), "Recortar de uma entrada" (separar uma parte, em % ou valor, de uma entrada excepcional recebida; vira uma saída e reduz o saldo) e "Retirar" (usar a reserva; vira uma entrada e aumenta o saldo). Não é possível retirar mais do que foi guardado nem recortar mais de 100% de uma entrada. Lançamentos gerados pelo Cofre aparecem nas listas com o ícone do cofre e a fonte "Investimento".

## Moedas e câmbio
Um lançamento pode ser registrado em reais, dólar ou euro. O sistema converte para reais usando a cotação PTAX de venda do Banco Central na data do lançamento e guarda essa cotação: o valor histórico não muda depois. Em fins de semana e feriados usa o último dia útil anterior. O seletor de moeda no topo (BRL/USD/EUR) só muda a exibição, convertendo pela cotação do dia; nada é regravado. O Dashboard mostra a cotação do dia e o histórico.

## Exportar o dashboard em PDF
No Dashboard, botão "Exportar". Abre um modal que começa igual ao que a tela mostra (projeção, período de cada gráfico, agrupamento das pizzas, moeda), descreve o que vai no arquivo e permite mudar tudo só para o PDF, com pré-visualização das páginas. O PDF gerado é exatamente a pré-visualização.

## Exportar meus dados em CSV
Em Perfil, seção "Exportar meus dados". Você escolhe o período (inclusive meses projetados), os arquivos (resumo mensal, lançamentos mês a mês, cadastro de lançamentos, parcelas, Cofre) e o formato (Excel em português ou padrão), vê uma prévia e baixa um CSV ou um .zip. Cada pessoa só exporta os próprios dados.

## Importação de extrato bancário
Administradores podem importar o CSV de extrato do Inter ou do Nubank (Admin, aba de importação bancária). O sistema sugere a classificação de cada linha e tudo passa por uma tela de revisão antes de gravar.

## Perfil e conta
Em "Perfil" você muda nome, e-mail, foto e senha (trocar a senha encerra as outras sessões), configura o modelo e a chave do Assistente e exporta seus dados. O tema claro/escuro fica no ícone de sol/lua no topo.

## Administração
Usuários administradores têm o menu "Admin": gerenciar usuários e papéis, exportar e importar o banco completo em .xlsx (com backup automático antes de qualquer importação) e restaurar o último backup.

## Assistente Cartuga
O Assistente responde dúvidas sobre o sistema, explica conceitos de finanças de forma simples e consulta os seus registros para responder perguntas como "quanto gastei em setembro" ou simular uma compra. Ele só lê os dados, nunca altera nada. Pode cometer imprecisões: confira os números nas telas do sistema. O histórico de conversas é guardado por 7 dias. Ele fica no botão verde "Assistente" no canto inferior direito de todas as telas, que abre o chat (dá para expandir ou abrir em página inteira), e na página Assistente do menu. Em Perfil → Assistente Cartuga, cada pessoa pode escolher o provedor e o modelo e usar a própria chave de API (por exemplo, a chave gratuita do Groq): a chave fica criptografada, nunca é exibida de novo, pode ser testada antes de salvar, e quem usa a própria chave não tem o limite de perguntas por hora do servidor.
