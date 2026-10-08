@echo off
REM Liga o sistema de Chamados de Maqueiros neste computador (duplo clique).
chcp 65001 >nul
title Chamados de Maqueiros
cd /d "%~dp0"

where node >/dev/null 2>nul
if errorlevel 1 (
  echo.
  echo  O Node.js não está instalado.
  echo  Baixe a versão LTS em https://nodejs.org, instale e rode este arquivo de novo.
  echo.
  pause
  exit /b 1
)

if not exist ".env.local" (
  echo.
  echo  Falta o arquivo .env.local com o endereço do banco.
  echo  Crie o arquivo nesta pasta com as linhas VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.
  echo  Veja o modelo em .env.example.
  echo.
  pause
  exit /b 1
)

echo.
echo  [1/2] Instalando/atualizando as bibliotecas (a primeira vez demora alguns minutos)...
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo.
  echo  Erro na instalação. Tire um print desta tela e envie para o suporte.
  pause
  exit /b 1
)

echo.
echo  [2/2] Ligando o sistema. O navegador vai abrir em http://localhost:5173
echo  Para desligar, feche esta janela.
echo.
call npm run dev -- --open
pause
