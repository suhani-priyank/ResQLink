const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

const FamilyGroup = require("../models/FamilyGroup");
const SOS = require("../models/SOS");

// CREATE a group
router.post("/", async (req, res) => {
  try {
    const { groupName, createdBy, members, emergencyContacts } = req.body;

    if (!groupName) {
      return res.status(400).json({ success: false, message: "Group name is required" });
    }

    const group = new FamilyGroup({
      groupName,
      createdBy: createdBy || "",
      members: Array.isArray(members) ? members : [],
      emergencyContacts: Array.isArray(emergencyContacts) ? emergencyContacts : [],
    });

    await group.save();

    res.status(201).json({ success: true, message: "Group created", group });
  } catch (error) {
    console.error("Create group error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// LIST groups
router.get("/", async (req, res) => {
  try {
    const groups = await FamilyGroup.find()
      .populate("activeSos")
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, count: groups.length, groups });
  } catch (error) {
    console.error("List groups error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// UPDATE a member's status/location
router.put("/:groupId/members/:memberId", async (req, res) => {
  try {
    const { groupId, memberId } = req.params;
    const { status, lastKnownLocation } = req.body;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ success: false, message: "Invalid group ID" });
    }

    const group = await FamilyGroup.findById(groupId);
    if (!group) {
      return res.status(404).json({ success: false, message: "Group not found" });
    }

    const member = group.members.id(memberId);
    if (!member) {
      return res.status(404).json({ success: false, message: "Member not found" });
    }

    if (status) member.status = status;
    if (lastKnownLocation) member.lastKnownLocation = lastKnownLocation;

    await group.save();

    res.status(200).json({ success: true, message: "Member updated", group });
  } catch (error) {
    console.error("Update member error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// TRIGGER GROUP SOS — creates a real SOS tied to the group and
// marks the group active, using the existing SOS pipeline
// (same AI classification / priority scoring / escalation
// as an individual SOS) rather than a parallel fake flow.
router.post("/:groupId/sos", async (req, res) => {
  try {
    const { groupId } = req.params;
    const { disasterType, severity, description, location } = req.body;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({ success: false, message: "Invalid group ID" });
    }

    const group = await FamilyGroup.findById(groupId);
    if (!group) {
      return res.status(404).json({ success: false, message: "Group not found" });
    }

    if (!location?.address || !Array.isArray(location?.coordinates)) {
      return res.status(400).json({
        success: false,
        message: "Location (address + coordinates) is required.",
      });
    }

    const [lng, lat] = location.coordinates;

    const sos = new SOS({
      disasterType: disasterType || "Other",
      description: description || `Group SOS triggered for "${group.groupName}" (${group.members.length} members).`,
      severity: severity || "Critical",
      peopleCount: Math.max(1, group.members.length),
      medicalRequired: false,
      vulnerablePeople: { children: 0, elderly: 0, disabled: 0 },
      location: {
        address: location.address,
        city: location.city || "",
        state: location.state || "",
        country: "India",
        coordinates: { type: "Point", coordinates: [Number(lng), Number(lat)] },
      },
      priorityScore: 90,
      status: "Pending",
    });

    await sos.save();

    group.activeSos = sos._id;
    group.status = "Group SOS Active";
    await group.save();

    res.status(201).json({
      success: true,
      message: `Group SOS created for "${group.groupName}"`,
      sos,
      group,
    });
  } catch (error) {
    console.error("Group SOS error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
