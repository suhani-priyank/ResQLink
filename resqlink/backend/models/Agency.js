const mongoose = require("mongoose");

const agencySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },

    type: {
      type: String,
      enum: ["Police", "Fire", "Medical", "Disaster Management", "Municipal Authority"],
      required: true,
    },

    jurisdiction: { type: String, default: "" },

    status: {
      type: String,
      enum: ["Online", "Degraded", "Offline"],
      default: "Online",
    },

    activeIncidents: { type: Number, default: 0 },
    availableTeams: { type: Number, default: 0 },
    availableResources: { type: Number, default: 0 },

    contact: { type: String, default: "" },

    isDemoData: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Agency", agencySchema);
