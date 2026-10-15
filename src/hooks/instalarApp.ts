import { useEffect, useState } from 'react';

// Evento que o Chrome/Edge/Android dispara quando o site pode ser instalado como app.
type EventoInstalacao = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

let pendente: EventoInstalacao | null = null;
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    pendente = e as EventoInstalacao;
    avisar();
  });
  window.addEventListener('appinstalled', () => {
    pendente = null;
    avisar();
  });
}

export function rodandoComoApp() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function ehIOS() {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * Estado do botão "Instalar app":
 * - 'pronto': o navegador oferece instalação direta (Chrome, Edge, Android);
 * - 'ios': iPhone/iPad, onde só dá pelo menu Compartilhar → Adicionar à Tela de Início;
 * - 'manual': outros navegadores (mostra instruções);
 * - 'instalado': já está aberto como app, então o botão some.
 */
export function useInstalarApp() {
  const [, forcar] = useState(0);
  useEffect(() => {
    const f = () => forcar((n) => n + 1);
    ouvintes.add(f);
    return () => {
      ouvintes.delete(f);
    };
  }, []);
  const estado: 'pronto' | 'ios' | 'manual' | 'instalado' = rodandoComoApp() ? 'instalado' : pendente ? 'pronto' : ehIOS() ? 'ios' : 'manual';
  async function instalar() {
    if (!pendente) return false;
    await pendente.prompt();
    const { outcome } = await pendente.userChoice;
    pendente = null;
    avisar();
    return outcome === 'accepted';
  }
  return { estado, instalar };
}
