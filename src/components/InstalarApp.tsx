import { useState } from 'react';
import clsx from 'clsx';
import { toast } from 'sonner';
import { Modal } from '@/components/ui';
import { Icone } from '@/components/Icone';
import { useInstalarApp } from '@/hooks/instalarApp';

/** Botão "Instalar app": instala direto quando o navegador permite, senão mostra o passo a passo. */
export function BotaoInstalar({ className, lateral }: { className?: string; lateral?: boolean }) {
  const { estado, instalar } = useInstalarApp();
  const [ajuda, setAjuda] = useState(false);
  if (estado === 'instalado') return null;
  return (
    <>
      <button
        type="button"
        onClick={async () => {
          if (estado === 'pronto') {
            if (await instalar()) toast.success('App instalado. Procure o ícone "Maqueiros".');
          } else setAjuda(true);
        }}
        className={clsx(
          'flex items-center gap-2 bg-marca-50 text-sm font-semibold text-marca-700 hover:bg-marca-100 dark:bg-marca-700/40 dark:text-marca-100',
          lateral ? 'justify-start rounded-lg px-3 py-2' : 'justify-center rounded-xl px-4 py-3',
          className,
        )}
      >
        <Icone nome="instalar" />
        Instalar app
      </button>
      <Modal aberto={ajuda} aoFechar={() => setAjuda(false)} titulo="Instalar o app">
        <ComoInstalar ios={estado === 'ios'} />
      </Modal>
    </>
  );
}

export function ComoInstalar({ ios }: { ios: boolean }) {
  return (
    <div className="space-y-4 text-sm">
      <p>O sistema funciona como um app: ícone próprio, abre em tela cheia e sem a barra do navegador. Não precisa de loja.</p>
      {ios ? (
        <section>
          <h3 className="font-bold">iPhone ou iPad (Safari)</h3>
          <ol className="mt-1 list-decimal space-y-1 pl-5">
            <li>
              Abra o sistema no <b>Safari</b>.
            </li>
            <li>
              Toque em <b>Compartilhar</b> (quadrado com seta para cima).
            </li>
            <li>
              Escolha <b>Adicionar à Tela de Início</b> e confirme.
            </li>
          </ol>
        </section>
      ) : (
        <>
          <section>
            <h3 className="font-bold">Celular Android (Chrome)</h3>
            <ol className="mt-1 list-decimal space-y-1 pl-5">
              <li>
                Toque nos <b>três pontinhos</b> no canto de cima.
              </li>
              <li>
                Escolha <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.
              </li>
            </ol>
          </section>
          <section>
            <h3 className="font-bold">Computador (Chrome ou Edge)</h3>
            <ol className="mt-1 list-decimal space-y-1 pl-5">
              <li>
                Clique no ícone de <b>instalar</b> no lado direito da barra de endereço (monitor com seta).
              </li>
              <li>
                Ou abra o menu do navegador e escolha <b>Instalar Maqueiros</b> (no Edge: Aplicativos → Instalar este site como aplicativo).
              </li>
            </ol>
          </section>
        </>
      )}
      <p className="text-xs text-slate-500">Depois de instalado, entre normalmente com seu usuário e senha.</p>
    </div>
  );
}
