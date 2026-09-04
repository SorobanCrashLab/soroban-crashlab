import { describe, expect, it } from 'vitest';
import {
  clampToGrid,
  healLayout,
  type Widget,
} from './implement-widget-layout-editor-component';

describe('clampToGrid', () => {
  const grid = { cols: 6, rows: 8 };

  it('clamps top-left origin to 0,0', () => {
    const res = clampToGrid({ x: 0, y: 0 }, { width: 1, height: 1 }, grid);
    expect(res).toEqual({ x: 0, y: 0 });
  });

  it('clamps negative origin coordinates to 0,0', () => {
    const res = clampToGrid({ x: -5, y: -10 }, { width: 1, height: 1 }, grid);
    expect(res).toEqual({ x: 0, y: 0 });
  });

  it('clamps widget dragging past max grid bounds', () => {
    const res = clampToGrid({ x: 10, y: 15 }, { width: 2, height: 2 }, grid);
    expect(res).toEqual({ x: 4, y: 6 });
  });

  it('snaps fractional coordinates to integer grid cells', () => {
    const res = clampToGrid({ x: 1.4, y: 2.7 }, { width: 1, height: 1 }, grid);
    expect(res).toEqual({ x: 1, y: 3 });
  });

  it('handles oversized widget versus small grid gracefully', () => {
    const res = clampToGrid({ x: 5, y: 5 }, { width: 8, height: 10 }, grid);
    expect(res).toEqual({ x: 0, y: 0 });
  });
});

describe('healLayout', () => {
  const grid = { cols: 6, rows: 8 };

  it('heals corrupted off-grid layout positions', () => {
    const corruptedWidgets: Widget[] = [
      {
        id: 'w1',
        type: 'chart',
        title: 'Chart 1',
        size: 'medium',
        position: { x: -2, y: 12 },
        config: {},
        visible: true,
      },
      {
        id: 'w2',
        type: 'metric',
        title: 'Metric 1',
        size: 'small',
        position: { x: 1.2, y: 3.8 },
        config: {},
        visible: true,
      },
    ];

    const healed = healLayout(corruptedWidgets, grid);
    expect(healed[0].position).toEqual({ x: 0, y: 7 });
    expect(healed[1].position).toEqual({ x: 1, y: 4 });
  });

  it('is idempotent when re-healing an already healed layout', () => {
    const widgets: Widget[] = [
      {
        id: 'w1',
        type: 'chart',
        title: 'Chart 1',
        size: 'medium',
        position: { x: -2, y: 12 },
        config: {},
        visible: true,
      },
    ];

    const firstPass = healLayout(widgets, grid);
    const secondPass = healLayout(firstPass, grid);

    expect(secondPass).toEqual(firstPass);
    expect(secondPass[0].position).toEqual({ x: 0, y: 7 });
  });
});
