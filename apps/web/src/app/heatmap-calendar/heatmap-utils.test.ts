import {
  aggregateHeatmapData,
  createHeatmapShareLink,
  heatmapToCsv,
  generateMockHeatmapData,
  getHeatmapColor,
  getMonthWeeks,
} from './heatmap-utils';

const mockData = generateMockHeatmapData();
console.assert(mockData.length === 90, 'Should generate 90 days of data');
console.assert(
  mockData.every(d => d.date && d.count >= 0),
  'All data points should have valid date and count'
);

const color = getHeatmapColor(3, 'high');
console.assert(color.startsWith('#'), 'Color should be hex format');

const weeks = getMonthWeeks(2024, 0);
console.assert(weeks.length > 0, 'Should generate weeks');
console.assert(
  weeks.every(week => week.length === 7),
  'Each week should have 7 days'
);

const severeColor = getHeatmapColor(10, 'critical');
const lowColor = getHeatmapColor(1, 'low');
console.assert(severeColor !== lowColor, 'Different severities should have different colors');

const aggregated = aggregateHeatmapData([
  { date: '2024-01-01', count: 2, runs: 3, severity: 'low', gas: 100, runIds: ['a'] },
  { date: '2024-01-01', count: 4, runs: 5, severity: 'high', gas: 200, runIds: ['b'] },
]);
console.assert(aggregated[0].runs === 8 && aggregated[0].count === 6, 'Should aggregate heatmap metrics');
console.assert(heatmapToCsv(aggregated, 'runs').includes('runs'), 'Should export heatmap CSV');
console.assert(createHeatmapShareLink('https://example.com/heatmap-calendar', '2024-01-01', 'gas').includes('metric=gas'), 'Should create share link');

console.log('✓ Heatmap utilities tests passed');
