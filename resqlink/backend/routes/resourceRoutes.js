const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

const Resource = require("../models/Resource");

// ========================================
// LOW-STOCK THRESHOLD
// ========================================
// A resource is "low stock" once available
// quantity drops to 20% of its total quantity.

function deriveStatus(resource) {
  if (resource.availableQuantity <= 0) return "Out of Stock";
  if (resource.availableQuantity <= resource.quantity * 0.2) return "Low Stock";
  return "Available";
}

// ========================================
// GET ALL RESOURCES (full inventory)
// ========================================

router.get("/", async (req, res) => {
  try {
    const resources = await Resource.find().sort({ category: 1, name: 1 });

    const lowStock = resources.filter(
      (r) => r.status === "Low Stock" || r.status === "Out of Stock"
    );

    res.status(200).json({
      success: true,
      message: "Resource inventory loaded",
      count: resources.length,
      resources,
      lowStock,
    });
  } catch (error) {
    console.error("Resource Error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// ========================================
// CREATE RESOURCE
// ========================================

router.post("/", async (req, res) => {
  try {
    const { name, category, quantity, location } = req.body;

    if (!name || !category) {
      return res.status(400).json({
        success: false,
        message: "Resource name and category are required.",
      });
    }

    const qty = Number(quantity) || 0;

    const resource = new Resource({
      name,
      category,
      quantity: qty,
      availableQuantity: qty,
      location: location || {},
      status: qty <= 0 ? "Out of Stock" : "Available",
    });

    await resource.save();

    res.status(201).json({
      success: true,
      message: "Resource added to inventory",
      resource,
    });
  } catch (error) {
    console.error("Create resource error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// ========================================
// UPDATE RESOURCE (edit details / quantity)
// ========================================

router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid resource ID" });
    }

    const resource = await Resource.findById(id);

    if (!resource) {
      return res.status(404).json({ success: false, message: "Resource not found" });
    }

    const { name, category, quantity, availableQuantity, location } = req.body;

    if (name !== undefined) resource.name = name;
    if (category !== undefined) resource.category = category;
    if (location !== undefined) resource.location = { ...resource.location, ...location };

    if (quantity !== undefined) {
      resource.quantity = Math.max(0, Number(quantity) || 0);
      resource.availableQuantity = Math.min(resource.availableQuantity, resource.quantity);
    }

    if (availableQuantity !== undefined) {
      resource.availableQuantity = Math.max(
        0,
        Math.min(resource.quantity, Number(availableQuantity) || 0)
      );
    }

    resource.status = deriveStatus(resource);

    await resource.save();

    res.status(200).json({
      success: true,
      message: "Resource updated",
      resource,
    });
  } catch (error) {
    console.error("Update resource error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// ========================================
// MARK UNAVAILABLE / AVAILABLE
// ========================================

router.patch("/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid resource ID" });
    }

    if (!["Available", "Low Stock", "Out of Stock"].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status value" });
    }

    const resource = await Resource.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );

    if (!resource) {
      return res.status(404).json({ success: false, message: "Resource not found" });
    }

    res.status(200).json({
      success: true,
      message: `Resource marked as ${status}`,
      resource,
    });
  } catch (error) {
    console.error("Resource status error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// ========================================
// DELETE RESOURCE
// ========================================

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid resource ID" });
    }

    const resource = await Resource.findByIdAndDelete(id);

    if (!resource) {
      return res.status(404).json({ success: false, message: "Resource not found" });
    }

    res.status(200).json({
      success: true,
      message: "Resource removed from inventory",
    });
  } catch (error) {
    console.error("Delete resource error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

module.exports = router;
