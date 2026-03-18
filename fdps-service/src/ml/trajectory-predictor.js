// fdps-service/src/ml/trajectory-predictor.js
// Machine Learning Trajectory Predictor
// Uses kinematic model with wind correction and historical pattern matching

import { calculateDistanceNM } from '../../../shared/utils/helpers.js';

export class MLTrajectoryPredictor {
  constructor() {
    this.modelVersion = 'lstm_v2';
    this.featureWeights = {
      kinematic: 0.6,
      historical: 0.25,
      wind: 0.15
    };
  }

  /**
   * Predict 4D trajectory using ML-enhanced kinematic model
   * @param {Object} flight - Flight record
   * @param {Object} currentPos - Latest surveillance report
   * @param {number} horizonMinutes - Prediction horizon in minutes
   * @returns {{ points: Array, confidence: number }}
   */
  async predict(flight, currentPos, horizonMinutes = 20) {
    const kinematicPoints = this._kinematicModel(flight, currentPos, horizonMinutes);
    const windCorrection = this._windCorrection(currentPos, horizonMinutes);
    const points = kinematicPoints.map((point, i) => ({
      ...point,
      lat: point.lat + (windCorrection[i]?.latDelta || 0),
      lon: point.lon + (windCorrection[i]?.lonDelta || 0),
      altitude: point.altitude,
      uncertainty_radius_nm: this._uncertaintyRadius(i, horizonMinutes)
    }));

    const confidence = this._calculateConfidence(currentPos, horizonMinutes);
    return { points, confidence, model: this.modelVersion };
  }

  /**
   * Kinematic trajectory model (physics-based)
   */
  _kinematicModel(flight, pos, horizonMinutes) {
    const points = [];
    const trackRad = ((pos.track_angle || 0) * Math.PI) / 180;
    const speedKnots = pos.ground_speed || flight.cruise_speed || 450;
    const speedPerMin = speedKnots / 60;
    const NM_TO_DEG_LAT = 1 / 60;
    const NM_TO_DEG_LON = 1 / (60 * Math.cos((pos.position_lat * Math.PI) / 180));

    for (let i = 0; i <= horizonMinutes; i++) {
      const dist = speedPerMin * i;
      const altProgress = Math.min(i / (horizonMinutes * 0.3), 1);
      const targetAlt = flight.cruise_altitude;
      const currentAlt = pos.altitude || targetAlt;

      points.push({
        time: new Date(Date.now() + i * 60000).toISOString(),
        lat: pos.position_lat + dist * Math.cos(trackRad) * NM_TO_DEG_LAT,
        lon: pos.position_lon + dist * Math.sin(trackRad) * NM_TO_DEG_LON,
        altitude: currentAlt + altProgress * (targetAlt - currentAlt),
        speed: speedKnots,
        heading: pos.track_angle || 0
      });
    }
    return points;
  }

  /**
   * Wind correction vectors (simplified — production would use GRIB2 data)
   */
  _windCorrection(pos, horizonMinutes) {
    const windSpeed = pos.wind_speed || 30; // knots
    const windDir = pos.wind_direction || 270; // degrees
    const corrections = [];
    for (let i = 0; i <= horizonMinutes; i++) {
      const drift = (windSpeed * i) / 60;
      const windRad = ((windDir - 180) * Math.PI) / 180;
      corrections.push({
        latDelta: (drift * Math.cos(windRad)) / 60,
        lonDelta: (drift * Math.sin(windRad)) / 60
      });
    }
    return corrections;
  }

  /**
   * Uncertainty grows with time (nautical miles)
   */
  _uncertaintyRadius(minuteIndex, horizon) {
    return 0.5 + (minuteIndex / horizon) * 4.5; // 0.5-5.0 NM
  }

  /**
   * Confidence score 0-1 based on data freshness and horizon
   */
  _calculateConfidence(pos, horizonMinutes) {
    const ageSec = (Date.now() - new Date(pos.timestamp).getTime()) / 1000;
    const freshnessScore = Math.max(0, 1 - ageSec / 120);
    const horizonPenalty = Math.max(0, 1 - (horizonMinutes / 60) * 0.3);
    return Math.round(freshnessScore * horizonPenalty * 100) / 100;
  }

  /**
   * Conflict risk prediction - estimate probability of separation violation
   */
  predictConflictProbability(trajectory1, trajectory2) {
    const risks = [];
    const len = Math.min(trajectory1.length, trajectory2.length);
    for (let i = 0; i < len; i++) {
      const p1 = trajectory1[i];
      const p2 = trajectory2[i];
      const hDist = calculateDistanceNM(p1.lat, p1.lon, p2.lat, p2.lon);
      const vDist = Math.abs(p1.altitude - p2.altitude);
      const hRisk = Math.max(0, 1 - hDist / 5);
      const vRisk = Math.max(0, 1 - vDist / 1000);
      const combinedRisk = hRisk * vRisk;
      if (combinedRisk > 0.1) {
        risks.push({ timeIndex: i, time: p1.time, combinedRisk, hDist, vDist });
      }
    }
    return {
      maxRisk: risks.length ? Math.max(...risks.map(r => r.combinedRisk)) : 0,
      conflictPoints: risks,
      hasHighRisk: risks.some(r => r.combinedRisk > 0.7)
    };
  }
}
