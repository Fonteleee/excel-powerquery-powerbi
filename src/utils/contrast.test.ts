// src/utils/contrast.test.ts

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { contrastRatio, parseHexColor, readableTextColor } from './contrast';

describe('contraste', () => {
  it('lê #rgb e #rrggbb e rejeita o resto', () => {
    assert.deepEqual(parseHexColor('#fff'), [255, 255, 255]);
    assert.deepEqual(parseHexColor('#1E293B'), [30, 41, 59]);
    assert.equal(parseHexColor('red'), null);
    assert.equal(parseHexColor(undefined), null);
  });

  it('preto sobre branco tem contraste máximo (21)', () => {
    assert.equal(Math.round(contrastRatio('#000000', '#ffffff')!), 21);
  });

  it('cabeçalho escuro com fonte escura ganha texto branco', () => {
    assert.equal(readableTextColor('#1e293b', '#0f172a'), '#ffffff');
    assert.equal(readableTextColor('#1e293b'), '#ffffff');
  });

  it('fundo claro com fonte clara ganha texto escuro', () => {
    assert.equal(readableTextColor('#fef08a', '#ffffff'), '#0f172a');
  });

  it('respeita a cor pedida quando ela já é legível', () => {
    assert.equal(readableTextColor('#1e293b', '#ffffff'), '#ffffff');
    assert.equal(readableTextColor('#ffffff', '#b91c1c'), '#b91c1c');
  });

  it('fundo que não é hex não muda a cor', () => {
    assert.equal(readableTextColor('transparent', '#123456'), '#123456');
  });
});
