# Roteiro de teste do app do maqueiro

**Objetivo:** validar com 2 ou 3 maqueiros, a Central e um setor que a distribuição automática funciona
na prática antes de usar no plantão. Fazer dentro do hospital, na homologação.

**Antes de começar (gestão NIR):**
1. Configurações → App dos maqueiros: estando no hospital, toque em **Usar minha localização atual**,
   confira o ponto no mapa e **salve**. Confira também os feriados de Natal/RN.
2. Os maqueiros do teste se cadastram como **Maqueiro** (escolhendo o próprio nome) e a gestão aprova em
   Configurações → Acessos.
3. Confirme na Escala (ou habilite na tela Maqueiros) que eles estão de plantão no horário do teste.

Marque: ✅ funcionou · ⚠ com dificuldade (anotar) · ❌ não funcionou.

| # | Passo | Resultado esperado | ✓ |
|---|---|---|---|
| 1 | No celular do maqueiro, abrir o site, entrar e usar **Adicionar à tela inicial** | Ícone "Maqueiros" na tela inicial; abre em tela cheia | |
| 2 | **Iniciar jornada** fora do hospital (ou com GPS desligado) | Não inicia e explica o motivo | |
| 3 | **Iniciar jornada** dentro do hospital | "Livre · aguardando chamado"; na Central, tela Maqueiros mostra "📱 App ligado" | |
| 4 | Tocar na faixa amarela para ativar o som | Faixa some | |
| 5 | Setor abre um chamado **Rotina** | Toca e vibra no celular de quem está livre há mais tempo, com 90 s; Central vê "📱 Oferecido a …" | |
| 6 | Maqueiro toca **Recusar** sem motivo | Não deixa confirmar | |
| 7 | Recusar com motivo | Chamado vai para o próximo maqueiro; Central vê "✋ Recusou · motivo" | |
| 8 | Deixar o tempo acabar sem responder | Passa para o próximo; Central vê "⏱ Não respondeu" | |
| 9 | Próximo maqueiro toca **ACEITAR** | Setor vê "Maqueiro X acionado às HH:MM" sem recarregar | |
| 10 | **Cheguei · iniciar transporte** e depois **Concluir chamado** | Status muda na Central e no setor; chamado vai para concluídos | |
| 11 | Setor abre um chamado **Urgente** | Toca para **todos** os livres; o primeiro que aceita leva e some dos outros | |
| 12 | Chamado do **Centro Cirúrgico** em dia útil | Vai primeiro para o maqueiro do CC | |
| 13 | Chamado do hospital em dia útil com só o maqueiro do CC livre | Não vai para ele; a Central recebe o aviso para direcionar | |
| 14 | Maqueiro inicia **intervalo** pelo app | Para de receber chamados; Dashboard → Intervalos registra | |
| 15 | **Encerrar jornada** com chamado em andamento | Não deixa (pede para concluir antes) | |
| 16 | Central encerra a jornada de quem esqueceu (tela Maqueiros) | App mostra "Fora de jornada" | |

**Perguntas para os maqueiros:** o som foi suficiente? 90 segundos é tempo bom? Os motivos de recusa da
lista cobrem o dia a dia? A tela ficar acesa atrapalhou a bateria?
