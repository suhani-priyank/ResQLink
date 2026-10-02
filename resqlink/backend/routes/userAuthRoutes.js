const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const router = express.Router();

router.post("/register", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: "Name, email, and password are required." });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, message: "Password must be at least 8 characters." });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ success: false, message: "Unable to create account with these details." });
    }

    const user = await User.create({ name, email, passwordHash: await bcrypt.hash(password, 12) });
    return res.status(201).json({
      success: true,
      message: "Account created successfully.",
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (error) {
    console.error("User registration error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to create account right now." });
  }
});

router.post("/login", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const user = await User.findOne({ email }).select("+passwordHash");
    const valid = Boolean(user && user.status === "Active" && await bcrypt.compare(password, user.passwordHash));

    if (!valid) return res.status(401).json({ success: false, message: "Invalid email or password." });

    user.lastLoginAt = new Date();
    await user.save();
    const secret = process.env.USER_JWT_SECRET || process.env.ADMIN_JWT_SECRET;
    if (!secret) return res.status(503).json({ success: false, message: "User authentication is not configured." });

    const token = jwt.sign({ sub: String(user._id), role: user.role }, secret, { expiresIn: "8h" });
    return res.json({ success: true, token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (error) {
    console.error("User login error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to sign in right now." });
  }
});

module.exports = router;
