const mongoose = require("mongoose");

const adminUserSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    name: { type: String, default: "ResQLink Administrator", trim: true },
    role: { type: String, enum: ["Admin"], default: "Admin" },
    status: { type: String, enum: ["Active", "Inactive"], default: "Active" },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.models.AdminUser || mongoose.model("AdminUser", adminUserSchema);
