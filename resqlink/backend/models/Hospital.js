const mongoose = require("mongoose");

const hospitalSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },

    city: { type: String, default: "" },
    state: { type: String, default: "" },
    address: { type: String, default: "" },

    coordinates: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number], // [lng, lat]
        default: [0, 0],
      },
    },

    emergencyCapacity: { type: Number, default: 0 },
    totalBeds: { type: Number, default: 0 },
    availableBeds: { type: Number, default: 0 },

    icuBeds: { type: Number, default: 0 },
    icuAvailable: { type: Number, default: 0 },

    ambulancesTotal: { type: Number, default: 0 },
    ambulancesAvailable: { type: Number, default: 0 },

    status: {
      type: String,
      enum: ["Operational", "Near Capacity", "Full", "Not Responding"],
      default: "Operational",
    },

    isDemoData: { type: Boolean, default: true },
  },
  { timestamps: true }
);

hospitalSchema.index({ coordinates: "2dsphere" });

module.exports = mongoose.model("Hospital", hospitalSchema);
