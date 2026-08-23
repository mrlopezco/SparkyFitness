import type { ComponentType, ReactNode } from 'react';
import WidgetGrid from '@/components/widgets/WidgetGrid';
import {
  generateDefaultLayouts,
  isMealWidgetKey,
  type DashboardLayouts,
  type WidgetLayout,
} from '@/utils/dashboardLayout';

export interface DiaryWidget {
  key: string;
  title: string;
  icon: ComponentType<{ className?: string }>;
  render: () => ReactNode;
}

interface DiaryWidgetGridProps {
  widgets: DiaryWidget[];
  toolbarContainer?: HTMLElement | null;
}

const PAGE_KEY = 'diary';
const WEIGHT_KEY = 'weight';

/**
 * Fork: insert the weight widget after water in upstream defaults without
 * editing dashboardLayout.ts (keeps rebases clean).
 */
function injectWeightAfterWater(
  layouts: DashboardLayouts,
  cols: Record<keyof DashboardLayouts, number>
): DashboardLayouts {
  const inject = (
    items: WidgetLayout[],
    breakpointCols: number
  ): WidgetLayout[] => {
    if (items.some((it) => it.i === WEIGHT_KEY)) return items;

    const waterIdx = items.findIndex((it) => it.i === 'water');
    const water = waterIdx >= 0 ? items[waterIdx] : undefined;
    const tile: WidgetLayout = {
      i: WEIGHT_KEY,
      x: water?.x ?? 0,
      y: water != null ? water.y + water.h : 0,
      w: water?.w ?? Math.min(3, breakpointCols),
      h: water != null ? Math.min(water.h, 8) : 8,
      minW: 2,
      minH: 4,
    };

    if (waterIdx < 0) {
      const maxY = items.reduce((m, it) => Math.max(m, it.y + it.h), 0);
      return [...items, { ...tile, y: maxY }];
    }

    const next = [...items];
    next.splice(waterIdx + 1, 0, tile);
    for (let i = 0; i < next.length; i++) {
      const it = next[i]!;
      if (it.i === WEIGHT_KEY) continue;
      if (it.y >= tile.y) {
        next[i] = { ...it, y: it.y + tile.h };
      }
    }
    return next;
  };

  return {
    lg: inject(layouts.lg, cols.lg),
    md: inject(layouts.md, cols.md),
    sm: inject(layouts.sm, cols.sm),
    xs: inject(layouts.xs, cols.xs),
  };
}

const diaryDefaultLayouts = (widgetKeys: string[]): DashboardLayouts => {
  const base = generateDefaultLayouts(widgetKeys.filter(isMealWidgetKey));
  if (!widgetKeys.includes(WEIGHT_KEY)) return base;
  return injectWeightAfterWater(base, { lg: 12, md: 10, sm: 6, xs: 4 });
};

const DiaryWidgetGrid = ({
  widgets,
  toolbarContainer,
}: DiaryWidgetGridProps) => (
  <WidgetGrid
    pageKey={PAGE_KEY}
    widgets={widgets}
    generateDefaultLayouts={diaryDefaultLayouts}
    toolbarContainer={toolbarContainer}
  />
);

export default DiaryWidgetGrid;
