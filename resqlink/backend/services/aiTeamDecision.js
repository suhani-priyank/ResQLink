const { GoogleGenerativeAI } = require("@google/generative-ai");

const apiKey = process.env.GEMINI_API_KEY;

const ai = apiKey
  ? new GoogleGenerativeAI(apiKey)
  : null;


// ======================================================
// AI RESCUE TEAM DECISION
// ======================================================

async function chooseBestRescueTeam({ emergency, teams }) {

  if (!emergency) {
    throw new Error("Emergency data is required.");
  }

  if (!Array.isArray(teams) || teams.length === 0) {
    throw new Error("No rescue teams available.");
  }


  // ====================================================
  // PREPARE TEAM DATA
  // ====================================================

  const teamData = teams.map((team) => ({
    id: team._id?.toString(),

    teamName: team.teamName,

    teamCode: team.teamCode,

    members: team.members,

    skills: Array.isArray(team.skills)
      ? team.skills
      : [],

    equipment: Array.isArray(team.equipment)
      ? team.equipment
      : [],

    availability: team.availability,

    status: team.status,

    city: team.location?.city || "",

    state: team.location?.state || "",

    coordinates:
      team.location?.coordinates?.coordinates || [],
  }));


  // ====================================================
  // IF GEMINI IS NOT CONFIGURED
  // USE LOCAL SCORING
  // ====================================================

  if (!ai) {
    return findBestTeamLocally(emergency, teamData);
  }


  // ====================================================
  // GEMINI AI
  // ====================================================

  try {

    const model = ai.getGenerativeModel({
      model:
        process.env.GEMINI_MODEL || "gemini-2.0-flash",
    });


    const prompt = `
You are an emergency rescue dispatch AI.

Choose the BEST rescue team for the emergency.

Consider:

1. Emergency type
2. Severity
3. Required skills
4. Required equipment
5. Number of people
6. Medical requirement
7. Team availability
8. Team status
9. Location
10. Distance if coordinates are available

EMERGENCY:

${JSON.stringify(emergency, null, 2)}

AVAILABLE RESCUE TEAMS:

${JSON.stringify(teamData, null, 2)}


Return ONLY valid JSON.

Format:

{
  "teamId": "team mongodb id",
  "teamName": "team name",
  "teamCode": "team code",
  "reason": "short explanation",
  "confidence": 0
}
`;


    const result = await model.generateContent(prompt);

    const text =
      result.response.text()
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();


    const parsed = JSON.parse(text);


    // Make sure AI selected an actual team
    const selectedTeam = teamData.find(
      (team) =>
        team.id === String(parsed.teamId)
    );


    if (!selectedTeam) {
      return findBestTeamLocally(
        emergency,
        teamData
      );
    }


    return {
      ...parsed,
      team: selectedTeam,
      breakdown: buildExplanation(emergency, selectedTeam),
      aiFallback: false,
    };

  } catch (error) {

    console.error(
      "Gemini rescue decision failed:",
      error.message
    );

    // AI fail hone par application band nahi hogi
    return findBestTeamLocally(
      emergency,
      teamData
    );
  }
}


// ======================================================
// EXPLAINABLE AI — NAMED MATCH BREAKDOWN
// Turns the raw scoring signals into the percentage
// categories a human dispatcher actually wants to see:
// Location Match / Skill Match / Availability /
// Distance / Response Capacity.
// This is derived from the same fields already used for
// scoring — no new external data required.
// ======================================================

function haversineKm(a, b) {
  if (
    !Array.isArray(a) || a.length < 2 ||
    !Array.isArray(b) || b.length < 2
  ) {
    return null;
  }

  const [lon1, lat1] = a;
  const [lon2, lat2] = b;

  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);

  const h =
    sinLat * sinLat +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      sinLon * sinLon;

  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function buildExplanation(emergency, team) {
  const emergencyType = String(
    emergency.disasterType || emergency.type || ""
  ).toLowerCase();

  const description = String(
    emergency.description || ""
  ).toLowerCase();

  const requiredMedical = emergency.medicalRequired === true;

  const skills = Array.isArray(team.skills)
    ? team.skills.map((s) => String(s).toLowerCase())
    : [];

  const equipment = Array.isArray(team.equipment)
    ? team.equipment.map((e) => String(e).toLowerCase())
    : [];

  // ---------- SKILL MATCH ----------
  const relevantKeywords = [];
  if (emergencyType.includes("flood")) relevantKeywords.push("flood", "swimming", "boat", "life jacket");
  if (emergencyType.includes("fire")) relevantKeywords.push("fire");
  if (emergencyType.includes("medical") || description.includes("medical") || requiredMedical) {
    relevantKeywords.push("medical", "first aid");
  }

  let skillMatch = 55; // baseline for a generically capable team
  if (relevantKeywords.length) {
    const pool = [...skills, ...equipment];
    const hits = relevantKeywords.filter((kw) =>
      pool.some((item) => item.includes(kw))
    ).length;
    skillMatch = Math.round(
      40 + (hits / relevantKeywords.length) * 60
    );
  }
  skillMatch = Math.max(0, Math.min(100, skillMatch));

  // ---------- AVAILABILITY ----------
  const availability =
    team.availability === "Available" && team.status === "Available"
      ? 100
      : 40;

  // ---------- LOCATION MATCH ----------
  // Accepts either a flat team shape ({ city, state, coordinates })
  // or a raw RescueTeam document ({ location: { city, state, coordinates: { coordinates } } }).
  const teamCity = team.city || team.location?.city || "";
  const teamState = team.state || team.location?.state || "";

  const emergencyCity = String(
    emergency.location?.city || ""
  ).toLowerCase();
  const emergencyState = String(
    emergency.location?.state || ""
  ).toLowerCase();

  let locationMatch = 50;
  if (emergencyCity && teamCity && emergencyCity === String(teamCity).toLowerCase()) {
    locationMatch = 95;
  } else if (emergencyState && teamState && emergencyState === String(teamState).toLowerCase()) {
    locationMatch = 75;
  }

  // ---------- DISTANCE ----------
  const emergencyCoords = emergency.location?.coordinates?.coordinates;
  const teamCoords = team.coordinates || team.location?.coordinates?.coordinates;
  const distanceKm = haversineKm(emergencyCoords, teamCoords);

  let distanceScore;
  let distanceEstimated = false;
  if (distanceKm === null) {
    // No coordinates on one side — fall back to the
    // location-match proxy and say so explicitly.
    distanceScore = locationMatch;
    distanceEstimated = true;
  } else {
    // 0km -> 100, 50km -> ~40, 100km+ -> floor of 15
    distanceScore = Math.round(
      Math.max(15, 100 - distanceKm * 1.2)
    );
  }

  // ---------- RESPONSE CAPACITY ----------
  let capacity = 70;
  if (emergency.peopleCount && team.members) {
    const ratio = team.members / emergency.peopleCount;
    capacity = Math.round(Math.min(100, 40 + ratio * 60));
  } else if (team.members) {
    capacity = Math.min(100, 50 + team.members * 5);
  }

  const overall = Math.round(
    locationMatch * 0.2 +
    skillMatch * 0.3 +
    availability * 0.2 +
    distanceScore * 0.15 +
    capacity * 0.15
  );

  const factors = [
    { label: "Skill Match", value: skillMatch },
    { label: "Location Match", value: locationMatch },
    { label: "Response Capacity", value: capacity },
  ].sort((a, b) => b.value - a.value);

  const why =
    `${team.teamName || "This team"} scored highest mainly on ` +
    `${factors[0].label.toLowerCase()} (${factors[0].value}%) and ` +
    `${factors[1].label.toLowerCase()} (${factors[1].value}%)` +
    (availability === 100 ? ", and is currently available to dispatch." : ".");

  return {
    locationMatch,
    skillMatch,
    availability,
    distance: distanceScore,
    distanceEstimated,
    distanceKm: distanceKm === null ? null : Math.round(distanceKm),
    responseCapacity: capacity,
    overall,
    why,
  };
}

// ======================================================
// LOCAL FALLBACK SCORING
// ======================================================

function findBestTeamLocally(
  emergency,
  teams
) {

  const emergencyType =
    String(
      emergency.disasterType ||
      emergency.type ||
      ""
    ).toLowerCase();


  const description =
    String(
      emergency.description || ""
    ).toLowerCase();


  const severity =
    String(
      emergency.severity || ""
    ).toLowerCase();


  const requiredMedical =
    emergency.medicalRequired === true;


  const scoredTeams = teams
    .filter(
      (team) =>
        team.availability === "Available" &&
        team.status === "Available"
    )
    .map((team) => {

      let score = 0;


      const skills =
        team.skills.map((skill) =>
          String(skill).toLowerCase()
        );


      const equipment =
        team.equipment.map((item) =>
          String(item).toLowerCase()
        );


      // ----------------------------------------------
      // DISASTER TYPE
      // ----------------------------------------------

      if (
        emergencyType.includes("flood")
      ) {

        if (
          skills.some(
            (skill) =>
              skill.includes("flood") ||
              skill.includes("swimming")
          )
        ) {
          score += 30;
        }

        if (
          equipment.some(
            (item) =>
              item.includes("boat") ||
              item.includes("life jacket")
          )
        ) {
          score += 25;
        }
      }


      if (
        emergencyType.includes("fire")
      ) {

        if (
          skills.some(
            (skill) =>
              skill.includes("fire")
          )
        ) {
          score += 30;
        }

        if (
          equipment.some(
            (item) =>
              item.includes("fire")
          )
        ) {
          score += 25;
        }
      }


      if (
        emergencyType.includes("medical") ||
        description.includes("medical")
      ) {

        if (
          skills.some(
            (skill) =>
              skill.includes("first aid") ||
              skill.includes("medical")
          )
        ) {
          score += 35;
        }

        if (
          equipment.some(
            (item) =>
              item.includes("first aid")
          )
        ) {
          score += 25;
        }
      }


      // ----------------------------------------------
      // MEDICAL REQUIREMENT
      // ----------------------------------------------

      if (requiredMedical) {

        if (
          skills.some(
            (skill) =>
              skill.includes("first aid") ||
              skill.includes("medical")
          )
        ) {
          score += 30;
        }

        if (
          equipment.some(
            (item) =>
              item.includes("first aid")
          )
        ) {
          score += 20;
        }
      }


      // ----------------------------------------------
      // SEVERITY
      // ----------------------------------------------

      if (severity === "critical") {
        score += 20;
      }

      if (severity === "high") {
        score += 10;
      }


      // ----------------------------------------------
      // TEAM SIZE
      // ----------------------------------------------

      if (
        emergency.peopleCount &&
        team.members >= emergency.peopleCount
      ) {
        score += 15;
      }


      return {
        ...team,
        score,
      };
    });


  // No available team
  if (scoredTeams.length === 0) {

    throw new Error(
      "No available rescue team found."
    );
  }


  // Highest score first
  scoredTeams.sort(
    (a, b) => b.score - a.score
  );


  const bestTeam = scoredTeams[0];

  const breakdown = buildExplanation(emergency, bestTeam);

  return {

    teamId: bestTeam.id,

    teamName: bestTeam.teamName,

    teamCode: bestTeam.teamCode,

    reason: breakdown.why,

    confidence: Math.min(
      95,
      60 + bestTeam.score
    ),

    team: bestTeam,

    breakdown,

    aiFallback: true,
  };
}


module.exports = {
  chooseBestRescueTeam,
  buildExplanation,
  haversineKm,
};