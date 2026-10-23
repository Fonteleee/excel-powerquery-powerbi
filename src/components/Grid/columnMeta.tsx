// src/components/Grid/columnMeta.tsx
// Ícone e rótulo do tipo da coluna no cabeçalho da grade.

import React from 'react';
import { Calendar, Clock, DollarSign, Hash, Key, Tag, Type, User } from 'lucide-react';
import { Sheet } from '../../types/spreadsheet';
import { cellPosToKey } from '../../engine/formulaParser';

export function getNocoColumnIcon(sheet: Sheet, colIdx: number): { icon: React.ReactNode; bg: string; label: string } {
  const headerCell = sheet.data[cellPosToKey(0, colIdx)];
  const title = String(headerCell?.value || '').toLowerCase();
  
  if (/hora|tempo|dura[cç]|perman|pausa|time/i.test(title)) {
    return { icon: <Clock className="size-2.5 text-sky-600" strokeWidth={2} />, bg: 'bg-sky-100 border border-sky-200', label: 'Hora' };
  }
  if (/data|nasc|admiss|date|criado|created/i.test(title)) {
    return { icon: <Calendar className="size-2.5 text-emerald-600" strokeWidth={2} />, bg: 'bg-emerald-100 border border-emerald-200', label: 'Data' };
  }
  if (/valor|sal[aá]|pre[cç]|custo|lucro|fatur|r\$|\$/i.test(title)) {
    return { icon: <DollarSign className="size-2.5 text-emerald-600" strokeWidth={2} />, bg: 'bg-emerald-100 border border-emerald-200', label: 'Moeda' };
  }
  if (colIdx === 0 || /id|c[oó]d|pk|chave/i.test(title)) {
    return { icon: <Key className="size-2.5 text-amber-600" strokeWidth={2} />, bg: 'bg-amber-100 border border-amber-200', label: 'ID' };
  }
  if (/agente|user|usuario|autor/i.test(title)) {
    return { icon: <User className="size-2.5 text-cyan-600" strokeWidth={2} />, bg: 'bg-cyan-100 border border-cyan-200', label: 'Usuário' };
  }
  if (/estado|status|motivo|tipo|setor/i.test(title)) {
    return { icon: <Tag className="size-2.5 text-indigo-600" strokeWidth={2} />, bg: 'bg-indigo-100 border border-indigo-200', label: 'Status' };
  }
  if (/num|qtd|total|quant|order|nc_/i.test(title) || typeof headerCell?.value === 'number') {
    return { icon: <Hash className="size-2.5 text-purple-600" strokeWidth={2} />, bg: 'bg-purple-100 border border-purple-200', label: 'Número' };
  }
  return { icon: <Type className="size-2.5 text-slate-500" strokeWidth={2} />, bg: 'bg-slate-100 border border-slate-200', label: 'Texto' };
}
