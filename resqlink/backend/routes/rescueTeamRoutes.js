const express = require("express");
const mongoose = require("mongoose");

const RescueTeam = require("../models/RescueTeam");
const Emergency = require("../models/Emergency");
const SOS = require("../models/SOS");

const router = express.Router();

/*
=========================================================
HELPERS
=========================================================
*/

// Check valid MongoDB ObjectId
function isValidObjectId(id) {
    return mongoose.Types.ObjectId.isValid(id);
}

// Convert any ID safely to string
function getId(value) {
    if (value === null || value === undefined) {
        return null;
    }

    return String(value);
}

/*
---------------------------------------------------------
FIND DOCUMENT BY ID

Supports:
1. Normal Mongo ObjectId
2. String IDs already present in database

Example:
6a89d97b3ca8bc86a55bdc4
---------------------------------------------------------
*/

async function findByAnyId(Model, id) {
    if (!id) {
        return null;
    }

    // =========================================
    // 1. Try normal MongoDB ObjectId
    // =========================================

    if (mongoose.Types.ObjectId.isValid(id)) {
        const document = await Model.findById(id).lean();

        if (document) {
            return document;
        }
    }

    // =========================================
    // 2. IMPORTANT:
    // Also try raw MongoDB string _id
    // even if the string looks like an ObjectId
    // =========================================

    try {
        const document =
            await Model.collection.findOne({
                _id: String(id)
            });

        if (document) {
            return document;
        }
    } catch (error) {
        console.log(
            "String ID lookup failed:",
            error.message
        );
    }

    return null;
}

/*
---------------------------------------------------------
FIND SOS OR EMERGENCY
---------------------------------------------------------
*/

async function findIncident(id) {
    if (!id) {
        return null;
    }

    // First SOS
    const sos = await findByAnyId(SOS, id);

    if (sos) {
        return {
            type: "SOS",
            data: sos
        };
    }

    // Then Emergency
    const emergency = await findByAnyId(
        Emergency,
        id
    );

    if (emergency) {
        return {
            type: "Emergency",
            data: emergency
        };
    }

    return null;
}

/*
---------------------------------------------------------
GET LOCATION COORDINATES
---------------------------------------------------------
*/

function getCoordinates(location) {
    if (!location) {
        return null;
    }

    // GeoJSON:
    // location.coordinates.coordinates
    if (
        location.coordinates &&
        Array.isArray(
            location.coordinates.coordinates
        ) &&
        location.coordinates.coordinates.length === 2
    ) {
        const lng = Number(
            location.coordinates.coordinates[0]
        );

        const lat = Number(
            location.coordinates.coordinates[1]
        );

        if (
            Number.isFinite(lng) &&
            Number.isFinite(lat)
        ) {
            return [lng, lat];
        }
    }

    // Simple:
    // location.coordinates = [lng, lat]
    if (
        Array.isArray(location.coordinates) &&
        location.coordinates.length === 2
    ) {
        const lng = Number(
            location.coordinates[0]
        );

        const lat = Number(
            location.coordinates[1]
        );

        if (
            Number.isFinite(lng) &&
            Number.isFinite(lat)
        ) {
            return [lng, lat];
        }
    }

    return null;
}

/*
---------------------------------------------------------
DISTANCE CALCULATOR
---------------------------------------------------------
*/

function calculateDistance(
    lat1,
    lon1,
    lat2,
    lon2
) {
    if (
        !Number.isFinite(lat1) ||
        !Number.isFinite(lon1) ||
        !Number.isFinite(lat2) ||
        !Number.isFinite(lon2)
    ) {
        return null;
    }

    const R = 6371;

    const dLat =
        ((lat2 - lat1) * Math.PI) / 180;

    const dLon =
        ((lon2 - lon1) * Math.PI) / 180;

    const a =
        Math.sin(dLat / 2) *
            Math.sin(dLat / 2) +
        Math.cos(
            (lat1 * Math.PI) / 180
        ) *
            Math.cos(
                (lat2 * Math.PI) / 180
            ) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);

    const c =
        2 *
        Math.atan2(
            Math.sqrt(a),
            Math.sqrt(1 - a)
        );

    return R * c;
}

/*
=========================================================
GET ALL RESCUE TEAMS
=========================================================

GET /api/rescue-teams
=========================================================
*/

router.get("/", async (req, res) => {
    try {
        const teams = await RescueTeam.find()
            .sort({
                createdAt: -1
            })
            .lean();

        return res.status(200).json({
            success: true,
            count: teams.length,
            teams
        });
    } catch (error) {
        console.error(
            "GET ALL TEAMS ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to fetch rescue teams",
            error: error.message
        });
    }
});

/*
=========================================================
GET AVAILABLE RESCUE TEAMS
=========================================================

GET /api/rescue-teams/available
=========================================================
*/

router.get(
    "/available",
    async (req, res) => {
        try {
            const teams =
                await RescueTeam.find({
                    availability: "Available",
                    status: "Available"
                })
                    .sort({
                        members: -1
                    })
                    .lean();

            return res.status(200).json({
                success: true,
                count: teams.length,
                teams
            });
        } catch (error) {
            console.error(
                "GET AVAILABLE TEAMS ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to fetch available rescue teams",
                error: error.message
            });
        }
    }
);

/*
=========================================================
CREATE RESCUE TEAM
=========================================================

POST /api/rescue-teams
=========================================================
*/

router.post("/", async (req, res) => {
    try {
        const {
            teamName,
            teamCode,
            members,
            skills,
            equipment,
            location,
            availability,
            status,
            phone
        } = req.body;

        if (!teamName || !teamCode) {
            return res.status(400).json({
                success: false,
                message:
                    "teamName and teamCode are required"
            });
        }

        const normalizedTeamCode =
            String(teamCode)
                .trim()
                .toUpperCase();

        const existingTeam =
            await RescueTeam.findOne({
                teamCode:
                    normalizedTeamCode
            });

        if (existingTeam) {
            return res.status(409).json({
                success: false,
                message:
                    "Team code already exists"
            });
        }

        let finalLocation = {
            address: "",
            city: "",
            state: "",
            country: "India",
            coordinates: {
                type: "Point",
                coordinates: [0, 0]
            }
        };

        if (location) {
            const coords =
                getCoordinates(location);

            finalLocation = {
                address:
                    location.address || "",
                city:
                    location.city || "",
                state:
                    location.state || "",
                country:
                    location.country ||
                    "India",
                coordinates: {
                    type: "Point",
                    coordinates:
                        coords || [0, 0]
                }
            };
        }

        const team =
            new RescueTeam({
                teamName:
                    String(teamName).trim(),

                teamCode:
                    normalizedTeamCode,

                members:
                    Number(members) > 0
                        ? Number(members)
                        : 1,

                skills:
                    Array.isArray(skills)
                        ? skills
                        : [],

                equipment:
                    Array.isArray(equipment)
                        ? equipment
                        : [],

                location:
                    finalLocation,

                availability:
                    availability ||
                    "Available",

                status:
                    status ||
                    "Available",

                phone:
                    phone || "",

                assignedEmergency:
                    null
            });

        await team.save();

        return res.status(201).json({
            success: true,
            message:
                "Rescue team created successfully",
            team
        });
    } catch (error) {
        console.error(
            "CREATE TEAM ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to create rescue team",
            error: error.message
        });
    }
});

/*
=========================================================
AI RESCUE TEAM RECOMMENDATION
=========================================================

IMPORTANT:

THIS ROUTE MUST COME BEFORE /:id

GET:
/api/rescue-teams/ai-recommend/:id

Works with:
- SOS ID
- Emergency ID

No aiTeamDecision.js required.
=========================================================
*/

router.get(
    "/ai-recommend/:id",
    async (req, res) => {
        try {
            const { id } = req.params;

            console.log(
                "===================================="
            );

            console.log(
                "RESCUE TEAM AI RECOMMENDATION"
            );

            console.log(
                "Incident ID:",
                id
            );

            console.log(
                "===================================="
            );

            /*
            -----------------------------------------
            FIND SOS / EMERGENCY
            -----------------------------------------
            */

            const incident =
                await findIncident(id);

            if (!incident) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Emergency/SOS not found",
                    incidentId: id
                });
            }

            const data =
                incident.data;

            /*
            -----------------------------------------
            INCIDENT INFORMATION
            -----------------------------------------
            */

            const disasterType =
                String(
                    data.disasterType ||
                    data.type ||
                    "Emergency"
                ).toLowerCase();

            const severity =
                String(
                    data.severity ||
                    "Medium"
                ).toLowerCase();

            const peopleCount =
                Number(
                    data.peopleCount
                ) || 1;

            const medicalRequired =
                data.medicalRequired === true;

            const vulnerablePeople =
                data.vulnerablePeople ||
                {};

            const vulnerableCount =
                Number(
                    vulnerablePeople.children
                ) || 0;

            const vulnerableElderly =
                Number(
                    vulnerablePeople.elderly
                ) || 0;

            const vulnerableDisabled =
                Number(
                    vulnerablePeople.disabled
                ) || 0;

            const totalVulnerable =
                vulnerableCount +
                vulnerableElderly +
                vulnerableDisabled;

            /*
            -----------------------------------------
            INCIDENT LOCATION
            -----------------------------------------
            */

            const incidentCoords =
                getCoordinates(
                    data.location
                );

            let incidentLng = null;
            let incidentLat = null;

            if (incidentCoords) {
                incidentLng =
                    incidentCoords[0];

                incidentLat =
                    incidentCoords[1];
            }

            /*
            -----------------------------------------
            GET AVAILABLE TEAMS
            -----------------------------------------
            */

            const teams =
                await RescueTeam.find({
                    availability: "Available",
                    status: "Available"
                })
                    .lean();

            if (
                !teams ||
                teams.length === 0
            ) {
                return res.status(200).json({
                    success: true,

                    incidentType:
                        incident.type,

                    incidentId:
                        getId(data._id),

                    message:
                        "No rescue team is currently available",

                    recommendation: null,

                    alternatives: [],

                    count: 0
                });
            }

            /*
            =========================================
            SCORE TEAMS
            =========================================
            */

            const scoredTeams =
                teams.map((team) => {
                    let score = 0;

                    /*
                    ---------------------------------
                    TEAM SKILLS
                    ---------------------------------
                    */

                    const skills =
                        Array.isArray(
                            team.skills
                        )
                            ? team.skills.map(
                                (skill) =>
                                    String(
                                        skill
                                    ).toLowerCase()
                            )
                            : [];

                    /*
                    ---------------------------------
                    TEAM EQUIPMENT
                    ---------------------------------
                    */

                    const equipment =
                        Array.isArray(
                            team.equipment
                        )
                            ? team.equipment.map(
                                (item) =>
                                    String(
                                        item
                                    ).toLowerCase()
                            )
                            : [];

                    /*
                    ---------------------------------
                    TEAM LOCATION
                    ---------------------------------
                    */

                    const teamCoords =
                        getCoordinates(
                            team.location
                        );

                    let distanceKm =
                        null;

                    if (
                        incidentLat !== null &&
                        incidentLng !== null &&
                        teamCoords
                    ) {
                        distanceKm =
                            calculateDistance(
                                incidentLat,
                                incidentLng,
                                teamCoords[1],
                                teamCoords[0]
                            );
                    }

                    /*
                    ---------------------------------
                    DISTANCE SCORE
                    ---------------------------------
                    */

                    if (
                        distanceKm !== null
                    ) {
                        if (
                            distanceKm <= 10
                        ) {
                            score += 40;
                        } else if (
                            distanceKm <= 25
                        ) {
                            score += 30;
                        } else if (
                            distanceKm <= 50
                        ) {
                            score += 20;
                        } else if (
                            distanceKm <= 100
                        ) {
                            score += 10;
                        }
                    }

                    /*
                    ---------------------------------
                    FLOOD
                    ---------------------------------
                    */

                    if (
                        disasterType.includes(
                            "flood"
                        )
                    ) {
                        if (
                            skills.some(
                                (x) =>
                                    x.includes(
                                        "flood"
                                    )
                            )
                        ) {
                            score += 40;
                        }

                        if (
                            skills.some(
                                (x) =>
                                    x.includes(
                                        "swimming"
                                    )
                            )
                        ) {
                            score += 25;
                        }

                        if (
                            equipment.some(
                                (x) =>
                                    x.includes(
                                        "boat"
                                    )
                            )
                        ) {
                            score += 30;
                        }

                        if (
                            equipment.some(
                                (x) =>
                                    x.includes(
                                        "life jacket"
                                    )
                            )
                        ) {
                            score += 20;
                        }
                    }

                    /*
                    ---------------------------------
                    FIRE
                    ---------------------------------
                    */

                    if (
                        disasterType.includes(
                            "fire"
                        )
                    ) {
                        if (
                            skills.some(
                                (x) =>
                                    x.includes(
                                        "fire"
                                    )
                            )
                        ) {
                            score += 50;
                        }

                        if (
                            equipment.some(
                                (x) =>
                                    x.includes(
                                        "fire"
                                    )
                            )
                        ) {
                            score += 30;
                        }
                    }

                    /*
                    ---------------------------------
                    MEDICAL
                    ---------------------------------
                    */

                    if (
                        disasterType.includes(
                            "medical"
                        ) ||
                        medicalRequired
                    ) {
                        if (
                            skills.some(
                                (x) =>
                                    x.includes(
                                        "medical"
                                    )
                            )
                        ) {
                            score += 30;
                        }

                        if (
                            skills.some(
                                (x) =>
                                    x.includes(
                                        "first aid"
                                    )
                            )
                        ) {
                            score += 30;
                        }

                        if (
                            equipment.some(
                                (x) =>
                                    x.includes(
                                        "first aid"
                                    )
                            )
                        ) {
                            score += 20;
                        }
                    }

                    /*
                    ---------------------------------
                    CYCLONE
                    ---------------------------------
                    */

                    if (
                        disasterType.includes(
                            "cyclone"
                        )
                    ) {
                        if (
                            skills.some(
                                (x) =>
                                    x.includes(
                                        "cyclone"
                                    )
                            )
                        ) {
                            score += 40;
                        }

                        if (
                            skills.some(
                                (x) =>
                                    x.includes(
                                        "rescue"
                                    )
                            )
                        ) {
                            score += 20;
                        }
                    }

                    /*
                    ---------------------------------
                    URBAN / GENERAL RESCUE
                    ---------------------------------
                    */

                    if (
                        disasterType.includes(
                            "emergency"
                        ) ||
                        disasterType.includes(
                            "rescue"
                        )
                    ) {
                        if (
                            skills.some(
                                (x) =>
                                    x.includes(
                                        "urban rescue"
                                    )
                            )
                        ) {
                            score += 30;
                        }

                        if (
                            skills.some(
                                (x) =>
                                    x.includes(
                                        "rescue"
                                    )
                            )
                        ) {
                            score += 20;
                        }
                    }

                    /*
                    ---------------------------------
                    VULNERABLE PEOPLE
                    ---------------------------------
                    */

                    if (
                        totalVulnerable > 0
                    ) {
                        if (
                            skills.some(
                                (x) =>
                                    x.includes(
                                        "first aid"
                                    ) ||
                                    x.includes(
                                        "medical"
                                    ) ||
                                    x.includes(
                                        "urban rescue"
                                    )
                            )
                        ) {
                            score += 15;
                        }
                    }

                    /*
                    ---------------------------------
                    TEAM CAPACITY
                    ---------------------------------
                    */

                    const members =
                        Number(
                            team.members
                        ) || 1;

                    if (
                        members >=
                        peopleCount
                    ) {
                        score += 20;
                    } else {
                        score -= 10;
                    }

                    /*
                    ---------------------------------
                    SEVERITY
                    ---------------------------------
                    */

                    if (
                        severity ===
                        "critical"
                    ) {
                        if (
                            members >= 8
                        ) {
                            score += 20;
                        }
                    } else if (
                        severity === "high"
                    ) {
                        if (
                            members >= 5
                        ) {
                            score += 15;
                        }
                    }

                    return {
                        team,
                        score,
                        distanceKm:
                            distanceKm === null
                                ? null
                                : Number(
                                    distanceKm.toFixed(
                                        2
                                    )
                                )
                    };
                });

            /*
            -----------------------------------------
            SORT
            -----------------------------------------
            */

            scoredTeams.sort(
                (a, b) =>
                    b.score - a.score
            );

            /*
            -----------------------------------------
            BEST TEAM
            -----------------------------------------
            */

            const best =
                scoredTeams[0];

            /*
            -----------------------------------------
            RESPONSE
            -----------------------------------------
            */

            return res.status(200).json({
                success: true,

                incidentType:
                    incident.type,

                incidentId:
                    getId(data._id),

                incident: {
                    disasterType:
                        data.disasterType ||
                        data.type ||
                        "Emergency",

                    description:
                        data.description ||
                        "",

                    severity:
                        data.severity ||
                        "Medium",

                    peopleCount:
                        data.peopleCount ||
                        1,

                    medicalRequired:
                        Boolean(
                            data.medicalRequired
                        ),

                    vulnerablePeople:
                        data.vulnerablePeople ||
                        {
                            children: 0,
                            elderly: 0,
                            disabled: 0
                        },

                    location:
                        data.location ||
                        null
                },

                recommendation: {
                    teamId:
                        getId(
                            best.team._id
                        ),

                    teamName:
                        best.team.teamName,

                    teamCode:
                        best.team.teamCode,

                    members:
                        best.team.members,

                    skills:
                        best.team.skills,

                    equipment:
                        best.team.equipment,

                    phone:
                        best.team.phone,

                    distanceKm:
                        best.distanceKm,

                    score:
                        best.score
                },

                alternatives:
                    scoredTeams
                        .slice(1, 5)
                        .map((item) => ({
                            teamId:
                                getId(
                                    item.team._id
                                ),

                            teamName:
                                item.team.teamName,

                            teamCode:
                                item.team.teamCode,

                            members:
                                item.team.members,

                            skills:
                                item.team.skills,

                            equipment:
                                item.team.equipment,

                            phone:
                                item.team.phone,

                            distanceKm:
                                item.distanceKm,

                            score:
                                item.score
                        })),

                count:
                    scoredTeams.length
            });

        } catch (error) {
            console.error(
                "AI RECOMMENDATION ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to generate rescue team recommendation",
                error: error.message
            });
        }
    }
);

/*
=========================================================
GET SINGLE RESCUE TEAM

IMPORTANT:
THIS COMES AFTER /available
AND /ai-recommend/:id
=========================================================

GET /api/rescue-teams/:id
=========================================================
*/

router.get(
    "/:id",
    async (req, res) => {
        try {
            const { id } =
                req.params;

            const team =
                await findByAnyId(
                    RescueTeam,
                    id
                );

            if (!team) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Rescue team not found"
                });
            }

            return res.status(200).json({
                success: true,
                team
            });
        } catch (error) {
            console.error(
                "GET SINGLE TEAM ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to fetch rescue team",
                error: error.message
            });
        }
    }
);

/*
=========================================================
ASSIGN TEAM

POST /api/rescue-teams/assign

BODY:
{
    "teamId": "...",
    "emergencyId": "..."
}

Supports SOS + Emergency
=========================================================
*/

router.post(
    "/assign",
    async (req, res) => {
        try {
            const {
                teamId,
                emergencyId
            } = req.body;

            if (
                !teamId ||
                !emergencyId
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "teamId and emergencyId are required"
                });
            }

            /*
            -----------------------------------------
            FIND TEAM
            -----------------------------------------
            */

            const team =
                await findByAnyId(
                    RescueTeam,
                    teamId
                );

            if (!team) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Rescue team not found"
                });
            }

            /*
            -----------------------------------------
            AVAILABILITY
            -----------------------------------------
            */

            if (
                team.availability !==
                    "Available" ||
                team.status !==
                    "Available"
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Rescue team is not available"
                });
            }

            /*
            -----------------------------------------
            FIND INCIDENT
            -----------------------------------------
            */

            const incident =
                await findIncident(
                    emergencyId
                );

            if (!incident) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Emergency/SOS not found",
                    incidentId:
                        emergencyId
                });
            }

            const data =
                incident.data;

            /*
            -----------------------------------------
            UPDATE INCIDENT
            -----------------------------------------
            */

            const incidentUpdate = {
                assignedTeam:
                    team._id,

                status:
                    "Assigned",

                updatedAt:
                    new Date()
            };

            if (
                incident.type === "SOS"
            ) {
                await SOS.collection.updateOne(
                    {
                        _id: data._id
                    },
                    {
                        $set:
                            incidentUpdate
                    }
                );
            } else {
                await Emergency.collection.updateOne(
                    {
                        _id: data._id
                    },
                    {
                        $set:
                            incidentUpdate
                    }
                );
            }

            /*
            -----------------------------------------
            UPDATE TEAM
            -----------------------------------------
            */

            const teamUpdate = {
                availability:
                    "Busy",

                status:
                    "Assigned",

                updatedAt:
                    new Date()
            };

            /*
            Only Emergency ID goes into
            assignedEmergency because that field
            is normally an Emergency reference.
            */

            if (
                incident.type ===
                "Emergency"
            ) {
                teamUpdate.assignedEmergency =
                    data._id;
            } else {
                teamUpdate.assignedEmergency =
                    null;
            }

            await RescueTeam.collection.updateOne(
                {
                    _id: team._id
                },
                {
                    $set:
                        teamUpdate
                }
            );

            return res.status(200).json({
                success: true,

                message:
                    "Rescue team assigned successfully",

                assignment: {
                    teamId:
                        getId(team._id),

                    teamName:
                        team.teamName,

                    teamCode:
                        team.teamCode,

                    incidentType:
                        incident.type,

                    incidentId:
                        getId(data._id),

                    status:
                        "Assigned"
                }
            });

        } catch (error) {
            console.error(
                "ASSIGN TEAM ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to assign rescue team",
                error:
                    error.message
            });
        }
    }
);

/*
=========================================================
COMPATIBILITY ASSIGN ROUTE

PUT /api/rescue-teams/:id/assign

BODY:
{
    "teamId": "..."
}

:id = SOS / Emergency ID
=========================================================
*/

router.put(
    "/:id/assign",
    async (req, res) => {
        try {
            const {
                teamId
            } = req.body;

            const incidentId =
                req.params.id;

            if (!teamId) {
                return res.status(400).json({
                    success: false,
                    message:
                        "teamId is required"
                });
            }

            const team =
                await findByAnyId(
                    RescueTeam,
                    teamId
                );

            if (!team) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Rescue team not found"
                });
            }

            const incident =
                await findIncident(
                    incidentId
                );

            if (!incident) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Emergency/SOS not found",
                    incidentId
                });
            }

            if (
                team.availability !==
                    "Available" ||
                team.status !==
                    "Available"
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Rescue team is not available"
                });
            }

            const data =
                incident.data;

            const incidentUpdate = {
                assignedTeam:
                    team._id,

                status:
                    "Assigned",

                updatedAt:
                    new Date()
            };

            if (
                incident.type === "SOS"
            ) {
                await SOS.collection.updateOne(
                    {
                        _id: data._id
                    },
                    {
                        $set:
                            incidentUpdate
                    }
                );
            } else {
                await Emergency.collection.updateOne(
                    {
                        _id: data._id
                    },
                    {
                        $set:
                            incidentUpdate
                    }
                );
            }

            const teamUpdate = {
                availability:
                    "Busy",

                status:
                    "Assigned",

                updatedAt:
                    new Date(),

                assignedEmergency:
                    null
            };

            if (
                incident.type ===
                "Emergency"
            ) {
                teamUpdate.assignedEmergency =
                    data._id;
            }

            await RescueTeam.collection.updateOne(
                {
                    _id: team._id
                },
                {
                    $set:
                        teamUpdate
                }
            );

            return res.status(200).json({
                success: true,

                message:
                    "Rescue team assigned successfully",

                assignment: {
                    teamId:
                        getId(team._id),

                    teamName:
                        team.teamName,

                    teamCode:
                        team.teamCode,

                    incidentType:
                        incident.type,

                    incidentId:
                        getId(data._id),

                    status:
                        "Assigned"
                }
            });

        } catch (error) {
            console.error(
                "PUT ASSIGN ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to assign rescue team",
                error:
                    error.message
            });
        }
    }
);

/*
=========================================================
UPDATE TEAM AVAILABILITY

PATCH /api/rescue-teams/:id/availability

BODY:
{
    "availability": "Available"
}

Allowed:
Available
Busy
Offline
=========================================================
*/

router.patch(
    "/:id/availability",
    async (req, res) => {
        try {
            const {
                availability
            } = req.body;

            const allowed = [
                "Available",
                "Busy",
                "Offline"
            ];

            if (
                !allowed.includes(
                    availability
                )
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Availability must be Available, Busy or Offline"
                });
            }

            const { id } =
                req.params;

            let team = null;

            if (
                isValidObjectId(id)
            ) {
                team =
                    await RescueTeam.findByIdAndUpdate(
                        id,
                        {
                            availability,
                            updatedAt:
                                new Date()
                        },
                        {
                            new: true,
                            runValidators: true
                        }
                    ).lean();
            } else {
                const result =
                    await RescueTeam.collection.updateOne(
                        {
                            _id: id
                        },
                        {
                            $set: {
                                availability,
                                updatedAt:
                                    new Date()
                            }
                        }
                    );

                if (
                    result.matchedCount > 0
                ) {
                    team =
                        await RescueTeam.collection.findOne(
                            {
                                _id: id
                            }
                        );
                }
            }

            if (!team) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Rescue team not found"
                });
            }

            return res.status(200).json({
                success: true,
                message:
                    "Team availability updated",
                team
            });

        } catch (error) {
            console.error(
                "UPDATE AVAILABILITY ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to update availability",
                error:
                    error.message
            });
        }
    }
);

/*
=========================================================
UPDATE RESCUE STATUS

PATCH /api/rescue-teams/:id/status
=========================================================
*/

router.patch(
    "/:id/status",
    async (req, res) => {
        try {
            const {
                status
            } = req.body;

            const validStatuses = [
                "Available",
                "Assigned",
                "Dispatched",
                "On the Way",
                "Reached",
                "Rescuing",
                "Completed"
            ];

            if (
                !validStatuses.includes(
                    status
                )
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid rescue status"
                });
            }

            const availability =
                status === "Available" ||
                status === "Completed"
                    ? "Available"
                    : "Busy";

            const { id } =
                req.params;

            let team = null;

            if (
                isValidObjectId(id)
            ) {
                team =
                    await RescueTeam.findByIdAndUpdate(
                        id,
                        {
                            status,
                            availability,
                            updatedAt:
                                new Date()
                        },
                        {
                            new: true,
                            runValidators: true
                        }
                    ).lean();
            } else {
                const result =
                    await RescueTeam.collection.updateOne(
                        {
                            _id: id
                        },
                        {
                            $set: {
                                status,
                                availability,
                                updatedAt:
                                    new Date()
                            }
                        }
                    );

                if (
                    result.matchedCount > 0
                ) {
                    team =
                        await RescueTeam.collection.findOne(
                            {
                                _id: id
                            }
                        );
                }
            }

            if (!team) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Rescue team not found"
                });
            }

            return res.status(200).json({
                success: true,
                message:
                    "Rescue status updated",
                team
            });

        } catch (error) {
            console.error(
                "UPDATE STATUS ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to update rescue status",
                error:
                    error.message
            });
        }
    }
);

/*
=========================================================
DISPATCH TEAM

PUT /api/rescue-teams/:id/dispatch

:id = TEAM ID
=========================================================
*/

router.put(
    "/:id/dispatch",
    async (req, res) => {
        try {
            const { id } =
                req.params;

            let team = null;

            if (
                isValidObjectId(id)
            ) {
                team =
                    await RescueTeam.findByIdAndUpdate(
                        id,
                        {
                            status:
                                "Dispatched",

                            availability:
                                "Busy",

                            updatedAt:
                                new Date()
                        },
                        {
                            new: true
                        }
                    ).lean();
            } else {
                const result =
                    await RescueTeam.collection.updateOne(
                        {
                            _id: id
                        },
                        {
                            $set: {
                                status:
                                    "Dispatched",

                                availability:
                                    "Busy",

                                updatedAt:
                                    new Date()
                            }
                        }
                    );

                if (
                    result.matchedCount > 0
                ) {
                    team =
                        await RescueTeam.collection.findOne(
                            {
                                _id: id
                            }
                        );
                }
            }

            if (!team) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Rescue team not found"
                });
            }

            return res.status(200).json({
                success: true,
                message:
                    "Team dispatched",
                team
            });

        } catch (error) {
            console.error(
                "DISPATCH TEAM ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to dispatch team",
                error:
                    error.message
            });
        }
    }
);

/*
=========================================================
UPDATE RESCUE TEAM

PUT /api/rescue-teams/:id
=========================================================
*/

router.put(
    "/:id",
    async (req, res) => {
        try {
            const { id } =
                req.params;

            const updateData = {
                ...req.body,
                updatedAt:
                    new Date()
            };

            let team = null;

            if (
                isValidObjectId(id)
            ) {
                team =
                    await RescueTeam.findByIdAndUpdate(
                        id,
                        updateData,
                        {
                            new: true,
                            runValidators: true
                        }
                    ).lean();
            } else {
                const result =
                    await RescueTeam.collection.updateOne(
                        {
                            _id: id
                        },
                        {
                            $set:
                                updateData
                        }
                    );

                if (
                    result.matchedCount > 0
                ) {
                    team =
                        await RescueTeam.collection.findOne(
                            {
                                _id: id
                            }
                        );
                }
            }

            if (!team) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Rescue team not found"
                });
            }

            return res.status(200).json({
                success: true,
                message:
                    "Rescue team updated successfully",
                team
            });

        } catch (error) {
            console.error(
                "UPDATE TEAM ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to update rescue team",
                error:
                    error.message
            });
        }
    }
);

/*
=========================================================
DELETE RESCUE TEAM

DELETE /api/rescue-teams/:id
=========================================================
*/

router.delete(
    "/:id",
    async (req, res) => {
        try {
            const { id } =
                req.params;

            let result = null;

            if (
                isValidObjectId(id)
            ) {
                result =
                    await RescueTeam.findByIdAndDelete(
                        id
                    );
            } else {
                result =
                    await RescueTeam.collection.findOneAndDelete(
                        {
                            _id: id
                        }
                    );
            }

            if (!result) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Rescue team not found"
                });
            }

            return res.status(200).json({
                success: true,
                message:
                    "Rescue team deleted successfully"
            });

        } catch (error) {
            console.error(
                "DELETE TEAM ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Failed to delete rescue team",
                error:
                    error.message
            });
        }
    }
);

/*
=========================================================
EXPORT
=========================================================
*/

module.exports = router;