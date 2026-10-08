// Gráficos (Recharts) com paleta validada para daltonismo e modo escuro.
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useEffect, useState } from 'react';

const CATEG_CLARO = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
const CATEG_ESCURO = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];

export function useModoEscuro() {
  const q = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const [escuro, setEscuro] = useState(q?.matches ?? false);
  useEffect(() => {
    if (!q) return;
    const f = (e: MediaQueryListEvent) => setEscuro(e.matches);
    q.addEventListener('change', f);
    return () => q.removeEventListener('change', f);
  }, [q]);
  return escuro;
}

export function useCores() {
  const escuro = useModoEscuro();
  return {
    categ: escuro ? CATEG_ESCURO : CATEG_CLARO,
    principal: escuro ? '#3987e5' : '#2a78d6',
    destaque: escuro ? '#d95926' : '#eb6834',
    bom: escuro ? '#22a06b' : '#1f845a',
    ruim: escuro ? '#e66767' : '#c9372c',
    texto: escuro ? '#c3c2b7' : '#52514e',
    grade: escuro ? '#2e2e2c' : '#e7e6e1',
    superficie: escuro ? '#0f172a' : '#ffffff',
  };
}

const estiloTooltip = (c: ReturnType<typeof useCores>) => ({
  contentStyle: { background: c.superficie, border: `1px solid ${c.grade}`, borderRadius: 8, fontSize: 12 },
  labelStyle: { color: c.texto, fontWeight: 600 },
  cursor: { fill: c.grade, opacity: 0.4 },
});

type Item = { chave: string; total: number };

/** Colunas verticais (ex.: chamados por hora) com destaque no maior valor. */
export function Colunas({ dados, x, y, altura = 240, destacarMaior = true, linhaMedia, nomeSerie = 'Chamados' }: {
  dados: Record<string, unknown>[];
  x: string;
  y: string;
  altura?: number;
  destacarMaior?: boolean;
  linhaMedia?: number | null;
  nomeSerie?: string;
}) {
  const c = useCores();
  const max = Math.max(0, ...dados.map((d) => Number(d[y]) || 0));
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <BarChart data={dados} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={c.grade} />
        <XAxis dataKey={x} tick={{ fill: c.texto, fontSize: 11 }} tickLine={false} axisLine={{ stroke: c.grade }} interval="preserveStartEnd" />
        <YAxis allowDecimals={false} tick={{ fill: c.texto, fontSize: 11 }} tickLine={false} axisLine={false} />
        <Tooltip {...estiloTooltip(c)} />
        {linhaMedia != null && <ReferenceLine y={linhaMedia} stroke={c.texto} strokeDasharray="4 4" label={{ value: 'média', fill: c.texto, fontSize: 11, position: 'right' }} />}
        <Bar dataKey={y} name={nomeSerie} radius={[4, 4, 0, 0]} maxBarSize={36}>
          {dados.map((d, i) => (
            <Cell key={i} fill={destacarMaior && max > 0 && Number(d[y]) === max ? c.destaque : c.principal} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Barras horizontais com rótulo (ranking dos 5–8 maiores). */
export function Ranking({ dados, altura, sufixo = '' }: { dados: Item[]; altura?: number; sufixo?: string }) {
  const c = useCores();
  const h = altura ?? Math.max(120, dados.length * 30 + 20);
  if (!dados.length) return <p className="py-8 text-center text-sm text-slate-500">Sem dados no período.</p>;
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={dados} layout="vertical" margin={{ top: 0, right: 36, left: 0, bottom: 0 }}>
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis type="category" dataKey="chave" width={200} tick={{ fill: c.texto, fontSize: 11 }} tickLine={false} axisLine={false} />
        <Tooltip {...estiloTooltip(c)} formatter={(v: number) => `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}${sufixo}`} />
        <Bar dataKey="total" name="Total" fill={c.principal} radius={[0, 4, 4, 0]} maxBarSize={20} label={{ position: 'right', fill: c.texto, fontSize: 11, formatter: (v: number) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) }} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Rosquinha. `cores` permite cores semânticas (ex.: no prazo × atrasado). */
export function Rosca({ dados, cores, altura = 220 }: { dados: Item[]; cores?: string[]; altura?: number }) {
  const c = useCores();
  const total = dados.reduce((s, d) => s + d.total, 0);
  const paletaBase = cores ?? c.categ;
  // mantém a cor de cada categoria mesmo escondendo as fatias zeradas
  const fatias = dados.map((d, i) => ({ ...d, cor: paletaBase[i % paletaBase.length] })).filter((d) => d.total > 0);
  if (!total) return <p className="py-8 text-center text-sm text-slate-500">Sem dados no período.</p>;
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <PieChart>
        <Pie data={fatias} dataKey="total" nameKey="chave" innerRadius="55%" outerRadius="80%" stroke={c.superficie} strokeWidth={fatias.length > 1 ? 2 : 0}>
          {fatias.map((f) => (
            <Cell key={f.chave} fill={f.cor} />
          ))}
        </Pie>
        <Tooltip {...estiloTooltip(c)} formatter={(v: number, n: string) => [`${v} (${((v / total) * 100).toFixed(0)}%)`, n]} />
        <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: 12, color: c.texto }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

/** Agrupa itens além do N-ésimo em "Outros" (máx. 8 fatias). */
export function comOutros(itens: Item[], n = 7): Item[] {
  if (itens.length <= n + 1) return itens;
  const resto = itens.slice(n).reduce((s, i) => s + i.total, 0);
  return [...itens.slice(0, n), { chave: 'Outros', total: resto }];
}
