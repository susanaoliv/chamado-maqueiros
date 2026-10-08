import { forwardRef, useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import clsx from 'clsx';

// ----------------------------------------------------------------------------
// Botão
// ----------------------------------------------------------------------------
type Variante = 'primario' | 'secundario' | 'perigo' | 'sucesso' | 'fantasma' | 'aviso';
const VARIANTES: Record<Variante, string> = {
  primario: 'bg-marca-600 text-white hover:bg-marca-700 focus-visible:ring-marca-500',
  secundario: 'bg-white text-slate-800 border border-slate-300 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600 dark:hover:bg-slate-700',
  perigo: 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500',
  sucesso: 'bg-green-600 text-white hover:bg-green-700 focus-visible:ring-green-500',
  aviso: 'bg-orange-500 text-white hover:bg-orange-600 focus-visible:ring-orange-400',
  fantasma: 'text-slate-700 hover:bg-slate-200 dark:text-slate-200 dark:hover:bg-slate-800',
};

export const Botao = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; tamanho?: 'sm' | 'md' | 'lg' | 'xl'; carregando?: boolean }
>(function Botao({ variante = 'primario', tamanho = 'md', carregando, className, children, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled || carregando}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTES[variante],
        tamanho === 'sm' && 'px-2.5 py-1.5 text-sm',
        tamanho === 'md' && 'px-4 py-2 text-sm',
        tamanho === 'lg' && 'px-5 py-3 text-base',
        tamanho === 'xl' && 'px-6 py-4 text-lg tracking-wide',
        className,
      )}
      {...rest}
    >
      {carregando && <Spinner pequeno />}
      {children}
    </button>
  );
});

// ----------------------------------------------------------------------------
// Campos de formulário
// ----------------------------------------------------------------------------
const baseCampo =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 shadow-sm focus:border-marca-500 focus:outline-none focus:ring-2 focus:ring-marca-500/40 disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-800';

export function Campo({
  rotulo,
  erro,
  obrigatorio,
  dica,
  children,
  className,
  htmlFor,
}: {
  rotulo: ReactNode;
  erro?: string;
  obrigatorio?: boolean;
  dica?: ReactNode;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={clsx('flex flex-col gap-1', className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-slate-700 dark:text-slate-300">
        {rotulo}
        {obrigatorio && (
          <span className="ml-1.5 rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-bold uppercase text-red-700 dark:bg-red-900/50 dark:text-red-200">
            obrigatório
          </span>
        )}
      </label>
      {children}
      {dica && !erro && <p className="text-xs text-slate-500 dark:text-slate-400">{dica}</p>}
      {erro && (
        <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">
          {erro}
        </p>
      )}
    </div>
  );
}

export const Entrada = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalido?: boolean }>(
  function Entrada({ className, invalido, ...rest }, ref) {
    return <input ref={ref} aria-invalid={invalido || undefined} className={clsx(baseCampo, invalido && 'border-red-500', className)} {...rest} />;
  },
);

export const Selecao = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalido?: boolean }>(
  function Selecao({ className, invalido, children, ...rest }, ref) {
    return (
      <select ref={ref} aria-invalid={invalido || undefined} className={clsx(baseCampo, invalido && 'border-red-500', className)} {...rest}>
        {children}
      </select>
    );
  },
);

export const AreaTexto = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalido?: boolean }>(
  function AreaTexto({ className, invalido, ...rest }, ref) {
    return <textarea ref={ref} aria-invalid={invalido || undefined} className={clsx(baseCampo, invalido && 'border-red-500', className)} {...rest} />;
  },
);

/** Botões Sim/Não grandes (melhor que checkbox em tela de recepção e celular). */
export function SimNao({ valor, onChange, rotulo, id }: { valor: boolean; onChange: (v: boolean) => void; rotulo: string; id?: string }) {
  const autoId = useId();
  const gid = id ?? autoId;
  return (
    <div role="radiogroup" aria-labelledby={`${gid}-r`} className="flex flex-col gap-1">
      <span id={`${gid}-r`} className="text-sm font-medium text-slate-700 dark:text-slate-300">
        {rotulo}
      </span>
      <div className="flex gap-2">
        {[false, true].map((v) => (
          <button
            key={String(v)}
            type="button"
            role="radio"
            aria-checked={valor === v}
            onClick={() => onChange(v)}
            className={clsx(
              'flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition',
              valor === v
                ? v
                  ? 'border-orange-500 bg-orange-500 text-white'
                  : 'border-slate-600 bg-slate-700 text-white dark:bg-slate-200 dark:text-slate-900'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200',
            )}
          >
            {v ? 'Sim' : 'Não'}
          </button>
        ))}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Estrutura
// ----------------------------------------------------------------------------
export function Cartao({ children, className, titulo, acoes }: { children: ReactNode; className?: string; titulo?: ReactNode; acoes?: ReactNode }) {
  return (
    <section className={clsx('rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900', className)}>
      {(titulo || acoes) && (
        <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {titulo && <h2 className="text-base font-semibold">{titulo}</h2>}
          {acoes}
        </header>
      )}
      {children}
    </section>
  );
}

export function Selo({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold', className)}>{children}</span>;
}

export function Spinner({ pequeno }: { pequeno?: boolean }) {
  return (
    <span
      role="status"
      aria-label="Carregando"
      className={clsx('inline-block animate-spin rounded-full border-2 border-current border-r-transparent', pequeno ? 'h-4 w-4' : 'h-8 w-8')}
    />
  );
}

export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-slate-500">
      <Spinner /> {texto}
    </div>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-slate-500 dark:border-slate-700">{children}</div>;
}

export function Erro({ erro }: { erro: unknown }) {
  return (
    <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
      {(erro as Error)?.message ?? String(erro)}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Modal acessível (dialog nativo)
// ----------------------------------------------------------------------------
export function Modal({
  aberto,
  aoFechar,
  titulo,
  children,
  largura = 'max-w-lg',
}: {
  aberto: boolean;
  aoFechar: () => void;
  titulo: ReactNode;
  children: ReactNode;
  largura?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aberto && !d.open) {
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
    }
    if (!aberto && d.open) d.close?.();
  }, [aberto]);
  if (!aberto) return null;
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        aoFechar();
      }}
      onClick={(e) => {
        if (e.target === ref.current) aoFechar();
      }}
      className={clsx(
        'w-[calc(100%-1.5rem)] rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-900/60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100',
        largura,
      )}
    >
      <div className="flex max-h-[90vh] flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3 dark:border-slate-700">
          <h2 className="text-lg font-bold">{titulo}</h2>
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="rounded-lg p-2 text-xl leading-none hover:bg-slate-100 dark:hover:bg-slate-800">
            ×
          </button>
        </header>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </dialog>
  );
}

// ----------------------------------------------------------------------------
// Abas
// ----------------------------------------------------------------------------
export function Abas<T extends string>({ abas, ativa, onChange }: { abas: { id: T; rotulo: string }[]; ativa: T; onChange: (id: T) => void }) {
  return (
    <div role="tablist" className="flex flex-wrap gap-1 rounded-xl bg-slate-200/70 p-1 dark:bg-slate-800">
      {abas.map((a) => (
        <button
          key={a.id}
          role="tab"
          aria-selected={ativa === a.id}
          onClick={() => onChange(a.id)}
          className={clsx(
            'rounded-lg px-3 py-1.5 text-sm font-semibold transition',
            ativa === a.id ? 'bg-white text-marca-700 shadow dark:bg-slate-950 dark:text-marca-100' : 'text-slate-600 hover:text-slate-900 dark:text-slate-300',
          )}
        >
          {a.rotulo}
        </button>
      ))}
    </div>
  );
}

// ----------------------------------------------------------------------------
// KPI
// ----------------------------------------------------------------------------
const CORES_KPI: Record<string, string> = {
  blue: 'from-blue-500 to-blue-600',
  green: 'from-green-500 to-green-600',
  orange: 'from-orange-400 to-orange-500',
  red: 'from-red-500 to-red-600',
  purple: 'from-purple-500 to-purple-600',
  slate: 'from-slate-500 to-slate-600',
  teal: 'from-teal-500 to-teal-600',
};
export function Kpi({ titulo, valor, detalhe, cor = 'blue' }: { titulo: string; valor: ReactNode; detalhe?: ReactNode; cor?: string }) {
  return (
    <div className={clsx('rounded-xl bg-gradient-to-br p-4 text-white shadow', CORES_KPI[cor] ?? CORES_KPI.blue)}>
      <div className="text-xs font-semibold uppercase tracking-wide opacity-90">{titulo}</div>
      <div className="mt-1 text-3xl font-bold tabular-nums">{valor}</div>
      {detalhe && <div className="mt-1 text-xs opacity-90">{detalhe}</div>}
    </div>
  );
}

export function Tabela({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx('overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800', className)}>
      <table className="min-w-full text-sm [&_td]:px-3 [&_td]:py-2 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_thead]:bg-slate-100 dark:[&_thead]:bg-slate-800 [&_tbody_tr]:border-t [&_tbody_tr]:border-slate-200 dark:[&_tbody_tr]:border-slate-800">
        {children}
      </table>
    </div>
  );
}
