import React, { useEffect } from 'react';
import { Sparkles, CheckCircle2, X, Info, Clock, DollarSign, Percent, Calendar, Hash } from 'lucide-react';
import { DataRecognitionReport } from '../../utils/dataRecognizer';

interface AutoFormatNotificationToastProps {
  report: DataRecognitionReport | null;
  onClose: () => void;
}

export const AutoFormatNotificationToast: React.FC<AutoFormatNotificationToastProps> = ({
  report,
  onClose,
}) => {
  useEffect(() => {
    if (report) {
      const timer = setTimeout(onClose, 9000);
      return () => clearTimeout(timer);
    }
  }, [report, onClose]);

  if (!report || report.columnsFormatted.length === 0) return null;

  return (
    <div className="fixed bottom-12 right-6 z-50 max-w-md bg-white border-2 border-emerald-500 rounded-2xl shadow-2xl p-4 animate-in slide-in-from-bottom-5 duration-200">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-emerald-100 text-emerald-800">
            <Sparkles className="size-5 text-emerald-600 animate-pulse" />
          </div>
          <div>
            <h4 className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
              <span>Reconhecimento Inteligente de Dados</span>
              <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px]">
                Auto-Formatado
              </span>
            </h4>
            <p className="text-[11px] text-slate-600 font-medium">{report.summaryText}</p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Columns list */}
      <div className="mt-3 max-h-40 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin">
        {report.columnsFormatted.map((col, idx) => {
          return (
            <div
              key={idx}
              className="px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between text-[11px]"
            >
              <div className="flex items-center gap-1.5 truncate">
                <span className="font-mono font-bold text-emerald-800 bg-emerald-50 px-1 rounded">
                  {col.colLabel}
                </span>
                <span className="font-semibold text-slate-800 truncate">{col.headerName}</span>
              </div>
              <span className="font-bold text-emerald-700 whitespace-nowrap ml-2 text-[10px] bg-white px-2 py-0.5 rounded-md border border-emerald-200">
                {col.detectedType}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
        <span>Não precisou adivinhar nem formatar manualmente</span>
        <button
          onClick={onClose}
          className="px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors cursor-pointer"
        >
          Perfeito!
        </button>
      </div>
    </div>
  );
};
