"""Gera as falas do vídeo (legenda + texto para a voz) e o áudio de cada uma com o Piper."""
import json, os, subprocess, sys, wave

PASTA = os.path.dirname(os.path.abspath(__file__))
MODELO = sys.argv[1]

# (id, legenda na tela, texto falado)
FALAS = [
    ('abertura1', 'Neste vídeo você vai aprender a usar o app do maqueiro da Casa de Saúde São Lucas.',
     'Olá! Neste vídeo você vai aprender a usar o aplicativo do maqueiro da Casa de Saúde São Lucas.'),
    ('abertura2', 'Os chamados chegam direto no seu celular, como em um app de corrida: o sistema oferece para quem está livre há mais tempo.',
     'Os chamados chegam direto no seu celular, como em um aplicativo de corrida: o sistema oferece o chamado para quem está livre há mais tempo.'),
    ('login1', 'Acesse chamado-maqueiros.vercel.app no celular. O usuário é o seu primeiro nome, sem acento. Exemplo: carlos.',
     'No celular, acesse chamado traço maqueiros, ponto vercel, ponto app. O usuário é o seu primeiro nome, sem acento. Por exemplo: carlos.'),
    ('login2', 'A senha inicial é o usuário + @2026. Exemplo: carlos@2026. Quem não tem acesso toca em "Cadastre-se" e escolhe o perfil Maqueiro.',
     'A senha inicial é o seu usuário, seguido de arroba, dois mil e vinte e seis. Quem ainda não tem acesso toca em cadastre-se, escolhe o perfil maqueiro e aguarda a aprovação da gestão.'),
    ('instalar1', 'Instale como aplicativo: toque em "Instalar app". No iPhone: Safari > Compartilhar > Adicionar à Tela de Início.',
     'Instale o sistema como aplicativo. Toque em instalar app. No iPhone, pelo Safari, toque em compartilhar e depois em adicionar à tela de início.'),
    ('entrar', 'Agora é só tocar em Entrar.', 'Agora é só tocar em entrar.'),
    ('jornada1', 'Ao chegar ao hospital, toque em "INICIAR JORNADA". Sem jornada iniciada, você não recebe chamados.',
     'Ao chegar ao hospital, toque em iniciar jornada. Sem a jornada iniciada, você não recebe chamados.'),
    ('jornada2', 'O app confere pelo GPS se você está no hospital e se está na escala. Permita o acesso à localização.',
     'O aplicativo confere pelo GPS se você está dentro do hospital, e se você está na escala deste horário. Quando o celular perguntar, permita o acesso à localização.'),
    ('jornada3', 'Fora da escala (troca, cobertura, hora extra)? Peça para a Central te habilitar.',
     'Se você não estiver na escala, por troca, cobertura ou hora extra, peça para a Central te habilitar.'),
    ('livre1', 'Pronto: você está LIVRE e aguardando chamado. Toque no aviso amarelo para ativar o som.',
     'Pronto! Você está livre, aguardando chamado. Toque no aviso amarelo para ativar o som dos chamados.'),
    ('livre2', 'Mantenha o app ABERTO na tela durante o plantão. A tela fica acesa sozinha.',
     'Durante o plantão, mantenha o aplicativo aberto na tela. A tela fica acesa sozinha.'),
    ('oferta1', '🔔 Chegou um chamado! O celular toca e vibra. Você tem 90 SEGUNDOS para responder.',
     'Chegou um chamado! O celular toca e vibra, e você tem noventa segundos para responder.'),
    ('oferta2', 'Veja onde BUSCAR o paciente, para onde LEVAR, o recurso e os avisos de ISOLAMENTO e OXIGÊNIO.',
     'Veja onde buscar o paciente, para onde levar, o recurso necessário, e os avisos de isolamento e de oxigênio.'),
    ('recusa1', 'Não pode ir? Toque em "Recusar" e escolha o motivo. O chamado passa para o próximo da fila.',
     'Não pode ir? Toque em recusar e escolha o motivo. O chamado passa para o próximo maqueiro da fila.'),
    ('recusa2', 'A recusa fica registrada. Se o tempo acabar sem resposta, o chamado também passa para outro maqueiro.',
     'A recusa fica registrada. E se o tempo acabar sem resposta, o chamado também passa para outro maqueiro.'),
    ('aceite1', 'Pode ir? Toque em "ACEITAR". O chamado é seu e a Central e o setor já veem o seu nome.',
     'Pode ir? Toque em aceitar. O chamado passa a ser seu, e a Central e o setor já veem o seu nome.'),
    ('etapa1', 'Vá até o paciente. Ao chegar, toque em "CHEGUEI · INICIAR TRANSPORTE".',
     'Vá até o paciente. Ao chegar, toque em cheguei, iniciar transporte.'),
    ('etapa2', 'Se precisar esperar, avise: "Aguardando enfermagem" ou "Aguardando maca". Isso explica o tempo parado.',
     'Se precisar esperar, avise pelo aplicativo: aguardando enfermagem, ou aguardando maca. Isso explica o tempo parado.'),
    ('etapa3', 'Quando liberar, toque em "RETOMAR TRANSPORTE".', 'Quando liberar, toque em retomar transporte.'),
    ('concluir1', 'Entregou o paciente? Toque em "CONCLUIR CHAMADO" e confirme.',
     'Entregou o paciente no destino? Toque em concluir chamado e confirme.'),
    ('concluir2', 'Se passou de 20 minutos, o app pede o MOTIVO DO ATRASO antes de concluir.',
     'Se o chamado passou de vinte minutos, o aplicativo pede o motivo do atraso antes de concluir.'),
    ('concluir3', 'Pronto! Você volta a ficar livre. Embaixo, o resumo do seu dia: concluídos, minutos e recusas.',
     'Pronto! Você volta a ficar livre. Embaixo, aparece o resumo do seu dia: chamados concluídos, minutos em chamados e recusas.'),
    ('urgente1', '🚨 CHAMADO URGENTE: vai para TODOS os maqueiros livres ao mesmo tempo. Quem aceitar primeiro leva.',
     'Atenção ao chamado urgente: ele vai para todos os maqueiros livres ao mesmo tempo, e quem aceitar primeiro leva.'),
    ('urgente2', 'Se outro maqueiro aceitar antes, o chamado some da sua tela.',
     'Se outro maqueiro aceitar antes, o chamado some da sua tela.'),
    ('cc1', 'Maqueiros do CC recebem os chamados do CC. Nos fins de semana e feriados, também os do hospital.',
     'Os maqueiros do centro cirúrgico recebem os chamados do centro cirúrgico. Nos fins de semana e feriados, recebem também os do hospital.'),
    ('intervalo1', 'Vai fazer intervalo? Toque em "Iniciar intervalo". Durante o intervalo, você não recebe chamados.',
     'Vai fazer o intervalo? Toque em iniciar intervalo. Durante o intervalo, você não recebe chamados.'),
    ('intervalo2', 'Na volta, toque em "Voltar do intervalo". O tempo de intervalo fica registrado.',
     'Na volta, toque em voltar do intervalo. O tempo de intervalo fica registrado.'),
    ('encerrar1', 'No fim do plantão, toque em "Encerrar jornada" e confirme. A partir daí, você não recebe mais chamados.',
     'No fim do plantão, toque em encerrar jornada e confirme. A partir daí, você não recebe mais chamados.'),
    ('fim1', 'Dicas: app aberto na tela, som ativado e celular carregado. Dúvidas? Fale com a Central ou com a Gestão NIR.',
     'Dicas finais: deixe o aplicativo aberto, o som ativado e o celular carregado. Ficou com dúvida? Fale com a Central ou com a Gestão NIR. Bom trabalho!'),
]

NOME = sys.argv[2] if len(sys.argv) > 2 else 'falas'
saida = os.path.join(PASTA, 'audio_' + NOME)
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
json.dump(resultado, open(os.path.join(PASTA, NOME + '.json'), 'w'), ensure_ascii=False, indent=1)
print('total', round(sum(v['dur_ms'] for v in resultado.values()) / 1000, 1), 's')
