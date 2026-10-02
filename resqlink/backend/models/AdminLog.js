const mongoose = require("mongoose");

const adminLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true, trim: true },
    targetType: { type: String, default: "System", trim: true },
    targetId: { type: String, default: "" },
    adminEmail: { type: String, required: true, trim: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: undefined },
  },
  { timestamps: true }
);

module.exports = mongoose.models.AdminLog || mongoose.model("AdminLog", adminLogSchema);
