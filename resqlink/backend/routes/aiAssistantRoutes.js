const express = require("express");
const router = express.Router();

const {
  askEmergencyAssistant,
} = require("../services/aiEmergencyAssistant");

// =====================================================
// AI EMERGENCY ASSISTANT
// POST /api/ai-assistant/chat
// =====================================================

router.post("/chat", async (req, res) => {
  try {
    const {
      message,
      emergency,
      language = "English",
    } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: "Message is required.",
      });
    }

    const result = await askEmergencyAssistant({
      message,
      emergency,
      language,
    });

    return res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("AI Assistant Route Error:", error);

    return res.status(500).json({
      success: false,
      message: "AI assistant temporarily unavailable.",
    });
  }
});

module.exports = router;