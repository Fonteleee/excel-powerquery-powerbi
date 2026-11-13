// src/components/Common/ErrorBoundary.tsx
// Se uma tela quebrar, o usuário vê uma mensagem com saída (tentar de novo / recarregar) em vez de uma página branca.
// Os dados ficam salvos no navegador; nada é apagado aqui.

import React from 'react';

interface Props {
  children: React.ReactNode;
  /** Nome da área protegida, para a mensagem ("a tela Painéis"). */
  area?: string;
  /** Quando muda, o erro é limpo (ex.: trocar de visão). */
  resetKey?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Erro na interface:', error, info.componentStack);
  }

  componentDidUpdate(prev: Props): void {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="flex flex-1 items-center justify-center p-6 bg-slate-50">
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-lg">
          <h2 className="text-base font-bold text-slate-900">Algo deu errado {this.props.area ? `em ${this.props.area}` : ''}</h2>
          <p className="mt-2 text-xs text-slate-600">
            Seus dados estão salvos neste navegador. Tente abrir a tela de novo; se continuar, recarregue a página.
          </p>
          <p className="mt-2 break-words rounded-lg bg-slate-100 px-3 py-2 font-mono text-[10px] text-slate-500">{this.state.error.message}</p>
          <div className="mt-4 flex justify-center gap-2">
            <button
              onClick={() => this.setState({ error: null })}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              Tentar de novo
            </button>
            <button
              onClick={() => window.location.reload()}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 cursor-pointer"
            >
              Recarregar
            </button>
          </div>
        </div>
      </div>
    );
  }
}
