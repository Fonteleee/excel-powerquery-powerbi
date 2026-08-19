import React, { useState } from 'react';
import { Palette, Check, X } from 'lucide-react';
import { CellRange, ConditionalFormatRule, ConditionalRuleType } from '../../types/spreadsheet';
import { colIndexToLabel } from '../../engine/formulaParser';

interface ConditionalFormatModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedRange: CellRange;
  onAddRule: (rule: ConditionalFormatRule) => void;
}

export const ConditionalFormatModal: React.FC<ConditionalFormatModalProps> = ({
  isOpen,
  onClose,
  selectedRange,
  onAddRule,
}) => {
  const [ruleType, setRuleType] = useState<ConditionalRuleType>('highlight_greater');
  const [value1, setValue1] = useState<string>('1000');
  const [value2, setValue2] = useState<string>('5000');
  const [presetStyle, setPresetStyle] = useState<string>('green');

  if (!isOpen) return null;

  const rangeStr = `${colIndexToLabel(selectedRange.startCol)}${selectedRange.startRow + 1}:${colIndexToLabel(selectedRange.endCol)}${selectedRange.endRow + 1}`;

  const handleSubmit = () => {
    let styleObj: ConditionalFormatRule['style'] = {};

    if (ruleType === 'data_bar') {
      styleObj = { barColor: presetStyle === 'blue' ? '#3b82f6' : '#107c41' };
    } else if (ruleType === 'color_scale_3') {
      styleObj = {
        minColor: '#fecaca',
        midColor: '#fef08a',
        maxColor: '#bbf7d0',
      };
    } else if (ruleType === 'icon_set') {
      styleObj = { iconSet: (presetStyle as any) || 'traffic' };
    } else {
      if (presetStyle === 'green') {
        styleObj = { bgColor: '#dcfce7', textColor: '#166534' };
      } else if (presetStyle === 'red') {
        styleObj = { bgColor: '#fee2e2', textColor: '#991b1b' };
      } else if (presetStyle === 'yellow') {
        styleObj = { bgColor: '#fef9c3', textColor: '#854d0e' };
      } else {
        styleObj = { bgColor: '#e0f2fe', textColor: '#075985' };
      }
    }

    onAddRule({
      id: `rule-${Date.now()}`,
      type: ruleType,
      value1: value1,
      value2: value2,
      range: selectedRange,
      style: styleObj,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-100 text-emerald-800 border border-emerald-200">
              <Palette className="size-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Nova Regra de Formatação</h3>
              <p className="text-xs text-slate-500">
                Aplicar no intervalo: <span className="font-mono text-emerald-800 font-bold">{rangeStr}</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-4 bg-white">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Selecione o tipo de regra:
            </label>
            <select
              value={ruleType}
              onChange={e => setRuleType(e.target.value as ConditionalRuleType)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 font-medium focus:outline-hidden focus:border-emerald-600"
            >
              <optgroup label="Realce de Células">
                <option value="highlight_greater">É Maior do Que (&gt;)</option>
                <option value="highlight_less">É Menor do Que (&lt;)</option>
                <option value="highlight_between">Está Entre dois valores</option>
                <option value="highlight_equal">É Igual A (=)</option>
                <option value="highlight_text">Texto Que Contém</option>
                <option value="highlight_duplicate">Valores Duplicados</option>
              </optgroup>
              <optgroup label="Valores Médios">
                <option value="highlight_above_avg">Acima da Média</option>
                <option value="highlight_below_avg">Abaixo da Média</option>
              </optgroup>
              <optgroup label="Gradientes & Indicadores">
                <option value="data_bar">Barras de Dados (Data Bar)</option>
                <option value="color_scale_3">Escala de 3 Cores (Mapa de Calor)</option>
                <option value="icon_set">Conjunto de Ícones (Semáforo)</option>
              </optgroup>
            </select>
          </div>

          {/* Value Inputs */}
          {(ruleType === 'highlight_greater' ||
            ruleType === 'highlight_less' ||
            ruleType === 'highlight_equal' ||
            ruleType === 'highlight_text') && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600">Valor ou texto de comparação:</label>
              <input
                type="text"
                value={value1}
                onChange={e => setValue1(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-hidden focus:border-emerald-600"
              />
            </div>
          )}

          {ruleType === 'highlight_between' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600">Valor Mínimo:</label>
                <input
                  type="text"
                  value={value1}
                  onChange={e => setValue1(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600">Valor Máximo:</label>
                <input
                  type="text"
                  value={value2}
                  onChange={e => setValue2(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800"
                />
              </div>
            </div>
          )}

          {/* Style presets */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Estilo de Formatação:
            </label>

            {ruleType === 'icon_set' ? (
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setPresetStyle('traffic')}
                  className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                    presetStyle === 'traffic' ? 'bg-emerald-50 border-emerald-600' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <span className="size-2 rounded-full bg-emerald-600"></span>
                  <span className="size-2 rounded-full bg-amber-500"></span>
                  <span className="size-2 rounded-full bg-rose-500"></span>
                  <span className="text-[11px] text-slate-700 ml-1">Semáforo</span>
                </button>
              </div>
            ) : ruleType === 'data_bar' ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPresetStyle('green')}
                  className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 cursor-pointer ${
                    presetStyle === 'green' ? 'bg-emerald-50 border-emerald-600' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="h-3 w-8 bg-emerald-600 rounded-xs"></div>
                  <span className="text-slate-800">Verde Esmeralda</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPresetStyle('blue')}
                  className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 cursor-pointer ${
                    presetStyle === 'blue' ? 'bg-blue-50 border-blue-600' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="h-3 w-8 bg-blue-600 rounded-xs"></div>
                  <span className="text-slate-800">Azul Oceano</span>
                </button>
              </div>
            ) : ruleType === 'color_scale_3' ? (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-3">
                <div className="h-4 flex-1 rounded bg-linear-to-r from-rose-300 via-amber-300 to-emerald-300"></div>
                <span className="text-xs text-slate-700 font-medium">Vermelho &rarr; Amarelo &rarr; Verde</span>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPresetStyle('green')}
                  className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 cursor-pointer ${
                    presetStyle === 'green'
                      ? 'bg-emerald-50 border-emerald-600 text-emerald-900'
                      : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                >
                  <span className="size-3 rounded-full bg-emerald-600"></span>
                  Preenchimento Verde Suave
                </button>

                <button
                  type="button"
                  onClick={() => setPresetStyle('red')}
                  className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 cursor-pointer ${
                    presetStyle === 'red'
                      ? 'bg-rose-50 border-rose-600 text-rose-900'
                      : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                >
                  <span className="size-3 rounded-full bg-rose-600"></span>
                  Preenchimento Vermelho
                </button>

                <button
                  type="button"
                  onClick={() => setPresetStyle('yellow')}
                  className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 cursor-pointer ${
                    presetStyle === 'yellow'
                      ? 'bg-amber-50 border-amber-600 text-amber-900'
                      : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                >
                  <span className="size-3 rounded-full bg-amber-500"></span>
                  Preenchimento Amarelo
                </button>

                <button
                  type="button"
                  onClick={() => setPresetStyle('blue')}
                  className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 cursor-pointer ${
                    presetStyle === 'blue'
                      ? 'bg-blue-50 border-blue-600 text-blue-900'
                      : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                >
                  <span className="size-3 rounded-full bg-blue-600"></span>
                  Preenchimento Azul
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            className="px-5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-xs"
          >
            <Check className="size-4" />
            Aplicar Regra
          </button>
        </div>
      </div>
    </div>
  );
};
