// src/features/relations/ui/Pin.tsx
// Pino de conexão. A posição é MEDIDA no DOM por `data-pin` (ver usePinMeasure): nada de coordenadas fixas.
// A área clicável é de 28px (alvo de toque) com o ponto visível de 12px no centro.

import React from 'react';
import { CableTone } from './tokens';

export type PinSide = 'left' | 'right';

interface PinProps {
  /** Valor de `data-pin`: "<out|in>:<chave>" (coluna, "*" ou nome da porta). */
  pinKey: string;
  side: PinSide;
  title: string;
  tone?: CableTone;
  active?: boolean;
  /** Pino é um destino válido para a ligação em andamento. */
  accepts?: boolean;
  /** Deslocamento da borda do contêiner pai em px (negativo = para fora). */
  offset?: number;
  /** Posição vertical (CSS). Padrão: centro. */
  top?: string;
}

export const Pin: React.FC<PinProps> = ({ pinKey, side, title, tone, active, accepts, offset = -14, top = '50%' }) => (
  <div
    data-pin={pinKey}
    data-accepts={accepts ? 'true' : undefined}
    title={title}
    className="rel-pin-hit"
    style={{ [side]: offset, top, transform: 'translateY(-50%)', cursor: side === 'right' ? 'crosshair' : 'copy' }}
  >
    <span className="rel-pin" data-tone={tone} data-active={active ? 'true' : undefined} />
  </div>
);
