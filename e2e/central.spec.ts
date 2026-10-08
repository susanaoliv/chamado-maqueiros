import { test, expect } from '@playwright/test';
import { abrirChamadoCentral, card, entrar, garantirMaqueiro, SENHA_TELEFONISTA } from './helpers';

test.skip(!SENHA_TELEFONISTA, 'Defina E2E_SENHA_TELEFONISTA (homologação)');

test('Central: abrir → acionar → em atendimento → encerrar, em menos de 30 s para registrar', async ({ page }) => {
  await entrar(page, 'telefonista', SENHA_TELEFONISTA, 'Teste E2E');
  await garantirMaqueiro(page);

  const t0 = Date.now();
  const numero = await abrirChamadoCentral(page, `E2E ${Date.now()}`);
  expect(Date.now() - t0).toBeLessThan(30_000);

  const c = card(page, numero);
  await expect(c).toContainText('Aguardando maqueiro');
  // Encerrar sem maqueiro não é permitido
  await expect(c.getByRole('button', { name: 'ENCERRAR' })).toBeDisabled();

  const select = c.getByLabel(`Maqueiro para ${numero}`);
  const opcao = await select.locator('option').nth(1).getAttribute('value');
  await select.selectOption(opcao!);
  await c.getByRole('button', { name: 'Informar maqueiro' }).click();
  await expect(c).toContainText('Maqueiro acionado');

  await c.getByLabel(`Status de ${numero}`).selectOption('em_atendimento');
  await expect(c).toContainText('Em atendimento');

  await c.getByRole('button', { name: 'ENCERRAR' }).click();
  await expect(page.getByText(new RegExp(`${numero} encerrado às`))).toBeVisible();
  await expect(card(page, numero)).toContainText('Concluído às');
});

test('Central: cancelar exige justificativa e mantém o registro', async ({ page }) => {
  await entrar(page, 'telefonista', SENHA_TELEFONISTA, 'Teste E2E');
  const numero = await abrirChamadoCentral(page, `E2E cancel ${Date.now()}`);
  const c = card(page, numero);
  await c.getByRole('button', { name: 'Cancelar chamado' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Confirmar cancelamento' })).toBeDisabled();
  await dialog.getByLabel(/Justificativa/).fill('Setor desistiu do transporte');
  await dialog.getByRole('button', { name: 'Confirmar cancelamento' }).click();
  await expect(card(page, numero)).toContainText('Setor desistiu do transporte');
});
