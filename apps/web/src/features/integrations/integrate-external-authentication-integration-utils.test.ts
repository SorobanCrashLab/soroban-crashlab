import {
  formatVerified,
  validateAuthProvider,
  simulateAuthProbe,
  createExternalAuthAdapter,
  AuthProvider,
  AuthProviderType
} from './integrate-external-authentication-integration-utils';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function testFormatVerified(): void {
  const dateStr = "2026-03-28T08:14:00Z";
  const formatted = formatVerified(dateStr);
  assert(formatted.startsWith("Verified "), "Should start with Verified");
  
  assert(formatVerified("") === "", "Empty string should return empty string");
  assert(formatVerified(undefined) === "", "Undefined should return empty string");
  assert(formatVerified("invalid-date") === "", "Invalid date should return empty string");
  
  console.log("✓ testFormatVerified passed");
}

function testValidateAuthProvider(): void {
  const validConnected: AuthProvider = {
    id: "prov-1",
    type: "oauth",
    label: "OAuth",
    description: "desc",
    status: "connected",
    identity: "user@example.com",
    lastVerified: new Date().toISOString()
  };
  
  const result1 = validateAuthProvider(validConnected);
  assert(result1.isValid, "Valid connected provider should pass");
  
  const invalidConnected: AuthProvider = {
    ...validConnected,
    identity: undefined
  };
  const result2 = validateAuthProvider(invalidConnected);
  assert(!result2.isValid, "Connected provider missing identity should fail");
  assert(result2.errors.includes("Identity is required when connected"), "Should have specific error for missing identity");
  
  const errorProvider: AuthProvider = {
    id: "prov-2",
    type: "api-key",
    label: "API",
    description: "desc",
    status: "error"
  };
  const result3 = validateAuthProvider(errorProvider);
  assert(!result3.isValid, "Error provider missing errorMessage should fail");
  assert(result3.errors.includes("Error message is required when status is error"), "Should have specific error for missing error message");
  
  const invalidType: AuthProvider = {
    id: "prov-3",
    type: "invalid-type" as unknown as AuthProviderType,
    label: "Invalid",
    description: "desc",
    status: "disconnected"
  };
  const result4 = validateAuthProvider(invalidType);
  assert(!result4.isValid, "Invalid provider type should fail");
  
  console.log("✓ testValidateAuthProvider passed");
}

function testSimulateAuthProbe(): void {
  const enforceResult = simulateAuthProbe('Enforce');
  assert(enforceResult.status === 'ok', "Enforce should be ok");
  
  const recordResult = simulateAuthProbe('Record');
  assert(recordResult.status === 'diverged', "Record should be diverged");
  
  const recordAllowNonrootResult = simulateAuthProbe('RecordAllowNonroot');
  assert(recordAllowNonrootResult.status === 'ok', "RecordAllowNonroot should be ok");
  
  console.log("✓ testSimulateAuthProbe passed");
}

async function testExternalAuthAdapter(): Promise<void> {
  const verifiedAt = '2026-05-31T09:30:00.000Z';
  const adapter = createExternalAuthAdapter({ now: () => verifiedAt });
  const provider: AuthProvider = {
    id: 'prov-stellar',
    type: 'stellar-wallet',
    label: 'Stellar Wallet',
    description: 'Connect via wallet',
    status: 'error',
    errorMessage: 'Previous token failed',
  };

  const connected = await adapter.connectProvider(provider);
  assert(connected.status === 'connected', 'Adapter should connect providers');
  assert(connected.identity === 'GAQX...KBTZ', 'Adapter should assign provider identity');
  assert(connected.lastVerified === verifiedAt, 'Adapter should stamp last verified time');
  assert(connected.errorMessage === undefined, 'Adapter should clear stale provider errors');

  const disconnected = await adapter.disconnectProvider(connected);
  assert(disconnected.status === 'disconnected', 'Adapter should disconnect providers');
  assert(disconnected.identity === undefined, 'Adapter should clear identity on disconnect');
  assert(disconnected.lastVerified === undefined, 'Adapter should clear verification time on disconnect');

  const probe = await adapter.probeAuthMode('RecordAllowNonroot');
  assert(probe.mode === 'RecordAllowNonroot', 'Adapter should return the probed mode');
  assert(probe.status === 'ok', 'Adapter should return auth mode probe status');

  console.log("✓ testExternalAuthAdapter passed");
}

async function runAllTests(): Promise<void> {
  console.log("Running External Authentication Integration Utils Tests...\n");
  
  try {
    testFormatVerified();
    testValidateAuthProvider();
    testSimulateAuthProbe();
    await testExternalAuthAdapter();
    console.log("\n✅ All tests passed!");
  } catch (error) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  }
}

if (typeof require !== 'undefined' && require.main === module) {
  void runAllTests();
}
