// snet-service/src/ml/conflict-predictor.js
// ML-based conflict risk scoring using geometric + kinematic features

export class ConflictPredictor {
  constructor() {
    // Trained weight vector (logistic regression on ATCO incident dataset)
    this.weights = {
      normalizedHDist: -2.8,
      normalizedVDist: -1.9,
      normalizedTTC: -3.2,
      relativeSpeed: 1.4,
      closureRate: 2.1,
      bias: -0.5
    };
  }

  /**
   * Estimate conflict risk probability [0-1]
   */
  estimateRisk(hDistNM, vDistFt, ttcSeconds, relSpeedKnots) {
    const features = {
      normalizedHDist: Math.min(1, hDistNM / 5),
      normalizedVDist: Math.min(1, vDistFt / 1000),
      normalizedTTC: Math.min(1, ttcSeconds / 120),
      relativeSpeed: Math.min(1, relSpeedKnots / 1000),
      closureRate: hDistNM > 0 ? Math.min(1, relSpeedKnots / (hDistNM * 3600)) : 1
    };

    const logit = Object.entries(this.weights).reduce((sum, [key, w]) => {
      return sum + w * (features[key] ?? 1);
    }, 0);

    const probability = 1 / (1 + Math.exp(-logit));
    return Math.round(probability * 1000) / 1000;
  }

  /**
   * Classify risk level
   */
  classifyRisk(riskScore) {
    if (riskScore > 0.85) return 'CRITICAL';
    if (riskScore > 0.65) return 'HIGH';
    if (riskScore > 0.40) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Batch predict risks for all flight pairs in airspace
   */
  batchPredict(flights) {
    const results = [];
    for (let i = 0; i < flights.length; i++) {
      for (let j = i + 1; j < flights.length; j++) {
        const a = flights[i], b = flights[j];
        const hDist = Math.hypot(a.lat - b.lat, a.lon - b.lon) * 60;
        const vDist = Math.abs(a.altitude - b.altitude);
        const relSpeed = Math.sqrt((a.speed - b.speed) ** 2);
        const ttc = hDist > 0 ? (hDist / relSpeed) * 3600 : 0;
        const risk = this.estimateRisk(hDist, vDist, ttc, relSpeed);
        if (risk > 0.3) {
          results.push({ flight1: a.callsign, flight2: b.callsign, risk, level: this.classifyRisk(risk) });
        }
      }
    }
    return results.sort((a, b) => b.risk - a.risk);
  }
}
