const { GoogleGenAI } = require("@google/genai");

const apiKey = process.env.GEMINI_API_KEY;
const modelName = process.env.GEMINI_MODEL || "gemini-3.6-flash";

const ai = new GoogleGenAI({
  apiKey,
});

// =====================================================
// AI EMERGENCY ASSISTANT
// =====================================================

async function askEmergencyAssistant({
  message,
  emergency = null,
  language = "English",
}) {
  if (!message || !message.trim()) {
    throw new Error("Message is required");
  }

  const context = emergency
    ? `
Emergency Information:
Disaster: ${emergency.disasterType || "Unknown"}
Severity: ${emergency.severity || "Unknown"}
Urgency: ${emergency.urgency || "Unknown"}
People affected: ${emergency.peopleCount || 0}
Medical required: ${Boolean(emergency.medicalRequired)}
Children: ${emergency.vulnerablePeople?.children || 0}
Elderly: ${emergency.vulnerablePeople?.elderly || 0}
Disabled: ${emergency.vulnerablePeople?.disabled || 0}
Location: ${emergency.location?.address || "Unknown"}
City: ${emergency.location?.city || "Unknown"}
State: ${emergency.location?.state || "Unknown"}
`
    : `
No active SOS context is available.
`;

  const prompt = `
You are ResQLink AI Emergency Assistant.

You help people during emergencies in India.

${context}

User language: ${language}

User message:
${message}

Give a clear, short and practical response.

Rules:
- Put human safety first.
- Give step-by-step guidance when useful.
- Never invent facts.
- Never claim that a rescue team has been dispatched unless the system confirms it.
- Never give dangerous instructions.
- If someone is in immediate danger, tell them to contact emergency services immediately.
- Consider children, elderly and disabled people when relevant.
- Answer in ${language}.
`;

  try {
    console.log("🤖 Sending request to Gemini...");
    console.log("Model:", modelName);

    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
    });

    const text = response.text?.trim();

    if (!text) {
      throw new Error("Gemini returned empty response");
    }

    console.log("✅ Emergency Assistant AI response received");

    return {
      reply: text,
      aiFallback: false,
    };
  } catch (error) {
    console.error("❌ Gemini Assistant Error:", error);

    return {
      reply:
        "AI guidance is temporarily unavailable. Please move to a safe location if possible and contact emergency services immediately if anyone is in danger.",
      aiFallback: true,
    };
  }
}

module.exports = {
  askEmergencyAssistant,
};