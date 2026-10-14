# Anexo: Assistente Cartuga

Documentação completa do chatbot do Cartuga: o que ele faz, como foi construído, por que
as respostas são confiáveis, quanto custa (nada) e como ativar, operar e evoluir.

> Resumo em uma frase: **o modelo de linguagem só conversa e escolhe consultas. Todo
> número vem de funções determinísticas sobre o mesmo motor financeiro do dashboard, e
> há uma verificação automática que sinaliza qualquer valor da resposta que não veio
> dos dados.**

> **Contexto:** o Cartuga é um MVP construído como prova de conceito, para rodar
> localmente. O que está no escopo e os limites conhecidos estão no
> [README](../README.md#-status-mvp-para-prova-de-conceito).

---

## 1. Visão geral

O Assistente Cartuga é um assistente de finanças pessoais, "como um contador
paciente". O ícone é a própria tartaruga do logo (mesma silhueta plana e mesmas cores)
com um par de óculos redondos vazados na cabeça. Um **botão flutuante em todas as
telas** abre um **pop-up com o chat, expansível**; há também uma **página dedicada**
(menu → Assistente). Está disponível para todos os perfis de usuário, e
**cada usuário pode usar o próprio modelo e a própria chave de API** (seção 2).

### O que ele sabe fazer

| Escopo | Exemplos de pergunta | De onde vem a resposta |
|---|---|---|
| **1. Manual do sistema** | "Como funcionam as compras parceladas?", "O que é um lançamento planejado?", "Onde exporto meus dados?", "Como o saldo é calculado?" | Busca no manual (`search_help`) |
| **2. Finanças em geral**, de forma simples | "O que é reserva de emergência?", "Juros compostos?", "Qual a cotação do dólar hoje?" | Conhecimento do modelo + glossário + cotação PTAX real (`get_exchange_rates`) |
| **3. Os dados do usuário** | "Quanto gastei dia 12?", "Quanto gastei em setembro?", "Quanto vou ter em dezembro?", "Tenho dinheiro para uma compra de R$ 2.000?", "Posso parcelar R$ 3.000 em 10x com juros de 2%?", "Quanto tenho no Cofre?", "Qual foi minha compra mais alta?", "Com o que mais gastei nos últimos 3 meses?", "Qual minha maior fonte de renda?" | Ferramentas determinísticas (seção 6) |

### O que ele **não** faz (por desenho)

- **Não altera dados.** Todas as ferramentas são somente leitura; pedidos de "cadastre" ou
  "apague" são respondidos com onde fazer isso no sistema.
- **Não sai do escopo.** Outros assuntos (programação, política, saúde...) são recusados
  com gentileza.
- **Não dá certezas sobre decisões financeiras** nem recomenda produtos de investimento
  específicos.
- **Não vê dados de outros usuários.** Todas as consultas são presas ao usuário logado.

---

## 2. Como ativar (custo zero)

O projeto vem com o assistente **instalado, mas sem chave**: ele aparece e explica que
falta configurar, com um link para o Perfil. Há dois níveis de configuração.

### Pelo próprio usuário: Perfil → Assistente Cartuga (recomendado)

Cada pessoa escolhe o provedor e o modelo e usa a **própria chave**, gastando a
**própria cota**:

| Opção | O que pede |
|---|---|
| **Padrão do servidor** | Nada; usa o que o administrador configurou no `.env` (mostra qual é, ou que não há) |
| **Groq (plano gratuito)** | A chave gratuita (link direto para gerar); modelo opcional, com sugestões |
| **Ollama (modelo local do servidor)** | Nada; usa o Ollama que o administrador subiu (o endereço não é editável) |
| **Outra API compatível com a da OpenAI** | URL **https** pública, modelo e, se o serviço exigir, chave |

- **Testar conexão** experimenta os valores *antes* de salvar, com uma chamada mínima, e
  mostra o erro em português (chave inválida, limite atingido, endereço inacessível).
- Depois de salva, a chave **nunca volta para o navegador**: o Perfil mostra só
  "Chave salva …1234", com "Trocar".
- Quem usa a própria chave **não tem o limite de perguntas por hora**, que existe só
  para proteger a cota compartilhada do servidor.
- Uma configuração própria incompleta (sem chave, chave ilegível, URL bloqueada)
  **desativa o assistente com o motivo**. Ele nunca cai silenciosamente na chave do
  servidor, o que gastaria a cota de outra pessoa sem o usuário saber.
- Voltar para "Padrão do servidor" **apaga** a chave salva.

### Pelo administrador do servidor (padrão para quem não configurou nada)

Escolha um provedor no `.env`:

### Opção A: Groq (recomendada; gratuita, sem cartão)

1. Crie uma conta em <https://console.groq.com> e gere uma chave em **API Keys**.
2. No `.env`:
   ```env
   ASSISTANT_PROVIDER=groq
   ASSISTANT_API_KEY=gsk_sua_chave
   ```
3. Recrie o backend para ler o `.env`: `docker compose up -d backend`.

Modelo padrão: `openai/gpt-oss-120b`, com reserva automática em `openai/gpt-oss-20b`
quando o primeiro está no limite (cada modelo tem a própria cota).

### Opção B: Ollama (100% local e offline; nada sai da máquina)

```bash
docker compose --profile ollama up -d ollama   # sobe o serviço opcional "ollama"
docker compose exec ollama ollama pull qwen3:8b  # baixa o modelo uma vez
# Padrão do servidor: no .env, ASSISTANT_PROVIDER=ollama (sem chave) e
# docker compose up -d backend. Ou cada usuário escolhe "Ollama" no Perfil.
```

O serviço só existe com `--profile ollama`: sem ele o backend não encontra o nome
`ollama` e o teste de conexão diz *"Não consegui conectar ao Ollama em
http://ollama:11434/v1..."*. Se o Ollama estiver instalado direto no Windows/Mac (fora
do Docker), aponte `ASSISTANT_OLLAMA_URL=http://host.docker.internal:11434/v1`.

**Memória e velocidade.** O modelo precisa caber na memória **do Docker** (no Windows,
a VM do WSL costuma ter metade da RAM): `qwen3:8b` pede ~6 GB, `qwen3:4b` ~3,5 GB e
`qwen3:1.7b` ~2,5 GB. Se não couber, o Ollama recusa e a mensagem diz para escolher um
modelo menor. Sem GPU tudo roda na CPU: num notebook i5 com 8 GB, o `qwen3:1.7b` leva
~1,5 min por chamada ao modelo (o prompt tem ~2 mil tokens) e escolhe consultas pior
que os modelos do Groq; por isso suba `ASSISTANT_TIMEOUT_SECONDS` (180-300). Para dar
mais memória ao Docker no Windows, crie `%UserProfile%\.wslconfig` com `[wsl2]` e
`memory=6GB` e rode `wsl --shutdown`.

O raciocínio (*thinking*) dos modelos locais é desligado (`reasoning_effort: "none"`):
na CPU ele levava minutos e podia gastar todo o limite de saída sem chegar à resposta.
O serviço do compose usa janela de contexto de 8192 tokens (o padrão do Ollama cortaria
o prompt) e mantém o modelo carregado por 30 minutos entre perguntas. Qualquer modelo do
Ollama com suporte a *tools* funciona.

### Opção C: qualquer API compatível com a da OpenAI

```env
ASSISTANT_PROVIDER=openai_compatible
ASSISTANT_BASE_URL=https://.../v1
ASSISTANT_MODEL=nome-do-modelo
ASSISTANT_API_KEY=...
```

Para desligar de vez: `ASSISTANT_PROVIDER=disabled`.

---

## 3. Arquitetura

```
 Navegador                          Backend (FastAPI)                           Provedor LLM
┌──────────────────┐  POST /assistant/  ┌───────────────────────────────┐   /chat/completions
│ Pop-up / Página  │  conversations/    │ assistant/service.py          │   (tools)       ┌─────────┐
│ ChatPanel        │──{id}/messages────▶│  1. limpeza 7 dias + limite   │────────────────▶│  Groq / │
│                  │                    │  2. prompt + histórico curto  │◀────────────────│ Ollama  │
│  • resposta      │◀── mensagem ───────│  3. laço de ferramentas (≤5)  │  "chame a       └─────────┘
│  • fontes        │   + fontes         │        │                      │   ferramenta X"
│  • avisos        │   + flags          │        ▼                      │
└──────────────────┘                    │  assistant/tools.py           │
                                        │  (somente leitura, por        │
                                        │   usuário)                    │
                                        │        │                      │
                                        │        ▼                      │
                                        │  finance_engine  ◀── o mesmo  │
                                        │  vault/planning/   do dashboard│
                                        │  câmbio                       │
                                        │  4. verificação de valores    │
                                        │  5. grava pergunta+resposta   │
                                        └───────────────┬───────────────┘
                                                        ▼
                                        MySQL: chat_conversations / chat_messages
```

### Fluxo de uma pergunta

1. **Higiene:** apaga do banco as mensagens do usuário com mais de 7 dias e confere o
   limite de perguntas por hora.
2. **Contexto:** monta o prompt de sistema (com a data de hoje e o primeiro nome do
   usuário), as últimas 8 mensagens *visíveis* da conversa e a pergunta, e envia ao
   modelo com a lista de ferramentas.
3. **Ferramentas:** se o modelo pede uma ferramenta, o backend a executa (escopada no
   usuário) e devolve o resultado em JSON. Isso se repete até 5 rodadas. Argumentos
   inválidos voltam ao modelo como erro, para ele corrigir a chamada.
4. **Verificação:** cada "R$" da resposta final é conferido contra os resultados das
   ferramentas e a pergunta (seção 5). Se alguma simulação foi usada, a resposta ganha
   a marcação de cautela.
5. **Gravação:** salva a pergunta e a resposta, com as **fontes** (quais dados foram
   consultados), os **avisos** e o **rastro completo do pipeline** (seção 9). Se o provedor falhar, **nada** é gravado, e a interface
   devolve a pergunta ao campo para reenviar.

### Módulos

| Arquivo | Responsabilidade |
|---|---|
| `backend/app/assistant/llm.py` | Cliente HTTP único para APIs no formato OpenAI (Groq, Ollama, outros), com modelo reserva e erros traduzidos |
| `backend/app/assistant/providers.py` | Qual provedor/modelo/chave cada usuário usa (próprio ou do servidor); validação de URL contra SSRF |
| `backend/app/assistant/user_settings.py` | Ver, salvar e testar a configuração do usuário |
| `backend/app/assistant/secrets.py` | Criptografia das chaves de API dos usuários (Fernet) |
| `backend/app/assistant/tools.py` | As ferramentas determinísticas (seção 6) |
| `backend/app/assistant/prompt.py` | Prompt de sistema |
| `backend/app/assistant/grounding.py` | Verificação de valores |
| `backend/app/assistant/knowledge/` | Manual e glossário em Markdown + busca |
| `backend/app/assistant/service.py` | Conversas, retenção, limite, laço de ferramentas |
| `backend/app/assistant/trace.py` | Rastreio passo a passo: grava com a resposta e emite nos logs |
| `backend/app/assistant/privacy.py` | Mascara dados pessoais antes de qualquer envio ao modelo |
| `backend/app/assistant/trace_text.py` | Texto legível do rastreio no terminal, etapa por etapa |
| `backend/app/assistant/audit.py` | Logs completos de cada pergunta e teste de conexão, para administradores |
| `backend/app/routers/assistant.py` | Endpoints `/assistant/*` |
| `backend/app/routers/assistant_admin.py` | Endpoints `/admin/assistant/logs` (só administradores) |
| `backend/app/models/assistant.py` + migrations `0007` a `0009` | Tabelas `chat_conversations`, `chat_messages` e `assistant_settings` |
| `frontend/src/components/assistant/` | Ícone, pop-up, painel de chat, renderizador de Markdown |
| `frontend/src/pages/AssistantPage.tsx` | Página dedicada com o histórico |

Não entrou nenhuma dependência nova: o cliente usa o `httpx` que o backend já tinha, e o
frontend não usa biblioteca de chat nem de Markdown.

---

## 4. Escolha do modelo e custo zero

Pesquisa feita em outubro de 2026. Preços e limites mudam com frequência.

| Opção | Custo | Prós | Contras |
|---|---|---|---|
| **Groq: `openai/gpt-oss-120b`** (escolhida) | Grátis, sem cartão | Rápido; pesos abertos; bom em *tool calling*; API compatível | Limites do plano gratuito (abaixo); dados saem para um terceiro |
| Groq: Llama 3.3 70B | — | Era a escolha natural | **Desligado no Groq em 16/08/2026**, com migração recomendada para `gpt-oss-120b` |
| Ollama local (Qwen3, Llama, Gemma...) | Grátis | Privacidade total; sem limite de cota | Precisa de hardware; mais lento em CPU; qualidade varia com o tamanho |
| xAI Grok API | Pago (há programa de créditos, instável) | Modelos fortes | Não é custo zero garantido; "Grok" (xAI) ≠ "Groq" (a empresa dos chips LPU) |
| Outras APIs compatíveis (OpenRouter etc.) | Variável | Suportadas pela opção C | Planos gratuitos mudam muito |

**Limites gratuitos do Groq para `gpt-oss-120b`:** 30 requisições/min, 1.000
requisições/dia, 8 mil tokens/min e 200 mil tokens/dia, por organização. Fontes: [Groq
rate limits](https://console.groq.com/docs/rate-limits), [Groq models](https://console.groq.com/docs/models),
[Groq tool use](https://console.groq.com/docs/tool-use/overview), [deprecações](https://console.groq.com/docs/deprecations).

**Orçamento por pergunta.** Uma pergunta típica faz de 2 a 3 chamadas ao modelo (pede a
ferramenta, depois responde). O que mais gasta é o prompt de sistema somado às
definições das ferramentas, cerca de 2,5 mil tokens por chamada. Por isso:

- o prompt é curto;
- o histórico enviado tem só as 8 últimas mensagens visíveis, sem os resultados de
  ferramentas de turnos anteriores;
- cada resultado de ferramenta é limitado a 6 mil caracteres;
- a resposta tem no máximo 900 tokens.

Na prática, o plano gratuito comporta cerca de **2 a 3 perguntas por minuto** e
**algumas centenas por dia**, somando todos os usuários. É suficiente para uma demo de
portfólio. O limite por usuário (`ASSISTANT_MAX_MESSAGES_PER_HOUR`, padrão 30) impede
que uma pessoa esgote a cota de todas. Quando o limite do provedor estoura (HTTP 429),
o sistema tenta o modelo reserva e, se também falhar, avisa o usuário para esperar um
minuto, sem gravar nada.

---

## 5. Estratégia de exatidão

Lidar com dinheiro exige mais do que pedir ao modelo para "não errar". São cinco
camadas, e as três primeiras não dependem do modelo obedecer:

1. **Números só de ferramentas determinísticas.** O modelo não faz contas: as
   ferramentas já devolvem totais, médias, rankings, parcelas e projeções prontos,
   calculados com `Decimal` pelo `finance_engine`, o mesmo motor do dashboard, do PDF e
   do CSV. Por isso o assistente não tem como discordar das telas. Os testes conferem a
   ferramenta de resumo mensal contra `GET /dashboard/month`.
2. **Verificação de valores** (`grounding.py`). Depois da resposta, cada "R$" do texto é
   extraído (aceita `1.234,56`, `1234,56`, `1.234` e `1234.56`) e comparado, centavo a
   centavo, com todos os números dos resultados das ferramentas e da pergunta do
   usuário. O que não bate aparece na interface: *"Não encontrei nos seus dados: R$ X.
   Podem ser exemplos ou contas feitas pelo assistente. Confira antes de usar."*
3. **Transparência das fontes.** Cada resposta mostra "Dados consultados" (ex.: "Resumo
   de setembro/2026", "Simulação de compra de R$ 3000 em 10x"), para o usuário saber de
   onde veio a informação e conferir na tela correspondente.
4. **Datas resolvidas a partir de hoje.** O prompt traz a data atual e o dia da semana, e
   as ferramentas recebem meses e datas explícitos (`AAAA-MM`, `AAAA-MM-DD`) validados.
   Argumento inválido volta ao modelo como erro, para ele corrigir.
5. **Instruções no prompt.** Nunca estimar nem fazer contas de cabeça; dizer quando não
   sabe; deixar claro que meses futuros são projeções; explicar a granularidade mensal.

### Granularidade: o sistema pensa em meses

O motor financeiro calcula saldo **por mês**: regras fixas valem para o mês inteiro, sem
dia específico. Por isso:

- **"Quanto gastei no dia 12?"** lista os lançamentos com aquela data (gastos pontuais e
  compras no crédito pelo valor total) e lembra que as contas fixas não têm dia;
- **"Quanto vou ter no dia 20 de dezembro?"** responde com o saldo previsto para o *fim*
  de dezembro e explica o motivo.

---

## 6. Ferramentas

Todas são somente leitura, escopadas no usuário logado e devolvem JSON com valores em
BRL (texto decimal).

| Ferramenta | Para que serve | Perguntas típicas | Baseada em |
|---|---|---|---|
| `get_current_snapshot` | Os cards do dashboard: saldo agora, mês atual, projeção de 6 meses, parcelas a pagar, Cofre | "Como estão minhas finanças?" | `dashboard_service.build_dashboard` |
| `get_month_overview` | Um mês (passado, atual ou futuro): entradas, saídas, parcelas, saldo do mês, acumulado no fim do mês, principais fontes | "Quanto gastei em setembro?", "Quanto vou ter em dezembro?" | `finance_engine.get_month_summary` + `get_balance_series` |
| `get_period_summary` | Mês a mês de um período (até 36 meses), totais e média de gastos | "Quanto gastei este ano?", "Média de gastos dos últimos 6 meses" | `get_balance_series` |
| `list_records` | Lançamentos com data num intervalo (inclusive um dia), ordenados por valor ou data, com busca por texto | "Quanto gastei dia 12?", "Qual foi minha compra mais alta?", "Quanto paguei de Uber?" | Tabelas de entradas e saídas |
| `rank_by_source` | Ranking por fonte ou descrição num período, com fixos e parcelas | "Com o que mais gastei nos últimos 3 meses?", "Qual minha maior fonte de renda?" | `get_month_summary` mês a mês |
| `simulate_purchase` | Simula compra à vista ou parcelada, **com juros pela tabela Price**: parcela, total, juros, saldo acumulado com e sem a compra mês a mês, menor saldo, meses negativos | "Tenho dinheiro para R$ 2.000?", "Posso parcelar R$ 3.000 em 10x com 2% de juros?" | `get_balance_series` + a mesma divisão de parcelas das compras reais (1ª parcela no mês da compra, centavos acertados na última) |
| `get_vault_summary` | Saldo do Cofre e últimas movimentações | "Quanto tenho guardado?" | `vault_service` |
| `get_exchange_rates` | Cotação do dia (PTAX do Banco Central) | "Qual a cotação do dólar?" | `exchange_rate_service` |
| `get_pending_reviews` | Planejados aguardando revisão | "Tenho algo para confirmar?" | `planning_service` |
| `search_help` | Busca no manual e no glossário | Perguntas sobre o sistema | `knowledge/` |

A simulação é **marcada como apoio a decisão**, então toda resposta que a usa recebe na
interface um aviso fixo, aplicado pelo backend e não pelo modelo: *"Esta é uma simulação
feita com os lançamentos já cadastrados, não uma recomendação. Gastos que você ainda não
registrou não entram. Avalie com cuidado e, para decisões importantes, converse com um
profissional."* A simulação também informa o saldo do Cofre à parte e explicita as
premissas no resultado.

---

## 7. Base de conhecimento

- `knowledge/manual.md`: o manual do Cartuga, uma seção (`## `) por funcionalidade:
  entradas e saídas, fixa x excepcional, crédito, cálculo do saldo, cards e gráficos do
  dashboard, "Ver impacto", planejados, Cofre, moedas, exportações, importação bancária,
  perfil, administração e o próprio assistente.
- `knowledge/financas.md`: glossário simples de finanças pessoais (renda e despesa,
  reserva de emergência, investimento, juros simples e compostos, parcelamento, rotativo,
  inflação, câmbio, orçamento), sem recomendações específicas.

**Busca:** palavras-chave sem acento, com remoção de plural e gênero, peso maior para
termos raros (idf) e título valendo em dobro. As 3 melhores seções vão para o modelo.
Não usa embeddings nem serviço externo: é instantânea, gratuita e **previsível** (a
mesma pergunta sempre recupera as mesmas seções).

**Para atualizar:** edite os `.md` (cada `## Título` vira uma seção). Ao criar ou mudar
uma funcionalidade do sistema, atualize a seção correspondente. O assistente responde
sobre o sistema a partir daqui, e um manual desatualizado gera respostas desatualizadas.

---

## 8. Segurança, privacidade e cautela

| Risco | Mitigação |
|---|---|
| Dados pessoais enviados ao provedor do modelo | Minimização (só o necessário, primeiro nome, sem IDs nem e-mail) e mascaramento de CPF, CNPJ, cartão, e-mail, telefone e chave Pix antes de qualquer envio, na pergunta, no histórico e nos resultados das ferramentas; aviso na interface; Ollama como opção local. Detalhes logo abaixo. Testado. |
| Ver dados de outra pessoa | Toda ferramenta recebe o `user_id` do token, nunca do modelo, e toda consulta ao banco filtra por ele. Argumentos que a ferramenta não declara (um `user_id` "injetado" por uma pergunta maliciosa) são descartados antes da chamada e aparecem no rastro como *argumentos ignorados*. Conversas são filtradas por dono: mandar mensagem na conversa de outra pessoa dá 404 **antes** de o modelo ser chamado, então o histórico alheio nunca chega a ele. O prompt manda recusar pedidos de dados de terceiros. Testado: cada uma das ferramentas é executada como outro usuário e o resultado não pode conter nada dos dados do dono (`test_assistant_isolation.py`; um teste falha se surgir uma ferramenta nova sem essa verificação). |
| Logs expondo dados de outra pessoa | A tela de logs completos (seção 9) é só para administradores (403 para os demais) e cada administrador vê **apenas os próprios** registros (de outra pessoa: 404, nem a existência vaza); retenção própria (`ASSISTANT_LOG_DAYS`). O usuário comum vê só o rastro das próprias respostas, sem o prompt de sistema. O terminal do servidor mostra todos os atendimentos, mas só quem administra o servidor o acessa, e com `ASSISTANT_TRACE_LOG=summary` ele omite o conteúdo. |
| Modelo alterar dados | Não existe ferramenta de escrita. |
| Injeção de instruções via texto dos lançamentos (ex.: uma descrição "ignore as regras") | O prompt declara que descrições e fontes são dados, nunca instruções; resultados vão como mensagens `tool` em JSON; nenhuma ferramenta tem efeito colateral para ser abusada. |
| Número inventado | Seção 5: ferramentas determinísticas + verificação de valores + fontes visíveis. |
| Conselho financeiro categórico | Regras no prompt, aviso fixo nas simulações e aviso permanente na tela. |
| Fuga de escopo | Prompt com os três escopos e recusa curta para o resto. |
| Esgotar a cota gratuita | Limite por usuário/hora, histórico curto, prompt compacto, modelo reserva. |
| XSS pela resposta do modelo | O frontend nunca injeta HTML: o Markdown é convertido em elementos React. |
| Histórico ou chave de API vazando após importação do admin | A importação (que roda com `FOREIGN_KEY_CHECKS=0`, onde o CASCADE não dispara) agora apaga também as tabelas do chat e as configurações do assistente. Testado. |
| Chave de API do usuário exposta | Criptografada em repouso (Fernet, AES + HMAC) com chave própria (`ASSISTANT_ENCRYPTION_KEY`) ou derivada do `JWT_SECRET` por HKDF; nunca devolvida pela API (só "…1234"); nunca registrada em log; vinculada a um provedor (trocar de provedor descarta a chave). |
| SSRF: usuário apontando o servidor para serviços internos | URL personalizada só com **https** e só se o nome resolver **apenas** para IPs públicos (bloqueia localhost, redes privadas, link-local como 169.254.169.254 e a rede do Docker), verificada ao salvar **e** a cada uso. Groq tem URL fixa; o Ollama usa só o endereço do administrador. Limite conhecido: *DNS rebinding* entre a verificação e a conexão não é totalmente coberto. |

### Dados pessoais e o modelo de linguagem

**A preocupação.** Um assistente financeiro trabalha com dados sensíveis por natureza.
Com um provedor externo (Groq ou qualquer API compatível), tudo o que o modelo lê sai
do servidor e passa a seguir os termos de uso e de privacidade desse provedor:
retenção, registro, local de processamento. Isso inclui texto livre digitado pelo
usuário, que é onde dados pessoais aparecem sem ninguém planejar ("Pix para João, CPF
529.982.247-25", "cartão 4111 1111 1111 1111", um e-mail na fonte de um lançamento) e
também o que ele escreve na própria pergunta.

**O que sai do servidor, e o que não sai:**

| Vai para o provedor | Nunca vai |
|---|---|
| O prompt de sistema com o **primeiro nome** do usuário (só para a saudação) e a data de hoje | E-mail, sobrenome, foto, senha, papel, IDs do banco |
| A pergunta e as 8 últimas mensagens da conversa, **com identificadores mascarados** | Chaves de API (a do servidor e as dos usuários) |
| Os resultados das ferramentas desta pergunta: totais, datas, descrições e fontes, **com identificadores mascarados** | Dados de outros usuários (seção de isolamento acima) |
| | Os registros de auditoria e o rastro (ficam no servidor) |

**O que é feito para lidar com isso:**

1. **Minimização.** As ferramentas devolvem só o necessário para responder: totais e
   lançamentos agregados ou limitados (até 20), sem IDs, sem e-mail, sem dados da
   conta. Do usuário, o prompt leva apenas o primeiro nome. Resultados de turnos
   anteriores não são reenviados (o modelo consulta de novo se precisar).
2. **Mascaramento antes do envio** (`assistant/privacy.py`). A pergunta, o histórico e
   cada resultado de ferramenta passam por um filtro que troca identificadores por
   marcadores. O mascaramento é feito antes do corte de tamanho, para que um corte não
   deixe meio CPF para trás:

   | Dado | Como é reconhecido | Vira |
   |---|---|---|
   | CPF | `000.000.000-00`, ou 11 dígitos seguidos **com dígitos verificadores válidos** | `[CPF]` |
   | CNPJ | `00.000.000/0000-00`, ou 14 dígitos com verificadores válidos | `[CNPJ]` |
   | Cartão | 13 a 19 dígitos (com ou sem espaços/hífens) que passam no algoritmo de Luhn | `[cartão]` |
   | E-mail | `nome@dominio.tld` | `[e-mail]` |
   | Telefone | `(11) 91234-5678`, `+55 11 91234 5678`, `21 3456-7890` | `[telefone]` |
   | Chave Pix aleatória | UUID | `[chave Pix]` |

   Valores, datas, porcentagens e números comuns ("pedido 12345678901", que não é um
   CPF válido) passam intactos: os padrões dependem de formatos que dinheiro e datas não
   têm, e sequências soltas de dígitos só contam se os dígitos verificadores baterem.
   O modelo é avisado no prompt de que os marcadores existem, para não tentar
   reconstruí-los, e de que nunca deve pedir CPF, senha ou cartão.
3. **A cópia do usuário fica intacta.** A conversa salva, o botão "Raciocínio" e os
   logs de administração guardam o texto original; só a cópia enviada ao provedor é
   mascarada. O rastro registra quantos itens de cada tipo foram mascarados, na etapa
   de contexto e em cada consulta (no terminal aparece como "🔒 dados pessoais
   mascarados antes do envio ao modelo").
4. **Transparência para quem usa.** O "?" do aviso embaixo do chat e a tela Perfil →
   Assistente dizem que perguntas e dados consultados vão ao provedor, com esses
   identificadores mascarados, e pedem para não digitar senhas.
5. **Opção sem saída de dados.** Com o **Ollama** (opção B), o modelo roda no próprio
   servidor e nada sai da máquina. Cada usuário pode escolher isso no Perfil.
6. **Escolha consciente do provedor.** Quem usa a própria chave aceita os termos do
   próprio provedor; o padrão do servidor é decisão do administrador, que deve ler a
   política de dados do provedor antes de publicar com dados reais (no Groq:
   https://groq.com/privacy-policy).

**Riscos que continuam** (e por isso o item 5 existe):

- **Nomes de pessoas e lugares** não são reconhecíveis por padrão sem um modelo de NER;
  "Pix para João" vai como está. O mesmo vale para endereços e números de conta
  bancária sem formato fixo.
- **Valores e descrições** são o próprio conteúdo das respostas e precisam ir ao
  modelo; o mascaramento protege identificadores, não a vida financeira em si.
- **O primeiro nome** vai no prompt para a saudação; remover a linha de `prompt.py` é
  suficiente se isso não for desejado.
- O mascaramento é por padrões: formatos incomuns podem passar. Ele reduz o risco, não
  substitui a escolha do provedor.

A conta demo é fictícia: nenhum dado real está em jogo ao testar o projeto.

**Aviso permanente na tela**, embaixo do campo de digitação, em todas as variações (pop-up,
página e celular): *"O Assistente pode cometer imprecisões. Confira os valores nas telas
do sistema; decisões financeiras merecem análise humana. Conversas ficam salvas por 7
dias."*

---

## 9. Rastreio do pipeline (passo a passo)

Cada pergunta gera um **rastro** com todas as etapas do pipeline, cronometradas e
identificadas por um `trace_id` de 12 caracteres. Ele aparece em três lugares.

### Gerenciamento → Logs do Assistente (administradores)

O lugar para entender o fluxo. Por segurança, **cada administrador vê apenas os
próprios registros**: ser administrador não dá acesso às perguntas nem aos dados
financeiros de outros usuários. Leitura, busca e exclusão são sempre filtradas pelo
administrador logado; o registro de outra pessoa responde 404, como as conversas.

**Toda** pergunta fica registrada, respondida ou não
(provedor fora, limite, conversa de outra pessoa, erro inesperado no código), e também
cada **teste de conexão** do Perfil, completa:

- no topo, para o filtro atual: registros, falhas, tempo médio, o mais lento, consultas
  aos dados e tokens;
- filtros por status (sucesso/falha), tipo (pergunta/teste de conexão) e busca no texto da pergunta, resposta e erro, ou pelo código de rastreio;
- clicando numa linha: usuário, provedor e modelo, a pergunta, a resposta ou o erro e o
  passo a passo completo, incluindo o **prompt de sistema exato** e o **histórico**
  enviados, o **texto integral** de cada resposta do modelo, cada tentativa ao provedor
  com o **erro técnico** (ex.: `ConnectError: Name or service not known
  (http://ollama:11434/v1)`) e os **dados exatos** que cada consulta devolveu;
- "Copiar JSON completo" leva o registro inteiro para análise.

Fica na tabela `assistant_logs` por `ASSISTANT_LOG_DAYS` (30; `0` desliga), limpa a
cada gravação. O botão "Apagar logs" apaga só os registros do próprio administrador.

### Na conversa: botão "Raciocínio"

Embaixo de cada resposta (ele substitui os antigos "Fontes" e "Passo a passo"). Primeiro
mostra os **dados consultados**, em pílulas (ex.: "Simulação de compra de R$ 1500 em
5x"); depois o tempo total, as chamadas ao modelo, as consultas, os tokens e o
identificador (um clique copia), e a linha do tempo:

| Passo | O que mostra |
|---|---|
| **Pergunta recebida** | Modelo e de onde vem a configuração (sua chave ou padrão do servidor), modelo reserva, uso do limite por hora |
| **Contexto montado** | Quantas mensagens anteriores foram enviadas, tamanho do prompt de sistema, consultas disponíveis, teto de rodadas |
| **Chamada ao modelo #N** | Modelo que respondeu, tempo, tokens de entrada e saída, o que ele decidiu (quais consultas pediu e com quais argumentos, ou "escreveu a resposta"), cada tentativa ao provedor quando houve falha ou modelo reserva, e o **raciocínio do modelo** quando o provedor o devolve (o `gpt-oss` no Groq devolve, em inglês) |
| **Consulta: …** | Ferramenta, argumentos, tempo, erro (se houve) e os **dados exatos devolvidos ao modelo** (JSON formatado; avisa se foram cortados por tamanho) |
| **Verificação de valores** | Cada R$ da resposta com ✓ (encontrado nos dados) ou ⚠ (não encontrado) |
| **Aviso de cautela** | Se foi aplicado e por causa de qual consulta |
| **Resposta final** | Tamanho, número de fontes, e se foi a resposta padrão por o modelo não ter chegado a uma |

O rastro é gravado junto da mensagem (`chat_messages.trace`, JSON) e expira com ela
(7 dias). Como são os dados do próprio usuário no histórico dele, ele é completo, menos
o prompt de sistema (só na tela de administração). Os dados das consultas aparecem
exatamente como o modelo os recebeu (até 6 mil caracteres) e o raciocínio até 4 mil.

### No terminal do backend, ao vivo

Cada passo é impresso **no momento em que acontece**, em texto legível, com a hora e o
`trace_id` no começo de cada linha (perguntas simultâneas não se misturam). Antes de
cada chamada ao modelo aparece *"… aguardando o modelo"*, para saber o que está
acontecendo durante uma espera longa. No fim vem o resumo e onde o registro foi gravado:

```bash
docker compose logs -f backend --no-log-prefix          # acompanhar ao vivo
docker compose logs backend --no-log-prefix | grep 9ab35992edfa   # um atendimento
```

```text
═══ ASSISTENTE · pergunta · rastreio c727873b91cb ═══════════════════════════════
13:13:14 [c727873b91cb +4 ms] 1. Pergunta recebida
      usuário: Conta Demo (#1) · conversa #12
      modelo: groq · openai/gpt-oss-120b (padrão do servidor) · reserva: openai/gpt-oss-20b
      limite por hora: 0 de 30 perguntas já usadas
      pergunta: Qual é o meu saldo acumulado agora?
13:13:14 [c727873b91cb +22 ms] … aguardando o modelo openai/gpt-oss-120b (rodada 1, 2 mensagens, 3.201 caracteres)
13:13:15 [c727873b91cb +523 ms] 3. Chamada ao modelo #1 · 501 ms
      decisão: pediu 1 consulta → get_current_snapshot(sem argumentos)
      tokens: 1.534 de entrada + 33 de saída
13:13:15 [c727873b91cb +965 ms] 4. Consulta: Situação atual (cards do dashboard) · 442 ms · ✓ ok
      dados devolvidos ao modelo (300 caracteres):
        │ { "accumulated_balance_now": "39699.22", ... }
13:13:15 [c727873b91cb +1,5 s] 6. Verificação de valores
      ✓ R$ 39.699,22
═══ ✓ CONCLUÍDA em 1,5 s · 2 chamadas ao modelo · 1 consulta · 3.190 + 169 tokens ═══
13:13:16 [c727873b91cb +1,6 s] registrado em Gerenciamento → Logs do Assistente (registro #9)
```

Falhas terminam em `═══ ✗ FALHOU em ...`, com o motivo técnico de cada tentativa ao
provedor (ex.: `1) qwen3:8b → provedor inacessível em 12 ms - ConnectError: ...`).
Blocos longos (prompt, dados, raciocínio) são cortados em 4 mil caracteres no terminal;
a tela de logs tem tudo.

Para ferramentas de log, `ASSISTANT_TRACE_FORMAT=json` troca o texto por uma linha JSON
por passo, mais uma linha final com o status, a duração e os totais:

```json
{"event": "assistant.step", "trace_id": "9ab35992edfa", "user_id": 1, "conversation_id": 4,
 "step": {"n": 6, "kind": "tool", "title": "Consulta: Simulação de compra de R$ 1500 em 5x",
          "at_ms": 4562, "name": "simulate_purchase",
          "arguments": {"amount": 1500, "installments": 5, "monthly_interest_percent": 0},
          "ms": 466, "ok": true, "error": null, "result_chars": 1864, "truncated_for_model": false}}
{"event": "assistant.trace", "trace_id": "9ab35992edfa", "status": "ok", "duration_ms": 5387,
 "totals": {"llm_calls": 3, "provider_attempts": 3, "tool_calls": 2, "prompt_tokens": 5214, "completion_tokens": 353}}
```

Para seguir um atendimento específico:

```bash
docker compose logs backend --no-log-prefix | grep '"trace_id": "9ab35992edfa"'
docker compose logs -f backend --no-log-prefix | grep '"event": "assistant'   # ao vivo
```

**Falhas também são rastreadas.** Quando o provedor falha (limite, chave inválida,
tempo esgotado), nenhuma mensagem é gravada, mas o log registra o rastro até o passo
`error`, com cada tentativa ao provedor. A mensagem de erro mostrada ao usuário termina
com *"(rastreio 9ab35992edfa)"*, para encontrar o caso no log.

**Privacidade dos logs** (`ASSISTANT_TRACE_LOG`). Logs costumam durar mais que os 7
dias do histórico, por isso há três níveis:

| Nível | O que vai para o log |
|---|---|
| `summary` (padrão) | A forma do pipeline: passos, tempos, modelo, tentativas (com o erro técnico), tokens, consultas e argumentos, contagens da verificação. **Sem** prompt, histórico, pergunta, resposta, dados devolvidos, raciocínio do modelo ou valores verificados. |
| `full` | Tudo, para depuração. Inclui conteúdo financeiro do usuário. |
| `off` | Nada (o rastro continua disponível no botão "Raciocínio"). |

A chave de API nunca entra no rastro em nenhum nível. Esse nível vale só para a saída
padrão; a tela de administração guarda sempre o registro completo.

---

## 10. Histórico de conversas (7 dias)

- **Tabelas:** `chat_conversations` (dono, título, datas) e `chat_messages` (papel,
  texto, fontes, avisos, data). Ambas com `ON DELETE CASCADE` no banco.
- **O que é guardado:** só as mensagens visíveis (pergunta e resposta), com as fontes. A
  troca intermediária com as ferramentas não é guardada.
- **Retenção:** a cada requisição do assistente, mensagens com mais de
  `ASSISTANT_HISTORY_DAYS` (padrão 7) dias são apagadas, e conversas que ficam vazias
  também. Como a limpeza roda antes de qualquer leitura, uma mensagem expirada nunca é
  servida, sem precisar de agendador. As janelas usam o relógio do banco (o mesmo que
  carimba `created_at`).
- O usuário pode apagar uma conversa ou todo o histórico na página do assistente.
- A conversa atual do pop-up fica lembrada no navegador (`localStorage`, só o id); o
  conteúdo vive no servidor.

---

## 11. Interface

- **Pop-up em todas as telas:** botão flutuante no canto inferior direito, no estilo
  dos botões principais do sistema (pílula verde da marca, silhueta da tartaruga e
  "Assistente"; no celular, um círculo só com o ícone). Abre o chat logo acima, com
  "Nova conversa", **expandir** (de 400×580 para até 760×780), **abrir em página
  inteira** e fechar (no próprio botão, que vira "×", e com Esc). No celular, o pop-up
  ocupa a tela toda. Some na página do assistente, que mostra a mesma conversa. Os
  toasts sobem para ficar acima do botão, e as páginas ganham um espaço no fim para o
  último conteúdo não ficar embaixo dele.
- **Status sempre visível:** "● Ativo · modelo · sua chave / padrão do servidor" (ou "●
  Não configurado") no cabeçalho do pop-up, no topo da página do assistente, com atalho
  "Configurar", e no Perfil.
- **Perfil → Assistente Cartuga:** um menu retrátil, **fechado por padrão**, que mostra
  só o título e o status. Aberto, vira um cartão em dois passos. Primeiro o provedor, em
  cartões com ícone, descrição e selos ("Recomendado", "Gratuito", "Privado",
  "Avançado"). Depois os detalhes: o modelo numa lista com "Outro modelo…" para digitar,
  e a chave salva como "🔒 •••• 1234 · Trocar". No rodapé, o resultado do "Testar
  conexão" como selo verde ou vermelho e o aviso "Alterações não salvas" (o "Salvar
  configuração" só fica ativo quando há o que salvar). Ao salvar um **provedor externo**
  (Groq ou outra API) com provedor, chave ou URL novos, um **modal de confirmação**
  explica o que passa a sair do servidor (perguntas, mensagens recentes e os dados
  consultados) e o que continua protegido (chave criptografada, só o necessário por
  pergunta, somente leitura). Também lembra que vale a política do provedor e que o
  Ollama é a opção sem saída de dados.
- **Página `/assistant`:** conversas dos últimos 7 dias agrupadas em "Hoje", "Ontem" e
  "Últimos 7 dias", com o item ativo destacado (no celular, recolhível); a conversa
  fica numa coluna centralizada de leitura confortável.
- **Conversa vazia:** compacta, com "Como posso ajudar?" e sugestões em chips pequenos com
  o ícone do tipo (números, uso do sistema, finanças): 4 no pop-up, sem rolagem, e 8 na
  página. Um clique já envia a pergunta.
- **Cada resposta:** autor e horário, texto em Markdown simples num cartão (listas, negrito, código e tabelas, com
  valores alinhados à direita e rolagem horizontal em telas estreitas), avisos (de
  cautela nas simulações e de valores não verificados) no mesmo estilo dos avisos do
  sistema, e uma linha de ações discretas: **Raciocínio** (abre os dados consultados, em pílulas, seguidos
  do passo a passo da seção 9) e **Copiar**.
- **Esperando:** indicador "Consultando seus dados...".
- **Erro:** mensagem em português do provedor ou do limite, com "Tentar de novo"; a
  pergunta volta ao campo.
- **Assistente não configurado:** em vez das sugestões, o motivo (ex.: falta a chave) e
  um botão "Configurar no Perfil".
- **Campo de digitação:** botão de enviar dentro da mesma moldura, que ganha o destaque
  verde ao focar. Enter envia, Shift+Enter quebra linha; contador a partir de 800 dos
  1.000 caracteres permitidos. Logo abaixo, o aviso em **uma linha** ("Pode cometer
  imprecisões. Confira os valores.") e um "?" que abre o texto completo (análise humana,
  retenção de 7 dias); quando faltam 5 ou menos, as perguntas restantes na hora.
- **Lista de conversas:** rodapé com "Guardadas por 7 dias" e um botão discreto "Limpar"
  (lixeira, vermelho só ao passar o mouse); a lixeira de cada conversa aparece ao passar
  o mouse. As áreas de conversa usam uma barra de rolagem mais fina que a do resto do app.

---

## 12. API

Todas exigem login (qualquer perfil) e só acessam as conversas do próprio usuário.

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/assistant/status` | Se está ativo (e por que não), de onde vem a configuração (`user`/`system`/`none`), provedor, modelo, retenção, limite e quanto resta na hora (nulos com chave própria) |
| `GET` | `/assistant/settings` | Configuração do usuário (sem a chave, só "…1234"), o padrão do servidor e os provedores disponíveis |
| `PUT` | `/assistant/settings` | Salva `{provider, model, base_url, api_key}`; `api_key` omitida mantém a salva, `""` remove; `provider: "system"` volta ao padrão e apaga a chave |
| `POST` | `/assistant/settings/test` | Testa os valores enviados (salvos ou não) com uma chamada mínima |
| `GET` | `/assistant/conversations` | Conversas dos últimos 7 dias |
| `POST` | `/assistant/conversations` | Cria uma conversa |
| `GET` | `/assistant/conversations/{id}` | Conversa com as mensagens |
| `POST` | `/assistant/conversations/{id}/messages` | Envia uma pergunta `{content}`; devolve a resposta (com `sources` e `flags`) e a conversa |
| `DELETE` | `/assistant/conversations/{id}` | Apaga uma conversa |
| `DELETE` | `/assistant/conversations` | Apaga todo o histórico do usuário |

Erros: `422` (pergunta vazia ou longa demais), `429` (limite por hora), `503`
(assistente não configurado ou provedor indisponível; nada é gravado na conversa, mas o
log de administração registra a falha).

Só administradores (403 para os demais):

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/admin/assistant/logs` | Registros **do próprio administrador**, mais recentes primeiro, sem o rastro, mais estatísticas do filtro. Filtros: `status` (`ok`/`error`), `kind` (`chat`/`connection_test`), `search`, `limit` (até 100), `offset` |
| `GET` | `/admin/assistant/logs/{id}` | Um registro próprio com o rastro completo (de outra pessoa: 404) |
| `DELETE` | `/admin/assistant/logs` | Apaga os registros do próprio administrador |

---

## 13. Configuração

| Variável | Padrão | Descrição |
|---|---|---|
| `ASSISTANT_PROVIDER` | `groq` | `groq`, `ollama`, `openai_compatible` ou `disabled` |
| `ASSISTANT_API_KEY` | vazio | Chave do provedor (obrigatória no Groq; vazia = assistente avisa que falta configurar) |
| `ASSISTANT_MAX_MESSAGES_PER_HOUR` | `30` | Perguntas por usuário por hora |
| `ASSISTANT_HISTORY_DAYS` | `7` | Retenção do histórico |
| `ASSISTANT_MODEL` | por provedor | Groq: `openai/gpt-oss-120b`; Ollama: `qwen3:8b` |
| `ASSISTANT_FALLBACK_MODEL` | por provedor | Groq: `openai/gpt-oss-20b` |
| `ASSISTANT_BASE_URL` | por provedor | Groq: `https://api.groq.com/openai/v1`; `openai_compatible`: obrigatória |
| `ASSISTANT_OLLAMA_URL` | `http://ollama:11434/v1` | Onde está o Ollama, para o padrão do servidor e para quem escolher Ollama no Perfil. Ollama instalado no Windows/Mac: `http://host.docker.internal:11434/v1` |
| `ASSISTANT_TIMEOUT_SECONDS` | `60` | Tempo máximo por chamada ao modelo (Ollama sem GPU: 180-300). O teste de conexão usa 20 s, ou este valor no Ollama |
| `ASSISTANT_TRACE_LOG` | `summary` | Rastreio no terminal: `summary`, `full` ou `off` (seção 9) |
| `ASSISTANT_TRACE_FORMAT` | `text` | Como o rastreio aparece no terminal: `text` (legível, ao vivo) ou `json` (uma linha por passo) |
| `ASSISTANT_LOG_DAYS` | `30` | Retenção dos logs completos de Gerenciamento → Logs do Assistente; `0` = não guardar |
| `ASSISTANT_ENCRYPTION_KEY` | derivada do `JWT_SECRET` | Criptografa as chaves de API dos usuários; trocá-la exige que eles salvem a chave de novo |

Essas variáveis definem o **padrão do servidor**. Cada usuário pode sobrepor provedor,
modelo e chave no próprio Perfil (seção 2).

Depois de mudar o `.env`: `docker compose up -d backend`.

---

## 14. Testes

`backend/tests/test_assistant.py` usa um **modelo falso com roteiro**: ele devolve
chamadas de ferramenta e respostas pré-definidas e registra o que recebeu. Assim o
comportamento do sistema é testado de forma determinística, sem rede e sem chave:

- **Laço de ferramentas:** o resultado volta ao modelo; as fontes são gravadas; o prompt
  leva a data e o nome do usuário; turnos anteriores entram como contexto; argumentos
  inválidos voltam como erro; o laço para no teto de rodadas com uma resposta segura.
- **Avisos:** valor inventado é sinalizado; simulação recebe a marcação de cautela.
- **Falhas:** provedor falhando não grava nada (503); assistente sem configuração dá 503
  e um status explicativo.
- **Limites e histórico:** limite por hora (429); retenção de 7 dias apaga mensagens e
  conversas vazias e preserva as recentes; conversas privadas entre usuários (404);
  exclusão.
- **Ferramentas:** resumo mensal igual ao `/dashboard/month`; lançamentos de um dia;
  ranking; simulação sem juros, com juros (Price) e com meses negativos; isolamento
  entre usuários.
- **Verificação e busca:** formatos de valor aceitos pela verificação; busca no manual.
- **Rastreio:** a resposta traz todos os passos na ordem, com argumentos, dados
  devolvidos, raciocínio, tokens somados e verificação item a item; o rastro volta junto
  com a conversa; logs `summary` têm a forma do pipeline sem o conteúdo do usuário,
  `full` têm tudo e `off` nada; uma falha do provedor é rastreada no log até o passo
  `error`, e a mensagem de erro cita o identificador.
- **Configuração por usuário:** chave criptografada no banco e nunca devolvida; Groq
  exige chave; salvar sem chave mantém a salva; trocar de provedor descarta a chave;
  voltar ao padrão apaga; URLs `http`, `localhost`, privadas e de metadados recusadas;
  sem limite por hora com chave própria; chave ilegível após troca da criptografia
  explica o que fazer; teste de conexão usa os valores não salvos e mostra erros do
  provedor; configurações privadas entre usuários.
- **Importação do admin:** apaga o histórico do chat e as configurações do assistente
  (`test_import_export.py`).
- **Isolamento entre usuários** (`test_assistant_isolation.py`): todas as ferramentas
  executadas como outro usuário não devolvem nada do dono (e o teste falha se surgir
  ferramenta nova não coberta); um `user_id` injetado pelo modelo é ignorado e aparece
  no rastro; mensagem na conversa de outra pessoa dá 404 sem chamar o modelo; o prompt
  manda recusar dados de terceiros.
- **Logs de administração** (`test_assistant_logs.py`): pergunta respondida registrada
  com prompt, dados consultados e tempos; o usuário não vê o prompt de sistema; falhas do
  provedor com o erro técnico, erros inesperados e testes de conexão (sem a chave)
  também registrados; busca e filtros; só administradores, e cada um só os próprios
  (lista, busca, detalhe e exclusão); `ASSISTANT_LOG_DAYS=0` desliga. No terminal, o
  texto conta a história completa na ordem, `summary` oculta o conteúdo, falhas
  trazem o motivo técnico e testes de conexão aparecem sem a chave.
- **Ollama:** URL própria valendo para servidor e usuários; mensagens que dizem o que
  fazer quando o serviço não responde, o modelo não foi baixado, falta memória ou o
  tempo esgota; raciocínio desligado só no Ollama.

A interface foi validada no navegador com um servidor falso compatível com a API da
OpenAI, que exercita também o cliente HTTP real: pop-up, página, celular, tema escuro,
avisos e fontes.

**A qualidade das respostas do modelo real** (escolher a ferramenta certa e redigir bem)
depende do modelo e precisa ser avaliada com a chave configurada. Um roteiro sugerido
está na seção 16.

---

## 15. Limitações conhecidas

- **Granularidade mensal** (seção 5): não há saldo exato "num dia".
- **Contas que o modelo faz por conta própria** (ex.: somar dois valores de ferramentas
  diferentes) são sinalizadas pela verificação, mas não corrigidas automaticamente.
  Percentuais não são verificados, só valores em R$.
- **Exemplos ilustrativos** em respostas de finanças gerais ("se você ganha R$ 3.000...")
  também aparecem como "não encontrados nos seus dados". É o comportamento correto (não
  são seus dados), mas pode soar redundante.
- **Sem streaming:** a resposta aparece inteira ao final (com indicador de espera).
- **Qualidade depende do modelo:** modelos locais pequenos escolhem ferramentas pior.
- **Plano gratuito:** sob uso intenso simultâneo, o limite do provedor aparece como "espere
  um minuto".
- **Contexto curto:** só as 8 últimas mensagens visíveis vão ao modelo; em conversas
  longas ele "esquece" o começo (por desenho, para caber no plano gratuito).

---

## 16. Validação com o modelo real (roteiro sugerido)

Com a chave configurada, faça estas perguntas na conta demo e confira os números na tela
indicada:

| Pergunta | Conferir em |
|---|---|
| "Quanto gastei este mês?" | Dashboard → card "Total gasto" |
| "Quanto gastei no mês passado e com o quê?" | Clique no mês anterior no gráfico |
| "Qual foi minha compra mais alta nos últimos 6 meses?" | Saídas, ordenadas por valor |
| "Com o que mais gastei nos últimos 3 meses?" | Exportação CSV `lancamentos_por_mes` |
| "Quanto vou ter de saldo em dezembro?" | Gráfico "Saldo acumulado" |
| "Tenho dinheiro para comprar algo de R$ 2.000 à vista?" | Deve trazer o aviso de simulação |
| "Posso parcelar R$ 3.000 em 10x com juros de 2% ao mês?" | Parcela de R$ 333,98 e total de R$ 3.339,80 (Price); aviso de simulação |
| "Quanto tenho no Cofre?" | Tela do Cofre |
| "Qual a cotação do dólar?" | Card de câmbio do Dashboard |
| "Como funciona o planejado?" | Manual (seção Planejados) |
| "Me ajuda a escrever um código em Python?" | Deve recusar e redirecionar |
| "Devo investir em ações da empresa X?" | Não deve recomendar; explica conceitos e sugere um profissional |

---

## 17. Evolução possível

- **Streaming** das respostas (SSE).
- **Avaliação automática** (*evals*) com um conjunto de perguntas e respostas esperadas,
  rodando contra o modelo real.
- **Busca semântica** no manual (embeddings locais), se ele crescer muito.
- **Feedback** (👍/👎) por resposta para orientar ajustes no prompt.
- **Desempenho:** o rastro mostrou que `get_current_snapshot` leva cerca de 1,8 s
  (recalcula o dashboard inteiro); dá para otimizá-lo reaproveitando o cálculo.
- **Painel de rastros para o administrador**, se os logs ficarem insuficientes.
- **Ferramentas novas:** comparação entre meses, metas de economia, alertas de gastos
  acima da média.
