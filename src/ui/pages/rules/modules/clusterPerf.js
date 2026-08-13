/**
 * Performance monitoring and benchmarking for the cluster toggle action.
 * Uses standard W3C User Timing API (performance.mark / performance.measure).
 */

export class ClusterPerfMonitor {
    static startToggle(enabled) {
        const id = Date.now();
        const startMark = `cluster-toggle-start-${id}`;
        performance.mark(startMark);
        const startTime = performance.now();

        return {
            id,
            startMark,
            startTime,
            async endAnimation() {
                const animMark = `cluster-toggle-anim-end-${id}`;
                performance.mark(animMark);
                performance.measure(`Cluster Toggle [Animation] (${enabled ? 'ON' : 'OFF'})`, startMark, animMark);
                return performance.now() - startTime;
            },
            async endStorage(storageStartTime) {
                const storageMark = `cluster-toggle-storage-end-${id}`;
                performance.mark(storageMark);
                return performance.now() - storageStartTime;
            },
            async endAll(details = {}) {
                const endMark = `cluster-toggle-end-${id}`;
                performance.mark(endMark);
                performance.measure(`Cluster Toggle [Total] (${enabled ? 'ON' : 'OFF'})`, startMark, endMark);
                const totalDuration = performance.now() - startTime;

                const summary = {
                    action: enabled ? 'ENABLE_CLUSTERING' : 'DISABLE_CLUSTERING',
                    totalMs: Math.round(totalDuration * 100) / 100,
                    animationMs: details.animationMs ? Math.round(details.animationMs * 100) / 100 : undefined,
                    storageMs: details.storageMs ? Math.round(details.storageMs * 100) / 100 : undefined,
                    groupTabsMs: details.groupTabsMs ? Math.round(details.groupTabsMs * 100) / 100 : undefined,
                };

                if (typeof window !== 'undefined' && window.__CLUSTER_PERF_LOGS) {
                    window.__CLUSTER_PERF_LOGS.push(summary);
                } else if (typeof window !== 'undefined') {
                    window.__CLUSTER_PERF_LOGS = [summary];
                }

                console.debug(`[Perf] Cluster Toggle (${enabled ? 'ON' : 'OFF'}):`, summary);
                return summary;
            },
        };
    }
}
