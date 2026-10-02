const express = require("express");
const mongoose = require("mongoose");

const SOS = require("../models/SOS");
const RescueTeam = require("../models/RescueTeam");
const Resource = require("../models/Resource");
const { buildExplanation } = require("../services/aiTeamDecision");

const router = express.Router();

/*
==================================================
HELPER FUNCTIONS
==================================================
*/

const severityScore = {
  Low: 1,
  Medium: 2,
  High: 3,
  Critical: 4,
};

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

/*
Return resource categories useful for an emergency.
*/
function getRequiredCategories(sos) {
  const disasterType = normalize(sos.disasterType);

  const categories = new Set();

  // Every emergency may need rescue/transport
  categories.add("Rescue");

  if (
    disasterType.includes("medical") ||
    disasterType.includes("injury") ||
    disasterType.includes("accident") ||
    sos.medicalRequired
  ) {
    categories.add("Medical");
    categories.add("Transport");
  }

  if (
    disasterType.includes("flood") ||
    disasterType.includes("water") ||
    disasterType.includes("drowning")
  ) {
    categories.add("Water");
    categories.add("Rescue");
    categories.add("Transport");
  }

  if (
    disasterType.includes("fire") ||
    disasterType.includes("burn")
  ) {
    categories.add("Medical");
    categories.add("Rescue");
    categories.add("Equipment");
    categories.add("Transport");
  }

  if (
    disasterType.includes("earthquake") ||
    disasterType.includes("collapse") ||
    disasterType.includes("building")
  ) {
    categories.add("Rescue");
    categories.add("Equipment");
    categories.add("Medical");
    categories.add("Shelter");
  }

  if (
    disasterType.includes("cyclone") ||
    disasterType.includes("storm") ||
    disasterType.includes("disaster")
  ) {
    categories.add("Shelter");
    categories.add("Water");
    categories.add("Food");
    categories.add("Medical");
    categories.add("Rescue");
  }

  // Critical emergencies get broader support
  if (sos.severity === "Critical") {
    categories.add("Medical");
    categories.add("Transport");
    categories.add("Equipment");
    categories.add("Shelter");
  }

  return [...categories];
}

/*
Calculate recommended quantity.
*/
function calculateRequiredQuantity(sos, resource) {
  const people = Math.max(Number(sos.peopleCount) || 1, 1);

  const vulnerable =
    (sos.vulnerablePeople?.children || 0) +
    (sos.vulnerablePeople?.elderly || 0) +
    (sos.vulnerablePeople?.disabled || 0);

  const severity = severityScore[sos.severity] || 1;

  let required = 1;

  switch (resource.category) {
    case "Medical":
      required = Math.ceil(people * 0.5);

      if (sos.medicalRequired) {
        required = Math.max(required, Math.ceil(people * 0.75));
      }

      if (vulnerable > 0) {
        required += vulnerable;
      }

      break;

    case "Water":
      required = Math.max(2, people * 2);
      break;

    case "Food":
      required = Math.max(2, people);
      break;

    case "Shelter":
      required = Math.max(1, Math.ceil(people / 4));
      break;

    case "Transport":
      required = Math.max(1, Math.ceil(people / 5));
      break;

    case "Rescue":
      required = Math.max(1, Math.ceil(people / 5));
      break;

    case "Equipment":
      required = Math.max(1, Math.ceil(people / 4));
      break;

    default:
      required = Math.max(1, severity);
  }

  // Critical emergency gets additional buffer
  if (sos.severity === "Critical") {
    required = Math.ceil(required * 1.25);
  }

  return required;
}

/*
Score a resource for an SOS.
*/
function scoreResource(sos, resource) {
  let score = 0;

  const disasterType = normalize(sos.disasterType);
  const category = normalize(resource.category);

  const requiredCategories = getRequiredCategories(sos);

  /*
  Category match
  */
  if (
    requiredCategories.some(
      (item) => normalize(item) === category
    )
  ) {
    score += 40;
  }

  /*
  Medical priority
  */
  if (
    sos.medicalRequired &&
    resource.category === "Medical"
  ) {
    score += 30;
  }

  /*
  Vulnerable people
  */
  const vulnerable =
    (sos.vulnerablePeople?.children || 0) +
    (sos.vulnerablePeople?.elderly || 0) +
    (sos.vulnerablePeople?.disabled || 0);

  if (vulnerable > 0) {
    if (
      resource.category === "Medical" ||
      resource.category === "Transport" ||
      resource.category === "Shelter"
    ) {
      score += 20;
    }
  }

  /*
  Disaster-specific matching
  */
  if (
    disasterType.includes("flood") &&
    ["Water", "Rescue", "Transport"].includes(
      resource.category
    )
  ) {
    score += 25;
  }

  if (
    disasterType.includes("fire") &&
    ["Medical", "Equipment", "Rescue", "Transport"].includes(
      resource.category
    )
  ) {
    score += 25;
  }

  if (
    disasterType.includes("earthquake") ||
    disasterType.includes("collapse")
  ) {
    if (
      ["Rescue", "Equipment", "Medical", "Shelter"].includes(
        resource.category
      )
    ) {
      score += 25;
    }
  }

  /*
  Availability
  */
  if (resource.availableQuantity > 0) {
    score += 20;
  }

  if (resource.availableQuantity >= resource.quantity * 0.5) {
    score += 10;
  }

  /*
  Stock status
  */
  if (resource.status === "Available") {
    score += 10;
  } else if (resource.status === "Low Stock") {
    score += 3;
  }

  return score;
}

/*
==================================================
GET AVAILABLE RESCUE TEAMS
==================================================
GET /api/resource-allocation/available
*/

router.get("/available", async (req, res) => {
  try {
    const teams = await RescueTeam.find({
      availability: "Available",
      status: "Available",
    }).sort({ members: -1 });

    res.json({
      success: true,
      count: teams.length,
      teams,
    });
  } catch (error) {
    console.error("Available teams error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch available rescue teams",
      error: error.message,
    });
  }
});

/*
==================================================
GET AVAILABLE RESOURCES
==================================================
GET /api/resource-allocation/resources
*/

router.get("/resources", async (req, res) => {
  try {
    const resources = await Resource.find({
      availableQuantity: { $gt: 0 },
      status: {
        $in: ["Available", "Low Stock"],
      },
    }).sort({
      availableQuantity: -1,
    });

    res.json({
      success: true,
      count: resources.length,
      resources,
    });
  } catch (error) {
    console.error("Available resources error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch available resources",
      error: error.message,
    });
  }
});

/*
==================================================
AI RESOURCE RECOMMENDATION
==================================================
GET /api/resource-allocation/resources/ai-recommend/:sosId
*/

router.get(
  "/resources/ai-recommend/:sosId",
  async (req, res) => {
    try {
      const { sosId } = req.params;

      /*
      Validate ID
      */
      if (!mongoose.Types.ObjectId.isValid(sosId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid SOS ID",
          receivedId: sosId,
        });
      }

      /*
      Find SOS
      */
      const sos = await SOS.findById(sosId);

      if (!sos) {
        return res.status(404).json({
          success: false,
          message: "SOS not found",
          sosId,
        });
      }

      /*
      Find available resources
      */
      const resources = await Resource.find({
        availableQuantity: { $gt: 0 },
        status: {
          $in: ["Available", "Low Stock"],
        },
      });

      if (resources.length === 0) {
        return res.status(404).json({
          success: false,
          message: "No available resources found",
          sosId,
        });
      }

      /*
      Score resources
      */
      const scoredResources = resources.map(
        (resource) => {
          const score = scoreResource(
            sos,
            resource
          );

          const requiredQuantity =
            calculateRequiredQuantity(
              sos,
              resource
            );

          const allocatedQuantity =
            Math.min(
              requiredQuantity,
              resource.availableQuantity
            );

          return {
            resource,
            score,
            requiredQuantity,
            allocatedQuantity,
          };
        }
      );

      /*
      Sort by score
      */
      scoredResources.sort(
        (a, b) => b.score - a.score
      );

      /*
      Only return resources relevant to
      this emergency.
      */
      const requiredCategories =
        getRequiredCategories(sos);

      const recommendedResources =
        scoredResources
          .filter(
            (item) =>
              requiredCategories.includes(
                item.resource.category
              )
          )
          .slice(0, 8);

      /*
      Explanation
      */
      const reasons = [];

      if (sos.medicalRequired) {
        reasons.push(
          "Medical assistance is required"
        );
      }

      if (
        sos.vulnerablePeople?.children > 0 ||
        sos.vulnerablePeople?.elderly > 0 ||
        sos.vulnerablePeople?.disabled > 0
      ) {
        reasons.push(
          "Vulnerable people are involved"
        );
      }

      if (sos.severity === "Critical") {
        reasons.push(
          "Critical emergency requires additional resources"
        );
      }

      reasons.push(
        `Resources matched to ${sos.disasterType} emergency`
      );

      /*
      Final response
      */
      return res.json({
        success: true,

        emergency: {
          id: sos._id,
          disasterType: sos.disasterType,
          severity: sos.severity,
          peopleCount: sos.peopleCount,
          medicalRequired: sos.medicalRequired,
          vulnerablePeople:
            sos.vulnerablePeople,
          location: sos.location,
        },

        allocation: {
          totalResources:
            recommendedResources.length,

          reasons,

          resources:
            recommendedResources.map(
              (item) => ({
                resourceId:
                  item.resource._id,

                name:
                  item.resource.name,

                category:
                  item.resource.category,

                availableQuantity:
                  item.resource
                    .availableQuantity,

                requiredQuantity:
                  item.requiredQuantity,

                allocatedQuantity:
                  item.allocatedQuantity,

                score:
                  item.score,

                location:
                  item.resource.location,

                status:
                  item.resource.status,
              })
            ),
        },
      });
    } catch (error) {
      console.error(
        "AI resource recommendation error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to generate resource recommendation",
        error: error.message,
      });
    }
  }
);

/*
==================================================
AI TEAM RECOMMENDATION
==================================================
GET /api/resource-allocation/ai-recommend/:sosId
*/

router.get(
  "/ai-recommend/:sosId",
  async (req, res) => {
    try {
      const { sosId } = req.params;

      /*
      Validate MongoDB ObjectId
      */
      if (!mongoose.Types.ObjectId.isValid(sosId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid SOS ID",
          receivedId: sosId,
          hint:
            "Use the _id returned by GET /api/sos",
        });
      }

      /*
      Find SOS
      */
      const sos = await SOS.findById(sosId);

      if (!sos) {
        return res.status(404).json({
          success: false,
          message: "SOS not found",
          sosId,
        });
      }

      /*
      Find available teams
      */
      const teams = await RescueTeam.find({
        availability: "Available",
        status: "Available",
      });

      if (teams.length === 0) {
        return res.status(404).json({
          success: false,
          message:
            "No available rescue teams found",
        });
      }

      /*
      Severity
      */
      const requiredSeverity =
        severityScore[sos.severity] || 1;

      /*
      Score teams
      */
      const scoredTeams = teams.map(
        (team) => {
          let score = 0;

          /*
          Severity
          */
          score +=
            requiredSeverity * 10;

          /*
          Skill matching
          */
          if (
            Array.isArray(team.skills)
          ) {
            const skills =
              team.skills.map(
                (skill) =>
                  normalize(skill)
              );

            const disasterType =
              normalize(
                sos.disasterType
              );

            if (
              skills.some(
                (skill) =>
                  disasterType.includes(
                    skill.replace(
                      " rescue",
                      ""
                    )
                  )
              )
            ) {
              score += 40;
            }

            if (
              skills.includes(
                "first aid"
              )
            ) {
              score += 15;
            }

            if (
              skills.includes(
                "swimming"
              )
            ) {
              score += 10;
            }
          }

          /*
          Medical
          */
          if (sos.medicalRequired) {
            if (
              Array.isArray(team.skills) &&
              team.skills.some(
                (skill) =>
                  normalize(skill) ===
                  "first aid"
              )
            ) {
              score += 30;
            }
          }

          /*
          Vulnerable people
          */
          const vulnerable =
            (sos.vulnerablePeople
              ?.children || 0) +
            (sos.vulnerablePeople
              ?.elderly || 0) +
            (sos.vulnerablePeople
              ?.disabled || 0);

          score +=
            vulnerable * 5;

          /*
          Team capacity
          */
          if (
            team.members &&
            team.members >=
              sos.peopleCount
          ) {
            score += 15;
          }

          return {
            team,
            score,
          };
        }
      );

      /*
      Sort
      */
      scoredTeams.sort(
        (a, b) =>
          b.score - a.score
      );

      /*
      Best team
      */
      const best =
        scoredTeams[0];

      /*
      Reasons
      */
      const reasons = [];

      if (
        best.team.skills?.length
      ) {
        reasons.push(
          "Team skills match the emergency requirements"
        );
      }

      if (
        sos.medicalRequired
      ) {
        reasons.push(
          "Medical assistance is required"
        );
      }

      if (
        sos.vulnerablePeople
          ?.children > 0 ||
        sos.vulnerablePeople
          ?.elderly > 0 ||
        sos.vulnerablePeople
          ?.disabled > 0
      ) {
        reasons.push(
          "Vulnerable people are involved"
        );
      }

      if (
        best.team.members >=
        sos.peopleCount
      ) {
        reasons.push(
          "Team has sufficient members"
        );
      }

      /*
      Final response
      */
      return res.json({
        success: true,

        emergency: {
          id: sos._id,
          disasterType:
            sos.disasterType,
          severity:
            sos.severity,
          peopleCount:
            sos.peopleCount,
          medicalRequired:
            sos.medicalRequired,
          location:
            sos.location,
        },

        recommendation: {
          teamId:
            best.team._id,

          teamName:
            best.team.teamName,

          teamCode:
            best.team.teamCode,

          score:
            best.score,

          reasons,

          // Explainable AI: named percentage breakdown for
          // "why this team?" instead of just a raw score.
          breakdown: buildExplanation(sos, best.team),
        },

        alternatives:
          scoredTeams
            .slice(1, 4)
            .map((item) => ({
              teamId:
                item.team._id,

              teamName:
                item.team.teamName,

              teamCode:
                item.team.teamCode,

              score:
                item.score,
            })),
      });
    } catch (error) {
      console.error(
        "AI recommendation error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to generate team recommendation",
        error: error.message,
      });
    }
  }
);

/*
==================================================
ALLOCATE RESOURCE (persists the change)
==================================================
POST /api/resource-allocation/allocate
body: { resourceId, quantity, sosId? }
*/

router.post("/allocate", async (req, res) => {
  try {
    const { resourceId, quantity } = req.body;

    if (!mongoose.Types.ObjectId.isValid(resourceId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid resource ID",
      });
    }

    const amount = Number(quantity);
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Quantity must be a positive number",
      });
    }

    const resource = await Resource.findById(resourceId);

    if (!resource) {
      return res.status(404).json({
        success: false,
        message: "Resource not found",
      });
    }

    if (resource.availableQuantity < amount) {
      return res.status(409).json({
        success: false,
        message: `Only ${resource.availableQuantity} units of ${resource.name} are available`,
      });
    }

    resource.availableQuantity -= amount;

    resource.status =
      resource.availableQuantity === 0
        ? "Out of Stock"
        : resource.availableQuantity <= resource.quantity * 0.2
        ? "Low Stock"
        : "Available";

    await resource.save();

    return res.json({
      success: true,
      message: `${amount} × ${resource.name} allocated`,
      resource,
    });
  } catch (error) {
    console.error("Allocate resource error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to allocate resource",
      error: error.message,
    });
  }
});

/*
==================================================
RELEASE RESOURCE (undo an allocation)
==================================================
POST /api/resource-allocation/release
body: { resourceId, quantity }
*/

router.post("/release", async (req, res) => {
  try {
    const { resourceId, quantity } = req.body;

    if (!mongoose.Types.ObjectId.isValid(resourceId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid resource ID",
      });
    }

    const amount = Number(quantity);
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Quantity must be a positive number",
      });
    }

    const resource = await Resource.findById(resourceId);

    if (!resource) {
      return res.status(404).json({
        success: false,
        message: "Resource not found",
      });
    }

    resource.availableQuantity = Math.min(
      resource.quantity,
      resource.availableQuantity + amount
    );

    resource.status =
      resource.availableQuantity === 0
        ? "Out of Stock"
        : resource.availableQuantity <= resource.quantity * 0.2
        ? "Low Stock"
        : "Available";

    await resource.save();

    return res.json({
      success: true,
      message: `${amount} × ${resource.name} released back to inventory`,
      resource,
    });
  } catch (error) {
    console.error("Release resource error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to release resource",
      error: error.message,
    });
  }
});

module.exports = router;