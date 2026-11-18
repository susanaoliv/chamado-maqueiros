# Vídeo de treinamento (perfil Enfermagem)

Gera o vídeo vertical (1080x1920) com o sistema em uso, legendas e narração em português.
Usa dados fictícios: o Supabase é simulado, nada toca o banco real.

Pré-requisitos: `npm ci`, ffmpeg, Chromium do Playwright e a voz Piper pt-BR:

```bash
pip install piper-tts
# voz (63 MB), do Hugging Face: rhasspy/piper-voices, pasta pt/pt_BR/faber/medium
#   pt_BR-faber-medium.onnx e pt_BR-faber-medium.onnx.json
```

Passos (rodar de uma pasta de trabalho fora do repositório):

```bash
VITE_SUPABASE_URL=http://localhost:9999 VITE_SUPABASE_ANON_KEY=x npx vite build --outDir ./dist   # na raiz do projeto
python3 falas.py pt_BR-faber-medium.onnx        # gera audio/*.wav e falas.json
node gravar.mjs ./dist ./out ./falas.json        # grava a tela no ritmo da narração
python3 montar.py ./out ../public/logo-cssl.png treinamento_enfermagem.mp4
```

O roteiro escrito está em `docs/ROTEIRO_VIDEO_ENFERMAGEM.md`. Para mudar uma fala, edite `FALAS` em
`falas.py` (legenda e texto falado) e rode os três passos de novo.
