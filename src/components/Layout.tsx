import { NavLink, Outlet } from 'react-router-dom';
import clsx from 'clsx';
import { useAuth, usePerfil } from '@/features/auth/AuthProvider';
import { useRealtimeSync } from '@/hooks/dados';

type Item = { para: string; rotulo: string };

export const MENU: Record<'gestao' | 'telefonista' | 'setor' | 'maqueiro', Item[]> = {
  maqueiro: [],
  telefonista: [
    { para: '/central', rotulo: 'Central' },
    { para: '/painel', rotulo: 'Painel' },
    { para: '/maqueiros', rotulo: 'Maqueiros' },
    { para: '/registros', rotulo: 'Registros' },
  ],
  setor: [{ para: '/meus-chamados', rotulo: 'Meus chamados' }],
  gestao: [
    { para: '/central', rotulo: 'Central' },
    { para: '/painel', rotulo: 'Painel' },
    { para: '/maqueiros', rotulo: 'Maqueiros' },
    { para: '/registros', rotulo: 'Registros' },
    { para: '/dashboard', rotulo: 'Dashboard' },
    { para: '/capacidade', rotulo: 'Capacidade' },
    { para: '/relatorios', rotulo: 'Relatórios' },
    { para: '/escala', rotulo: 'Escala' },
    { para: '/historico', rotulo: 'Histórico' },
    { para: '/configuracoes', rotulo: 'Configurações' },
  ],
};

const NOME_PAPEL = { gestao: 'Gestão NIR', telefonista: 'Central de Telefonistas', setor: 'Enfermagem', maqueiro: 'Maqueiro' };

export function Layout() {
  const perfil = usePerfil();
  const { sair } = useAuth();
  const conectado = useRealtimeSync(true);
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
          <div className="flex items-center gap-2">
            <img src="/favicon.svg" alt="" className="h-8 w-8" />
            <div className="leading-tight">
              <div className="font-bold">Chamados de Maqueiros</div>
              <div className="text-xs text-slate-500">
                {perfil.papel === 'setor' ? perfil.setorNome : NOME_PAPEL[perfil.papel]} · {perfil.atorNome}
              </div>
            </div>
          </div>
          <nav aria-label="Principal" className="order-3 -mx-1 flex w-full gap-1 overflow-x-auto md:order-none md:w-auto md:flex-1 lg:flex-wrap lg:overflow-visible">
            {MENU[perfil.papel].map((i) => (
              <NavLink
                key={i.para}
                to={i.para}
                className={({ isActive }) =>
                  clsx(
                    'whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold',
                    isActive ? 'bg-marca-600 text-white' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800',
                  )
                }
              >
                {i.rotulo}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span
              className={clsx('inline-flex items-center gap-1 text-xs', conectado ? 'text-green-700 dark:text-green-400' : 'text-orange-600')}
              title={conectado ? 'Atualização em tempo real ativa' : 'Reconectando… os dados podem estar desatualizados'}
            >
              <span className={clsx('h-2 w-2 rounded-full', conectado ? 'bg-green-500' : 'animate-pulse bg-orange-500')} />
              {conectado ? 'ao vivo' : 'reconectando'}
            </span>
            <button onClick={() => sair()} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800">
              Sair
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-5">
        <Outlet />
      </main>
    </div>
  );
}
