import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { NovoChamadoForm } from './NovoChamadoForm';

const setores = [
  { id: 'ps', nome: 'PS', exige_leito: false, ativo: true, ordem: 1, created_at: '' },
  { id: 'sj', nome: 'São José', exige_leito: true, ativo: true, ordem: 2, created_at: '' },
  { id: 'tomo', nome: 'Tomografia', exige_leito: false, ativo: true, ordem: 3, created_at: '' },
  { id: 'nec', nome: 'Necrotério', exige_leito: false, ativo: true, ordem: 4, created_at: '' },
];
const mutateAsync = vi.fn();
let papel: 'telefonista' | 'setor' = 'telefonista';

vi.mock('@/hooks/dados', () => ({
  useSetores: () => ({ data: setores }),
  useConfig: () => ({ data: { sla: 20, metaAcionamento: 5, somenteNumeroAtendimento: false, capacidadeManual: {} } }),
}));
vi.mock('@/features/auth/AuthProvider', () => ({
  usePerfil: () => ({ papel, setor_id: papel === 'setor' ? 'sj' : null, setorNome: papel === 'setor' ? 'São José' : null, nome: 'X', atorNome: 'X' }),
}));
vi.mock('./api', () => ({ useAbrirChamado: () => ({ mutateAsync }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const sel = (rotulo: RegExp) => screen.getByLabelText(rotulo) as HTMLSelectElement;

describe('NovoChamadoForm', () => {
  beforeEach(() => {
    papel = 'telefonista';
    mutateAsync.mockReset();
    mutateAsync.mockResolvedValue({ numero: 'CH-2026-000001', aberto_em: '2026-10-08T11:00:00Z' });
  });

  it('vem com padrões para registro rápido (Exame, Maca, Rotina)', () => {
    render(<NovoChamadoForm aoConcluir={() => {}} />);
    expect(sel(/tipo de chamado/i).value).toBe('Exame');
    expect(sel(/recurso/i).value).toBe('Maca');
    expect(sel(/prioridade/i).value).toBe('Rotina');
  });

  it('marca o leito como OBRIGATÓRIO ao escolher setor da lista', () => {
    render(<NovoChamadoForm aoConcluir={() => {}} />);
    const rotulo = () => screen.getByText(/leito de origem/i).closest('label')!;
    expect(within(rotulo()).queryByText(/obrigatório/i)).toBeNull();
    fireEvent.change(sel(/setor de origem/i), { target: { value: 'sj' } });
    expect(within(rotulo()).getByText(/obrigatório/i)).toBeInTheDocument();
  });

  it('Alta esconde o destino; Óbito trava no Necrotério', () => {
    render(<NovoChamadoForm aoConcluir={() => {}} />);
    fireEvent.change(sel(/tipo de chamado/i), { target: { value: 'Alta' } });
    expect(screen.queryByLabelText(/setor de destino/i)).toBeNull();
    expect(screen.getByText(/destino não é exigido/i)).toBeInTheDocument();
    fireEvent.change(sel(/tipo de chamado/i), { target: { value: 'Óbito' } });
    expect(screen.getByText(/automático para óbito/i)).toBeInTheDocument();
  });

  it('bloqueia envio sem leito em setor obrigatório e envia quando completo', async () => {
    const aoConcluir = vi.fn();
    render(<NovoChamadoForm aoConcluir={aoConcluir} />);
    fireEvent.change(sel(/setor de origem/i), { target: { value: 'sj' } });
    fireEvent.change(sel(/setor de destino/i), { target: { value: 'tomo' } });
    fireEvent.change(screen.getByLabelText(/paciente/i), { target: { value: 'Maria' } });
    fireEvent.click(screen.getByRole('button', { name: /registrar chamado/i }));
    expect(await screen.findByText(/leito de origem obrigatório/i)).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/leito de origem/i), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: /registrar chamado/i }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(mutateAsync.mock.calls[0][0]).toMatchObject({ p_setor_origem_id: 'sj', p_leito_origem: '12', p_setor_destino_id: 'tomo', p_paciente: 'Maria', p_aberto_em: null });
    await waitFor(() => expect(aoConcluir).toHaveBeenCalled());
  });

  it('perfil setor: origem fixa e solicitante obrigatório', async () => {
    papel = 'setor';
    render(<NovoChamadoForm aoConcluir={() => {}} />);
    expect(screen.queryByRole('combobox', { name: /setor de origem/i })).toBeNull();
    expect(screen.queryByLabelText(/origem do chamado/i)).toBeNull();
    fireEvent.change(screen.getByLabelText(/leito de origem/i), { target: { value: '3' } });
    fireEvent.change(sel(/setor de destino/i), { target: { value: 'tomo' } });
    fireEvent.change(screen.getByLabelText(/paciente/i), { target: { value: 'Maria' } });
    fireEvent.click(screen.getByRole('button', { name: /registrar chamado/i }));
    expect(await screen.findByText(/informe quem está solicitando/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/quem está solicitando/i), { target: { value: 'Enf. Ana' } });
    fireEvent.click(screen.getByRole('button', { name: /registrar chamado/i }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(mutateAsync.mock.calls[0][0]).toMatchObject({ p_setor_origem_id: 'sj', p_origem_chamado: 'Setor (enfermagem)', p_solicitante: 'Enf. Ana' });
  });
});
