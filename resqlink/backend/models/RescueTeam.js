const mongoose = require("mongoose");

const rescueTeamSchema = new mongoose.Schema(
  {
    
    // TEAM INFORMATION


    teamName: {
      type: String,
      required: true,
      trim: true,
    },

    teamCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },

    // ================================
    // TEAM MEMBERS
    // ================================

    members: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },

    // ================================
    // SKILLS
    // ================================

    skills: [
      {
        type: String,
        trim: true,
      },
    ],

    // Example:
    // ["Flood Rescue", "First Aid", "Swimming"]


    // ================================
    // EQUIPMENT
    // ================================

    equipment: [
      {
        type: String,
        trim: true,
      },
    ],

    // Example:
    // ["Boat", "First Aid Kit", "Life Jacket"]


    // ================================
    // CURRENT LOCATION
    // ================================

    location: {
      address: {
        type: String,
        trim: true,
        default: "",
      },

      city: {
        type: String,
        trim: true,
        default: "",
      },

      state: {
        type: String,
        trim: true,
        default: "",
      },

      country: {
        type: String,
        default: "India",
        trim: true,
      },

      // GeoJSON
      // [longitude, latitude]

      coordinates: {
        type: {
          type: String,
          enum: ["Point"],
          default: "Point",
        },

        coordinates: {
          type: [Number],
          required: true,
        },
      },
    },


    // ================================
    // AVAILABILITY
    // ================================

    availability: {
      type: String,

      enum: [
        "Available",
        "Busy",
        "Offline",
      ],

      default: "Available",
    },


    // ================================
    // CURRENT RESCUE STATUS
    // ================================

    status: {
      type: String,

      enum: [
        "Available",
        "Assigned",
        "Dispatched",
        "On the Way",
        "Reached",
        "Rescuing",
        "Completed",
      ],

      default: "Available",
    },


    // ================================
    // CURRENT ASSIGNMENT
    // ================================

    assignedEmergency: {
      type: mongoose.Schema.Types.ObjectId,

      ref: "Emergency",

      default: null,
    },


    // ================================
    // CONTACT
    // ================================

    phone: {
      type: String,
      trim: true,
      default: "",
    },
  },

  {
    timestamps: true,
  }
);


// ========================================
// GEOSPATIAL INDEX
// ========================================

rescueTeamSchema.index({
  "location.coordinates": "2dsphere",
});


// ========================================
// MODEL
// ========================================

const RescueTeam = mongoose.model(
  "RescueTeam",
  rescueTeamSchema
);

module.exports = RescueTeam;