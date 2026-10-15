# Roteiro de vídeo: Chamados de Maqueiros para a Enfermagem

**Casa de Saúde São Lucas · Treinamento do perfil Enfermagem (setores)**

| | |
|---|---|
| **Público** | Enfermeiros e técnicos de enfermagem dos setores |
| **Duração estimada** | 5 a 6 minutos |
| **Formato** | Gravação da tela do celular (principal) com narração em off. Uma cena curta no computador. |
| **Objetivo** | Ao final, a pessoa sabe entrar no sistema, abrir um chamado completo, acompanhar o status e cancelar quando necessário. |
| **Imagens de referência** | Pasta `docs/roteiro-video-enfermagem/` (uma imagem por cena, com dados fictícios). |

---

## Antes de gravar (checklist)

1. **Login de teste do setor.** Use um setor real (ex.: `uti1`, senha `uti1@2026`) ou peça à gestão um login só para o treinamento.
2. **Paciente fictício.** Grave sempre com nome inventado (ex.: "José da Silva"). Nunca mostre paciente real no vídeo (LGPD).
3. **Combine com a Central.** Avise a telefonista que vai abrir um chamado de teste, para ela acionar um maqueiro durante a gravação (cena 7) e você conseguir mostrar o status mudando.
4. **No final, cancele o chamado de teste** com a justificativa "Chamado de treinamento", para não entrar nos indicadores como transporte real.
5. **Celular:** modo não perturbe ligado, brilho alto, bateria acima de 50%, gravação de tela nativa do aparelho.
6. **Áudio:** grave a narração em lugar silencioso, com fone com microfone. Se preferir, grave a tela primeiro e a narração depois, lendo este roteiro.

---

## CENA 1 · Abertura (0:00 a 0:20)

**Na tela:** logo da Casa de Saúde São Lucas (tela de login, imagem `01-login.png`).

**Texto na tela:** *Chamados de Maqueiros · Como abrir e acompanhar um chamado pelo setor*

**Narração:**
> Olá! Neste vídeo você vai aprender a pedir um maqueiro pelo sistema de Chamados de Maqueiros da Casa de Saúde São Lucas. Com ele, o seu setor abre o chamado direto pelo celular ou computador, sem precisar ligar para a Central, e acompanha em tempo real quando o maqueiro foi acionado e quando o transporte foi concluído.

---

## CENA 2 · Entrar no sistema (0:20 a 0:55)

**Na tela:** tela de login (`01-login.png`). Digitar devagar.

**Ação na tela:**
1. Mostrar o endereço **chamado-maqueiros.vercel.app** no navegador.
2. Campo **Usuário**: digitar `uti1`.
3. Campo **Senha**: digitar a senha (os pontos aparecem).
4. Campo **Seu nome**: digitar "Enf. Ana".
5. Tocar em **Entrar**.

**Texto na tela:** *Usuário = nome do setor · Senha padrão = setor@2026*

**Narração:**
> Acesse chamado-maqueiros.vercel.app. Cada setor tem o seu usuário, que é o nome do setor sem acento e sem espaço, por exemplo uti1, saojose ou ps. A senha inicial segue o padrão: o nome do usuário, arroba, dois mil e vinte e seis. No campo "Seu nome", coloque o seu nome. Ele fica registrado em cada chamado que você abrir. Depois, toque em Entrar.

---

## CENA 3 · Instalar como app (0:55 a 1:20)

**Na tela:** botão **Instalar app** embaixo do login (`01-login.png`) e o menu (`08-menu.png`).

**Ação na tela:** tocar em **Instalar app** e confirmar. Mostrar o ícone do São Lucas na tela inicial do celular.

**Texto na tela:** *Android: Instalar app · iPhone: Compartilhar > Adicionar à Tela de Início*

**Narração:**
> Para facilitar, instale o sistema como um aplicativo. No Android, toque em "Instalar app". No iPhone, abra pelo Safari, toque em Compartilhar e depois em "Adicionar à Tela de Início". Pronto: o ícone do São Lucas fica na tela do celular, e não precisa baixar nada de loja.

---

## CENA 4 · Conhecendo a tela do setor (1:20 a 1:50)

**Na tela:** tela **Meus chamados** (`02-meus-chamados.png`).

**Ação na tela:** passar o dedo devagar mostrando, de cima para baixo: o botão **+ NOVO CHAMADO**, a lista **Em aberto** e a lista **Histórico de hoje**. Mostrar a barra de baixo (**Meus chamados** e **Menu**).

**Narração:**
> Esta é a tela do seu setor. No topo, o botão grande "Novo chamado". Logo abaixo, os chamados em aberto do setor, com o status de cada um. E mais embaixo, o histórico do dia, com o que já foi concluído ou cancelado. Você só vê os chamados do seu próprio setor.

---

## CENA 5 · Abrindo um chamado (1:50 a 3:20)

**Na tela:** formulário **Novo chamado** (`03-novo-vazio.png`, depois `05-novo-preenchido.png` e `06-novo-fim.png`).

**Ação na tela:** tocar em **+ NOVO CHAMADO** e preencher, campo por campo:

| Campo | Exemplo para o vídeo |
|---|---|
| Tipo de chamado | Exame |
| Setor de origem | já vem preenchido com o seu setor (UTI 1) |
| Nº do leito de origem | 04 |
| Setor de destino | Tomografia |
| Nome do paciente / nº do atendimento | José da Silva |
| Nome de quem está solicitando | Enf. Ana |
| Recurso necessário | Maca |
| Prioridade | Prioritário |
| Necessita de isolamento? | Não |
| Necessita de oxigênio? | Não |
| Observação | (deixar em branco ou "Paciente com acesso venoso") |

Depois tocar em **REGISTRAR CHAMADO**.

**Narração:**
> Para pedir um maqueiro, toque em "Novo chamado". A data e a hora de abertura são marcadas automaticamente pelo sistema.
>
> Escolha o tipo de chamado: exame, alta, óbito, transferência interna, admissão, centro cirúrgico, UTI, hemodinâmica ou outro.
>
> O setor de origem já vem preenchido com o seu setor. Informe o número do leito do paciente.
>
> Escolha o setor de destino. Se for transferência interna, informe também o leito de destino.
>
> Preencha o nome do paciente ou o número do atendimento, e o seu nome como solicitante. Esses campos são obrigatórios.
>
> Escolha o recurso: maca, cadeira de rodas, cama, só acompanhamento ou outro. E a prioridade: rotina, prioritário ou urgente.
>
> Atenção a estes dois campos: isolamento e oxigênio. Marque "Sim" sempre que o paciente precisar. Essa informação aparece em destaque para a Central e para o maqueiro, para que ele vá preparado.
>
> Se precisar, escreva uma observação. Confira tudo e toque em "Registrar chamado".

**Texto na tela (aparecer junto da fala do isolamento e oxigênio):** *⚠ Isolamento e oxigênio: marque SIM sempre que precisar*

---

## CENA 6 · Campos obrigatórios (3:20 a 3:45)

**Na tela:** formulário com os avisos em vermelho (`04-erros.png`).

**Ação na tela:** abrir um novo chamado, apagar o nome do paciente e tocar em **Registrar chamado** para mostrar as mensagens em vermelho. Depois fechar com o **X**.

**Narração:**
> Se faltar alguma informação obrigatória, o sistema não deixa enviar e mostra em vermelho o que precisa ser preenchido. Os campos marcados como "obrigatório" sempre precisam de resposta. Fique atenta a algumas regras:
> na alta, não é preciso informar destino;
> no óbito, o destino é sempre o necrotério;
> na transferência interna, os leitos de origem e de destino são obrigatórios.

---

## CENA 7 · Acompanhando o chamado (3:45 a 4:45)

**Na tela:** lista **Em aberto** com o card do chamado (`02-meus-chamados.png`). Se a Central estiver combinada, mostrar o status mudando ao vivo.

**Ação na tela:** dar zoom no card e mostrar: número do chamado, status colorido, horário e tempo decorrido, nome do maqueiro.

**Texto na tela (lista de status, um por vez):**
- 🟡 Aguardando maqueiro
- 🔵 Maqueiro acionado
- 🟣 Em atendimento
- 🟠 Aguardando enfermagem
- 🟤 Aguardando maca
- 🟢 Concluído
- 🔴 Atrasado

**Narração:**
> Assim que você registra, o chamado aparece em "Em aberto" com um número, por exemplo CH-2026-000151. Você não precisa atualizar a página: o status muda sozinho.
>
> Amarelo, aguardando maqueiro: a Central ainda vai direcionar.
> Azul, maqueiro acionado: o nome do maqueiro aparece no card, com o horário.
> Roxo, em atendimento: o transporte começou.
> Laranja, aguardando enfermagem: o maqueiro chegou e está esperando a equipe liberar o paciente. Se aparecer esse status, priorize, porque o tempo está correndo.
> Marrom, aguardando maca.
> Verde, concluído: o chamado vai para o histórico do dia.
>
> E se o chamado passar do tempo combinado, hoje 20 minutos, aparece a etiqueta vermelha "Atrasado".

---

## CENA 8 · Cancelando um chamado (4:45 a 5:20)

**Na tela:** botão **Cancelar chamado** no card e a janela de cancelamento (`07-cancelar.png`).

**Ação na tela:** tocar em **Cancelar chamado**, escrever a justificativa "Chamado de treinamento" e tocar em **Confirmar cancelamento**.

**Narração:**
> Se o transporte não for mais necessário, cancele o chamado para liberar o maqueiro. Toque em "Cancelar chamado" e escreva o motivo, por exemplo: paciente não estava pronto ou exame remarcado. A justificativa é obrigatória. O chamado não é apagado: fica registrado como cancelado, com o motivo e o seu nome.

---

## CENA 9 · Menu, senha e sair (5:20 a 5:45)

**Na tela:** menu do celular (`08-menu.png`).

**Ação na tela:** tocar em **Menu** e mostrar **Instalar app**, **Minha senha** e **Sair do sistema**.

**Narração:**
> No Menu, você encontra a opção "Minha senha", para trocar a senha do setor se a gestão orientar, e "Sair do sistema". Em computador compartilhado, sempre saia ao terminar o plantão.

---

## CENA 10 · Encerramento (5:45 a 6:00)

**Na tela:** logo da Casa de Saúde São Lucas.

**Texto na tela:** *Dúvidas? Fale com a Central ou com a Gestão NIR.*

**Narração:**
> Pronto! Com o chamado bem preenchido, a Central direciona o maqueiro mais rápido e o paciente chega no horário. Ficou alguma dúvida? Procure a Central ou a Gestão NIR. Obrigado!

---

## Resumo para legenda ou cartaz (opcional)

1. Acesse **chamado-maqueiros.vercel.app** e entre com o usuário do setor e o seu nome.
2. Toque em **+ NOVO CHAMADO**.
3. Preencha tipo, leito, destino, **paciente**, **solicitante**, recurso e prioridade.
4. Marque **isolamento** e **oxigênio** quando precisar.
5. Toque em **REGISTRAR CHAMADO** e acompanhe o status em tempo real.
6. Não precisa mais? **Cancelar chamado**, com o motivo.
