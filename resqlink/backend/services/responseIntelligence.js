const { haversineKm } = require("./aiTeamDecision");

/*
==================================================
FEATURE 7 — AUTOMATIC ESCALATION
==================================================
Deterministic, rule-based. No external service
required. Considers severity, time waiting, and
whether a team has been assigned yet.

LOW -> MEDIUM -> HIGH -> CRITICAL
*/

const SEVERITY_ORDER = ["Low", "Medium", "High", "Critical"];

function minutesSince(date) {
  if (!date) return 0;
  return Math.max(0, (Date.now() - new Date(date).getTime()) / 60000);
}

function calculateEscalation(sos) {
  const waitingMinutes = Math.round(minutesSince(sos.createdAt));
  const hasTeam = Boolean(sos.assignedTeam);
  const currentIndex = SEVERITY_ORDER.indexOf(sos.severity || "Low");

  const isTerminal = ["Completed", "Cancelled"].includes(sos.status);

  if (isTerminal) {
    return {
      escalated: false,
      currentSeverity: sos.severity,
      recommendedSeverity: sos.severity,
      waitingMinutes,
      reason: `Case is ${sos.status.toLowerCase()} — no escalation needed.`,
    };
  }

  // Thresholds (minutes) before an unassigned SOS should
  // escalate one level, scaled by current severity —
  // a Critical case escalates faster than a Low one.
  const thresholds = { Low: 20, Medium: 12, High: 6, Critical: 3 };
  const threshold = thresholds[sos.severity] ?? 15;

  let escalationSteps = 0;
  const reasons = [];

  if (!hasTeam && waitingMinutes >= threshold) {
    escalationSteps = Math.min(
      SEVERITY_ORDER.length - 1 - currentIndex,
      Math.floor(waitingMinutes / threshold)
    );
    reasons.push(
      `No response team assigned for ${waitingMinutes} min (threshold ${threshold} min).`
    );
  }

  if (!hasTeam && waitingMinutes >= threshold * 3) {
    reasons.push("Wait time is more than 3x the safe threshold for this severity.");
  }

  const recommendedIndex = Math.min(
    SEVERITY_ORDER.length - 1,
    currentIndex + escalationSteps
  );

  const recommendedSeverity = SEVERITY_ORDER[recommendedIndex];
  const escalated = recommendedIndex > currentIndex;

  return {
    escalated,
    currentSeverity: sos.severity,
    recommendedSeverity,
    waitingMinutes,
    reason: escalated
      ? reasons.join(" ")
      : hasTeam
      ? "Team already assigned — within normal response window."
      : `Within the ${threshold}-minute response window.`,
  };
}

/*
==================================================
FEATURE 8 — ETA + RESPONSE-TIME PREDICTION
==================================================
Deterministic distance / speed model — never random.
Uses real coordinates when both sides have them,
and is explicit when it has to fall back to a
severity-based estimate instead.
*/

// Average effective road speed for a rescue vehicle,
// factoring in traffic/terrain (kept conservative).
const AVG_SPEED_KMH = 32;

function calculateETA(sos, team) {
  const sosCoords = sos.location?.coordinates?.coordinates;
  const teamCoords = team?.location?.coordinates?.coordinates || team?.coordinates;

  const distanceKm = haversineKm(sosCoords, teamCoords);

  if (distanceKm === null) {
    // No usable coordinates on one side — give a
    // clearly-labelled severity-based fallback instead
    // of inventing a distance.
    const severityEtaMinutes = { Critical: 8, High: 12, Medium: 18, Low: 25 };
    const minutes = severityEtaMinutes[sos.severity] ?? 20;

    return {
      distanceKm: null,
      etaMinutes: minutes,
      source: "severity-fallback",
      team: team?.teamName || null,
      status: team?.status || null,
    };
  }

  const drivingKm = distanceKm * 1.25; // road-distance correction over straight-line
  const etaMinutes = Math.max(3, Math.round((drivingKm / AVG_SPEED_KMH) * 60));

  return {
    distanceKm: Math.round(distanceKm * 10) / 10,
    etaMinutes,
    source: "distance-model",
    team: team?.teamName || null,
    status: team?.status || null,
  };
}

module.exports = {
  calculateEscalation,
  calculateETA,
};
