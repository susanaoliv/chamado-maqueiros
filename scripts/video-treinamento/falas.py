"""Gera as falas do vídeo (legenda + texto para a voz) e o áudio de cada uma com o Piper."""
import json, os, subprocess, sys, wave

PASTA = os.path.dirname(os.path.abspath(__file__))
MODELO = sys.argv[1]

# (id, legenda na tela, texto falado)
FALAS = [
    ('abertura1', 'Neste vídeo você vai aprender a pedir um maqueiro pelo sistema de Chamados de Maqueiros da Casa de Saúde São Lucas.',
     'Olá! Neste vídeo você vai aprender a pedir um maqueiro pelo sistema de Chamados de Maqueiros da Casa de Saúde São Lucas.'),
    ('abertura2', 'O seu setor abre o chamado direto pelo celular ou computador, sem precisar ligar para a Central, e acompanha tudo em tempo real.',
     'O seu setor abre o chamado direto pelo celular ou pelo computador, sem precisar ligar para a Central, e acompanha tudo em tempo real.'),
    ('login1', 'Acesse chamado-maqueiros.vercel.app. O usuário é o nome do setor, sem acento e sem espaço. Exemplo: uti1.',
     'Acesse o endereço chamado traço maqueiros, ponto vercel, ponto app. O usuário é o nome do setor, sem acento e sem espaço. Por exemplo: u, tê, i, um.'),
    ('login2', 'A senha inicial é o nome do usuário + @2026. Exemplo: uti1@2026.',
     'A senha inicial é o nome do usuário, seguido de arroba, dois mil e vinte e seis.'),
    ('login3', 'Em "Seu nome", coloque o seu nome. Ele fica registrado em cada chamado que você abrir.',
     'No campo seu nome, coloque o seu nome. Ele fica registrado em cada chamado que você abrir.'),
    ('instalar1', 'Dica: instale o sistema como aplicativo. Toque em "Instalar app".',
     'Uma dica: instale o sistema como aplicativo. Toque em instalar app.'),
    ('instalar2', 'No Android: menu ⋮ > Instalar app. No iPhone (Safari): Compartilhar > Adicionar à Tela de Início. Não precisa baixar nada de loja.',
     'No Android, abra o menu de três pontinhos e escolha instalar app. No iPhone, pelo Safari, toque em compartilhar e depois em adicionar à tela de início. Não precisa baixar nada de loja.'),
    ('entrar', 'Agora é só tocar em Entrar.', 'Agora é só tocar em entrar.'),
    ('tela1', 'Esta é a tela do seu setor. No topo, o botão grande "+ NOVO CHAMADO".',
     'Esta é a tela do seu setor. No topo, fica o botão grande, novo chamado.'),
    ('tela2', 'Abaixo, os chamados EM ABERTO do setor, com o status de cada um. Você só vê os chamados do seu próprio setor.',
     'Logo abaixo, aparecem os chamados em aberto do setor, com o status de cada um. Você só vê os chamados do seu próprio setor.'),
    ('tela3', 'Mais embaixo fica o HISTÓRICO DE HOJE, com o que já foi concluído ou cancelado.',
     'Mais embaixo, fica o histórico de hoje, com o que já foi concluído ou cancelado.'),
    ('novo1', 'Para pedir um maqueiro, toque em "+ NOVO CHAMADO". A data e a hora são marcadas automaticamente.',
     'Para pedir um maqueiro, toque em novo chamado. A data e a hora são marcadas automaticamente pelo sistema.'),
    ('novo2', 'Escolha o TIPO: exame, alta, óbito, transferência interna, admissão, centro cirúrgico, UTI, hemodinâmica ou outro.',
     'Escolha o tipo de chamado: exame, alta, óbito, transferência interna, admissão, centro cirúrgico, u tê i, hemodinâmica ou outro.'),
    ('novo3', 'O setor de origem já vem preenchido. Informe o LEITO do paciente.',
     'O setor de origem já vem preenchido. Informe o leito do paciente.'),
    ('novo4', 'Escolha o SETOR DE DESTINO. Na transferência interna, informe também o leito de destino.',
     'Escolha o setor de destino. Na transferência interna, informe também o leito de destino.'),
    ('novo5', 'Preencha o NOME DO PACIENTE (ou nº do atendimento) e QUEM ESTÁ SOLICITANDO. Os dois são obrigatórios.',
     'Preencha o nome do paciente, ou o número do atendimento, e o nome de quem está solicitando. Os dois campos são obrigatórios.'),
    ('novo6', 'Escolha o RECURSO (maca, cadeira de rodas, cama…) e a PRIORIDADE: rotina, prioritário ou urgente.',
     'Escolha o recurso, como maca, cadeira de rodas ou cama, e a prioridade: rotina, prioritário ou urgente.'),
    ('novo7', '⚠ ISOLAMENTO e OXIGÊNIO: marque SIM sempre que o paciente precisar. Aparece em destaque para a Central e para o maqueiro.',
     'Atenção aos campos isolamento e oxigênio. Marque sim sempre que o paciente precisar. Essa informação aparece em destaque para a Central e para o maqueiro.'),
    ('novo8', 'Se precisar, escreva uma OBSERVAÇÃO. Confira tudo e toque em "REGISTRAR CHAMADO".',
     'Se precisar, escreva uma observação. Confira tudo e toque em registrar chamado.'),
    ('novo9', 'Pronto! O chamado ganha um número e aparece em "Em aberto".',
     'Pronto! O chamado ganha um número e já aparece na lista de chamados em aberto.'),
    ('obrig1', 'Se faltar alguma informação obrigatória, o sistema não deixa enviar e mostra em vermelho o que falta.',
     'Se faltar alguma informação obrigatória, o sistema não deixa enviar e mostra em vermelho o que está faltando.'),
    ('obrig2', 'Regras: na ALTA não precisa de destino; no ÓBITO o destino é sempre o necrotério; na TRANSFERÊNCIA INTERNA os leitos de origem e destino são obrigatórios.',
     'Algumas regras: na alta, não precisa informar destino. No óbito, o destino é sempre o necrotério. E na transferência interna, os leitos de origem e de destino são obrigatórios.'),
    ('status0', 'Você não precisa atualizar a página: o status muda sozinho. 🟡 AGUARDANDO MAQUEIRO: a Central ainda vai direcionar.',
     'Você não precisa atualizar a página: o status muda sozinho. Amarelo, aguardando maqueiro: a Central ainda vai direcionar.'),
    ('status1', '🔵 MAQUEIRO ACIONADO: o nome do maqueiro aparece no card, com o horário.',
     'Azul, maqueiro acionado: o nome do maqueiro aparece no cartão, com o horário.'),
    ('status2', '🟣 EM ATENDIMENTO: o transporte começou.', 'Roxo, em atendimento: o transporte começou.'),
    ('status3', '🟠 AGUARDANDO ENFERMAGEM: o maqueiro chegou e espera a equipe liberar o paciente. Priorize!',
     'Laranja, aguardando enfermagem: o maqueiro chegou e está esperando a equipe liberar o paciente. Nesse caso, priorize!'),
    ('status4', '🟢 CONCLUÍDO: o chamado vai para o Histórico de hoje.', 'Verde, concluído: o chamado vai para o histórico de hoje.'),
    ('status5', '🔴 ATRASADO: aparece quando o chamado passa do tempo combinado (hoje, 20 minutos).',
     'E a etiqueta vermelha, atrasado, aparece quando o chamado passa do tempo combinado, que hoje é de vinte minutos.'),
    ('cancel1', 'Não precisa mais do transporte? Toque em "Cancelar chamado" para liberar o maqueiro.',
     'Não precisa mais do transporte? Toque em cancelar chamado, para liberar o maqueiro.'),
    ('cancel2', 'Escreva o motivo (obrigatório). Exemplo: paciente não estava pronto, exame remarcado.',
     'Escreva o motivo, que é obrigatório. Por exemplo: paciente não estava pronto, ou exame remarcado.'),
    ('cancel3', 'O chamado não é apagado: fica registrado como cancelado, com o motivo e o seu nome.',
     'O chamado não é apagado: ele fica registrado como cancelado, com o motivo e o seu nome.'),
    ('menu1', 'No MENU: "Minha senha" para trocar a senha, e "Sair do sistema". Em computador compartilhado, sempre saia ao terminar o plantão.',
     'No menu, você encontra minha senha, para trocar a senha, e sair do sistema. Em computador compartilhado, sempre saia ao terminar o plantão.'),
    ('fim1', 'Chamado bem preenchido = maqueiro mais rápido e paciente no horário. Dúvidas? Fale com a Central ou com a Gestão NIR.',
     'Chamado bem preenchido é maqueiro mais rápido e paciente no horário. Ficou com dúvida? Fale com a Central ou com a Gestão NIR. Obrigado!'),
]

saida = os.path.join(PASTA, 'audio')
os.makedirs(saida, exist_ok=True)
resultado = {}
for fid, legenda, voz in FALAS:
    wav = os.path.join(saida, f'{fid}.wav')
    subprocess.run([sys.executable, '-m', 'piper', '-m', MODELO, '-f', wav, '--length-scale', '1.05', '--sentence-silence', '0.25'],
                   input=voz.encode(), check=True, capture_output=True)
    with wave.open(wav) as w:
        dur = w.getnframes() / w.getframerate()
    resultado[fid] = {'legenda': legenda, 'voz': voz, 'wav': wav, 'dur_ms': round(dur * 1000)}
    print(f'{fid:10s} {dur:5.1f}s')
json.dump(resultado, open(os.path.join(PASTA, 'falas.json'), 'w'), ensure_ascii=False, indent=1)
print('total', round(sum(v['dur_ms'] for v in resultado.values()) / 1000, 1), 's')
