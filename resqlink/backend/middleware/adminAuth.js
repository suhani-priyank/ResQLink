const jwt = require("jsonwebtoken");
const AdminUser = require("../models/AdminUser");

function getSecret() {
  return process.env.ADMIN_JWT_SECRET;
}

function authenticateUser(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token || !getSecret()) {
    return res.status(401).json({ success: false, message: "Authentication required." });
  }

  try {
    req.auth = jwt.verify(token, getSecret());
    next();
  } catch {
    return res.status(401).json({ success: false, message: "Authentication required." });
  }
}

async function requireAdmin(req, res, next) {
  try {
    if (!req.auth?.sub || req.auth.role !== "Admin") {
      return res.status(403).json({ success: false, message: "Administrator access required." });
    }

    const admin = await AdminUser.findById(req.auth.sub);
    if (!admin || admin.status !== "Active") {
      return res.status(403).json({ success: false, message: "Administrator access required." });
    }

    req.admin = admin;
    next();
  } catch (error) {
    return res.status(500).json({ success: false, message: "Unable to verify administrator access." });
  }
}

module.exports = { authenticateUser, requireAdmin };
