// weather-service/src/ml/weather-hazard.js
// ML Weather Hazard Prediction Model

export class WeatherHazardModel {
  predict(lat, lon, altitudeFt, lookaheadMinutes, pireps, sigmets) {
    const hazards = [];

    // Check active SIGMETs covering this area
    for (const s of sigmets) {
      const polygon = typeof s.area_polygon === 'string' ? JSON.parse(s.area_polygon) : s.area_polygon;
      if (this._pointInPolygon(lat, lon, polygon)) {
        hazards.push({
          type: s.phenomenon, source: 'SIGMET', severity: 'HIGH',
          description: s.raw_text, valid_to: s.valid_to
        });
      }
    }

    // Analyze PIREPs for turbulence/icing nearby
    const nearbyPireps = pireps.filter(p =>
      Math.hypot(p.position_lat - lat, p.position_lon - lon) < 1.5 &&
      Math.abs(p.altitude - altitudeFt) < 5000
    );

    const turbPireps = nearbyPireps.filter(p => p.turbulence_intensity && p.turbulence_intensity !== 'NONE');
    const icePireps = nearbyPireps.filter(p => p.icing_intensity && p.icing_intensity !== 'NONE');

    const turbScore = turbPireps.reduce((s, p) => s + this._intensityScore(p.turbulence_intensity), 0);
    const iceScore = icePireps.reduce((s, p) => s + this._intensityScore(p.icing_intensity), 0);

    if (turbPireps.length > 0) {
      hazards.push({
        type: 'TURBULENCE', source: 'PIREP_ML', severity: this._scoreToSeverity(turbScore / turbPireps.length),
        confidence: Math.min(0.95, 0.5 + turbPireps.length * 0.1),
        reportCount: turbPireps.length
      });
    }

    if (icePireps.length > 0) {
      hazards.push({
        type: 'ICING', source: 'PIREP_ML', severity: this._scoreToSeverity(iceScore / icePireps.length),
        confidence: Math.min(0.90, 0.4 + icePireps.length * 0.1),
        reportCount: icePireps.length
      });
    }

    return {
      position: { lat, lon, altitude: altitudeFt },
      lookaheadMinutes,
      hazards,
      overallRisk: hazards.length === 0 ? 'NONE' :
        hazards.some(h => h.severity === 'CRITICAL') ? 'CRITICAL' :
        hazards.some(h => h.severity === 'HIGH') ? 'HIGH' : 'MODERATE',
      generatedAt: new Date().toISOString()
    };
  }

  _intensityScore(intensity) {
    const map = { LIGHT: 1, LIGHT_MODERATE: 2, MODERATE: 3, MODERATE_SEVERE: 4, SEVERE: 5, EXTREME: 6 };
    return map[intensity] || 0;
  }

  _scoreToSeverity(score) {
    if (score >= 4) return 'CRITICAL';
    if (score >= 2.5) return 'HIGH';
    if (score >= 1.5) return 'MEDIUM';
    return 'LOW';
  }

  _pointInPolygon(lat, lon, polygon) {
    if (!polygon || polygon.length < 3) return false;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, yi] = polygon[i];
      const [xj, yj] = polygon[j];
      const intersect = ((yi > lat) !== (yj > lat)) && (lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }
}
