const express = require("express");
const router = express.Router();

const SOS = require("../models/SOS");
const RescueTeam = require("../models/RescueTeam");

const { analyzeEmergency } = require("../services/aiEmergencyAgent");
const { calculateEscalation, calculateETA } = require("../services/responseIntelligence");
const { haversineKm } = require("../services/aiTeamDecision");

// =====================================================
// PRIORITY CALCULATOR
// =====================================================

function calculatePriority({
  severity,
  peopleCount,
  medicalRequired,
  vulnerablePeople,
}) {
  const severityScore = {
    Low: 25,
    Medium: 50,
    High: 75,
    Critical: 100,
  };

  let score = severityScore[severity] || 0;

  // More people = higher priority
  if (peopleCount >= 5) {
    score += 20;
  } else if (peopleCount >= 3) {
    score += 10;
  }

  // Medical emergency
  if (medicalRequired) {
    score += 25;
  }

  // Vulnerable people
  const vulnerable =
    (Number(vulnerablePeople?.children) || 0) +
    (Number(vulnerablePeople?.elderly) || 0) +
    (Number(vulnerablePeople?.disabled) || 0);

  score += vulnerable * 5;

  return score;
}

// =====================================================
// POST - CREATE SOS
// =====================================================

router.post("/", async (req, res) => {
  try {
    const {
      disasterType,
      description,
      severity,
      peopleCount,
      medicalRequired,
      vulnerablePeople,
      location,
    } = req.body;

    // -------------------------------------------------
    // BASIC VALIDATION
    // -------------------------------------------------

    if (!disasterType) {
      return res.status(400).json({
        success: false,
        message: "Disaster type is required.",
      });
    }

    if (!severity) {
      return res.status(400).json({
        success: false,
        message: "Severity is required.",
      });
    }

    const numericPeopleCount = Number(peopleCount);

    if (
      !Number.isFinite(numericPeopleCount) ||
      numericPeopleCount < 1
    ) {
      return res.status(400).json({
        success: false,
        message: "People count must be at least 1.",
      });
    }

    if (!location) {
      return res.status(400).json({
        success: false,
        message: "Location is required.",
      });
    }

    if (!location.address) {
      return res.status(400).json({
        success: false,
        message: "Location address is required.",
      });
    }

    if (
      !Array.isArray(location.coordinates) ||
      location.coordinates.length !== 2
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Location coordinates must be [longitude, latitude].",
      });
    }

    // -------------------------------------------------
    // LOCATION
    // -------------------------------------------------

    const [longitude, latitude] = location.coordinates;

    const lng = Number(longitude);
    const lat = Number(latitude);

    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      return res.status(400).json({
        success: false,
        message:
          "Valid longitude and latitude are required.",
      });
    }

    // -------------------------------------------------
    // INDIA BOUNDARY CHECK
    // -------------------------------------------------

    if (
      lng < 68 ||
      lng > 98 ||
      lat < 6 ||
      lat > 38
    ) {
      return res.status(400).json({
        success: false,
        message:
          "The provided location is outside India.",
      });
    }

    // -------------------------------------------------
    // VULNERABLE PEOPLE
    // -------------------------------------------------

    const safeVulnerablePeople = {
      children:
        Number(vulnerablePeople?.children) || 0,

      elderly:
        Number(vulnerablePeople?.elderly) || 0,

      disabled:
        Number(vulnerablePeople?.disabled) || 0,
    };

    const safeMedicalRequired =
      Boolean(medicalRequired);

    // =================================================
    // AI EMERGENCY ANALYSIS
    // =================================================

    let aiAnalysis = null;

    try {
      aiAnalysis = await analyzeEmergency({
        disasterType,
        description: description || "",
        severity,
        peopleCount: numericPeopleCount,
        medicalRequired: safeMedicalRequired,
        vulnerablePeople: safeVulnerablePeople,
        location,
      });

      console.log(
        "AI Emergency Analysis:",
        aiAnalysis
      );
    } catch (aiError) {
      console.error(
        "AI Emergency Agent Error:",
        aiError.message
      );

      // AI failure must NOT stop SOS creation.
      aiAnalysis = {
        disasterType: disasterType || "Other",

        severity: severity || "Medium",

        urgency: "Unknown",

        reasoning:
          "AI analysis unavailable. Existing emergency rules used.",

        requiredResources: [],

        recommendedActions: [],

        vulnerablePeople:
          safeVulnerablePeople,

        medicalRequired:
          safeMedicalRequired,

        confidence: 0,
      };
    }

    // =================================================
// AI SOS CLASSIFICATION
// =================================================

const aiClassification = aiAnalysis?.classification || {
  disasterType:
    aiAnalysis?.disasterType ||
    disasterType ||
    "Other",

  severity:
    aiAnalysis?.severity ||
    severity ||
    "Medium",

  urgency:
    aiAnalysis?.urgency ||
    "Moderate",

  requiredResources:
    Array.isArray(aiAnalysis?.requiredResources)
      ? aiAnalysis.requiredResources
      : [],

  medicalRequired:
    typeof aiAnalysis?.medicalRequired === "boolean"
      ? aiAnalysis.medicalRequired
      : safeMedicalRequired,

  confidence:
    typeof aiAnalysis?.confidence === "number"
      ? Math.max(
          0,
          Math.min(100, aiAnalysis.confidence)
        )
      : 50,
};

console.log(
  "🧠 AI SOS Classification:",
  aiClassification
);

    // -------------------------------------------------
    // PRIORITY
    // -------------------------------------------------

    const priorityScore = calculatePriority({
      severity,
      peopleCount: numericPeopleCount,
      medicalRequired: safeMedicalRequired,
      vulnerablePeople: safeVulnerablePeople,
    });

    // =================================================
    // CREATE SOS
    // =================================================

    const sos = new SOS({
      disasterType,

      description:
        description || "",

      severity,

      peopleCount:
        numericPeopleCount,

      medicalRequired:
        safeMedicalRequired,

      vulnerablePeople:
        safeVulnerablePeople,

      location: {
        address:
          location.address,

        city:
          location.city || "",

        state:
          location.state || "",

        country: "India",

        coordinates: {
          type: "Point",

          coordinates: [
            lng,
            lat,
          ],
        },
      },

      priorityScore,

      status: "Pending",
    });

    await sos.save();

    // =================================================
    // RESPONSE
    // =================================================

   return res.status(201).json({
  success: true,

  message:
    "SOS sent successfully 🚨",

  priorityScore,

  aiAnalysis,

  aiClassification,

  sos,
});
  } catch (error) {
    console.error(
      "Create SOS Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// =====================================================
// GET - ALL SOS
// =====================================================

router.get("/", async (req, res) => {
  try {
    const sosRequests = await SOS.find()
      .populate(
        "assignedTeam",
        "teamName teamCode phone status availability"
      )
      .sort({
        priorityScore: -1,
        createdAt: 1,
      });

    // Feature 7: attach a live escalation read to every
    // active case so the dashboard can flag stalled SOS
    // requests without a separate round-trip per card.
    const withEscalation = sosRequests.map((doc) => {
      const obj = doc.toObject();
      obj.escalation = calculateEscalation(doc);
      return obj;
    });

    return res.status(200).json({
      success: true,

      count:
        sosRequests.length,

      sosRequests: withEscalation,
    });
  } catch (error) {
    console.error(
      "Get SOS Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// =====================================================
// GET - NEARBY SOS
// =====================================================

router.get(
  "/nearby",
  async (req, res) => {
    try {
      const {
        longitude,
        latitude,
        distance = 10000,
      } = req.query;

      const lng =
        Number(longitude);

      const lat =
        Number(latitude);

      const maxDistance =
        Number(distance);

      if (
        !Number.isFinite(lng) ||
        !Number.isFinite(lat) ||
        !Number.isFinite(maxDistance)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Valid longitude, latitude and distance are required.",
        });
      }

      const sosRequests =
        await SOS.find({
          status: {
            $in: [
              "Pending",
              "Assigned",
              "Dispatched",
              "On the Way",
              "Reached",
              "Rescuing",
            ],
          },

          "location.coordinates": {
            $near: {
              $geometry: {
                type: "Point",

                coordinates: [
                  lng,
                  lat,
                ],
              },

              $maxDistance:
                maxDistance,
            },
          },
        }).populate(
          "assignedTeam",
          "teamName teamCode phone status availability"
        );

      return res.status(200).json({
        success: true,

        count:
          sosRequests.length,

        sosRequests,
      });
    } catch (error) {
      console.error(
        "Nearby SOS Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

// =====================================================
// PUT - UPDATE SOS STATUS
// =====================================================

router.put(
  "/:id/status",
  async (req, res) => {
    try {
      const { status } =
        req.body;

      const validStatuses = [
        "Pending",
        "Assigned",
        "Dispatched",
        "On the Way",
        "Reached",
        "Rescuing",
        "Completed",
        "Cancelled",
      ];

      // -------------------------------------------------
      // VALIDATE STATUS
      // -------------------------------------------------

      if (
        !validStatuses.includes(status)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid SOS status.",
        });
      }

      // -------------------------------------------------
      // FIND SOS
      // -------------------------------------------------

      const sos =
        await SOS.findById(
          req.params.id
        );

      if (!sos) {
        return res.status(404).json({
          success: false,
          message:
            "SOS not found.",
        });
      }

      // -------------------------------------------------
      // UPDATE STATUS
      // -------------------------------------------------

      sos.status = status;

      await sos.save();

      // -------------------------------------------------
      // RELEASE TEAM
      // -------------------------------------------------

      if (
        status === "Completed" ||
        status === "Cancelled"
      ) {
        if (sos.assignedTeam) {
          const team =
            await RescueTeam.findById(
              sos.assignedTeam
            );

          if (team) {
            team.status =
              "Available";

            team.availability =
              "Available";

            team.assignedEmergency =
              null;

            await team.save();
          }
        }
      }

      // -------------------------------------------------
      // RESPONSE
      // -------------------------------------------------

      return res.status(200).json({
        success: true,

        message:
          "SOS status updated successfully.",

        sos,
      });
    } catch (error) {
      console.error(
        "Update SOS Status Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

// =====================================================
// PUT - ASSIGN RESCUE TEAM
// =====================================================

router.put(
  "/:id/assign",
  async (req, res) => {
    try {
      const { teamId } =
        req.body;

      // -------------------------------------------------
      // VALIDATE TEAM ID
      // -------------------------------------------------

      if (!teamId) {
        return res.status(400).json({
          success: false,
          message:
            "Rescue team ID is required.",
        });
      }

      // -------------------------------------------------
      // FIND TEAM
      // -------------------------------------------------

      const team =
        await RescueTeam.findById(
          teamId
        );

      if (!team) {
        return res.status(404).json({
          success: false,
          message:
            "Rescue team not found.",
        });
      }

      // -------------------------------------------------
      // CHECK AVAILABILITY
      // -------------------------------------------------

      if (
        team.availability !==
          "Available" ||
        team.status !==
          "Available"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "This rescue team is currently unavailable.",
        });
      }

      // -------------------------------------------------
      // FIND SOS
      // -------------------------------------------------

      const sos =
        await SOS.findById(
          req.params.id
        );

      if (!sos) {
        return res.status(404).json({
          success: false,
          message:
            "SOS not found.",
        });
      }

      // -------------------------------------------------
      // ASSIGN SOS
      // -------------------------------------------------

      sos.assignedTeam =
        team._id;

      sos.status =
        "Assigned";

      await sos.save();

      // -------------------------------------------------
      // UPDATE TEAM
      // -------------------------------------------------

      team.assignedEmergency =
        sos._id;

      team.status =
        "Assigned";

      team.availability =
        "Busy";

      await team.save();

      // -------------------------------------------------
      // RESPONSE
      // -------------------------------------------------

      return res.status(200).json({
        success: true,

        message:
          "SOS assigned to rescue team successfully.",

        sos,

        team,
      });
    } catch (error) {
      console.error(
        "Assign SOS Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

// =====================================================
// GET - RECOMMENDED RESCUE TEAMS
// =====================================================

router.get(
  "/:id/recommended-teams",
  async (req, res) => {
    try {
      // -------------------------------------------------
      // FIND SOS
      // -------------------------------------------------

      const sos =
        await SOS.findById(
          req.params.id
        );

      if (!sos) {
        return res.status(404).json({
          success: false,
          message:
            "SOS not found.",
        });
      }

      // -------------------------------------------------
      // SOS LOCATION
      // -------------------------------------------------

      const [
        longitude,
        latitude,
      ] =
        sos.location.coordinates
          .coordinates;

      // -------------------------------------------------
      // FIND AVAILABLE TEAMS
      // -------------------------------------------------

      const teams =
        await RescueTeam.find({
          availability:
            "Available",

          status:
            "Available",

          "location.coordinates": {
            $near: {
              $geometry: {
                type: "Point",

                coordinates: [
                  longitude,
                  latitude,
                ],
              },

              // 100 km
              $maxDistance:
                100000,
            },
          },
        });

      // -------------------------------------------------
      // SCORE EACH TEAM
      // -------------------------------------------------

      const recommendedTeams =
        teams.map((team) => {
          let score = 0;

          // ---------------------------------------------
          // DISTANCE SCORE
          // ---------------------------------------------

          const [
            teamLng,
            teamLat,
          ] =
            team.location.coordinates
              .coordinates;

          const distance =
            calculateDistance(
              latitude,
              longitude,
              teamLat,
              teamLng
            );

          if (distance <= 10) {
            score += 40;
          } else if (distance <= 25) {
            score += 30;
          } else if (distance <= 50) {
            score += 20;
          } else {
            score += 10;
          }

          // ---------------------------------------------
          // SKILL MATCH
          // ---------------------------------------------

          const skills =
            Array.isArray(team.skills)
              ? team.skills.map(
                  (skill) =>
                    String(skill).toLowerCase()
                )
              : [];

          if (
            sos.disasterType &&
            skills.some((skill) =>
              skill.includes(
                String(
                  sos.disasterType
                ).toLowerCase()
              )
            )
          ) {
            score += 30;
          }

          // ---------------------------------------------
          // MEDICAL SUPPORT
          // ---------------------------------------------

          if (
            sos.medicalRequired &&
            skills.some(
              (skill) =>
                skill.includes(
                  "first aid"
                ) ||
                skill.includes(
                  "medical"
                ) ||
                skill.includes(
                  "doctor"
                )
            )
          ) {
            score += 20;
          }

          // ---------------------------------------------
          // TEAM SIZE
          // ---------------------------------------------

          if (
            Number(team.members) >=
            Number(sos.peopleCount)
          ) {
            score += 10;
          }

          // ---------------------------------------------
          // RETURN RESULT
          // ---------------------------------------------

          return {
            team,

            distance:
              Number(
                distance.toFixed(2)
              ),

            score,
          };
        });

      // -------------------------------------------------
      // SORT
      // -------------------------------------------------

      recommendedTeams.sort(
        (a, b) =>
          b.score - a.score
      );

      // -------------------------------------------------
      // RESPONSE
      // -------------------------------------------------

      return res.status(200).json({
        success: true,

        sosId:
          sos._id,

        count:
          recommendedTeams.length,

        recommendedTeams,
      });
    } catch (error) {
      console.error(
        "Recommended Teams Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

// =====================================================
// DISTANCE CALCULATOR
// =====================================================

function calculateDistance(
  lat1,
  lon1,
  lat2,
  lon2
) {
  const R = 6371;

  const dLat =
    ((lat2 - lat1) *
      Math.PI) /
    180;

  const dLon =
    ((lon2 - lon1) *
      Math.PI) /
    180;

  const a =
    Math.sin(dLat / 2) *
      Math.sin(dLat / 2) +
    Math.cos(
      (lat1 * Math.PI) /
        180
    ) *
      Math.cos(
        (lat2 * Math.PI) /
          180
      ) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c =
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    );

  return R * c;
}

// =====================================================
// GET - ETA FOR AN SOS (Feature 8)
// =====================================================
// Uses the assigned team if one exists, otherwise the
// closest available team, and a deterministic distance
// model — never a random number.

router.get("/:id/eta", async (req, res) => {
  try {
    const { id } = req.params;

    const sos = await SOS.findById(id).populate("assignedTeam");

    if (!sos) {
      return res.status(404).json({ success: false, message: "SOS not found" });
    }

    let team = sos.assignedTeam;

    if (!team) {
      const available = await RescueTeam.find({ status: "Available" });
      const sosCoords = sos.location?.coordinates?.coordinates;

      if (available.length && sosCoords) {
        team = available
          .map((t) => ({
            t,
            d: haversineKm(sosCoords, t.location?.coordinates?.coordinates),
          }))
          .filter((x) => x.d !== null)
          .sort((a, b) => a.d - b.d)[0]?.t || available[0];
      } else if (available.length) {
        team = available[0];
      }
    }

    const eta = calculateETA(sos, team);

    return res.status(200).json({
      success: true,
      sosId: sos._id,
      eta,
    });
  } catch (error) {
    console.error("ETA error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// =====================================================
// EXPORT
// =====================================================

module.exports = router;