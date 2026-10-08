import { test, expect } from '@playwright/test';
import { card, entrar, garantirMaqueiro, SENHA_SETOR, SENHA_TELEFONISTA, USUARIO_SETOR } from './helpers';

test.skip(!SENHA_SETOR || !SENHA_TELEFONISTA, 'Defina E2E_SENHA_UTI1 e E2E_SENHA_TELEFONISTA (homologação)');

test('Setor abre → Central aciona → setor vê o status em tempo real → setor cancela', async ({ browser }) => {
  const setor = await (await browser.newContext()).newPage();
  const central = await (await browser.newContext()).newPage();

  // 1. Setor abre (origem fixa, solicitante obrigatório)
  await entrar(setor, USUARIO_SETOR, SENHA_SETOR, 'Enf. Teste');
  await setor.getByTestId('novo-chamado').click();
  await setor.getByLabel('Nº do leito de origem').fill('7');
  await setor.getByLabel('Setor de destino').selectOption({ label: 'Tomografia' });
  await setor.getByLabel(/paciente/i).fill(`E2E setor ${Date.now()}`);
  await setor.getByRole('button', { name: 'REGISTRAR CHAMADO' }).click();
  await expect(setor.getByText('Informe quem está solicitando')).toBeVisible();
  await setor.getByLabel('Nome de quem está solicitando').fill('Enf. Teste');
  await setor.getByRole('button', { name: 'REGISTRAR CHAMADO' }).click();
  const toast = setor.getByText(/Chamado CH-\d{4}-\d{6} registrado/);
  await expect(toast).toBeVisible();
  const numero = (await toast.textContent())!.match(/CH-\d{4}-\d{6}/)![0];
  await expect(card(setor, numero)).toContainText('Aguardando a Central acionar');

  // 2. Central vê e aciona
  await entrar(central, 'telefonista', SENHA_TELEFONISTA, 'Central E2E');
  await garantirMaqueiro(central);
  const c = card(central, numero);
  await expect(c).toBeVisible({ timeout: 10_000 });
  const select = c.getByLabel(`Maqueiro para ${numero}`);
  await select.selectOption((await select.locator('option').nth(1).getAttribute('value'))!);
  await c.getByRole('button', { name: 'Informar maqueiro' }).click();

  // 3. Setor vê o acionamento sem recarregar
  await expect(card(setor, numero)).toContainText(/Maqueiro .+ acionado às \d{2}:\d{2}/, { timeout: 10_000 });

  // 4. Setor cancela com justificativa
  await card(setor, numero).getByRole('button', { name: 'Cancelar chamado' }).click();
  await setor.getByRole('dialog').getByLabel(/Justificativa/).fill('Paciente não estava pronto');
  await setor.getByRole('dialog').getByRole('button', { name: 'Confirmar cancelamento' }).click();
  await expect(card(setor, numero)).toContainText('Cancelado às');
  await expect(card(central, numero)).toContainText('Paciente não estava pronto', { timeout: 10_000 });
});
