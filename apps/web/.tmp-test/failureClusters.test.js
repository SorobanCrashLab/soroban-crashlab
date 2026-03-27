"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const assert = __importStar(require("node:assert/strict"));
const failureClusters_1 = require("./failureClusters");
const makeRun = (overrides) => ({
    id: 'run-default',
    status: 'failed',
    area: 'auth',
    severity: 'high',
    duration: 1,
    seedCount: 1,
    cpuInstructions: 1,
    memoryBytes: 1,
    minResourceFee: 1,
    crashDetail: {
        failureCategory: 'InvariantViolation',
        signature: 'sig:token:transfer:assert_balance_nonnegative',
        payload: '{}',
        replayAction: 'cargo run --bin crash-replay',
    },
    ...overrides,
});
const runAssertions = () => {
    const clusters = (0, failureClusters_1.buildFailureClusters)([
        makeRun({ id: 'run-3' }),
        makeRun({ id: 'run-2' }),
        makeRun({ id: 'run-1', area: 'state' }),
        makeRun({ id: 'run-0', status: 'completed', crashDetail: null }),
    ]);
    assert.equal(clusters.length, 2);
    assert.equal(clusters[0].representativeRunId, 'run-3');
    assert.equal(clusters[0].count, 2);
    assert.deepEqual(clusters[0].relatedRunIds, ['run-3', 'run-2']);
    assert.equal(clusters[1].count, 1);
    const [cluster] = (0, failureClusters_1.buildFailureClusters)([
        makeRun({ area: 'budget', severity: 'critical', crashDetail: { failureCategory: 'Panic', signature: 'sig:router:swap:budget_cpu_limit', payload: '{}', replayAction: 'cargo run' } }),
    ]);
    assert.equal((0, failureClusters_1.describeFailureCluster)(cluster), 'Panic in Budget (critical)');
};
runAssertions();
console.log('failureClusters.test.ts: all assertions passed');
