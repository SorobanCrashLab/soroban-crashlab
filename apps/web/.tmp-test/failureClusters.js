"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildFailureClusters = buildFailureClusters;
exports.describeFailureCluster = describeFailureCluster;
const formatAreaLabel = (area) => area.charAt(0).toUpperCase() + area.slice(1);
const buildClusterKey = (run) => {
    if (!run.crashDetail) {
        return null;
    }
    return [
        run.crashDetail.signature,
        run.crashDetail.failureCategory,
        run.area,
        run.severity,
    ].join('::');
};
function buildFailureClusters(runs) {
    const clusters = new Map();
    for (const run of runs) {
        if (run.status !== 'failed' || !run.crashDetail) {
            continue;
        }
        const key = buildClusterKey(run);
        if (!key) {
            continue;
        }
        const existing = clusters.get(key);
        if (existing) {
            existing.count += 1;
            existing.relatedRunIds.push(run.id);
            continue;
        }
        clusters.set(key, {
            id: key,
            signature: run.crashDetail.signature,
            failureCategory: run.crashDetail.failureCategory,
            area: run.area,
            severity: run.severity,
            count: 1,
            representativeRunId: run.id,
            relatedRunIds: [run.id],
        });
    }
    return Array.from(clusters.values()).sort((left, right) => {
        if (right.count !== left.count) {
            return right.count - left.count;
        }
        return left.signature.localeCompare(right.signature);
    });
}
function describeFailureCluster(cluster) {
    return `${cluster.failureCategory} in ${formatAreaLabel(cluster.area)} (${cluster.severity})`;
}
