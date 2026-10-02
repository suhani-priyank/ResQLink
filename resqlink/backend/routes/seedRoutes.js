const express = require("express");
const router = express.Router();

const RescueTeam = require("../models/RescueTeam");

// ========================================
// CREATE INDIA-WIDE TEST RESCUE TEAMS
// ========================================

router.post("/rescue-teams", async (req, res) => {
  try {
    // ----------------------------------------
    // Delete existing test teams
    // ----------------------------------------

    await RescueTeam.deleteMany({});

    // ----------------------------------------
    // India-wide rescue teams
    // Coordinates = [longitude, latitude]
    // ----------------------------------------

    const teams = [

      {
        teamName: "Delhi Rescue Unit",
        teamCode: "DRU001",
        members: 10,

        skills: [
          "Flood Rescue",
          "First Aid",
          "Fire Rescue",
          "Urban Rescue",
        ],

        equipment: [
          "First Aid Kit",
          "Rescue Vehicle",
          "Life Jacket",
          "Fire Equipment",
        ],

        location: {
          address: "New Delhi, Delhi",
          city: "New Delhi",
          state: "Delhi",
          country: "India",

          coordinates: {
            type: "Point",

            coordinates: [
              77.2090,
              28.6139,
            ],
          },
        },

        availability: "Available",
        status: "Available",

        phone: "9000000001",
      },


      {
        teamName: "Patna Rescue Unit",
        teamCode: "PRU001",
        members: 8,

        skills: [
          "Flood Rescue",
          "Swimming",
          "First Aid",
        ],

        equipment: [
          "Boat",
          "Life Jacket",
          "First Aid Kit",
        ],

        location: {
          address: "Patna, Bihar",
          city: "Patna",
          state: "Bihar",
          country: "India",

          coordinates: {
            type: "Point",

            coordinates: [
              85.1376,
              25.5941,
            ],
          },
        },

        availability: "Available",
        status: "Available",

        phone: "9000000002",
      },


      {
        teamName: "Mumbai Rescue Unit",
        teamCode: "MRU001",
        members: 12,

        skills: [
          "Flood Rescue",
          "Fire Rescue",
          "First Aid",
          "Urban Rescue",
        ],

        equipment: [
          "Rescue Vehicle",
          "Boat",
          "First Aid Kit",
          "Fire Equipment",
        ],

        location: {
          address: "Mumbai, Maharashtra",
          city: "Mumbai",
          state: "Maharashtra",
          country: "India",

          coordinates: {
            type: "Point",

            coordinates: [
              72.8777,
              19.0760,
            ],
          },
        },

        availability: "Available",
        status: "Available",

        phone: "9000000003",
      },


      {
        teamName: "Bhubaneswar Rescue Unit",
        teamCode: "BRU001",
        members: 8,

        skills: [
          "Flood Rescue",
          "First Aid",
          "Swimming",
        ],

        equipment: [
          "Boat",
          "First Aid Kit",
          "Life Jacket",
        ],

        location: {
          address: "Bhubaneswar, Odisha",
          city: "Bhubaneswar",
          state: "Odisha",
          country: "India",

          coordinates: {
            type: "Point",

            coordinates: [
              85.8245,
              20.2961,
            ],
          },
        },

        availability: "Available",
        status: "Available",

        phone: "9000000004",
      },


      {
        teamName: "Kolkata Rescue Unit",
        teamCode: "KRU001",
        members: 9,

        skills: [
          "Flood Rescue",
          "First Aid",
          "Swimming",
        ],

        equipment: [
          "Boat",
          "Life Jacket",
          "First Aid Kit",
        ],

        location: {
          address: "Kolkata, West Bengal",
          city: "Kolkata",
          state: "West Bengal",
          country: "India",

          coordinates: {
            type: "Point",

            coordinates: [
              88.3639,
              22.5726,
            ],
          },
        },

        availability: "Available",
        status: "Available",

        phone: "9000000005",
      },


      {
        teamName: "Guwahati Rescue Unit",
        teamCode: "GRU001",
        members: 7,

        skills: [
          "Flood Rescue",
          "Swimming",
          "First Aid",
        ],

        equipment: [
          "Boat",
          "Life Jacket",
          "First Aid Kit",
        ],

        location: {
          address: "Guwahati, Assam",
          city: "Guwahati",
          state: "Assam",
          country: "India",

          coordinates: {
            type: "Point",

            coordinates: [
              91.7362,
              26.1445,
            ],
          },
        },

        availability: "Available",
        status: "Available",

        phone: "9000000006",
      },


      {
        teamName: "Chennai Rescue Unit",
        teamCode: "CRU001",
        members: 10,

        skills: [
          "Flood Rescue",
          "Cyclone Rescue",
          "First Aid",
          "Swimming",
        ],

        equipment: [
          "Boat",
          "Life Jacket",
          "Rescue Vehicle",
          "First Aid Kit",
        ],

        location: {
          address: "Chennai, Tamil Nadu",
          city: "Chennai",
          state: "Tamil Nadu",
          country: "India",

          coordinates: {
            type: "Point",

            coordinates: [
              80.2707,
              13.0827,
            ],
          },
        },

        availability: "Available",
        status: "Available",

        phone: "9000000007",
      },


      {
        teamName: "Hyderabad Rescue Unit",
        teamCode: "HRU001",
        members: 9,

        skills: [
          "Flood Rescue",
          "Fire Rescue",
          "First Aid",
        ],

        equipment: [
          "Rescue Vehicle",
          "First Aid Kit",
          "Fire Equipment",
        ],

        location: {
          address: "Hyderabad, Telangana",
          city: "Hyderabad",
          state: "Telangana",
          country: "India",

          coordinates: {
            type: "Point",

            coordinates: [
              78.4867,
              17.3850,
            ],
          },
        },

        availability: "Available",
        status: "Available",

        phone: "9000000008",
      },

    ];

    // ----------------------------------------
    // Insert teams
    // ----------------------------------------

    const createdTeams =
      await RescueTeam.insertMany(teams);

    res.status(201).json({
      success: true,

      message:
        "India-wide rescue teams created successfully.",

      count: createdTeams.length,

      teams: createdTeams,
    });

  } catch (error) {

    console.error(
      "Seed Rescue Teams Error:",
      error
    );

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});


// ========================================
// GET - ALL INDIA RESCUE TEAMS
// ========================================

router.get("/rescue-teams", async (req, res) => {
  try {

    const teams =
      await RescueTeam.find()
        .sort({
          state: 1,
          city: 1,
        });

    res.status(200).json({
      success: true,

      count: teams.length,

      teams,
    });

  } catch (error) {

    console.error(
      "Get India Rescue Teams Error:",
      error
    );

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});


module.exports = router;