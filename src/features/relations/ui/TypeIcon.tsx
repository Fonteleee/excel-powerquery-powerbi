// src/features/relations/ui/TypeIcon.tsx
// Ícone do tipo INFERIDO pelos valores da coluna (não pelo nome do cabeçalho).

import React from 'react';
import { Calendar, Hash, KeyRound, SquareCheck, Type } from 'lucide-react';
import { InferredType, TYPE_LABELS } from '../analysis/typeInference';

const STYLE: Record<InferredType, { icon: React.ReactNode; color: string }> = {
  id: { icon: <KeyRound className="size-3" aria-hidden />, color: 'text-amber-700' },
  number: { icon: <Hash className="size-3" aria-hidden />, color: 'text-violet-700' },
  date: { icon: <Calendar className="size-3" aria-hidden />, color: 'text-emerald-700' },
  boolean: { icon: <SquareCheck className="size-3" aria-hidden />, color: 'text-indigo-700' },
  text: { icon: <Type className="size-3" aria-hidden />, color: 'text-slate-600' },
  empty: { icon: <Type className="size-3 opacity-40" aria-hidden />, color: 'text-slate-400' },
};

interface TypeIconProps {
  type: InferredType | undefined;
  className?: string;
}

export const TypeIcon: React.FC<TypeIconProps> = ({ type = 'empty', className = '' }) => {
  const style = STYLE[type];
  return (
    <span
      className={`inline-flex shrink-0 items-center ${style.color} ${className}`}
      title={`Tipo inferido pelos valores: ${TYPE_LABELS[type]}`}
      role="img"
      aria-label={TYPE_LABELS[type]}
    >
      {style.icon}
    </span>
  );
};
