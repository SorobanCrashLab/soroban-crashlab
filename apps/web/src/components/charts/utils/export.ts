import type { ChartPoint, ChartSeries } from '../types';

function csvCell(value: unknown): string {
  const text = value instanceof Date ? value.toISOString() : String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function chartDataToCsv<TPoint extends ChartPoint>(series: readonly ChartSeries<TPoint>[]): string {
  const rows = new Map<string, Map<string, number>>();
  const seriesIds = series.map(({ id }) => id);
  for (const item of series) {
    for (const point of item.data) {
      const x = point.x instanceof Date ? point.x.toISOString() : String(point.x);
      const row = rows.get(x) ?? new Map<string, number>();
      row.set(item.id, point.y);
      rows.set(x, row);
    }
  }
  return [
    ['x', ...seriesIds].map(csvCell).join(','),
    ...Array.from(rows.entries()).map(([x, values]) =>
      [x, ...seriesIds.map((id) => values.get(id) ?? '')].map(csvCell).join(','),
    ),
  ].join('\r\n');
}

export function downloadTextFile(contents: string, fileName: string, type: string): void {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadChartSvg(svg: SVGSVGElement, fileName: string): void {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.style.backgroundColor = getComputedStyle(svg.parentElement ?? svg).backgroundColor;
  const originals = [svg, ...Array.from(svg.querySelectorAll<SVGElement>('*'))];
  const copies = [clone, ...Array.from(clone.querySelectorAll<SVGElement>('*'))];
  originals.forEach((element, index) => {
    const computed = getComputedStyle(element);
    for (const property of ['fill', 'stroke', 'color', 'font-family', 'font-size', 'font-weight', 'stroke-width', 'opacity']) {
      copies[index].style.setProperty(property, computed.getPropertyValue(property));
    }
  });
  downloadTextFile(new XMLSerializer().serializeToString(clone), fileName, 'image/svg+xml;charset=utf-8');
}

export function downloadChartPng(svg: SVGSVGElement, fileName: string): Promise<void> {
  const markup = new XMLSerializer().serializeToString(svg);
  const image = new Image();
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }));
  return new Promise((resolve, reject) => {
    image.onload = () => {
      const canvas = document.createElement('canvas');
      const bounds = svg.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(bounds.width * window.devicePixelRatio));
      canvas.height = Math.max(1, Math.round(bounds.height * window.devicePixelRatio));
      const context = canvas.getContext('2d');
      if (!context) {
        URL.revokeObjectURL(url);
        reject(new Error('Canvas 2D context is not available'));
        return;
      }
      context.fillStyle = getComputedStyle(svg.parentElement ?? svg).backgroundColor || '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Could not export chart as PNG'));
          return;
        }
        const pngUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = pngUrl;
        anchor.download = fileName;
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(pngUrl), 0);
        resolve();
      }, 'image/png');
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not render chart as PNG'));
    };
    image.src = url;
  });
}
