/**
 * NeuroDrive AI - Explainable Fusion Explanation Builder
 * 
 * Synthesizes transparent, human-readable explanations summarizing the top
 * contributing risk factors and numeric evidence for alerts and dashboard display.
 * 
 * Pure TypeScript with zero DOM/browser dependencies.
 */

import { Factor, RiskLevel, RISK_LEVELS } from '../types';

const VEHICLE_FACTOR_IDS = new Set(['vibration_anomaly', 'audio_anomaly', 'vehicle_anomaly']);

/**
 * Checks whether a given factor ID originates from vehicle monitoring.
 */
export function isVehicleFactor(factorId: string): boolean {
  return VEHICLE_FACTOR_IDS.has(factorId) || factorId.startsWith('vehicle_') || factorId.startsWith('vibration_') || factorId.startsWith('audio_');
}

/**
 * Builds a clear, human-readable explanation with top 3 factors and real numeric evidence.
 * 
 * Example compound output:
 * "Eyes closed 2.1 s, PERCLOS 28%, plus unusual vibration for 4.2 s. Risk raised because both appear together."
 * 
 * Example single output:
 * "Eyes closed 2.1 s, PERCLOS 28%."
 */
export function buildExplanation(
  factors: Factor[],
  compoundEscalation: boolean = false,
  level: RiskLevel = RISK_LEVELS.NORMAL
): string {
  if (level === RISK_LEVELS.NORMAL || factors.length === 0) {
    return 'Normal driving conditions. Driver attentive and vehicle signals nominal.';
  }

  // Filter factors with active positive contribution and sort descending by weight
  const activeFactors = factors
    .filter(f => f.contribution > 0 && f.evidence && f.evidence.trim().length > 0)
    .sort((a, b) => b.contribution - a.contribution);

  if (activeFactors.length === 0) {
    if (compoundEscalation) {
      return 'Elevated risk detected. Risk raised because driver and vehicle anomalies appear together.';
    }
    return 'Elevated risk detected with minimal distinct factors.';
  }

  const topFactors = activeFactors.slice(0, 3);

  if (compoundEscalation) {
    const driverFactors = topFactors.filter(f => !isVehicleFactor(f.id));
    const vehicleFactors = topFactors.filter(f => isVehicleFactor(f.id));

    if (driverFactors.length > 0 && vehicleFactors.length > 0) {
      const driverEvidence = driverFactors.map(f => f.evidence).join(', ');
      const vehicleEvidence = vehicleFactors.map(f => f.evidence).join(', ');
      return `${driverEvidence}, plus ${vehicleEvidence}. Risk raised because both appear together.`;
    }

    // If all top 3 happen to be driver or vehicle, but compound escalation is true
    const combinedEvidence = topFactors.map(f => f.evidence).join(', ');
    return `${combinedEvidence}. Risk raised because both appear together.`;
  }

  // Standard non-compounded explanation
  const factorStrings = topFactors.map(f => f.evidence).join(', ');
  return `${factorStrings}.`;
}
