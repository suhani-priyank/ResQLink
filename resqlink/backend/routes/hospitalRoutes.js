const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

const Hospital = require("../models/Hospital");
const { haversineKm } = require("../services/aiTeamDecision");

// ======================================================
// DEMO DATASET
// No external hospital-capacity API is wired up, so this
// route seeds a small, clearly-labelled (isDemoData:true)
// dataset the first time it's queried. The schema/route
// shape is ready to be pointed at a real API later —
// swap the seed for a fetch() and nothing downstream
// needs to change.
// ======================================================

const DEMO_HOSPITALS = [
  {
    name: "City General Hospital",
    city: "Chennai",
    state: "Tamil Nadu",
    address: "Anna Salai, Chennai",
    coordinates: { type: "Point", coordinates: [80.2707, 13.0827] },
    emergencyCapacity: 40,
    totalBeds: 320,
    availableBeds: 54,
    icuBeds: 30,
    icuAvailable: 6,
    ambulancesTotal: 12,
    ambulancesAvailable: 4,
    status: "Operational",
  },
  {
    name: "St. Mary's Medical Center",
    city: "Chennai",
    state: "Tamil Nadu",
    address: "Mount Road, Chennai",
    coordinates: { type: "Point", coordinates: [80.2497, 13.0569] },
    emergencyCapacity: 25,
    totalBeds: 180,
    availableBeds: 12,
    icuBeds: 18,
    icuAvailable: 1,
    ambulancesTotal: 6,
    ambulancesAvailable: 1,
    status: "Near Capacity",
  },
  {
    name: "Government District Hospital",
    city: "Chennai",
    state: "Tamil Nadu",
    address: "Egmore, Chennai",
    coordinates: { type: "Point", coordinates: [80.2609, 13.0732] },
    emergencyCapacity: 60,
    totalBeds: 450,
    availableBeds: 130,
    icuBeds: 40,
    icuAvailable: 14,
    ambulancesTotal: 20,
    ambulancesAvailable: 9,
    status: "Operational",
  },
  {
    name: "Riverside Trauma Institute",
    city: "Chennai",
    state: "Tamil Nadu",
    address: "Adyar, Chennai",
    coordinates: { type: "Point", coordinates: [80.2565, 13.0067] },
    emergencyCapacity: 15,
    totalBeds: 90,
    availableBeds: 0,
    icuBeds: 12,
    icuAvailable: 0,
    ambulancesTotal: 4,
    ambulancesAvailable: 0,
    status: "Full",
  },
];

async function ensureSeeded() {
  const count = await Hospital.countDocuments();
  if (count === 0) {
    await Hospital.insertMany(DEMO_HOSPITALS.map((h) => ({ ...h, isDemoData: true })));
  }
}

// GET all hospitals, optionally sorted by distance to a coordinate
router.get("/", async (req, res) => {
  try {
    await ensureSeeded();

    const hospitals = await Hospital.find();

    const { lng, lat } = req.query;
    let result = hospitals.map((h) => h.toObject());

    if (lng && lat) {
      const origin = [Number(lng), Number(lat)];
      result = result
        .map((h) => ({
          ...h,
          distanceKm: (() => {
            const d = haversineKm(origin, h.coordinates?.coordinates);
            return d === null ? null : Math.round(d * 10) / 10;
          })(),
        }))
        .sort((a, b) => (a.distanceKm ?? 999999) - (b.distanceKm ?? 999999));
    }

    res.status(200).json({
      success: true,
      count: result.length,
      hospitals: result,
      source: "local-demo-dataset",
    });
  } catch (error) {
    console.error("Hospital list error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update bed/ICU/ambulance counts (dispatcher marks a bed used, etc.)
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid hospital ID" });
    }

    const allowed = [
      "availableBeds",
      "icuAvailable",
      "ambulancesAvailable",
      "status",
    ];

    const update = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }

    const hospital = await Hospital.findByIdAndUpdate(id, update, { new: true });

    if (!hospital) {
      return res.status(404).json({ success: false, message: "Hospital not found" });
    }

    res.status(200).json({ success: true, message: "Hospital updated", hospital });
  } catch (error) {
    console.error("Hospital update error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
