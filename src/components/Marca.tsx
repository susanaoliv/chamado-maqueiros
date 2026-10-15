import clsx from 'clsx';
import type { ReactNode } from 'react';

/** Logo completa da Casa de Saúde São Lucas. Sempre sobre fundo branco (a logo é verde sobre transparente). */
export function LogoHospital({ className }: { className?: string }) {
  return <img src="/logo-cssl.png" alt="Casa de Saúde São Lucas" className={clsx('h-auto select-none', className)} draggable={false} />;
}

/** Só o símbolo (para barras e cabeçalhos estreitos). */
export function SimboloHospital({ className }: { className?: string }) {
  return <img src="/simbolo-128.png" alt="" className={clsx('select-none', className)} draggable={false} />;
}

/** Fundo das telas de entrada (login, cadastro): verde da marca com a logo num cartão branco. */
export function TelaEntrada({ titulo, subtitulo, largura = 'max-w-sm', children }: { titulo: string; subtitulo?: string; largura?: string; children: ReactNode }) {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-gradient-to-br from-marca-600 via-marca-700 to-marca-900 p-4">
      {/* desenho suave de fundo com o símbolo */}
      <SimboloHospital className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 opacity-10 mix-blend-luminosity" />
      <div className={clsx('relative w-full', largura)}>
        <div className="mb-4 rounded-2xl bg-white px-6 py-5 text-center shadow-lg">
          <LogoHospital className="mx-auto w-56" />
          <div className="mt-3 border-t border-marca-100 pt-3">
            <h1 className="text-xl font-bold text-marca-800">{titulo}</h1>
            {subtitulo && <p className="text-sm text-slate-500">{subtitulo}</p>}
          </div>
        </div>
        {children}
      </div>
    </main>
  );
}
