// analytics-service/src/ml/workload-analyzer.js
// Controller Workload Analyzer using composite scoring

export class WorkloadAnalyzer {
  score(activeFlights, activeAlerts, pendingHandoffs) {
    const flightLoad = Math.min(1, activeFlights / 15);
    const alertLoad = Math.min(1, activeAlerts / 5);
    const handoffLoad = Math.min(1, pendingHandoffs / 8);
    const composite = (flightLoad * 0.5) + (alertLoad * 0.35) + (handoffLoad * 0.15);
    return Math.round(composite * 100);
  }

  classify(activeFlights, activeAlerts) {
    if (activeFlights > 12 || activeAlerts > 3) return 'HIGH';
    if (activeFlights > 7 || activeAlerts > 1) return 'MEDIUM';
    return 'LOW';
  }

  recommend(activeFlights, activeAlerts) {
    if (activeFlights > 12) return 'Consider sector splitting or traffic flow management';
    if (activeAlerts > 3) return 'Immediate supervisor attention recommended';
    if (activeFlights > 7) return 'Monitor workload — approaching capacity';
    return 'Workload nominal';
  }
}
