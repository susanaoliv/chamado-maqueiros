import { useMemo, useState } from 'react';
import { Botao, Carregando, Erro, Modal, Vazio } from '@/components/ui';
import { useAgora, useChamadosOperacao, useConfig } from '@/hooks/dados';
import { ChamadoCard } from '@/features/chamados/ChamadoCard';
import { NovoChamadoForm } from '@/features/chamados/NovoChamadoForm';
import { usePerfil } from '@/features/auth/AuthProvider';
import { estaAberto } from '@/lib/regras';
import { hojeLocal } from '@/lib/tempo';

export function MeusChamadosPage() {
  const perfil = usePerfil();
  const [novo, setNovo] = useState(false);
  const agora = useAgora(15000);
  const { data: chamados, isLoading, error } = useChamadosOperacao(); // RLS: somente do próprio setor
  const { data: config } = useConfig();
  const sla = config?.sla ?? 20;

  const { abertos, historico } = useMemo(() => {
    const hoje = hojeLocal(agora);
    const lista = chamados ?? [];
    return {
      abertos: lista.filter((c) => estaAberto(c.status)).sort((a, b) => a.aberto_em.localeCompare(b.aberto_em)),
      historico: lista.filter((c) => !estaAberto(c.status) && c.data_local === hoje),
    };
  }, [chamados, agora]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold">Chamados · {perfil.setorNome}</h1>
        <Botao tamanho="xl" onClick={() => setNovo(true)} data-testid="novo-chamado">
          + NOVO CHAMADO
        </Botao>
      </div>

      <section>
        <h2 className="mb-2 text-lg font-bold">Em aberto ({abertos.length})</h2>
        {isLoading && <Carregando />}
        {error && <Erro erro={error} />}
        {!isLoading && abertos.length === 0 && <Vazio>Nenhum chamado em aberto do setor.</Vazio>}
        <div className="grid gap-3 lg:grid-cols-2">
          {abertos.map((c) => (
            <ChamadoCard key={c.id} c={c} sla={sla} agora={agora} modo="setor" />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-bold">Histórico de hoje ({historico.length})</h2>
        {historico.length === 0 ? (
          <Vazio>Nenhum chamado finalizado hoje.</Vazio>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {historico.map((c) => (
              <ChamadoCard key={c.id} c={c} sla={sla} agora={agora} modo="setor" />
            ))}
          </div>
        )}
      </section>

      <Modal aberto={novo} aoFechar={() => setNovo(false)} titulo={`Novo chamado · ${perfil.setorNome ?? ''}`} largura="max-w-2xl">
        <NovoChamadoForm aoConcluir={() => setNovo(false)} />
      </Modal>
    </div>
  );
}
