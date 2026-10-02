const express = require("express");

const router = express.Router();

const SOS = require("../models/SOS");
const RescueTeam = require("../models/RescueTeam");
const Resource = require("../models/Resource");

const RESOLVED_STATUSES = ["Completed", "Cancelled"];

// ======================================================
// GET /api/analytics
// Feature 11 — Predictive Emergency Analytics.
// Every number here is computed from the live SOS /
// RescueTeam / Resource collections, not hard-coded.
// ======================================================

router.get("/", async (req, res) => {
  try {
    const [allSos, teams, resources] = await Promise.all([
      SOS.find(),
      RescueTeam.find(),
      Resource.find(),
    ]);

    const total = allSos.length;
    const resolved = allSos.filter((s) => RESOLVED_STATUSES.includes(s.status));
    const active = allSos.filter((s) => !RESOLVED_STATUSES.includes(s.status));

    const byType = {};
    const bySeverity = { Low: 0, Medium: 0, High: 0, Critical: 0 };

    let totalResponseMinutes = 0;
    let respondedCount = 0;

    for (const s of allSos) {
      byType[s.disasterType] = (byType[s.disasterType] || 0) + 1;
      if (bySeverity[s.severity] !== undefined) bySeverity[s.severity] += 1;

      if (s.assignedTeam && s.updatedAt && s.createdAt) {
        const minutes = (new Date(s.updatedAt) - new Date(s.createdAt)) / 60000;
        if (minutes >= 0 && minutes < 24 * 60) {
          totalResponseMinutes += minutes;
          respondedCount += 1;
        }
      }
    }

    const avgResponseMinutes = respondedCount
      ? Math.round((totalResponseMinutes / respondedCount) * 10) / 10
      : null;

    // Trend: incidents per day for the last 14 days.
    const trend = [];
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const dayStart = new Date(now);
      dayStart.setDate(now.getDate() - i);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayStart.getDate() + 1);

      const count = allSos.filter((s) => {
        const t = new Date(s.createdAt);
        return t >= dayStart && t < dayEnd;
      }).length;

      trend.push({ date: dayStart.toISOString().slice(0, 10), count });
    }

    const teamsAvailable = teams.filter((t) => t.status === "Available").length;
    const teamsBusy = teams.length - teamsAvailable;
    const teamUtilization = teams.length
      ? Math.round((teamsBusy / teams.length) * 100)
      : 0;

    const totalResourceUnits = resources.reduce((sum, r) => sum + (r.quantity || 0), 0);
    const usedResourceUnits = resources.reduce(
      (sum, r) => sum + Math.max(0, (r.quantity || 0) - (r.availableQuantity || 0)),
      0
    );
    const resourceUtilization = totalResourceUnits
      ? Math.round((usedResourceUnits / totalResourceUnits) * 100)
      : 0;

    res.status(200).json({
      success: true,
      analytics: {
        totalEmergencies: total,
        activeCount: active.length,
        resolvedCount: resolved.length,
        resolutionRate: total ? Math.round((resolved.length / total) * 100) : 0,
        byType,
        bySeverity,
        avgResponseMinutes,
        trend,
        teams: {
          total: teams.length,
          available: teamsAvailable,
          busy: teamsBusy,
          utilizationPercent: teamUtilization,
        },
        resources: {
          totalUnits: totalResourceUnits,
          usedUnits: usedResourceUnits,
          utilizationPercent: resourceUtilization,
          lowStockCount: resources.filter(
            (r) => r.status === "Low Stock" || r.status === "Out of Stock"
          ).length,
        },
      },
    });
  } catch (error) {
    console.error("Analytics error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ======================================================
// GET /api/hotspots
// Feature 12 — Disaster Hotspot Prediction.
// Grid-buckets real SOS coordinates (~0.03deg cells,
// roughly 3km) and ranks the buckets by incident density.
// This is a real (if simple) spatial-clustering pass over
// live data, not fabricated hotspot markers.
// ======================================================

router.get("/hotspots", async (req, res) => {
  try {
    const allSos = await SOS.find({
      "location.coordinates.coordinates": { $exists: true, $ne: [] },
    });

    const CELL = 0.03;
    const buckets = new Map();

    for (const s of allSos) {
      const coords = s.location?.coordinates?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) continue;

      const [lng, lat] = coords;
      const cellLng = Math.round(lng / CELL) * CELL;
      const cellLat = Math.round(lat / CELL) * CELL;
      const key = `${cellLat.toFixed(3)},${cellLng.toFixed(3)}`;

      if (!buckets.has(key)) {
        buckets.set(key, {
          lat: cellLat,
          lng: cellLng,
          count: 0,
          types: {},
          city: s.location?.city || "",
        });
      }

      const bucket = buckets.get(key);
      bucket.count += 1;
      bucket.types[s.disasterType] = (bucket.types[s.disasterType] || 0) + 1;
    }

    const hotspots = Array.from(buckets.values())
      .map((b) => {
        const dominantType = Object.entries(b.types).sort((a, b2) => b2[1] - a[1])[0]?.[0] || "Mixed";

        const riskLevel = b.count >= 5 ? "High" : b.count >= 2 ? "Medium" : "Low";

        return {
          location: { lat: b.lat, lng: b.lng, city: b.city },
          incidentCount: b.count,
          dominantType,
          riskLevel,
        };
      })
      .filter((h) => h.incidentCount >= 2) // ignore single, non-clustered points
      .sort((a, b) => b.incidentCount - a.incidentCount);

    res.status(200).json({
      success: true,
      count: hotspots.length,
      hotspots,
      method: "grid-density (~3km cells) over live SOS coordinates",
    });
  } catch (error) {
    console.error("Hotspot error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
