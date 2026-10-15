import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { useAuth, usePerfil } from '@/features/auth/AuthProvider';
import { useRealtimeSync } from '@/hooks/dados';
import { Icone, type NomeIcone } from '@/components/Icone';
import { BotaoInstalar } from '@/components/InstalarApp';
import { LogoHospital, SimboloHospital } from '@/components/Marca';
import { atalhosCelular, telasPermitidas } from '@/lib/telas';

type Item = {
  para: string;
  rotulo: string;
  icone: NomeIcone;
  /** aparece na barra de baixo do celular (no máximo 4); o resto fica em "Menu" */
  principal?: boolean;
};

const NOME_PAPEL = {
  gestao: 'Gestão NIR',
  telefonista: 'Central de Telefonistas',
  setor: 'Enfermagem',
  maqueiro: 'Maqueiro',
};

function AoVivo({ conectado, compacto, sobreEscuro }: { conectado: boolean; compacto?: boolean; sobreEscuro?: boolean }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 text-xs font-medium',
        sobreEscuro ? (conectado ? 'text-green-200' : 'text-orange-200') : conectado ? 'text-green-700 dark:text-green-400' : 'text-orange-600',
      )}
      title={conectado ? 'Atualização em tempo real ativa' : 'Reconectando… os dados podem estar desatualizados'}
    >
      <span className={clsx('h-2 w-2 shrink-0 rounded-full', conectado ? 'bg-green-500' : 'animate-pulse bg-orange-500')} />
      <span className={clsx(compacto && 'sr-only')}>{conectado ? 'ao vivo' : 'reconectando'}</span>
    </span>
  );
}

export function Layout() {
  const perfil = usePerfil();
  const { sair } = useAuth();
  const conectado = useRealtimeSync(true);
  const local = useLocation();
  const [menuAberto, setMenuAberto] = useState(false);
  const telas = telasPermitidas(perfil.papel, perfil.perfilAcesso);
  const atalhos = atalhosCelular(telas);
  const itens: Item[] = telas.map((t) => ({ para: `/${t.id}`, rotulo: t.rotulo, icone: t.icone, principal: atalhos.includes(t.id) }));
  const principais = itens.filter((i) => i.principal);
  const atual = itens.find((i) => local.pathname.startsWith(i.para));
  const nomePerfil = perfil.perfilAcesso?.nome ?? NOME_PAPEL[perfil.papel];
  const subtitulo = `${perfil.papel === 'setor' ? `${perfil.setorNome}${perfil.perfilAcesso ? ` (${perfil.perfilAcesso.nome})` : ''}` : nomePerfil} · ${perfil.atorNome}`;

  // Fecha o menu do celular ao trocar de tela.
  useEffect(() => setMenuAberto(false), [local.pathname]);
  useEffect(() => {
    if (atual) document.title = `${atual.rotulo} · Maqueiros CSSL`;
  }, [atual]);

  return (
    <div className="min-h-dvh lg:pl-60">
      {/* Computador: barra lateral fixa */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-gradient-to-b from-marca-700 to-marca-900 text-white lg:flex">
        <div className="px-3 pb-3 pt-3">
          <div className="rounded-xl bg-white px-3 py-2.5 shadow-md">
            <LogoHospital className="mx-auto w-44" />
          </div>
          <div className="mt-3 px-1 leading-tight">
            <div className="font-bold">Chamados de Maqueiros</div>
            <div className="truncate text-xs text-marca-100" title={subtitulo}>
              {subtitulo}
            </div>
          </div>
        </div>
        <nav aria-label="Principal" className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
          {itens.map((i) => (
            <NavLink
              key={i.para}
              to={i.para}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition',
                  isActive ? 'bg-white text-marca-700 shadow-sm' : 'text-marca-50 hover:bg-white/10',
                )
              }
            >
              <Icone nome={i.icone} />
              {i.rotulo}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-2 border-t border-white/15 p-3">
          <div className="px-3">
            <AoVivo conectado={conectado} sobreEscuro />
          </div>
          <BotaoInstalar lateral className="w-full" />
          <button
            onClick={() => sair()}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold text-marca-50 hover:bg-white/10"
          >
            <Icone nome="sair" />
            Sair
          </button>
        </div>
      </aside>

      {/* Celular e tablet: barra de cima enxuta */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 lg:hidden">
        <div className="h-1 bg-gradient-to-r from-marca-500 via-marca-600 to-marca-800" />
        <div className="flex h-14 items-center gap-3 px-4">
          <SimboloHospital className="h-8 w-8" />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate font-bold">{atual?.rotulo ?? 'Maqueiros CSSL'}</div>
            <div className="truncate text-xs text-slate-500">{subtitulo}</div>
          </div>
          <AoVivo conectado={conectado} compacto />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-3 py-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-4 sm:py-5 lg:px-6 lg:pb-8">
        <Outlet />
      </main>

      {/* Celular e tablet: barra de abas embaixo, ao alcance do polegar */}
      <nav
        aria-label="Atalhos"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 lg:hidden"
      >
        <div className="mx-auto flex max-w-xl">
          {principais.map((i) => (
            <NavLink
              key={i.para}
              to={i.para}
              className={({ isActive }) =>
                clsx(
                  'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-semibold',
                  isActive ? 'text-marca-600 dark:text-marca-100' : 'text-slate-500 dark:text-slate-400',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className={clsx('rounded-full px-4 py-1 transition', isActive && 'bg-marca-100 dark:bg-marca-700/60')}>
                    <Icone nome={i.icone} />
                  </span>
                  <span className="max-w-full truncate">{i.rotulo}</span>
                </>
              )}
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => setMenuAberto(true)}
            aria-expanded={menuAberto}
            className={clsx(
              'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-semibold',
              menuAberto || (atual && !atual.principal) ? 'text-marca-600 dark:text-marca-100' : 'text-slate-500 dark:text-slate-400',
            )}
          >
            <span className={clsx('rounded-full px-4 py-1', atual && !atual.principal && 'bg-marca-100 dark:bg-marca-700/60')}>
              <Icone nome="menu" />
            </span>
            Menu
          </button>
        </div>
      </nav>

      {menuAberto && <MenuCelular itens={itens} subtitulo={subtitulo} conectado={conectado} aoFechar={() => setMenuAberto(false)} aoSair={() => sair()} />}
    </div>
  );
}

function MenuCelular({
  itens,
  subtitulo,
  conectado,
  aoFechar,
  aoSair,
}: {
  itens: Item[];
  subtitulo: string;
  conectado: boolean;
  aoFechar: () => void;
  aoSair: () => void;
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [aoFechar]);
  return (
    <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
      <button type="button" aria-label="Fechar menu" onClick={aoFechar} className="absolute inset-0 bg-slate-900/50" />
      <div className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-2xl bg-white pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl dark:bg-slate-900">
        <div className="sticky top-0 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
          <SimboloHospital className="h-9 w-9" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-bold">Casa de Saúde São Lucas</div>
            <div className="truncate text-xs text-slate-500">{subtitulo}</div>
          </div>
          <AoVivo conectado={conectado} />
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800">
            <Icone nome="fechar" />
          </button>
        </div>
        <nav aria-label="Todas as telas" className="grid grid-cols-3 gap-2 p-4 sm:grid-cols-4">
          {itens.map((i) => (
            <NavLink
              key={i.para}
              to={i.para}
              className={({ isActive }) =>
                clsx(
                  'flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-center text-xs font-semibold',
                  isActive
                    ? 'border-marca-500 bg-marca-50 text-marca-700 dark:bg-marca-700/40 dark:text-marca-100'
                    : 'border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-200',
                )
              }
            >
              <Icone nome={i.icone} className="h-6 w-6" />
              {i.rotulo}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-2 px-4">
          <BotaoInstalar className="w-full" />
          <button
            type="button"
            onClick={aoSair}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-red-700 dark:border-slate-700 dark:text-red-400"
          >
            <Icone nome="sair" />
            Sair do sistema
          </button>
        </div>
      </div>
    </div>
  );
}
