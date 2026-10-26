// src/features/charts/SheetImagesLayer.tsx
// Imagens do arquivo do Excel, desenhadas sobre as células na posição original.

import React from 'react';
import { Sheet } from '../../types/spreadsheet';

export const SheetImagesLayer: React.FC<{ sheet: Sheet }> = ({ sheet }) => {
  const images = sheet.images ?? [];
  if (images.length === 0) return null;
  return (
    <div className="pointer-events-none absolute left-0 top-0 h-0 w-0" data-sheet-images>
      {images.map(image => (
        <img
          key={image.id}
          src={image.src}
          alt=""
          draggable={false}
          style={{ left: image.x, top: image.y, width: image.width, height: image.height }}
          className="absolute z-10 object-contain"
        />
      ))}
    </div>
  );
};
