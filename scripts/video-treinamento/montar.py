"""Monta o vídeo final (1080x1920): logo no topo, título da cena, tela do celular, legendas e narração."""
import json, subprocess, sys, os

PASTA = sys.argv[1]            # saída do gravar.mjs (linhas.json + q/)
LOGO = sys.argv[2]             # logo-cssl.png
SAIDA = sys.argv[3]            # .mp4 final
d = json.load(open(os.path.join(PASTA, 'linhas.json')))
q = d['quadros']; fim = d['fimTotal'] / 1000
inicio = q[0]['t'] / 1000      # o vídeo começa no primeiro quadro capturado

# 1) Quadros com tempo variável -> ffconcat
lst = os.path.join(PASTA, 'quadros.txt')
with open(lst, 'w') as f:
    f.write('ffconcat version 1.0\n')
    for i, fr in enumerate(q):
        prox = q[i + 1]['t'] / 1000 if i + 1 < len(q) else fim
        f.write(f"file '{os.path.abspath(fr['arq'])}'\nduration {max(0.001, prox - fr['t'] / 1000):.3f}\n")
    f.write(f"file '{os.path.abspath(q[-1]['arq'])}'\n")

# 2) Legendas (ASS). Emojis não aparecem na legenda: troca por texto.
TROCA = {'🟡': 'AMARELO ·', '🔵': 'AZUL ·', '🟣': 'ROXO ·', '🟠': 'LARANJA ·', '🟢': 'VERDE ·', '🔴': 'VERMELHO ·',
         '⚠': 'ATENÇÃO:', '⋮': '(três pontinhos)'}
def limpa(t):
    for k, v in TROCA.items():
        t = t.replace(k, v)
    return t.replace('{', '(').replace('}', ')')
def ts(s):
    s = max(0, s - inicio); h = int(s // 3600); m = int(s % 3600 // 60); r = s % 60
    return f"{h}:{m:02d}:{r:05.2f}"

linhas = d['linhas']
ass = os.path.join(PASTA, 'legendas.ass')
with open(ass, 'w') as f:
    f.write("""[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cena,Inter,46,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,0,0,8,40,40,150,1
Style: Legenda,Inter,50,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,0,2,5,70,70,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
""")
    i = 0
    while i < len(linhas):
        j = i
        while j + 1 < len(linhas) and linhas[j + 1]['cena'] == linhas[i]['cena']:
            j += 1
        fim_cena = linhas[j + 1]['ini'] / 1000 if j + 1 < len(linhas) else fim
        f.write(f"Dialogue: 0,{ts(linhas[i]['ini']/1000)},{ts(fim_cena)},Cena,,0,0,0,,{limpa(linhas[i]['cena'])}\n")
        i = j + 1
    for k, l in enumerate(linhas):
        fim_l = linhas[k + 1]['ini'] / 1000 if k + 1 < len(linhas) else fim
        # \pos centraliza a legenda na faixa de baixo (y = 1695)
        f.write(f"Dialogue: 0,{ts(l['ini']/1000)},{ts(fim_l)},Legenda,,0,0,0,,{{\\fad(150,150)\\pos(540,1695)}}{limpa(l['texto'])}\n")

# 3) Narração: cada fala entra no seu tempo
FUNDO = '0x005a5c'
TEL_H = 1210; TEL_W = round(TEL_H * 780 / 1688) // 2 * 2
TEL_X = (1080 - TEL_W) // 2; TEL_Y = 225
entradas = ['-f', 'concat', '-safe', '0', '-i', lst, '-loop', '1', '-i', LOGO]
audios = []
for n, l in enumerate(linhas):
    entradas += ['-i', l['wav']]
    atraso = max(0, round(l['ini'] - inicio * 1000 + 250))  # 0,25 s depois que a cena começa
    audios.append(f"[{n + 2}:a]aresample=48000,adelay={atraso}|{atraso}[a{n}]")
mix = ';'.join(audios) + ';' + ''.join(f'[a{n}]' for n in range(len(linhas))) + \
      f"amix=inputs={len(linhas)}:normalize=0:dropout_transition=0,volume=1.3,alimiter=limit=0.89:level=false,apad,atrim=0:{fim - inicio:.2f}[aud]"

video = (
    f"color=c={FUNDO}:s=1080x1920:r=30[bg];"
    f"[bg]drawbox=x=0:y=0:w=1080:h=130:color=white@1:t=fill,"
    f"drawbox=x=0:y=1470:w=1080:h=450:color=0x003234@1:t=fill[bg2];"
    f"[1:v]scale=380:-1[logo];"
    f"[0:v]fps=30,scale={TEL_W}:{TEL_H}:flags=lanczos,pad={TEL_W+12}:{TEL_H+12}:6:6:color=white[tel];"
    f"[bg2][logo]overlay=(W-w)/2:14[a];"
    f"[a][tel]overlay={TEL_X-6}:{TEL_Y-6}:shortest=1[b];"
    f"[b]ass={ass}[v]"
)
cmd = ['ffmpeg', '-v', 'error', '-y', *entradas, '-filter_complex', video + ';' + mix,
       '-map', '[v]', '-map', '[aud]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-pix_fmt', 'yuv420p',
       '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-movflags', '+faststart', '-t', f'{fim - inicio:.2f}', SAIDA]
subprocess.run(cmd, check=True)
print('ok', SAIDA, f'{fim - inicio:.1f}s')
