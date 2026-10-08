import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Carregando } from '@/components/ui';
import { Layout } from '@/components/Layout';
import { useAuth, type Papel } from '@/features/auth/AuthProvider';
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
const HistoricoPage = lazy(() => import('@/features/historico/HistoricoPage').then((m) => ({ default: m.HistoricoPage })));
const ConfiguracoesPage = lazy(() => import('@/features/config/ConfiguracoesPage').then((m) => ({ default: m.ConfiguracoesPage })));

function Protegida({ papeis, children }: { papeis: Papel[]; children: ReactNode }) {
  const { perfil } = useAuth();
  if (!perfil) return <Navigate to="/login" replace />;
  if (!papeis.includes(perfil.papel)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function Inicio() {
  const { perfil } = useAuth();
  if (!perfil) return <Navigate to="/login" replace />;
  return <Navigate to={perfil.papel === 'setor' ? '/meus-chamados' : '/central'} replace />;
}

const G: Papel[] = ['gestao'];
const GT: Papel[] = ['gestao', 'telefonista'];

export function App() {
  const { carregando, perfil } = useAuth();
  if (carregando) return <Carregando texto="Abrindo…" />;
  return (
    <BrowserRouter>
      <Suspense fallback={<Carregando />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/cadastro" element={perfil ? <Navigate to="/" replace /> : <CadastroPage />} />
          {perfil ? (
            <Route element={<Layout />}>
              <Route index element={<Inicio />} />
              <Route path="central" element={<Protegida papeis={GT}><CentralPage /></Protegida>} />
              <Route path="painel" element={<Protegida papeis={GT}><PainelCentralPage /></Protegida>} />
              <Route path="maqueiros" element={<Protegida papeis={GT}><MaqueirosPage /></Protegida>} />
              <Route path="meus-chamados" element={<Protegida papeis={['setor']}><MeusChamadosPage /></Protegida>} />
              <Route path="dashboard" element={<Protegida papeis={G}><DashboardPage /></Protegida>} />
              <Route path="capacidade" element={<Protegida papeis={G}><CapacidadePage /></Protegida>} />
              <Route path="relatorios" element={<Protegida papeis={G}><RelatoriosPage /></Protegida>} />
              <Route path="escala" element={<Protegida papeis={G}><EscalaPage /></Protegida>} />
              <Route path="historico" element={<Protegida papeis={G}><HistoricoPage /></Protegida>} />
              <Route path="configuracoes" element={<Protegida papeis={G}><ConfiguracoesPage /></Protegida>} />
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
