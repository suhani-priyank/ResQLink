const express = require("express");

const router = express.Router();

const Agency = require("../models/Agency");
const SOS = require("../models/SOS");
const RescueTeam = require("../models/RescueTeam");
const Resource = require("../models/Resource");

const DEMO_AGENCIES = [
  { name: "City Police Department", type: "Police", jurisdiction: "Chennai Metro", contact: "100" },
  { name: "Fire & Rescue Services", type: "Fire", jurisdiction: "Chennai Metro", contact: "101" },
  { name: "Emergency Medical Services", type: "Medical", jurisdiction: "Chennai Metro", contact: "108" },
  { name: "State Disaster Management Authority", type: "Disaster Management", jurisdiction: "Tamil Nadu" },
  { name: "Municipal Corporation", type: "Municipal Authority", jurisdiction: "Chennai" },
];

async function ensureSeeded() {
  const count = await Agency.countDocuments();
  if (count === 0) {
    await Agency.insertMany(DEMO_AGENCIES.map((a) => ({ ...a, isDemoData: true })));
  }
}

// GET all agencies, with real active-incident / team / resource
// counts merged in from the actual database (not fabricated
// per-agency — every agency shares the same shared incident
// pool, since this platform doesn't yet route by agency type).
router.get("/", async (req, res) => {
  try {
    await ensureSeeded();

    const [agencies, activeIncidents, availableTeams, availableResources] = await Promise.all([
      Agency.find(),
      SOS.countDocuments({ status: { $in: ["Pending", "Assigned", "In Progress"] } }),
      RescueTeam.countDocuments({ status: "Available" }),
      Resource.countDocuments({ availableQuantity: { $gt: 0 } }),
    ]);

    const enriched = agencies.map((a) => {
      const obj = a.toObject();
      obj.activeIncidents = activeIncidents;
      obj.availableTeams = availableTeams;
      obj.availableResources = availableResources;
      return obj;
    });

    res.status(200).json({
      success: true,
      count: enriched.length,
      agencies: enriched,
      note: "Shared incident view — per-agency routing is not yet implemented, so all agencies currently see the same active-incident pool.",
    });
  } catch (error) {
    console.error("Agency list error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
