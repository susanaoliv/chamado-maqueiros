import { useState } from 'react';
import clsx from 'clsx';
import { toast } from 'sonner';
import { Botao, Campo, Entrada, Modal } from '@/components/ui';
import { Icone } from '@/components/Icone';
import { supabase } from '@/lib/supabase';
import { mensagemErro } from '@/lib/erros';

/** Botão + janela para a própria pessoa trocar a senha (não derruba a sessão atual). */
export function BotaoMinhaSenha({ className, lateral }: { className?: string; lateral?: boolean }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className={clsx(
          'flex items-center gap-2 text-sm font-semibold',
          lateral ? 'justify-start rounded-lg px-3 py-2 text-marca-50 hover:bg-white/10' : 'justify-center rounded-xl border border-slate-200 px-4 py-3 text-slate-700 dark:border-slate-700 dark:text-slate-200',
          className,
        )}
      >
        <Icone nome="chave" className={lateral ? 'h-5 w-5' : 'h-5 w-5'} />
        Minha senha
      </button>
      {aberto && <TrocarSenha aoFechar={() => setAberto(false)} />}
    </>
  );
}

function TrocarSenha({ aoFechar }: { aoFechar: () => void }) {
  const [nova, setNova] = useState('');
  const [repetir, setRepetir] = useState('');
  const [salvando, setSalvando] = useState(false);
  const curta = nova.length > 0 && nova.length < 8;
  const diferente = repetir.length > 0 && nova !== repetir;
  const valido = nova.length >= 8 && nova === repetir;

  async function salvar() {
    setSalvando(true);
    const { error } = await supabase.auth.updateUser({ password: nova });
    setSalvando(false);
    if (error) {
      const msg = mensagemErro(error);
      toast.error(/same|different from the old/i.test(msg) ? 'A senha nova precisa ser diferente da atual.' : msg);
      return;
    }
    toast.success('Senha trocada. Use a nova senha no próximo acesso.');
    aoFechar();
  }

  return (
    <Modal aberto aoFechar={aoFechar} titulo="Trocar minha senha">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (valido) salvar();
        }}
      >
        <Campo rotulo="Nova senha" htmlFor="ms_nova" dica="Mínimo de 8 caracteres." erro={curta ? 'Use pelo menos 8 caracteres.' : undefined}>
          <Entrada id="ms_nova" type="password" autoComplete="new-password" autoFocus value={nova} onChange={(e) => setNova(e.target.value)} />
        </Campo>
        <Campo rotulo="Repita a nova senha" htmlFor="ms_rep" erro={diferente ? 'As duas senhas não são iguais.' : undefined}>
          <Entrada id="ms_rep" type="password" autoComplete="new-password" value={repetir} onChange={(e) => setRepetir(e.target.value)} />
        </Campo>
        <p className="text-xs text-slate-500">Você continua conectado neste aparelho. Nos outros, entre de novo com a senha nova.</p>
        <div className="flex justify-end gap-2">
          <Botao type="button" variante="secundario" onClick={aoFechar}>
            Voltar
          </Botao>
          <Botao type="submit" disabled={!valido} carregando={salvando}>
            Salvar nova senha
          </Botao>
        </div>
      </form>
    </Modal>
  );
}
