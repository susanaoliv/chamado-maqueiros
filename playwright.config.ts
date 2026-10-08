import { defineConfig, devices } from '@playwright/test';

// E2E contra um projeto Supabase de HOMOLOGAÇÃO (nunca produção).
// Variáveis: E2E_BASE_URL (padrão: vite preview local), E2E_SENHA_TELEFONISTA, E2E_SENHA_UTI1,
// E2E_USUARIO_SETOR (padrão uti1). Veja README → "Testes".
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:4173',
    locale: 'pt-BR',
    timezoneId: 'America/Fortaleza',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'celular', use: { ...devices['Pixel 7'] }, testMatch: /setor/ },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: 'npm run build && npm run preview -- --port 4173', port: 4173, reuseExistingServer: true, timeout: 180_000 },
});
