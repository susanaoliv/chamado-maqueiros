# Roteiro de teste com a Central de Telefonistas

**Objetivo:** validar, com quem vai usar no dia a dia, que o sistema substitui o livro sem
atrasar o atendimento. Fazer na **homologação**, com duas telas abertas lado a lado: uma logada
como `telefonista` e outra como um setor (ex.: `uti1`), de preferência no celular.

**Duração estimada:** 40 minutos. **Participantes:** 1 ou 2 telefonistas, 1 enfermeira de setor,
1 pessoa da gestão anotando.

Marque cada item: ✅ funcionou · ⚠ funcionou com dificuldade (anotar) · ❌ não funcionou.

---

## Parte 1 · Entrada (2 min)

| # | Passo | Resultado esperado | ✓ |
|---|---|---|---|
| 1.1 | Entrar com usuário `telefonista`, senha e **Seu nome** | Abre a tela Central; no topo aparece "Central de Telefonistas · (seu nome)" e o indicador "ao vivo" verde | |
| 1.2 | Clicar em **Maqueiros** | Lista com quem está de plantão primeiro (🟢/🔵/⛔…) e os fora da escala apagados com botão **Habilitar** | |

## Parte 2 · Chamado comum, cronometrado (10 min)

A gestão cronometra do clique em **+ NOVO CHAMADO** até a mensagem de confirmação. **Meta: < 30 s.**

| # | Passo | Resultado esperado | ✓ | Tempo |
|---|---|---|---|---|
| 2.1 | **+ NOVO CHAMADO** → origem **PS** → destino **Tomografia** → paciente → **REGISTRAR CHAMADO** (sem mexer no resto) | Mensagem "Chamado CH-2026-… registrado às HH:MM"; card aparece na fila com 🟡 Aguardando maqueiro | | |
| 2.2 | Repetir com origem **São José** sem leito | Campo do leito mostra **OBRIGATÓRIO** e o sistema não deixa registrar sem ele | | |
| 2.3 | Preencher o leito e registrar | Registra normalmente | | |
| 2.4 | Tipo **Alta** | Campo de destino some; registra sem destino | | |
| 2.5 | Tipo **Óbito** | Destino fica travado em **Necrotério** | | |
| 2.6 | Tipo **Transferência interna** sem leito de destino | Não registra; pede os dois leitos | | |
| 2.7 | Chamado **Urgente** com isolamento = Sim e oxigênio = Sim, origem **Rádio – CC** | Card sobe para o topo da fila, com ⚠ ISOLAMENTO e ⚠ OXIGÊNIO em destaque | | |

## Parte 3 · Acionar, acompanhar e encerrar (8 min)

| # | Passo | Resultado esperado | ✓ |
|---|---|---|---|
| 3.1 | No card do 2.1, abrir a lista de maqueiros | Só aparecem maqueiros de plantão agora (livre/ocupado indicado) | |
| 3.2 | Escolher um e clicar **Informar maqueiro** | Status 🔵 Maqueiro acionado e "acionado às HH:MM (N min após abertura)" | |
| 3.3 | Mudar status para **Em atendimento** | 🟣 Em atendimento | |
| 3.4 | **ENCERRAR** | Mensagem "encerrado às HH:MM · N min"; vai para "Concluídos e cancelados hoje" | |
| 3.5 | Tentar **ENCERRAR** um chamado sem maqueiro | Botão desabilitado | |

## Parte 4 · Atraso (5 min, pode ser feito ao final do teste)

| # | Passo | Resultado esperado | ✓ |
|---|---|---|---|
| 4.1 | Deixar um chamado aberto mais de 20 min (SLA) | Card fica com borda vermelha e 🔴 Atrasado; aparece no filtro "Atrasados" | |
| 4.2 | Acionar e **ENCERRAR** | Abre "Qual foi o motivo do atraso?"; não encerra sem escolher | |
| 4.3 | Escolher **Outro** sem descrever | Pede a descrição | |

## Parte 5 · Cancelamento (3 min)

| # | Passo | Resultado esperado | ✓ |
|---|---|---|---|
| 5.1 | **Cancelar chamado** sem escrever nada | Botão de confirmar fica desabilitado | |
| 5.2 | Escrever "Setor desistiu do transporte" e confirmar | Card vai para os cancelados do dia com a justificativa e quem cancelou | |

## Parte 6 · Maqueiros (5 min)

| # | Passo | Resultado esperado | ✓ |
|---|---|---|---|
| 6.1 | Em **Maqueiros**, marcar alguém **Indisponível** sem justificativa | Não permite | |
| 6.2 | Com justificativa (ex.: Atestado) | Fica ⛔ Indisponível e some da lista de acionamento na Central | |
| 6.3 | **Disponibilizar** | Volta a aparecer para acionamento | |
| 6.4 | **Habilitar** alguém fora da escala (Troca de plantão, observação "substitui X") | Passa a 🟢 Disponível e aparece na Central; **Desabilitar** desfaz | |
| 6.5 | **Intervalo** e **Voltou do intervalo** | Sai e volta da lista de acionamento | |

## Parte 7 · Setor de enfermagem em tempo real (7 min)

| # | Passo | Resultado esperado | ✓ |
|---|---|---|---|
| 7.1 | No celular, entrar como `uti1` | Tela "Meus chamados"; só aparecem chamados da UTI 1 | |
| 7.2 | **+ NOVO CHAMADO** sem nome do solicitante | Não registra; pede quem está solicitando | |
| 7.3 | Registrar com leito e solicitante | Aparece "Aguardando a Central acionar"; **na tela da Central o chamado aparece sozinho em até 2 s, sem recarregar** | |
| 7.4 | Na Central, informar o maqueiro | No celular aparece "Maqueiro X acionado às HH:MM" sem recarregar | |
| 7.5 | No celular, **Cancelar chamado** com justificativa "Paciente não estava pronto" | Na Central o card vai para cancelados com a justificativa | |
| 7.6 | Enquanto a Central digita um novo chamado, o setor abre outro | O formulário da Central **não perde** o que estava sendo digitado | |

---

## Perguntas para a equipe (anotar as respostas)

1. Algum campo atrapalha ou poderia vir preenchido?
2. A ordem dos campos segue a ordem em que a informação chega no telefone?
3. Os nomes dos setores e maqueiros estão como vocês falam no dia a dia?
4. Em que situação vocês ainda usariam o livro?
5. O computador da Central e o celular dos setores ficaram confortáveis (tamanho de letra, botões)?

**Registro:** data ____/____/______ · participantes ______________________ · tempo médio de registro ______ s
