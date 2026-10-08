import { expect, type Page } from '@playwright/test';

export const SENHA_TELEFONISTA = process.env.E2E_SENHA_TELEFONISTA ?? '';
export const USUARIO_SETOR = process.env.E2E_USUARIO_SETOR ?? 'uti1';
export const SENHA_SETOR = process.env.E2E_SENHA_UTI1 ?? '';

export async function entrar(page: Page, usuario: string, senha: string, nome: string) {
  await page.goto('/login');
  await page.getByLabel('Usuário').fill(usuario);
  await page.getByLabel('Senha').fill(senha);
  await page.getByLabel(/Seu nome/).fill(nome);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible();
}

/** Preenche o formulário de novo chamado (Central) e devolve o número gerado. */
export async function abrirChamadoCentral(page: Page, paciente: string) {
  await page.getByTestId('novo-chamado').click();
  await page.getByLabel('Setor de origem (solicitante)').selectOption({ label: 'PS' });
  await page.getByLabel('Setor de destino').selectOption({ label: 'Tomografia' });
  await page.getByLabel(/paciente/i).fill(paciente);
  await page.getByRole('button', { name: 'REGISTRAR CHAMADO' }).click();
  const toast = page.getByText(/Chamado CH-\d{4}-\d{6} registrado às \d{2}:\d{2}/);
  await expect(toast).toBeVisible();
  return (await toast.textContent())!.match(/CH-\d{4}-\d{6}/)![0];
}

export const card = (page: Page, numero: string) => page.getByTestId('chamado-card').filter({ hasText: numero });

/** Garante um maqueiro disponível: se ninguém pode ser acionado, habilita o primeiro fora da escala. */
export async function garantirMaqueiro(page: Page) {
  await page.getByRole('link', { name: 'Maqueiros' }).click();
  const alerta = page.getByText('Nenhum maqueiro pode ser acionado agora');
  if (await alerta.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Habilitar' }).first().click();
    await page.getByLabel('Início').fill('00:00');
    await page.getByLabel('Fim').fill('23:59');
    await page.getByLabel('Observação').fill('Teste E2E');
    await page.getByRole('dialog').getByRole('button', { name: 'Habilitar' }).click();
    await expect(alerta).toBeHidden();
  }
  await page.getByRole('link', { name: 'Central' }).click();
}
