const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

const SOS = require("../models/SOS");
const RescueTeam = require("../models/RescueTeam");
const Resource = require("../models/Resource");
const Hospital = require("../models/Hospital");
const { calculateEscalation } = require("../services/responseIntelligence");

const RESOLVED = ["Completed", "Cancelled"];

// ======================================================
// GET /api/reports/generate
// Feature 19 — Post-Disaster Intelligence / Reports.
// Aggregates real data into a single report object the
// frontend can render and export (JSON/CSV) or print.
// ======================================================

router.get("/generate", async (req, res) => {
  try {
    const [allSos, teams, resources] = await Promise.all([
      SOS.find().populate("assignedTeam", "teamName teamCode"),
      RescueTeam.find(),
      Resource.find(),
    ]);

    const resolved = allSos.filter((s) => RESOLVED.includes(s.status));
    const critical = allSos.filter((s) => s.severity === "Critical");
    const escalated = allSos.filter((s) => calculateEscalation(s).escalated);

    const teamsDeployed = new Set(
      allSos.filter((s) => s.assignedTeam).map((s) => String(s.assignedTeam._id || s.assignedTeam))
    ).size;

    let totalResponseMinutes = 0;
    let respondedCount = 0;
    for (const s of allSos) {
      if (s.assignedTeam && s.updatedAt && s.createdAt) {
        const minutes = (new Date(s.updatedAt) - new Date(s.createdAt)) / 60000;
        if (minutes >= 0 && minutes < 24 * 60) {
          totalResponseMinutes += minutes;
          respondedCount += 1;
        }
      }
    }

    const resourceConsumption = resources.map((r) => ({
      name: r.name,
      category: r.category,
      totalQuantity: r.quantity,
      used: Math.max(0, r.quantity - r.availableQuantity),
      remaining: r.availableQuantity,
    }));

    const timeline = allSos
      .slice()
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .map((s) => ({
        id: s._id,
        at: s.createdAt,
        disasterType: s.disasterType,
        severity: s.severity,
        status: s.status,
        team: s.assignedTeam?.teamName || null,
      }));

    const report = {
      generatedAt: new Date().toISOString(),

      summary: {
        totalEmergencies: allSos.length,
        criticalEmergencies: critical.length,
        resolvedCases: resolved.length,
        resolutionRate: allSos.length
          ? Math.round((resolved.length / allSos.length) * 100)
          : 0,
        teamsDeployed,
        totalTeams: teams.length,
        avgResponseMinutes: respondedCount
          ? Math.round((totalResponseMinutes / respondedCount) * 10) / 10
          : null,
        escalations: escalated.length,
        hospitalsOnRecord: await Hospital.countDocuments(),
      },

      resourceConsumption,
      timeline,
    };

    res.status(200).json({ success: true, report });
  } catch (error) {
    console.error("Report generation error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// CSV export of the timeline (kept dependency-free — no
// PDF/CSV library, just a hand-built CSV string).
router.get("/export.csv", async (req, res) => {
  try {
    const allSos = await SOS.find().populate("assignedTeam", "teamName");

    const rows = [
      ["Date", "Type", "Severity", "Status", "Team", "People", "City"].join(","),
      ...allSos.map((s) =>
        [
          new Date(s.createdAt).toISOString(),
          s.disasterType,
          s.severity,
          s.status,
          s.assignedTeam?.teamName || "",
          s.peopleCount,
          s.location?.city || "",
        ]
          .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
          .join(",")
      ),
    ];

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=resqlink-report.csv");
    res.status(200).send(rows.join("\n"));
  } catch (error) {
    console.error("CSV export error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ======================================================
// GET /api/reports/digital-twin/:sosId
// Feature 14 — Emergency Digital Twin.
// Assembles the live incident -> team -> resources ->
// hospital chain from existing collections; nothing here
// is a separate parallel data model, it's a read-only
// composition over data that already exists.
// ======================================================

router.get("/digital-twin/:sosId", async (req, res) => {
  try {
    const { sosId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(sosId)) {
      return res.status(400).json({ success: false, message: "Invalid SOS ID" });
    }

    const sos = await SOS.findById(sosId).populate("assignedTeam");

    if (!sos) {
      return res.status(404).json({ success: false, message: "SOS not found" });
    }

    const nearestHospital = await Hospital.findOne(
      sos.location?.coordinates?.coordinates
        ? {
            coordinates: {
              $near: {
                $geometry: {
                  type: "Point",
                  coordinates: sos.location.coordinates.coordinates,
                },
              },
            },
          }
        : {}
    ).catch(() => null);

    res.status(200).json({
      success: true,
      twin: {
        incident: {
          id: sos._id,
          type: sos.disasterType,
          severity: sos.severity,
          status: sos.status,
        },
        team: sos.assignedTeam
          ? {
              id: sos.assignedTeam._id,
              name: sos.assignedTeam.teamName,
              code: sos.assignedTeam.teamCode,
              status: sos.assignedTeam.status,
            }
          : null,
        resources: sos.assignedTeam?.equipment || [],
        hospital: nearestHospital
          ? {
              id: nearestHospital._id,
              name: nearestHospital.name,
              availableBeds: nearestHospital.availableBeds,
              totalBeds: nearestHospital.totalBeds,
              capacityPercent: nearestHospital.totalBeds
                ? Math.round(
                    ((nearestHospital.totalBeds - nearestHospital.availableBeds) /
                      nearestHospital.totalBeds) *
                      100
                  )
                : null,
              status: nearestHospital.status,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Digital twin error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
