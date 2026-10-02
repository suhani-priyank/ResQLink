const mongoose = require("mongoose");

const resourceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    category: {
      type: String,
      required: true,
      enum: [
        "Medical",
        "Rescue",
        "Transport",
        "Food",
        "Water",
        "Equipment",
        "Shelter",
        "Other",
      ],
    },

    quantity: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    availableQuantity: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    location: {
      address: {
        type: String,
        default: "",
        trim: true,
      },

      city: {
        type: String,
        default: "",
        trim: true,
      },

      state: {
        type: String,
        default: "",
        trim: true,
      },

      coordinates: {
        type: {
          type: String,
          enum: ["Point"],
          default: "Point",
        },

        coordinates: {
          type: [Number],
          default: [0, 0],
        },
      },
    },

    status: {
      type: String,
      enum: [
        "Available",
        "Low Stock",
        "Out of Stock",
      ],
      default: "Available",
    },
  },
  {
    timestamps: true,
  }
);

resourceSchema.index({
  "location.coordinates": "2dsphere",
});

const Resource = mongoose.model(
  "Resource",
  resourceSchema
);

module.exports = Resource;