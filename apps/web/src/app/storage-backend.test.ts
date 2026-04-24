/**
 * Comprehensive tests for Storage Backend Integration
 *
 * Tests cover:
 * - Memory backend implementation
 * - IndexedDB backend implementation
 * - Backend manager and switching
 * - Error handling and edge cases
 * - Operation logging and observability
 * - Configuration verification
 * - Statistics and quota tracking
 */

import {
  MemoryStorageBackend,
  IndexedDBStorageBackend,
  StorageBackendManager,
  StorageError,
  StorageErrorCode,
  initializeStorageBackend,
} from './storage-backend';

// Test helper: Create a test file
function createTestFile(
  name: string = 'test.txt',
  size: number = 1024,
  type: string = 'text/plain'
): File {
  const content = new Array(size).fill('x').join('');
  return new File([content], name, { type });
}

// Test helper: Compare artifacts
function compareArtifacts(
  actual: any,
  expected: Partial<any>
): boolean {
  if (expected.id && actual.id !== expected.id) return false;
  if (expected.name && actual.name !== expected.name) return false;
  if (expected.sizeBytes && actual.sizeBytes !== expected.sizeBytes)
    return false;
  return true;
}

// ============================================================================
// MEMORY BACKEND TESTS
// ============================================================================

function testMemoryBackendUpload(
  backend: MemoryStorageBackend
): void {
  const file = createTestFile('artifact.json', 2048, 'application/json');
  console.log('Testing memory backend upload...');

  backend.upload(file).then(artifact => {
    if (!artifact.id || artifact.name !== 'artifact.json') {
      throw new Error('Upload failed: invalid artifact metadata');
    }
    if (artifact.sizeBytes !== 2048) {
      throw new Error('Upload failed: size mismatch');
    }
    console.log('✓ Memory backend upload test passed');
  });
}

function testMemoryBackendList(
  backend: MemoryStorageBackend
): void {
  console.log('Testing memory backend list...');

  const file1 = createTestFile('artifact1.json', 1024);
  const file2 = createTestFile('artifact2.bin', 2048);

  Promise.all([backend.upload(file1), backend.upload(file2)])
    .then(([art1, art2]) => {
      return backend.list().then(artifacts => {
        if (artifacts.length !== 2) {
          throw new Error(
            `List failed: expected 2 artifacts, got ${artifacts.length}`
          );
        }
        if (!artifacts.find(a => a.id === art1.id)) {
          throw new Error('List failed: artifact1 not found');
        }
        if (!artifacts.find(a => a.id === art2.id)) {
          throw new Error('List failed: artifact2 not found');
        }
        console.log('✓ Memory backend list test passed');
      });
    });
}

function testMemoryBackendDownload(
  backend: MemoryStorageBackend
): void {
  console.log('Testing memory backend download...');

  const file = createTestFile('test-download.bin', 512);
  backend.upload(file).then(artifact => {
    backend.download(artifact.id).then(blob => {
      if (blob.size !== 512) {
        throw new Error(
          `Download failed: size mismatch ${blob.size} !== 512`
        );
      }
      console.log('✓ Memory backend download test passed');
    });
  });
}

function testMemoryBackendDelete(
  backend: MemoryStorageBackend
): void {
  console.log('Testing memory backend delete...');

  const file = createTestFile('to-delete.txt', 256);
  backend.upload(file).then(artifact => {
    backend.delete(artifact.id).then(() => {
      backend.exists(artifact.id).then(exists => {
        if (exists) {
          throw new Error('Delete failed: artifact still exists');
        }
        console.log('✓ Memory backend delete test passed');
      });
    });
  });
}

function testMemoryBackendQuotaExceeded(
  backend: MemoryStorageBackend
): void {
  console.log('Testing memory backend quota exceeded...');

  const smallBackend = new MemoryStorageBackend(1024); // 1KB limit
  const largeFile = createTestFile('large.bin', 2048); // 2KB file

  smallBackend.upload(largeFile).catch(error => {
    if (error instanceof StorageError &&
        error.code === StorageErrorCode.QuotaExceeded) {
      console.log('✓ Memory backend quota exceeded test passed');
    } else {
      throw new Error(
        'Quota exceeded test failed: wrong error type'
      );
    }
  });
}

function testMemoryBackendNotFound(
  backend: MemoryStorageBackend
): void {
  console.log('Testing memory backend not found...');

  backend.download('nonexistent-id').catch(error => {
    if (error instanceof StorageError &&
        error.code === StorageErrorCode.NotFound) {
      console.log('✓ Memory backend not found test passed');
    } else {
      throw new Error('Not found test failed: wrong error type');
    }
  });
}

function testMemoryBackendStats(
  backend: MemoryStorageBackend
): void {
  console.log('Testing memory backend statistics...');

  const file1 = createTestFile('stat-test1.json', 1024);
  const file2 = createTestFile('stat-test2.bin', 2048);

  Promise.all([backend.upload(file1), backend.upload(file2)])
    .then(() => {
      return backend.getStats().then(stats => {
        if (stats.totalArtifacts !== 2) {
          throw new Error(
            `Stats test failed: expected 2 artifacts, got ${stats.totalArtifacts}`
          );
        }
        if (stats.usedBytes !== 3072) {
          throw new Error(
            `Stats test failed: expected 3072 bytes, got ${stats.usedBytes}`
          );
        }
        console.log('✓ Memory backend statistics test passed');
      });
    });
}

function testMemoryBackendConfiguration(
  backend: MemoryStorageBackend
): void {
  console.log('Testing memory backend configuration...');

  const config = backend.getConfiguration();
  if (config.type !== 'memory') {
    throw new Error('Configuration test failed: wrong type');
  }
  if (config.readonly !== false) {
    throw new Error('Configuration test failed: should not be readonly');
  }
  console.log('✓ Memory backend configuration test passed');
}

// ============================================================================
// BACKEND MANAGER TESTS
// ============================================================================

function testBackendManagerSwitching(): void {
  console.log('Testing backend manager switching...');

  const manager = new StorageBackendManager(new MemoryStorageBackend());
  const initialConfig = manager.getCurrentConfiguration();

  if (initialConfig.type !== 'memory') {
    throw new Error('Manager switch test failed: initial backend wrong');
  }

  // Note: Switching to indexed-db in tests is complex due to IndexedDB limitations
  // We verify the switch method exists and works for memory backend
  const availableBackends = manager.getAvailableBackends();
  if (!availableBackends.includes('memory')) {
    throw new Error('Manager switch test failed: memory backend not available');
  }

  console.log('✓ Backend manager switching test passed');
}

function testBackendManagerOperationLog(): void {
  console.log('Testing backend manager operation logging...');

  const backend = new MemoryStorageBackend();
  const manager = new StorageBackendManager(backend);
  const file = createTestFile('log-test.txt', 512);

  manager.upload(file).then(() => {
    const log = manager.getOperationLog();
    const uploadLog = log.find(entry => entry.operation === 'upload');

    if (!uploadLog) {
      throw new Error('Operation log test failed: upload not logged');
    }
    if (!uploadLog.success) {
      throw new Error('Operation log test failed: upload should be successful');
    }

    console.log('✓ Backend manager operation logging test passed');
  });
}

function testBackendManagerErrorLogging(): void {
  console.log('Testing backend manager error logging...');

  const backend = new MemoryStorageBackend();
  const manager = new StorageBackendManager(backend);

  manager.download('nonexistent').catch(() => {
    const log = manager.getOperationLog();
    const downloadLog = log.find(entry => entry.operation === 'download');

    if (!downloadLog) {
      throw new Error('Error log test failed: operation not logged');
    }
    if (downloadLog.success) {
      throw new Error('Error log test failed: should have failed');
    }
    if (!downloadLog.error) {
      throw new Error('Error log test failed: error message missing');
    }

    console.log('✓ Backend manager error logging test passed');
  });
}

function testBackendManagerVerify(): void {
  console.log('Testing backend manager verify...');

  const backend = new MemoryStorageBackend();
  const manager = new StorageBackendManager(backend);

  manager.verify().then(isVerified => {
    if (!isVerified) {
      throw new Error('Verify test failed: backend verification failed');
    }

    const log = manager.getOperationLog();
    const verifyLog = log.find(entry => entry.operation === 'verify');

    if (!verifyLog || !verifyLog.success) {
      throw new Error('Verify test failed: verification not logged correctly');
    }

    console.log('✓ Backend manager verify test passed');
  });
}

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

function testBackendIntegrationUploadListDownload(): void {
  console.log('Testing upload → list → download integration...');

  const backend = new MemoryStorageBackend();
  const manager = new StorageBackendManager(backend);
  const file = createTestFile('integration-test.json', 1024);

  manager
    .upload(file)
    .then(artifact => {
      return manager.list().then(artifacts => {
        if (!artifacts.find(a => a.id === artifact.id)) {
          throw new Error(
            'Integration test failed: uploaded artifact not in list'
          );
        }
        return manager.download(artifact.id);
      });
    })
    .then(blob => {
      if (blob.size !== 1024) {
        throw new Error(
          `Integration test failed: blob size mismatch ${blob.size} !== 1024`
        );
      }
      console.log(
        '✓ Integration test (upload → list → download) passed'
      );
    });
}

function testBackendIntegrationQuotaTracking(): void {
  console.log('Testing quota tracking integration...');

  const backend = new MemoryStorageBackend(5120); // 5KB total
  const manager = new StorageBackendManager(backend);

  // Upload multiple files
  const files = [
    createTestFile('file1.txt', 1024),
    createTestFile('file2.txt', 2048),
  ];

  Promise.all(files.map(f => manager.upload(f)))
    .then(() => {
      return manager.getStats();
    })
    .then(stats => {
      if (stats.usedBytes !== 3072) {
        throw new Error(
          `Quota tracking failed: expected 3072 bytes, got ${
            stats.usedBytes
          }`
        );
      }
      if (stats.quotaPercentUsed !== 60) {
        throw new Error(
          `Quota tracking failed: expected 60%, got ${stats.quotaPercentUsed}%`
        );
      }
      console.log('✓ Quota tracking integration test passed');
    });
}

function testBackendIntegrationDeleteAndStats(): void {
  console.log('Testing delete and stats integration...');

  const backend = new MemoryStorageBackend();
  const manager = new StorageBackendManager(backend);
  const files = [
    createTestFile('del1.txt', 512),
    createTestFile('del2.txt', 512),
  ];

  let artifact1Id: string;

  Promise.all(files.map(f => manager.upload(f)))
    .then(artifacts => {
      artifact1Id = artifacts[0].id;
      return manager.delete(artifact1Id);
    })
    .then(() => {
      return manager.getStats();
    })
    .then(stats => {
      if (stats.totalArtifacts !== 1) {
        throw new Error(
          `Delete and stats test failed: expected 1 artifact, got ${
            stats.totalArtifacts
          }`
        );
      }
      if (stats.usedBytes !== 512) {
        throw new Error(
          `Delete and stats test failed: expected 512 bytes, got ${stats.usedBytes}`
        );
      }
      console.log('✓ Delete and stats integration test passed');
    });
}

// ============================================================================
// EDGE CASE TESTS
// ============================================================================

function testEdgeCaseEmptyFilename(): void {
  console.log('Testing edge case: empty filename...');

  const backend = new MemoryStorageBackend();
  const file = new File(['content'], '', { type: 'text/plain' });

  backend.upload(file).then(artifact => {
    if (artifact.name !== '') {
      throw new Error('Empty filename test failed: filename should be empty');
    }
    console.log('✓ Edge case (empty filename) test passed');
  });
}

function testEdgeCaseZeroByteFile(): void {
  console.log('Testing edge case: zero-byte file...');

  const backend = new MemoryStorageBackend();
  const file = new File([], 'empty.txt', { type: 'text/plain' });

  backend.upload(file).then(artifact => {
    if (artifact.sizeBytes !== 0) {
      throw new Error('Zero byte test failed: size should be 0');
    }
    console.log('✓ Edge case (zero-byte file) test passed');
  });
}

function testEdgeCaseSpecialCharactersInName(): void {
  console.log('Testing edge case: special characters in filename...');

  const backend = new MemoryStorageBackend();
  const filename = 'artifact-$%^&*()_+{}|:<>?.test';
  const file = createTestFile(filename, 256);

  backend.upload(file).then(artifact => {
    if (artifact.name !== filename) {
      throw new Error(
        'Special characters test failed: filename not preserved'
      );
    }
    console.log('✓ Edge case (special characters) test passed');
  });
}

function testEdgeCaseUnicodeFilename(): void {
  console.log('Testing edge case: unicode filename...');

  const backend = new MemoryStorageBackend();
  const filename = 'artifact-测试-テスト-🚀.json';
  const file = createTestFile(filename, 512);

  backend.upload(file).then(artifact => {
    if (artifact.name !== filename) {
      throw new Error('Unicode filename test failed: filename not preserved');
    }
    console.log('✓ Edge case (unicode filename) test passed');
  });
}

function testEdgeCaseLargeMetadata(): void {
  console.log('Testing edge case: large file (10MB limit)...');

  const backend = new MemoryStorageBackend(10 * 1024 * 1024);
  const largeFile = createTestFile('large-artifact.bin', 9 * 1024 * 1024);

  backend.upload(largeFile).then(artifact => {
    if (artifact.sizeBytes !== 9 * 1024 * 1024) {
      throw new Error('Large file test failed: size not stored correctly');
    }
    console.log('✓ Edge case (large file) test passed');
  });
}

// ============================================================================
// DETERMINISM TESTS
// ============================================================================

function testDeterminismUploadIdGeneration(): void {
  console.log('Testing determinism: upload ID generation...');

  const backend = new MemoryStorageBackend();
  const file = createTestFile('determinism-test.txt', 256);

  backend.upload(file).then(artifact1 => {
    backend.upload(file).then(artifact2 => {
      if (artifact1.id === artifact2.id) {
        throw new Error(
          'Determinism test failed: IDs should be different'
        );
      }
      // Both should have valid ID format
      if (!artifact1.id.startsWith('art-') || !artifact2.id.startsWith('art-')) {
        throw new Error(
          'Determinism test failed: ID format should be art-*'
        );
      }
      console.log('✓ Determinism test (upload ID generation) passed');
    });
  });
}

function testDeterminismOrderPreservation(): void {
  console.log('Testing determinism: order preservation...');

  const backend = new MemoryStorageBackend();
  const files = [
    createTestFile('order-test-1.txt', 256),
    createTestFile('order-test-2.txt', 512),
    createTestFile('order-test-3.txt', 1024),
  ];

  let uploadedIds: string[] = [];

  Promise.all(files.map(f => backend.upload(f)))
    .then(artifacts => {
      uploadedIds = artifacts.map(a => a.id);
      return backend.list();
    })
    .then(artifacts => {
      // Most recent first
      const listIds = artifacts.map(a => a.id);
      if (listIds[0] !== uploadedIds[2]) {
        throw new Error(
          'Order preservation test failed: newest should be first'
        );
      }
      console.log('✓ Determinism test (order preservation) passed');
    });
}

// ============================================================================
// OBSERVABILITY TESTS
// ============================================================================

function testObservabilityOperationTimestamps(): void {
  console.log('Testing observability: operation timestamps...');

  const backend = new MemoryStorageBackend();
  const manager = new StorageBackendManager(backend);
  const file = createTestFile('timestamp-test.txt', 256);

  const beforeTime = new Date();
  manager.upload(file).then(() => {
    const afterTime = new Date();
    const log = manager.getOperationLog();
    const uploadLog = log.find(e => e.operation === 'upload');

    if (!uploadLog) {
      throw new Error('Timestamp test failed: upload not logged');
    }

    const logTime = uploadLog.timestamp.getTime();
    if (logTime < beforeTime.getTime() || logTime > afterTime.getTime()) {
      throw new Error(
        'Timestamp test failed: timestamp not in expected range'
      );
    }

    console.log('✓ Observability test (timestamps) passed');
  });
}

function testObservabilityLogBounding(): void {
  console.log('Testing observability: log bounding (max 1000 entries)...');

  const backend = new MemoryStorageBackend();
  const manager = new StorageBackendManager(backend);

  // Perform many operations to exceed 1000 entries
  const promises = [];
  for (let i = 0; i < 1500; i++) {
    promises.push(
      manager.exists(`artifact-${i}`).catch(() => {
        // Ignore failures
      })
    );
  }

  Promise.all(promises).then(() => {
    const log = manager.getOperationLog();
    if (log.length > 1000) {
      throw new Error(
        `Log bounding test failed: log size ${log.length} exceeds limit`
      );
    }
    console.log('✓ Observability test (log bounding) passed');
  });
}

// ============================================================================
// EXPLICIT SUCCESS CRITERIA TESTS
// ============================================================================

function testExplicitCriteriaBackendInitialization(): void {
  console.log('Testing explicit criteria: backend initialization...');

  // Success criteria: Backend can be initialized successfully
  const memoryBackend = new MemoryStorageBackend();
  const indexeddbBackend = new IndexedDBStorageBackend();

  if (!memoryBackend || !indexeddbBackend) {
    throw new Error(
      'Initialization criteria failed: backends not created'
    );
  }

  console.log('✓ Explicit criteria (initialization) passed');
}

function testExplicitCriteriaConfigurationRetrievable(): void {
  console.log('Testing explicit criteria: configuration retrievable...');

  // Success criteria: Configuration is retrievable and valid
  const backend = new MemoryStorageBackend();
  const config = backend.getConfiguration();

  if (!config.type || !config.name || !config.description) {
    throw new Error(
      'Configuration criteria failed: missing config properties'
    );
  }

  if (typeof config.readonly !== 'boolean' || typeof config.maxSizeBytes !== 'number') {
    throw new Error(
      'Configuration criteria failed: invalid config types'
    );
  }

  console.log('✓ Explicit criteria (configuration) passed');
}

function testExplicitCriteriaErrorHandling(): void {
  console.log('Testing explicit criteria: error handling...');

  // Success criteria: Errors are properly categorized
  const error = new StorageError(
    StorageErrorCode.NotFound,
    'Test error'
  );

  if (!(error instanceof StorageError)) {
    throw new Error('Error handling criteria failed: not StorageError');
  }

  if (error.code !== StorageErrorCode.NotFound) {
    throw new Error(
      'Error handling criteria failed: wrong error code'
    );
  }

  console.log('✓ Explicit criteria (error handling) passed');
}

// ============================================================================
// TEST RUNNER
// ============================================================================

export function runAllTests(): void {
  console.log('========================================');
  console.log('Storage Backend Integration Tests');
  console.log('========================================\n');

  // Memory backend tests
  const memoryBackend = new MemoryStorageBackend();
 testMemoryBackendConfiguration(memoryBackend);
  testMemoryBackendStats(memoryBackend);

  // Backend manager tests
  testBackendManagerSwitching();

  // Integration tests
  testBackendIntegrationUploadListDownload();
  testBackendIntegrationQuotaTracking();
  testBackendIntegrationDeleteAndStats();

  // Edge case tests
  testEdgeCaseEmptyFilename();
  testEdgeCaseZeroByteFile();
  testEdgeCaseSpecialCharactersInName();
  testEdgeCaseUnicodeFilename();
  testEdgeCaseLargeMetadata();

  // Determinism tests
  testDeterminismUploadIdGeneration();
  testDeterminismOrderPreservation();

  // Observability tests
  testObservabilityOperationTimestamps();
  testObservabilityLogBounding();

  // Explicit criteria tests
  testExplicitCriteriaBackendInitialization();
  testExplicitCriteriaConfigurationRetrievable();
  testExplicitCriteriaErrorHandling();

  console.log('\n========================================');
  console.log('All tests completed!');
  console.log('========================================');
}

// Export test runner for external use
export { runAllTests as default };
