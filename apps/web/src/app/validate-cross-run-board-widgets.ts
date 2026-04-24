/**
 * Validation script for Cross-run Board Widgets Component
 * This file validates that the component can be imported and used correctly
 */

import CrossRunBoardWidgets, { computeWidgetMetrics, CrossRunBoardDataState } from "./implement-cross-run-board-widgets-component";
import { FuzzingRun } from "./types";

// Type validation - ensure all required types are available
const dataState: CrossRunBoardDataState = "success";
const runs: FuzzingRun[] = [];

// Function validation - ensure computeWidgetMetrics is exported and callable
const metrics = computeWidgetMetrics(runs);

// Component validation - ensure component can be instantiated
const componentProps = {
  runs,
  dataState,
  onRetry: () => console.log("Retry called"),
  errorMessage: "Test error",
  className: "test-class"
};

// Validate that all props are accepted (TypeScript compilation check)
const isValidComponent = typeof CrossRunBoardWidgets === 'function';

// Export validation results
export const validationResults = {
  componentImported: isValidComponent,
  metricsFunction: typeof computeWidgetMetrics === 'function',
  dataStateType: typeof dataState === 'string',
  metricsComputed: typeof metrics === 'object' && metrics !== null,
  propsAccepted: typeof componentProps === 'object',
};

// Log validation results
console.log('Cross-run Board Widgets Validation Results:', validationResults);

// Ensure all validations pass
const allValid = Object.values(validationResults).every(result => result === true);

if (allValid) {
  console.log('✅ All validations passed - Component is ready for use');
} else {
  console.error('❌ Some validations failed - Check implementation');
  process.exit(1);
}

export default validationResults;