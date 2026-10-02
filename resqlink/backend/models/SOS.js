const mongoose = require("mongoose");

const sosSchema = new mongoose.Schema(
  {
    disasterType: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      trim: true,
      default: "",
    },

    severity: {
      type: String,
      required: true,
      enum: ["Low", "Medium", "High", "Critical"],
    },

    peopleCount: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },

    medicalRequired: {
      type: Boolean,
      default: false,
    },

    vulnerablePeople: {
      children: {
        type: Number,
        default: 0,
        min: 0,
      },

      elderly: {
        type: Number,
        default: 0,
        min: 0,
      },

      disabled: {
        type: Number,
        default: 0,
        min: 0,
      },
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

    priorityScore: {
      type: Number,
      default: 0,
    },

    status: {
      type: String,
      enum: [
        "Pending",
        "Assigned",
        "Dispatched",
        "On the Way",
        "Reached",
        "Rescuing",
        "Completed",
        "Cancelled",
      ],
      default: "Pending",
    },

    assignedTeam: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RescueTeam",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

sosSchema.index({
  "location.coordinates": "2dsphere",
});

module.exports =
  mongoose.models.SOS ||
  mongoose.model("SOS", sosSchema);