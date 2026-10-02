const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const AdminUser = require("../models/AdminUser");
const AdminLog = require("../models/AdminLog");
const SOS = require("../models/SOS");
const RescueTeam = require("../models/RescueTeam");
const Hospital = require("../models/Hospital");
const Resource = require("../models/Resource");
const Agency = require("../models/Agency");
const { authenticateUser, requireAdmin } = require("../middleware/adminAuth");

const router = express.Router();
const ACTIVE_STATUSES = ["Pending", "Assigned", "Dispatched", "On the Way", "Reached", "Rescuing"];
const VALID_SOS_STATUSES = [...ACTIVE_STATUSES, "Completed", "Cancelled"];
const VALID_TEAM_STATUSES = ["Available", "Assigned", "Dispatched", "On the Way", "Reached", "Rescuing", "Completed"];

function objectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

async function logAction(admin, action, targetType = "System", targetId = "", metadata) {
  await AdminLog.create({
    action,
    targetType,
    targetId: String(targetId || ""),
    adminEmail: admin.email,
    metadata,
  });
}

async function ensureConfiguredAdmin() {
  const email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || "");
  if (!email || !password) return null;

  let admin = await AdminUser.findOne({ email }).select("+passwordHash");
  if (!admin) {
    admin = await AdminUser.create({
      email,
      passwordHash: await bcrypt.hash(password, 12),
      name: process.env.ADMIN_NAME || "ResQLink Administrator",
    });
  }
  return admin;
}

router.post("/auth/login", async (req, res) => {
  try {
    if (!process.env.ADMIN_JWT_SECRET) {
      return res.status(503).json({ success: false, message: "Administrator sign-in is not configured." });
    }

    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const configuredAdmin = await ensureConfiguredAdmin();
    const admin = configuredAdmin || (email ? await AdminUser.findOne({ email }).select("+passwordHash") : null);
    const valid = Boolean(admin && admin.status === "Active" && await bcrypt.compare(password, admin.passwordHash));

    if (!valid || !admin || (configuredAdmin && admin.email !== email)) {
      return res.status(401).json({ success: false, message: "Invalid administrator credentials." });
    }

    admin.lastLoginAt = new Date();
    await admin.save();
    await logAction(admin, "Admin login");

    const token = jwt.sign({ sub: String(admin._id), role: admin.role }, process.env.ADMIN_JWT_SECRET, { expiresIn: "8h" });
    return res.json({ success: true, token, admin: { id: admin._id, email: admin.email, name: admin.name, role: admin.role } });
  } catch (error) {
    console.error("Admin login error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to sign in." });
  }
});

router.use(authenticateUser, requireAdmin);

router.get("/auth/me", (req, res) => {
  res.json({ success: true, admin: { id: req.admin._id, email: req.admin.email, name: req.admin.name, role: req.admin.role } });
});

router.post("/auth/logout", async (req, res) => {
  await logAction(req.admin, "Admin logout");
  res.json({ success: true });
});

router.get("/overview", async (req, res) => {
  try {
    const [incidents, teams, hospitals, resources, agencies, logs, admins] = await Promise.all([
      SOS.find().populate("assignedTeam", "teamName teamCode phone status availability").sort({ createdAt: -1 }).lean(),
      RescueTeam.find().sort({ createdAt: -1 }).lean(),
      Hospital.find().sort({ name: 1 }).lean(),
      Resource.find().sort({ category: 1, name: 1 }).lean(),
      Agency.find().sort({ name: 1 }).lean(),
      AdminLog.find().sort({ createdAt: -1 }).limit(100).lean(),
      AdminUser.find().select("email name role status createdAt lastLoginAt").sort({ createdAt: -1 }).lean(),
    ]);

    const availableTeams = teams.filter((team) => team.availability === "Available" && team.status === "Available").length;
    const assignedTeams = teams.filter((team) => team.status !== "Available" || team.availability !== "Available").length;
    const activeIncidents = incidents.filter((incident) => ACTIVE_STATUSES.includes(incident.status));
    const criticalIncidents = activeIncidents.filter((incident) => incident.severity === "Critical").length;
    const availableResources = resources.reduce((sum, resource) => sum + Number(resource.availableQuantity || 0), 0);

    return res.json({
      success: true,
      stats: {
        activeIncidents: activeIncidents.length,
        criticalIncidents,
        availableTeams,
        assignedTeams,
        hospitals: hospitals.length,
        availableResources,
        pendingSOS: incidents.filter((incident) => incident.status === "Pending").length,
        completedIncidents: incidents.filter((incident) => incident.status === "Completed").length,
      },
      incidents,
      teams,
      hospitals,
      resources,
      agencies,
      logs,
      admins,
    });
  } catch (error) {
    console.error("Admin overview error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to load administrator data." });
  }
});

router.put("/incidents/:id/status", async (req, res) => {
  try {
    if (!objectId(req.params.id) || !VALID_SOS_STATUSES.includes(req.body.status)) {
      return res.status(400).json({ success: false, message: "Invalid incident or status." });
    }
    const incident = await SOS.findById(req.params.id);
    if (!incident) return res.status(404).json({ success: false, message: "Incident not found." });
    incident.status = req.body.status;
    await incident.save();

    if (["Completed", "Cancelled"].includes(incident.status) && incident.assignedTeam) {
      await RescueTeam.findByIdAndUpdate(incident.assignedTeam, { status: "Available", availability: "Available", assignedEmergency: null });
    }
    await logAction(req.admin, "SOS status changed", "SOS", incident._id, { status: incident.status });
    return res.json({ success: true, incident });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Unable to update incident status." });
  }
});

router.put("/incidents/:id/assign", async (req, res) => {
  try {
    if (!objectId(req.params.id) || !objectId(req.body.teamId)) return res.status(400).json({ success: false, message: "Invalid incident or team." });
    const [incident, team] = await Promise.all([SOS.findById(req.params.id), RescueTeam.findById(req.body.teamId)]);
    if (!incident) return res.status(404).json({ success: false, message: "Incident not found." });
    if (!team) return res.status(404).json({ success: false, message: "Rescue team not found." });
    if (team.availability !== "Available" || team.status !== "Available") return res.status(409).json({ success: false, message: "This rescue team is unavailable." });

    incident.assignedTeam = team._id;
    incident.status = "Assigned";
    team.status = "Assigned";
    team.availability = "Busy";
    team.assignedEmergency = incident._id;
    await Promise.all([incident.save(), team.save()]);
    await logAction(req.admin, "Team assigned", "SOS", incident._id, { teamId: String(team._id) });
    return res.json({ success: true, incident, team });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Unable to assign rescue team." });
  }
});

router.patch("/teams/:id/availability", async (req, res) => {
  if (!objectId(req.params.id) || !["Available", "Busy", "Offline"].includes(req.body.availability)) return res.status(400).json({ success: false, message: "Invalid team availability." });
  const team = await RescueTeam.findByIdAndUpdate(req.params.id, { availability: req.body.availability }, { new: true });
  if (!team) return res.status(404).json({ success: false, message: "Rescue team not found." });
  await logAction(req.admin, "Team availability changed", "RescueTeam", team._id, { availability: team.availability });
  res.json({ success: true, team });
});

router.patch("/teams/:id/status", async (req, res) => {
  if (!objectId(req.params.id) || !VALID_TEAM_STATUSES.includes(req.body.status)) return res.status(400).json({ success: false, message: "Invalid team status." });
  const team = await RescueTeam.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
  if (!team) return res.status(404).json({ success: false, message: "Rescue team not found." });
  await logAction(req.admin, "Team status changed", "RescueTeam", team._id, { status: team.status });
  res.json({ success: true, team });
});

router.post("/teams", async (req, res) => {
  try {
    const team = await RescueTeam.create(req.body);
    await logAction(req.admin, "Team created", "RescueTeam", team._id);
    res.status(201).json({ success: true, team });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.put("/teams/:id", async (req, res) => {
  if (!objectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid team ID." });
  const team = await RescueTeam.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!team) return res.status(404).json({ success: false, message: "Rescue team not found." });
  await logAction(req.admin, "Team updated", "RescueTeam", team._id);
  res.json({ success: true, team });
});

router.delete("/teams/:id", async (req, res) => {
  if (!objectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid team ID." });
  const team = await RescueTeam.findByIdAndDelete(req.params.id);
  if (!team) return res.status(404).json({ success: false, message: "Rescue team not found." });
  await logAction(req.admin, "Team deactivated", "RescueTeam", team._id);
  res.json({ success: true });
});

router.put("/hospitals/:id", async (req, res) => {
  if (!objectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid hospital ID." });
  const allowed = ["availableBeds", "icuAvailable", "ambulancesAvailable", "status"];
  const update = Object.fromEntries(allowed.filter((key) => req.body[key] !== undefined).map((key) => [key, req.body[key]]));
  const hospital = await Hospital.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  if (!hospital) return res.status(404).json({ success: false, message: "Hospital not found." });
  await logAction(req.admin, "Hospital updated", "Hospital", hospital._id, update);
  res.json({ success: true, hospital });
});

router.post("/resources", async (req, res) => {
  try {
    const quantity = Math.max(0, Number(req.body.quantity) || 0);
    const resource = await Resource.create({ ...req.body, quantity, availableQuantity: quantity, status: quantity ? "Available" : "Out of Stock" });
    await logAction(req.admin, "Resource created", "Resource", resource._id);
    res.status(201).json({ success: true, resource });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.put("/resources/:id", async (req, res) => {
  if (!objectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid resource ID." });
  const resource = await Resource.findById(req.params.id);
  if (!resource) return res.status(404).json({ success: false, message: "Resource not found." });
  for (const key of ["name", "category", "location"]) if (req.body[key] !== undefined) resource[key] = req.body[key];
  if (req.body.quantity !== undefined) resource.quantity = Math.max(0, Number(req.body.quantity) || 0);
  if (req.body.availableQuantity !== undefined) resource.availableQuantity = Math.max(0, Math.min(resource.quantity, Number(req.body.availableQuantity) || 0));
  resource.status = resource.availableQuantity <= 0 ? "Out of Stock" : resource.availableQuantity <= resource.quantity * 0.2 ? "Low Stock" : "Available";
  await resource.save();
  await logAction(req.admin, "Resource updated", "Resource", resource._id);
  res.json({ success: true, resource });
});

router.patch("/resources/:id/status", async (req, res) => {
  if (!objectId(req.params.id) || !["Available", "Low Stock", "Out of Stock"].includes(req.body.status)) return res.status(400).json({ success: false, message: "Invalid resource status." });
  const resource = await Resource.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
  if (!resource) return res.status(404).json({ success: false, message: "Resource not found." });
  await logAction(req.admin, "Resource status changed", "Resource", resource._id, { status: resource.status });
  res.json({ success: true, resource });
});

router.delete("/resources/:id", async (req, res) => {
  if (!objectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid resource ID." });
  const resource = await Resource.findByIdAndDelete(req.params.id);
  if (!resource) return res.status(404).json({ success: false, message: "Resource not found." });
  await logAction(req.admin, "Resource removed", "Resource", resource._id);
  res.json({ success: true });
});

router.patch("/users/:id", async (req, res) => {
  if (!objectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid user ID." });
  const update = {};
  if (req.body.status && ["Active", "Inactive"].includes(req.body.status)) update.status = req.body.status;
  const admin = await AdminUser.findByIdAndUpdate(req.params.id, update, { new: true }).select("email name role status createdAt lastLoginAt");
  if (!admin) return res.status(404).json({ success: false, message: "User not found." });
  await logAction(req.admin, "Administrator account updated", "AdminUser", admin._id, update);
  res.json({ success: true, admin });
});

module.exports = router;
