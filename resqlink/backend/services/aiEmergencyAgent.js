const https = require("https");

// =====================================================
// GEMINI CONFIG
// =====================================================

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Use a stable Gemini model.
// You can change this from .env if needed.
const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-2.5-flash";

// =====================================================
// GEMINI REST REQUEST
// =====================================================

function callGemini(prompt) {
  return new Promise((resolve, reject) => {
    if (!GEMINI_API_KEY) {
      reject(new Error("GEMINI_API_KEY is missing in .env"));
      return;
    }

    const requestBody = JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: prompt,
            },
          ],
        },
      ],

      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
      },
    });

    const options = {
      hostname: "generativelanguage.googleapis.com",
      path: `/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(
        GEMINI_API_KEY
      )}`,
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(requestBody),
      },

      timeout: 30000,
    };

    const request = https.request(options, (response) => {
      let data = "";

      response.on("data", (chunk) => {
        data += chunk;
      });

      response.on("end", () => {
        let parsed;

        try {
          parsed = JSON.parse(data);
        } catch (error) {
          reject(
            new Error(
              `Gemini returned invalid response. HTTP ${response.statusCode}`
            )
          );
          return;
        }

        if (response.statusCode < 200 || response.statusCode >= 300) {
          const message =
            parsed?.error?.message ||
            `Gemini API HTTP ${response.statusCode}`;

          reject(new Error(message));
          return;
        }

        const text =
          parsed?.candidates?.[0]?.content?.parts
            ?.map((part) => part.text || "")
            .join("")
            .trim();

        if (!text) {
          reject(new Error("Gemini returned an empty response."));
          return;
        }

        resolve(text);
      });
    });

    request.on("timeout", () => {
      request.destroy();
      reject(new Error("Gemini request timed out."));
    });

    request.on("error", (error) => {
      reject(new Error(`Gemini network error: ${error.message}`));
    });

    request.write(requestBody);
    request.end();
  });
}

// =====================================================
// FALLBACK ANALYSIS
// =====================================================

function fallbackAnalysis({
  disasterType,
  description,
  severity,
  peopleCount,
  medicalRequired,
  vulnerablePeople,
}) {
  const children = Number(vulnerablePeople?.children) || 0;
  const elderly = Number(vulnerablePeople?.elderly) || 0;
  const disabled = Number(vulnerablePeople?.disabled) || 0;
  const people = Number(peopleCount) || 0;

  const text = String(description || "").toLowerCase();

  let finalDisasterType = disasterType || "Other";

  // Simple local classification
  if (
    text.includes("flood") ||
    text.includes("water") ||
    text.includes("flooding")
  ) {
    finalDisasterType = "Flood";
  } else if (
    text.includes("fire") ||
    text.includes("burning") ||
    text.includes("smoke")
  ) {
    finalDisasterType = "Fire";
  } else if (
    text.includes("accident") ||
    text.includes("crash") ||
    text.includes("collision")
  ) {
    finalDisasterType = "Accident";
  } else if (
    text.includes("earthquake") ||
    text.includes("tremor")
  ) {
    finalDisasterType = "Earthquake";
  } else if (
    text.includes("cyclone") ||
    text.includes("storm")
  ) {
    finalDisasterType = "Cyclone";
  } else if (
    text.includes("landslide") ||
    text.includes("mudslide")
  ) {
    finalDisasterType = "Landslide";
  } else if (
    medicalRequired ||
    text.includes("injured") ||
    text.includes("medical") ||
    text.includes("bleeding")
  ) {
    finalDisasterType = "Medical";
  }

  let finalSeverity = severity || "Medium";

  const criticalWords = [
    "trapped",
    "dying",
    "unconscious",
    "severe bleeding",
    "collapsed",
    "life threatening",
    "life-threatening",
  ];

  const hasCriticalWord = criticalWords.some((word) =>
    text.includes(word)
  );

  if (severity === "Critical" || hasCriticalWord) {
    finalSeverity = "Critical";
  } else if (
    severity === "High" ||
    people >= 5 ||
    medicalRequired ||
    children > 0 ||
    elderly > 0 ||
    disabled > 0
  ) {
    finalSeverity = "High";
  }

  let urgency = "Moderate";

  if (finalSeverity === "Critical") {
    urgency = "Immediate";
  } else if (finalSeverity === "High") {
    urgency = "High";
  } else if (finalSeverity === "Low") {
    urgency = "Low";
  }

  const requiredResources = [];

  if (
    finalDisasterType === "Flood"
  ) {
    requiredResources.push("Flood rescue team");
    requiredResources.push("Boat or water rescue equipment");
  }

  if (
    finalDisasterType === "Fire"
  ) {
    requiredResources.push("Fire and rescue team");
    requiredResources.push("Fire suppression equipment");
  }

  if (
    finalDisasterType === "Accident" ||
    finalDisasterType === "Medical"
  ) {
    requiredResources.push("Medical response team");
    requiredResources.push("Ambulance");
  }

  if (children > 0) {
    requiredResources.push("Child-safe medical support");
  }

  if (elderly > 0) {
    requiredResources.push("Elderly assistance");
  }

  if (disabled > 0) {
    requiredResources.push("Accessibility assistance");
  }

  if (requiredResources.length === 0) {
    requiredResources.push("General emergency response team");
  }

  return {
    disasterType: finalDisasterType,

    severity: finalSeverity,

    urgency,

    reasoning:
      "AI service was temporarily unavailable. " +
      "The system used the emergency priority fallback based on the submitted information.",

    requiredResources: [
      ...new Set(requiredResources),
    ],

    recommendedActions: [
      "Prioritize the emergency according to the current severity.",
      "Dispatch an appropriate available response team.",
      "Provide medical assistance if required.",
      "Keep vulnerable people as a high-priority consideration.",
    ],

    vulnerablePeople: {
      children,
      elderly,
      disabled,
    },

    medicalRequired: Boolean(medicalRequired),

    confidence: 60,

    aiFallback: true,
  };
}

// =====================================================
// AI EMERGENCY AGENT
// =====================================================

async function analyzeEmergency({
  disasterType,
  description,
  severity,
  peopleCount,
  medicalRequired,
  vulnerablePeople,
  location,
}) {
  const children = Number(vulnerablePeople?.children) || 0;
  const elderly = Number(vulnerablePeople?.elderly) || 0;
  const disabled = Number(vulnerablePeople?.disabled) || 0;

  const prompt = `
You are the AI Emergency Agent for ResQLink,
an emergency and disaster response coordination platform in India.

Analyze the emergency information below.

SAFETY RULES:

- Do not invent facts.
- Use only the information provided.
- Prioritize human safety.
- Never downgrade a Critical emergency because information is missing.
- Trapped people should receive very high urgency.
- Multiple affected people increase urgency.
- Children, elderly and disabled people increase urgency.
- Medical emergencies requiring immediate care increase urgency.
- Do not claim that an emergency service has actually been contacted.
- Do not invent hospital names or rescue team names.
- Return ONLY valid JSON.

EMERGENCY:

Disaster Type:
${disasterType || "Unknown"}

Description:
${description || "No description provided"}

Selected Severity:
${severity || "Unknown"}

People Affected:
${Number(peopleCount) || 0}

Medical Required:
${Boolean(medicalRequired)}

Children:
${children}

Elderly:
${elderly}

Disabled:
${disabled}

Location:
${location?.address || "Unknown"}

City:
${location?.city || "Unknown"}

State:
${location?.state || "Unknown"}

Return exactly this JSON structure:

{
  "disasterType": "Flood",
  "severity": "Critical",
  "urgency": "Immediate",
  "reasoning": "Short explanation",
  "requiredResources": [
    "resource 1",
    "resource 2"
  ],
  "recommendedActions": [
    "action 1",
    "action 2"
  ],
  "vulnerablePeople": {
    "children": 0,
    "elderly": 0,
    "disabled": 0
  },
  "medicalRequired": true,
  "confidence": 0
}

Allowed disasterType:
Flood, Fire, Accident, Medical, Earthquake, Cyclone, Landslide, Other

Allowed severity:
Low, Medium, High, Critical

Allowed urgency:
Low, Moderate, High, Immediate

Confidence must be a number from 0 to 100.
`;

  try {
    const rawText = await callGemini(prompt);

    const cleanedText = rawText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    let result;

    try {
      result = JSON.parse(cleanedText);
    } catch (error) {
      console.error(
        "Gemini JSON Parse Error:",
        cleanedText
      );

      throw new Error(
        "Gemini returned invalid JSON."
      );
    }

    // =================================================
    // SAFETY NORMALIZATION
    // =================================================

    result.vulnerablePeople = {
      children,
      elderly,
      disabled,
    };

    result.medicalRequired =
      Boolean(medicalRequired) ||
      Boolean(result.medicalRequired);

    result.confidence = Math.max(
      0,
      Math.min(
        100,
        Number(result.confidence) || 0
      )
    );

    // Never downgrade Critical.
    if (severity === "Critical") {
      result.severity = "Critical";
      result.urgency = "Immediate";
    }

    result.aiFallback = false;

    console.log(
      "✅ Gemini AI Emergency Analysis:",
      result
    );

    return result;
  } catch (error) {
    console.error(
      "⚠️ Gemini AI unavailable:",
      error.message
    );

    console.log(
      "🔄 Using local emergency safety fallback..."
    );

    return fallbackAnalysis({
      disasterType,
      description,
      severity,
      peopleCount,
      medicalRequired,
      vulnerablePeople,
    });
  }
}

// =====================================================
// EXPORT
// =====================================================

module.exports = {
  analyzeEmergency,
};