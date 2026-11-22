import assert from 'node:assert';
import { getSeverityDescription, getSeverityStyleClasses } from './LogSeverityBadge';

function testLogSeverityBadge() {
  const errorStyles = getSeverityStyleClasses('error');
  assert(errorStyles.bg.includes('rose'));
  assert(errorStyles.text.includes('rose'));

  const criticalStyles = getSeverityStyleClasses('critical');
  assert(criticalStyles.bg.includes('rose'));

  const warnStyles = getSeverityStyleClasses('warn');
  assert(warnStyles.bg.includes('amber'));
  assert(warnStyles.text.includes('amber'));

  const warningStyles = getSeverityStyleClasses('warning');
  assert(warningStyles.bg.includes('amber'));

  const infoStyles = getSeverityStyleClasses('info');
  assert(infoStyles.bg.includes('sky'));

  const debugStyles = getSeverityStyleClasses('debug');
  assert(debugStyles.bg.includes('zinc'));

  const traceStyles = getSeverityStyleClasses('trace');
  assert(traceStyles.bg.includes('zinc'));

  assert(getSeverityDescription('error').toLowerCase().includes('immediate'));
  assert(getSeverityDescription('warn').toLowerCase().includes('warning'));
  assert(getSeverityDescription('info').toLowerCase().includes('informational'));
  assert(getSeverityDescription('debug').toLowerCase().includes('debug'));
}

testLogSeverityBadge();
console.log('LogSeverityBadge.test.ts: all assertions passed');
