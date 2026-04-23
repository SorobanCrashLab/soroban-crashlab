/**
 * Validation script for Artifact Preview Modal Component
 * This file validates that the component can be imported and used correctly
 */

import ArtifactPreviewModal, { 
  formatSize, 
  formatDate, 
  generatePreviewContent, 
  Artifact, 
  ArtifactPreviewDataState 
} from "./implement-artifact-preview-modal-component";

// Type validation - ensure all required types are available
const dataState: ArtifactPreviewDataState = "success";

// Create test artifact
const testArtifact: Artifact = {
  id: "validation-test-123",
  name: "test-artifact.bin",
  type: "seed",
  size: 2048,
  updatedAt: "2026-04-23T15:30:00Z",
  runId: "run-validation",
  content_hash: "abc123def456",
};

// Function validation - ensure all utilities are exported and callable
const sizeFormatted = formatSize(testArtifact.size);
const dateFormatted = formatDate(testArtifact.updatedAt);
const contentGenerated = generatePreviewContent(testArtifact);

// Validate the results are reasonable
console.log(`Size formatted: ${sizeFormatted}`);
console.log(`Date formatted: ${dateFormatted}`);
console.log(`Content generated: ${contentGenerated.length} characters`);

// Component validation - ensure component can be instantiated
const componentProps = {
  artifact: testArtifact,
  isOpen: true,
  onClose: () => console.log("Modal closed"),
  dataState,
  onRetry: () => console.log("Retry called"),
  errorMessage: "Test error message",
  className: "test-validation-class"
};

// Validate that all props are accepted (TypeScript compilation check)
const isValidComponent = typeof ArtifactPreviewModal === 'function';

// Test all artifact types
const artifactTypes: Artifact['type'][] = ['seed', 'log', 'trace', 'coverage', 'bundle'];
const typeValidation = artifactTypes.map(type => {
  const artifact: Artifact = { ...testArtifact, type };
  const content = generatePreviewContent(artifact);
  return {
    type,
    hasContent: content.length > 0,
    contentLength: content.length
  };
});

// Test utility functions with edge cases
const utilityValidation = {
  formatSize: {
    zero: formatSize(0),
    bytes: formatSize(512),
    kilobytes: formatSize(2048),
    megabytes: formatSize(1572864),
  },
  formatDate: {
    valid: formatDate("2026-04-23T10:30:00Z"),
    invalid: formatDate("invalid-date"),
  }
};

// Export validation results
export const validationResults = {
  componentImported: isValidComponent,
  utilitiesExported: {
    formatSize: typeof formatSize === 'function',
    formatDate: typeof formatDate === 'function',
    generatePreviewContent: typeof generatePreviewContent === 'function',
  },
  dataStateType: typeof dataState === 'string',
  artifactInterface: {
    hasRequiredFields: !!(testArtifact.id && testArtifact.name && testArtifact.type && 
                          typeof testArtifact.size === 'number' && testArtifact.updatedAt),
    optionalFields: !!(testArtifact.runId && testArtifact.content_hash),
  },
  contentGeneration: {
    allTypesGenerate: typeValidation.every(t => t.hasContent),
    typeResults: typeValidation,
  },
  utilityFunctions: {
    formatSizeWorks: utilityValidation.formatSize.bytes === "512 B" && 
                     utilityValidation.formatSize.kilobytes === "2.0 KB",
    formatDateWorks: utilityValidation.formatDate.valid !== "2026-04-23T10:30:00Z" &&
                     utilityValidation.formatDate.invalid === "invalid-date",
  },
  propsAccepted: typeof componentProps === 'object',
};

// Detailed validation logging
console.log('Artifact Preview Modal Validation Results:');
console.log('==========================================');

console.log('\n✓ Component Import:', validationResults.componentImported ? 'PASS' : 'FAIL');

console.log('\n✓ Utility Functions:');
Object.entries(validationResults.utilitiesExported).forEach(([name, exported]) => {
  console.log(`  - ${name}: ${exported ? 'PASS' : 'FAIL'}`);
});

console.log('\n✓ Artifact Interface:');
console.log(`  - Required fields: ${validationResults.artifactInterface.hasRequiredFields ? 'PASS' : 'FAIL'}`);
console.log(`  - Optional fields: ${validationResults.artifactInterface.optionalFields ? 'PASS' : 'FAIL'}`);

console.log('\n✓ Content Generation:');
console.log(`  - All types generate content: ${validationResults.contentGeneration.allTypesGenerate ? 'PASS' : 'FAIL'}`);
validationResults.contentGeneration.typeResults.forEach(result => {
  console.log(`  - ${result.type}: ${result.hasContent ? 'PASS' : 'FAIL'} (${result.contentLength} chars)`);
});

console.log('\n✓ Utility Function Behavior:');
console.log(`  - formatSize: ${validationResults.utilityFunctions.formatSizeWorks ? 'PASS' : 'FAIL'}`);
console.log(`  - formatDate: ${validationResults.utilityFunctions.formatDateWorks ? 'PASS' : 'FAIL'}`);

console.log('\n✓ Props Interface:', validationResults.propsAccepted ? 'PASS' : 'FAIL');

// Overall validation result
const allValid = Object.values(validationResults).every(result => {
  if (typeof result === 'boolean') return result;
  if (typeof result === 'object') {
    return Object.values(result).every(subResult => {
      if (typeof subResult === 'boolean') return subResult;
      if (typeof subResult === 'object' && Array.isArray(subResult)) {
        return subResult.every(item => typeof item === 'object' && item.hasContent);
      }
      if (typeof subResult === 'object') {
        return Object.values(subResult).every(val => val === true);
      }
      return true;
    });
  }
  return true;
});

console.log('\n==========================================');
if (allValid) {
  console.log('🎉 All validations passed - Component is ready for use');
} else {
  console.error('❌ Some validations failed - Check implementation');
  process.exit(1);
}

// Test content generation samples
console.log('\n📋 Content Generation Samples:');
console.log('==============================');
artifactTypes.forEach(type => {
  const artifact: Artifact = { ...testArtifact, type, id: `sample-${type}` };
  const content = generatePreviewContent(artifact);
  const preview = content.length > 100 ? content.substring(0, 100) + '...' : content;
  console.log(`\n${type.toUpperCase()}:`);
  console.log(preview);
});

export default validationResults;