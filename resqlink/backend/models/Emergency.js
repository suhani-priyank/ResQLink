const mongoose = require("mongoose");

const emergencySchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      trim: true,
    },

    severity: {
      type: String,
      required: true,
      enum: ["Low", "Medium", "High", "Critical"],
    },

    description: {
      type: String,
      required: true,
      trim: true,
    },

    priorityScore: {
      type: Number,
      default: 0,
    },

    reportCount: {
      type: Number,
      default: 1,
      min: 1,
    },

    lastReportedAt: {
      type: Date,
      default: Date.now,
    },

    location: {
      address: {
        type: String,
        required: true,
        trim: true,
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
        trim: true,
        default: "India",
      },

      coordinates: {
        type: {
          type: String,
          enum: ["Point"],
          default: "Point",
        },

        coordinates: {
          type: [Number],
          required: true,
          validate: {
            validator: function (value) {
              return value.length === 2;
            },
            message: "Coordinates must be [longitude, latitude]",
          },
        },
      },
    },

    status: {
      type: String,
      enum: ["Active", "Resolved"],
      default: "Active",
    },
  },
  {
    timestamps: true,
  }
);

emergencySchema.index({
  "location.coordinates": "2dsphere",
});

module.exports =
  mongoose.models.Emergency ||
  mongoose.model("Emergency", emergencySchema);