const express = require("express");
const router = express.Router();
const Emergency = require("../models/Emergency");

// =========================================
// GET - Geocode Indian Location
// =========================================
// Example:
// /api/emergencies/geocode?q=Patna,Bihar

router.get("/geocode", async (req, res) => {
    try {
        const { q } = req.query;

        if (!q || !q.trim()) {
            return res.status(400).json({
                success: false,
                message: "Location is required."
            });
        }

        const searchLocation = `${q.trim()}, India`;

        const url =
            "https://nominatim.openstreetmap.org/search" +
            `?q=${encodeURIComponent(searchLocation)}` +
            "&format=jsonv2" +
            "&addressdetails=1" +
            "&limit=1" +
            "&countrycodes=in";

        const response = await fetch(url, {
            headers: {
                "User-Agent":
                    "ResQLink Emergency Response Network/1.0"
            }
        });

        if (!response.ok) {
            console.error(
                "Nominatim response:",
                response.status,
                response.statusText
            );

            return res.status(502).json({
                success: false,
                message:
                    "Location service is temporarily unavailable."
            });
        }

        const results = await response.json();

        if (!Array.isArray(results) || results.length === 0) {
            return res.status(404).json({
                success: false,
                message:
                    "Location not found in India. Please enter a valid Indian city, area or address."
            });
        }

        const result = results[0];

        const latitude = Number(result.lat);
        const longitude = Number(result.lon);

        // =========================================
        // INDIA LOCATION VALIDATION
        // =========================================

        if (
            !Number.isFinite(latitude) ||
            !Number.isFinite(longitude) ||
            longitude < 68 ||
            longitude > 98 ||
            latitude < 6 ||
            latitude > 38
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "The selected location is outside India."
            });
        }

        const address = result.address || {};

        const city =
            address.city ||
            address.town ||
            address.village ||
            address.municipality ||
            address.county ||
            "";

        res.status(200).json({
            success: true,

            location: {
                address:
                    result.display_name ||
                    searchLocation,

                city: city,

                state: address.state || "",

                country: "India",

                latitude: latitude,

                longitude: longitude
            }
        });

    } catch (error) {
        console.error(
            "Geocoding Error:",
            error
        );

        res.status(500).json({
            success: false,
            message:
                "Unable to find this location right now."
        });
    }
});


// =========================================
// POST - Create Emergency
// WITH DUPLICATE DETECTION
// =========================================

router.post("/", async (req, res) => {
    try {
        const {
            type,
            severity,
            description,
            location
        } = req.body;

        // =========================================
        // BASIC VALIDATION
        // =========================================

        if (!type || !severity || !description) {
            return res.status(400).json({
                success: false,
                message:
                    "Type, severity and description are required."
            });
        }

        // =========================================
        // LOCATION VALIDATION
        // =========================================

        if (
            !location ||
            !location.address ||
            !Array.isArray(location.coordinates) ||
            location.coordinates.length !== 2
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Valid location with longitude and latitude is required."
            });
        }

        const [longitude, latitude] =
            location.coordinates;

        // =========================================
        // NUMBER VALIDATION
        // =========================================

        const lng = Number(longitude);
        const lat = Number(latitude);

        if (
            !Number.isFinite(lng) ||
            !Number.isFinite(lat)
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Valid longitude and latitude are required."
            });
        }

        // =========================================
        // INDIA BOUNDARY CHECK
        // =========================================

        if (
            lng < 68 ||
            lng > 98 ||
            lat < 6 ||
            lat > 38
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "The provided location is outside India."
            });
        }

        // =========================================
        // PRIORITY SCORE
        // =========================================

        const priorityMap = {
            Low: 25,
            Medium: 50,
            High: 75,
            Critical: 100
        };

        const priorityScore =
            priorityMap[severity] || 0;

        // =========================================
        // DUPLICATE DETECTION
        // Same emergency type
        // Within 2 KM
        // Only active emergencies
        // =========================================

        const nearbyEmergency =
            await Emergency.findOne({
                type: {
                    $regex: `^${type.trim()}$`,
                    $options: "i"
                },

                status: "Active",

                "location.coordinates": {
                    $near: {
                        $geometry: {
                            type: "Point",
                            coordinates: [
                                lng,
                                lat
                            ]
                        },

                        $maxDistance: 2000
                    }
                }
            });

        // =========================================
        // DUPLICATE FOUND
        // =========================================

        if (nearbyEmergency) {

            nearbyEmergency.reportCount =
                (nearbyEmergency.reportCount || 1) + 1;

            nearbyEmergency.lastReportedAt =
                new Date();

            // Keep the highest severity
            if (
                priorityScore >
                (nearbyEmergency.priorityScore || 0)
            ) {
                nearbyEmergency.severity =
                    severity;

                nearbyEmergency.priorityScore =
                    priorityScore;
            }

            await nearbyEmergency.save();

            return res.status(200).json({
                success: true,

                duplicate: true,

                message:
                    "This emergency is already reported nearby. Your report has been added to the existing incident.",

                emergency: nearbyEmergency
            });
        }

        // =========================================
        // CREATE NEW EMERGENCY
        // =========================================

        const emergency =
            new Emergency({

                type,

                severity,

                description,

                priorityScore,

                reportCount: 1,

                lastReportedAt: new Date(),

                location: {

                    address:
                        location.address,

                    city:
                        location.city || "",

                    state:
                        location.state || "",

                    country:
                        "India",

                    coordinates: {

                        type: "Point",

                        coordinates: [
                            lng,
                            lat
                        ]
                    }
                }
            });

        await emergency.save();

        // =========================================
        // SUCCESS RESPONSE
        // =========================================

        res.status(201).json({

            success: true,

            duplicate: false,

            message:
                "Emergency reported successfully",

            emergency
        });

    } catch (error) {

        console.error(
            "Create Emergency Error:",
            error
        );

        res.status(500).json({

            success: false,

            message:
                error.message
        });
    }
});


// =========================================
// GET - ALL EMERGENCIES
// =========================================

router.get("/", async (req, res) => {
    try {
        const emergencies =
        await Emergency.find()
        .sort({
            priorityScore: -1,
            createdAt: -1
        });
        res.status(200).json({
            success: true,

            count: emergencies.length,

            emergencies
        });

    } catch (error) {
        console.error(
            "Get Emergencies Error:",
            error
        );

        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});


// =========================================
// GET - NEARBY EMERGENCIES
// =========================================
// Example:
// /api/emergencies/nearby
// ?longitude=85.8245
// &latitude=20.2961
// &distance=10000
//
// distance is in meters
// 10000 = 10 km

router.get("/nearby", async (req, res) => {
    try {
        const {
            longitude,
            latitude,
            distance = 10000
        } = req.query;

        const lng = Number(longitude);
        const lat = Number(latitude);
        const maxDistance = Number(distance);

        // =========================================
        // VALIDATION
        // =========================================

        if (
            !Number.isFinite(lng) ||
            !Number.isFinite(lat) ||
            !Number.isFinite(maxDistance)
        ) {
            return res.status(400).json({
                success: false,

                message:
                    "Valid longitude, latitude and distance are required."
            });
        }

        // =========================================
        // FIND NEARBY EMERGENCIES
        // =========================================

        const emergencies =
            await Emergency.find({
                "location.coordinates": {
                    $near: {
                        $geometry: {
                            type: "Point",

                            coordinates: [
                                lng,
                                lat
                            ]
                        },

                        $maxDistance:
                            maxDistance
                    }
                }
            });

        res.status(200).json({
            success: true,

            count: emergencies.length,

            emergencies
        });

    } catch (error) {
        console.error(
            "Nearby Emergencies Error:",
            error
        );

        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});


module.exports = router;