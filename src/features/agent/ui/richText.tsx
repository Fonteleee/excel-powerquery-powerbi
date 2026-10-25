// src/features/agent/ui/richText.tsx
// Texto simples com **negrito**, `código`, listas e parágrafos. Nunca usa HTML bruto: tudo vira elementos React.

import React from 'react';

function inline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let n = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const token = match[0];
    parts.push(
      token.startsWith('**') ? (
        <strong key={`${keyPrefix}-${n++}`}>{token.slice(2, -2)}</strong>
      ) : (
        <code key={`${keyPrefix}-${n++}`} className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px] text-emerald-800">
          {token.slice(1, -1)}
        </code>
      )
    );
    last = match.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export const RichText: React.FC<{ text: string }> = ({ text }) => {
  const lines = text.split('\n');
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];
  const flush = (key: string): void => {
    if (bullets.length === 0) return;
    blocks.push(
      <ul key={key} className="my-1 list-disc space-y-0.5 pl-4">
        {bullets.map((b, i) => (
          <li key={i}>{inline(b, `${key}-${i}`)}</li>
        ))}
      </ul>
    );
    bullets = [];
  };
  lines.forEach((line, i) => {
    const bullet = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line);
    if (bullet) {
      bullets.push(bullet[1]);
      return;
    }
    flush(`ul-${i}`);
    if (line.trim() === '') return;
    blocks.push(
      <p key={`p-${i}`} className="my-1">
        {inline(line, `p-${i}`)}
      </p>
    );
  });
  flush('ul-end');
  return <div className="break-words">{blocks}</div>;
};
