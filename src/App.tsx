import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Carregando } from '@/components/ui';
import { Layout } from '@/components/Layout';
import { useAuth } from '@/features/auth/AuthProvider';
import { telasPermitidas } from '@/lib/telas';
import { LoginPage } from '@/features/auth/LoginPage';
import { CadastroPage } from '@/features/auth/CadastroPage';
import { CentralPage } from '@/features/central/CentralPage';
import { PainelCentralPage } from '@/features/central/PainelCentralPage';
import { MaqueirosPage } from '@/features/maqueiros/MaqueirosPage';
import { MeusChamadosPage } from '@/features/enfermagem/MeusChamadosPage';

// Módulos da gestão carregados sob demanda (a Central abre mais rápido)
const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const CapacidadePage = lazy(() => import('@/features/capacidade/CapacidadePage').then((m) => ({ default: m.CapacidadePage })));
const RelatoriosPage = lazy(() => import('@/features/relatorios/RelatoriosPage').then((m) => ({ default: m.RelatoriosPage })));
const EscalaPage = lazy(() => import('@/features/escala/EscalaPage').then((m) => ({ default: m.EscalaPage })));
const AppMaqueiroPage = lazy(() => import('@/features/app-maqueiro/AppMaqueiroPage').then((m) => ({ default: m.AppMaqueiroPage })));
const RegistrosPage = lazy(() => import('@/features/registros/RegistrosPage').then((m) => ({ default: m.RegistrosPage })));
const HistoricoPage = lazy(() => import('@/features/historico/HistoricoPage').then((m) => ({ default: m.HistoricoPage })));
const ConfiguracoesPage = lazy(() => import('@/features/config/ConfiguracoesPage').then((m) => ({ default: m.ConfiguracoesPage })));

/** Abre a tela só se ela estiver liberada para o nível do usuário e para o perfil personalizado dele. */
function Protegida({ tela, children }: { tela: string; children: ReactNode }) {
  const { perfil, perfilAcesso } = useAuth();
  if (!perfil) return <Navigate to="/login" replace />;
  if (!telasPermitidas(perfil.papel, perfilAcesso).some((t) => t.id === tela)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function Inicio() {
  const { perfil, perfilAcesso } = useAuth();
  if (!perfil) return <Navigate to="/login" replace />;
  if (perfil.papel === 'maqueiro') return <Navigate to="/app" replace />;
  const primeira = telasPermitidas(perfil.papel, perfilAcesso)[0];
  if (!primeira) return <SemTelas />;
  return <Navigate to={`/${primeira.id}`} replace />;
}

function SemTelas() {
  const { sair } = useAuth();
  return (
    <div className="mx-auto max-w-md space-y-3 py-10 text-center">
      <p className="font-semibold">Seu perfil ainda não tem nenhuma tela liberada.</p>
      <p className="text-sm text-slate-500">Peça à gestão para revisar o seu perfil em Configurações → Perfis.</p>
      <button onClick={() => sair()} className="font-semibold text-marca-600 underline">
        Sair
      </button>
    </div>
  );
}

export function App() {
  const { carregando, perfil } = useAuth();
  if (carregando) return <Carregando texto="Abrindo…" />;
  return (
    <BrowserRouter>
      <Suspense fallback={<Carregando />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/cadastro" element={perfil ? <Navigate to="/" replace /> : <CadastroPage />} />
          {perfil?.papel === 'maqueiro' ? (
            <>
              <Route path="/app" element={<AppMaqueiroPage />} />
              <Route path="*" element={<Navigate to="/app" replace />} />
            </>
          ) : perfil ? (
            <Route element={<Layout />}>
              <Route index element={<Inicio />} />
              <Route path="central" element={<Protegida tela="central"><CentralPage /></Protegida>} />
              <Route path="painel" element={<Protegida tela="painel"><PainelCentralPage /></Protegida>} />
              <Route path="maqueiros" element={<Protegida tela="maqueiros"><MaqueirosPage /></Protegida>} />
              <Route path="registros" element={<Protegida tela="registros"><RegistrosPage /></Protegida>} />
              <Route path="meus-chamados" element={<Protegida tela="meus-chamados"><MeusChamadosPage /></Protegida>} />
              <Route path="dashboard" element={<Protegida tela="dashboard"><DashboardPage /></Protegida>} />
              <Route path="capacidade" element={<Protegida tela="capacidade"><CapacidadePage /></Protegida>} />
              <Route path="relatorios" element={<Protegida tela="relatorios"><RelatoriosPage /></Protegida>} />
              <Route path="escala" element={<Protegida tela="escala"><EscalaPage /></Protegida>} />
              <Route path="historico" element={<Protegida tela="historico"><HistoricoPage /></Protegida>} />
              <Route path="configuracoes" element={<Protegida tela="configuracoes"><ConfiguracoesPage /></Protegida>} />
              <Route path="*" element={<Inicio />} />
            </Route>
          ) : (
            <Route path="*" element={<Navigate to="/login" replace />} />
          )}
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
