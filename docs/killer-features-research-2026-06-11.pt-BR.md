# Pesquisa de killer features — reduzir gastos, melhorar qualidade

*Relatório de pesquisa profunda, 11/06/2026. Público: o time fundador do
Foglamp decidindo os próximos dois trimestres.*

**Método.** Uma rodada de deep research multiagente: 6 ângulos de busca, 27
fontes coletadas (papers do arXiv, changelogs de fornecedores, páginas de
preço, threads do HN), 118 afirmações falseáveis extraídas, as 25 principais
submetidas a verificação adversarial com 3 votos. **Apenas 7 afirmações
sobreviveram.** Essa taxa de descarte é um achado por si só: a maioria dos
números de manchete nesse espaço ("98% de redução de custo" do FrugalGPT,
"compressão de 20x" do LLMLingua, "68% de hit rate" do cache semântico) não
resistiu ao escrutínio — veja [Em que NÃO apostar](#em-que-não-apostar).
Tudo abaixo cita apenas afirmações verificadas, com o nível de confiança
indicado.

---

## TL;DR

O mercado está visivelmente migrando de *dashboards passivos* para
*controle ativo de custo/qualidade em loop fechado* — mas **ninguém ainda
entregou o loop completo de forma crível**. Os gateways (o Portkey é o mais
avançado) estão adicionando enforcement, mas esse enforcement é **cego à
qualidade**: age sobre regras de metadados e contagens de tokens, não sobre
o agente estar em loop, alucinando ou queimando tokens de raciocínio sem
produzir nada. Uma plataforma de observabilidade enxerga exatamente o sinal
que falta aos gateways. O espaço em branco defensável para o Foglamp é a
**ação informada por qualidade**, alimentada por dados que já coletamos e
os concorrentes não: custos por dimensão incluindo tokens de raciocínio,
amostras de TPS intra-stream, catálogos de ferramentas por span e a
estrutura de execuções de workflow.

As três apostas, em ordem:

1. **Autopilot de gasto com raciocínio** — detectar overthinking por span,
   recomendar budgets de thinking por agente, aplicá-los via SDK.
2. **Autopilot de prompt** — otimização reflexiva de prompts no estilo
   GEPA, semeada por traces de falha de produção, validada contra evals
   derivados de traces e entregue como um diff revisável.
3. **Enforcement informado por qualidade** — fechar o loop
   observar→agir que os gateways não conseguem: circuit breakers para loops
   descontrolados e downgrades de modelo condicionados a evals, servidos
   pela camada de control plane que já está no roadmap.

---

## Estado do mercado (verificado)

- **Os gateways estão migrando de observar para impor.** O changelog de
  abril de 2026 do Portkey traz janelas semanais de teto de gasto (`rpw`) e
  **Model Rules** que rejeitam requisições no gateway, antes de o tráfego
  chegar ao modelo, com base em metadados da requisição
  ([changelog do Portkey, abr 2026][portkey]; Model Rules verificado 3-0,
  tetos semanais 2-1). Ambos são restritos ao tier Enterprise — evidência de
  que *enforcement* é o que empresas pagam, consistente com a nossa própria
  divisão visibilidade-grátis / governança-paga.
- **Mas o enforcement dos gateways é cego à qualidade.** Model Rules agem
  sobre matching de chave-valor de metadados e cotas. Um gateway não
  consegue perceber que um agente está em um loop de tool calls, que seu
  trace de raciocínio ficou redundante 2.000 tokens atrás, ou que ele passa
  nos evals em um modelo mais barato. Esse sinal vive no trace — o nosso
  lado da cerca.
- **Tokens de raciocínio são um direcionador de custo primário e
  crescente** para workloads em modelos da classe o3 / Claude extended
  thinking / DeepSeek-R1 ([Han et al., ACL Findings 2025][token-budget];
  verificado 2-1, confiança alta). O Foglamp já precifica tokens de
  raciocínio como dimensão separada no ingest; Langfuse, Braintrust e
  HoneyHive não os separam (segundo docs públicos na data da pesquisa).
- **Sensibilidade a tempo.** O mercado de enforcement em gateway está se
  movendo rápido — LiteLLM, OpenRouter e Vercel AI Gateway podem lançar
  enforcement estilo cota em um ou dois trimestres. O espaço em branco de
  *cota* vai se fechar; o de *qualidade* é o durável, porque exige dados de
  trace que os gateways não têm.

---

## Aposta 1 — Autopilot de gasto com raciocínio

**O quê:** uma visão de "desperdício de raciocínio" por agente → budgets de
thinking recomendados → caps opcionais aplicados pelo SDK.

1. **Detectar:** sinalizar spans em que a saída de raciocínio ficou
   redundante. A pesquisa mostra que a transição produtivo→redundante em um
   stream de raciocínio é detectável, e truncar nesse ponto rende **24–27%
   de redução de tokens sem perda de acurácia** (Qwen3-8B: 4.262→3.107
   tokens com acurácia inalterada; DeepSeek-R1-Distill-32B: 3.062→2.319)
   ([ROM, arXiv:2603.22016][rom]; verificado 3-0, mas é um preprint não
   revisado e só com benchmarks de matemática — tratar como direcional).
2. **Recomendar:** sugestões de budget de thinking por agente a partir das
   distribuições observadas de tokens de raciocínio. Evidência revisada por
   pares: budgets dinâmicos por query atingem **~67% de redução de tokens
   de raciocínio com queda de acurácia <3%** e superam caps estáticos
   ([Han et al., ACL Findings 2025][token-budget]; verificado 2-1).
3. **Impor:** o SDK aplica o budget (`thinkingBudget`/`maxReasoningTokens`
   por provider) via o control plane de managed models que já está no
   roadmap — a recomendação fica a um clique da ação.

**Por que nós:** a detecção exige custos de tokens de raciocínio por span
(calculamos no ingest) e amostras de chunks intra-stream (já capturamos TPS
ao longo do tempo dentro de um stream). Nenhum concorrente OSS de
observabilidade expõe qualquer um dos dois sinais segundo docs públicos —
é o nosso ativo de dados mais defensável. **Viabilidade:** alta; a detecção
é uma query no ClickHouse sobre dados que já temos, e o enforcement pega
carona no control plane planejado. **Ressalva:** o valor se concentra em
workloads com modelos de raciocínio; uma questão em aberto é qual fração
dos usuários do Vercel AI SDK os utiliza (crescendo rápido, mas não
medido).

## Aposta 2 — Autopilot de prompt (otimizar a partir de falhas de produção)

**O quê:** pegar os traces de falha de um agente, rodar um otimizador de
prompts reflexivo no estilo GEPA contra um eval set derivado dos próprios
dados de produção dele (o item save-trace-as-eval do roadmap é o
pré-requisito), e apresentar o prompt otimizado como um diff revisável com
scores de eval antes/depois — aplicar via managed prompts ou exportar como
PR.

**Evidência (o resultado verificado mais forte desta pesquisa):** a
evolução reflexiva de prompts do GEPA **supera o MIPROv2 — o otimizador
líder — em mais de 10%** (ex.: +12% no AIME-2025; verificado 3-0) e supera
o GRPO baseado em RL em 6% na média / até 20%, **usando até 35x menos
rollouts** (verificado 2-1) ([GEPA, arXiv:2507.19457, oral no ICLR
2026][gepa]). A propriedade dos 35x menos rollouts é o que torna isso
economicamente viável como feature de produto: a rodada de otimização em si
é barata. A Decagon publicou sobre rodar GEPA em produção para agentes de
suporte — uma validação comercial inicial.

**Por que nós:** otimização no estilo GEPA tem como gargalo (a) exemplos de
falha realistas e (b) um eval confiável — exatamente o que uma plataforma
de observabilidade com traces indexados por agente/workflow/sessão, mais os
eval datasets planejados, produz como subproduto. Langfuse/Braintrust têm
playgrounds e experiments; nenhum entrega um *otimizador* semeado por
traces que feche o loop. **Viabilidade:** média — precisa do item de eval
datasets do roadmap primeiro, mais um budget de inferência por rodada (uma
feature paga/Foggy natural). **Risco:** é uma questão em aberto se os times
*agem* sobre sugestões automáticas de prompt; o enquadramento de diff
revisável + score de eval (como um bot de CI, não uma caixa-preta) é a
mitigação.

## Aposta 3 — Enforcement informado por qualidade (o loop que os gateways não fecham)

**O quê:** usar sinais de qualidade do trace para *agir*, não só alertar:

- **Circuit breaker de descontrole:** detectar loops de tool calls /
  tempestades de retry / queima de tokens dentro de uma sessão ao vivo
  (estrutura de workflow runs + a base do live tail) e permitir que o SDK
  interrompa ou degrade a execução em pleno voo. Threads de praticantes
  citam consistentemente loops descontrolados de agentes como o modo de
  falha de custo mais assustador — é um produto de seguro: "o Foglamp se
  paga na primeira vez que mata um loop".
- **Downgrades de modelo condicionados a evals:** a versão ambiciosa do
  item de model recommendations do roadmap — não apenas dizer "o agente X
  passa em um modelo mais barato", mas oferecer um rollout com guarda-corpo
  (espelhar N% do tráfego no modelo mais barato, promover automaticamente
  se a taxa de aprovação nos evals se mantiver, reverter automaticamente
  caso contrário) através do control plane.

**Por que nós:** o enforcement classe-Portkey prova que empresas pagam por
controle, mas ele é baseado em metadados/cotas ([changelog do
Portkey][portkey]). Enforcement informado por *o que de fato aconteceu no
trace* exige os nossos dados. **Viabilidade:** o circuit breaker é de curto
prazo (a detecção é barata no nosso schema; o SDK precisa de um canal de
kill switch — o mesmo caminho de runtime config sensível a latência dos
managed prompts, então a camada de cache é compartilhada). Rollouts com
guarda-corpo ficam um trimestre ou mais atrás, dependentes da maquinaria de
evals + A/B. **Cautela:** qualquer coisa que bloqueie ou redirecione
tráfego de produção precisa de defaults conservadores — recomendar
primeiro, impor como opt-in.

---

## Candidatas secundárias (valem ter, não são game changers)

- **Página de analytics de tokens de raciocínio** — mesmo sem enforcement,
  uma visão de "fatia do gasto com raciocínio, tendência e estimativa de
  desperdício por agente" é um subconjunto barato e imediatamente
  diferenciado da Aposta 1.
- **Conselheiro de layout de cache** — a versão ambiciosa do item de
  cache-savings do roadmap: não apenas reportar hit rate, mas diffar
  prompts consecutivos por agente para mostrar *onde* o prefixo diverge e
  que reordenação o tornaria cacheável. (Nenhum número de economia
  verificado sobreviveu para isso; o mecanismo é documentado pelos
  providers, não respaldado por pesquisa.)
- **Detalhamento "o que este token comprou" por span** — somos os únicos
  precificando por dimensão; expor isso como drill-down de primeira classe
  (custo de input vs cached vs raciocínio vs output empilhado por
  span/agente/semana).

## Em que NÃO apostar

A verificação adversarial rejeitou estas afirmações populares — não
construa marketing nem features sobre elas:

| Afirmação rejeitada | Votação |
| --- | --- |
| Cascatas FrugalGPT: "98% de redução de custo igualando o GPT-4" | 0-3 / 1-2 |
| LLMLingua: "compressão de 20x, speedup de 1,7–5,7x, perda mínima" | 1-2 / 0-3 |
| Cache semântico: "hit rates de 61–69%" | 0-3 |
| Papers de roteadores: "35% mais barato, degradação <2%" (CARROT/vLLM-SR), MixLLM "97% da qualidade a 24% do custo", R2-Reasoner "84% de economia" | 0-3 / 1-2 |
| DSPy "dobrou o recall de detecção de alucinação / acurácia de jailbreak de 59%→93%" (preprint único) | 0-3 |
| ROM "46,5% de redução de latência" (a afirmação de redução de tokens sobreviveu; a de latência não) | 0-3 |

Padrão: **cache semântico, compressão de prompt e roteamento em cascata** —
as três alavancas de custo mais badaladas — todas se apoiam em números que
não se verificaram. Isso não significa que nunca funcionam; significa que
os números de manchete vêm de benchmarks estreitos que não transferem, e
não deveriam ancorar nosso roadmap nem nosso copy. *Recomendações* de
modelo fundamentadas nos evals do próprio cliente (nosso item de roadmap)
contornam isso: a evidência são os dados do próprio cliente.

## Questões em aberto

1. Algum concorrente captura timing em nível de chunk intra-stream
   suficiente para detecção de overthinking estilo ROM, ou o nosso TPS
   sampling é genuinamente único? (Docs públicos dizem que é único; não
   auditado contra os internals.)
2. Times de engenharia agem sobre sugestões automáticas de prompt, ou o
   loop fechado precisa de um modelo de entrega gerenciado/API-first para
   ter adoção?
3. Existe evidência de demanda especificamente por roteamento *informado
   por qualidade* versus o roteamento por metadados que o Portkey entrega?
   (Vale testar com design partners antes de construir a maquinaria de
   rollout com guarda-corpo.)
4. Qual fração dos workloads de produção do Vercel AI SDK usa modelos de
   raciocínio? Dimensiona o impacto de curto prazo da Aposta 1.

## Ressalvas

- As afirmações sobre gaps dos concorrentes vêm de docs/changelogs públicos
  até junho de 2026, não de auditorias de produto; capacidades podem ter
  sido lançadas desde então.
- O ROM é um preprint não revisado, só com benchmarks de matemática e sem
  replicação independente — direcional, não comprovado em produção.
- A comparação GEPA vs GRPO usou um baseline de RL restringido; cite o GEPA
  como "otimização de prompt estado-da-arte", não como "prompting supera
  fine-tuning".

## Fontes

Os achados verificados se apoiam em quatro fontes primárias; a varredura
mais ampla cobriu 27 (changelogs de fornecedores, blogs da
Braintrust/Arize/Evidently/Comet, threads do HN, outros papers do arXiv —
a maioria contribuiu contexto ou foi refutada).

- [GEPA: Reflective Prompt Evolution Can Outperform Reinforcement Learning — arXiv:2507.19457 (oral no ICLR 2026)][gepa]
- [Token-Budget-Aware LLM Reasoning — arXiv:2412.18547 (ACL Findings 2025)][token-budget]
- [ROM: rambling-oriented monitoring para streams de raciocínio — arXiv:2603.22016 (preprint)][rom]
- [Changelog do Portkey, abril de 2026 — rate limits semanais, Model Rules][portkey]

[gepa]: https://arxiv.org/pdf/2507.19457
[token-budget]: https://arxiv.org/pdf/2412.18547
[rom]: https://arxiv.org/abs/2603.22016
[portkey]: https://portkey.ai/docs/changelog/2026/april
