const mongoose = require("mongoose");

const memberSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    relation: { type: String, default: "" },
    phone: { type: String, default: "" },
    status: {
      type: String,
      enum: ["Safe", "Unknown", "Needs Help"],
      default: "Unknown",
    },
    lastKnownLocation: {
      address: { type: String, default: "" },
      coordinates: { type: [Number], default: undefined }, // [lng, lat]
    },
  },
  { _id: true }
);

const familyGroupSchema = new mongoose.Schema(
  {
    groupName: { type: String, required: true, trim: true },
    createdBy: { type: String, default: "" },

    members: [memberSchema],

    emergencyContacts: [
      {
        name: String,
        phone: String,
      },
    ],

    activeSos: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SOS",
      default: null,
    },

    status: {
      type: String,
      enum: ["Normal", "Group SOS Active", "Resolved"],
      default: "Normal",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("FamilyGroup", familyGroupSchema);
