const express = require("express");
const cors = require("cors");
require("dotenv").config();

const connectDB = require("./config/db");

const emergencyRoutes = require("./routes/emergencyRoutes");
const resourceRoutes = require("./routes/resourceRoutes");
const rescueTeamRoutes = require("./routes/rescueTeamRoutes");
const sosRoutes = require("./routes/sosRoutes");
const seedRoutes = require("./routes/seedRoutes");
const aiAssistantRoutes = require("./routes/aiAssistantRoutes");
const resourceAllocationRoutes = require("./routes/resourceAllocationRoutes");
const hospitalRoutes = require("./routes/hospitalRoutes");
const agencyRoutes = require("./routes/agencyRoutes");
const groupRoutes = require("./routes/groupRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");
const reportRoutes = require("./routes/reportRoutes");
const adminRoutes = require("./routes/adminRoutes");
const userAuthRoutes = require("./routes/userAuthRoutes");

const app = express();

// ========================================
// DATABASE
// ========================================

connectDB();

// ========================================
// MIDDLEWARE
// ========================================

app.use(cors());
app.use(express.json());

// ========================================
// ROUTES
// ========================================

app.use("/api/emergencies", emergencyRoutes);
app.use("/api/resources", resourceRoutes);
app.use("/api/rescue-teams", rescueTeamRoutes);
app.use("/api/sos", sosRoutes);
app.use("/api/seed", seedRoutes);
app.use("/api/ai-assistant", aiAssistantRoutes);
app.use("/api/resource-allocation", resourceAllocationRoutes);
app.use("/api/hospitals", hospitalRoutes);
app.use("/api/agencies", agencyRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/auth", userAuthRoutes);

// ========================================
// TEST
// ========================================

app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "ResQLink Backend is running 🚨"
    });
});

// ========================================
// 404
// ========================================

app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: `Route ${req.method} ${req.originalUrl} not found`
    });
});

// ========================================
// SERVER
// ========================================

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`🚨 ResQLink server running on port ${PORT}`);
});