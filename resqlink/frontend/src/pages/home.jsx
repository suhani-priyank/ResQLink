import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";

import "./home.css";

const API = "http://localhost:5000/api";

function Home() {
  const navigate = useNavigate();
  const isUserSignedIn = Boolean(localStorage.getItem("resqlink_user_token"));
  const [showUserMenu, setShowUserMenu] = useState(false);

  // =========================
  // UI STATE
  // =========================
  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem("resqlink_dark_mode") === "1"
  );
  const [showEmergency, setShowEmergency] = useState(false);
  const [emergencyMode, setEmergencyMode] = useState("choice");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [resourceResult, setResourceResult] = useState(null);
  const [resourceLoading, setResourceLoading] = useState(false);
  const [resourceMessage, setResourceMessage] = useState("");

  // =========================
  // DATA
  // =========================
  const [alerts, setAlerts] = useState([]);
  const [teams, setTeams] = useState([]);
  const [resources, setResources] = useState([]);

  // =========================
  // AI
  // =========================
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [aiMessage, setAiMessage] = useState("");
  const [lastRecommendedId, setLastRecommendedId] = useState(null);
  const [assigningTeam, setAssigningTeam] = useState(false);
  const [assignmentMessage, setAssignmentMessage] = useState("");

  // =========================
  // LOCATION
  // =========================
  const [userLocation, setUserLocation] = useState(null);

  // =========================
  // EMERGENCY STATUS
  // =========================
  const [emergencyStatus, setEmergencyStatus] = useState(null);
  const [lastClassification, setLastClassification] = useState(null);
  const [pendingSOSCount, setPendingSOSCount] = useState(0);

  // =========================
  // REPORT FORM
  // =========================
  const [reportForm, setReportForm] = useState({
    type: "Flood",
    severity: "Medium",
    description: "",
    location: "",
    peopleCount: 1,
    medicalRequired: false,
    children: 0,
    elderly: 0,
    disabled: 0,
  });

  // =====================================================
  // LOAD ALL DASHBOARD DATA
  // =====================================================

  const loadDashboard = async () => {
    try {
      const [sosRes, teamRes, resourceRes] =
        await Promise.allSettled([
          fetch(`${API}/sos`),
          fetch(`${API}/rescue-teams/available`),
          fetch(`${API}/resource-allocation/resources`),
        ]);

      // SOS
      if (sosRes.status === "fulfilled") {
        const data = await sosRes.value.json();

        if (sosRes.value.ok) {
          setAlerts(
            data.sosRequests ||
              data.sos ||
              data.requests ||
              []
          );
        }
      }

      // TEAMS
      if (teamRes.status === "fulfilled") {
        const data = await teamRes.value.json();

        if (teamRes.value.ok) {
          setTeams(data.teams || []);
        }
      }

      // RESOURCES
      if (resourceRes.status === "fulfilled") {
        const data = await resourceRes.value.json();

        if (resourceRes.value.ok) {
          setResources(
            data.resources ||
              data.teams ||
              []
          );
        }
      }
    } catch (error) {
      console.error(
        "Dashboard loading error:",
        error
      );
    }
  };

  useEffect(() => {
    loadDashboard();

    // Refresh dashboard every 15 sec
    const interval = setInterval(
      loadDashboard,
      15000
    );

    return () => clearInterval(interval);
  }, []);

  // Feature 10: initialize the pending-SOS count on load,
  // and retry automatically whenever connectivity returns.
  useEffect(() => {
    try {
      const queue = JSON.parse(localStorage.getItem("resqlink_pending_sos") || "[]");
      setPendingSOSCount(queue.length);
    } catch {
      setPendingSOSCount(0);
    }

    if (navigator.onLine) retryPendingSOS();

    window.addEventListener("online", retryPendingSOS);
    return () => window.removeEventListener("online", retryPendingSOS);
  }, []);

  // Automatically show a recommendation for the latest active incident.
  // It runs only when a new incident appears, not on every dashboard refresh.
  useEffect(() => {
    if (!alerts.length) return;

    const latestId = alerts[0]?._id || alerts[0]?.id;
    if (!latestId || latestId === lastRecommendedId) return;

    setLastRecommendedId(latestId);
    getAIRecommendation(latestId);
  }, [alerts, lastRecommendedId]);

  // =====================================================
  // LOCATION
  // =====================================================

  const getCurrentLocation = () => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(
          new Error(
            "Geolocation is not supported by your browser."
          )
        );
        return;
      }

      setLocationLoading(true);

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const latitude =
            position.coords.latitude;

          const longitude =
            position.coords.longitude;

          if (
            longitude < 68 ||
            longitude > 98 ||
            latitude < 6 ||
            latitude > 38
          ) {
            setLocationLoading(false);

            reject(
              new Error(
                "Your current location appears to be outside India."
              )
            );

            return;
          }

          const location = {
            address: "Current location",
            city: "",
            state: "",
            country: "India",

            // IMPORTANT:
            // GeoJSON = [longitude, latitude]
            coordinates: [
              longitude,
              latitude,
            ],
          };

          setUserLocation(location);

          setReportForm((prev) => ({
            ...prev,
            location: "Current location",
          }));

          setLocationLoading(false);

          resolve(location);
        },

        (error) => {
          setLocationLoading(false);

          let message =
            "Unable to get your location.";

          if (error.code === 1) {
            message =
              "Location permission denied. Please allow location access.";
          }

          if (error.code === 2) {
            message =
              "Your location could not be determined.";
          }

          if (error.code === 3) {
            message =
              "Location request timed out.";
          }

          reject(new Error(message));
        },

        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000,
        }
      );
    });
  };

  // =====================================================
  // FEATURE 10 — OFFLINE / LOW-NETWORK SOS QUEUE
  // =====================================================
  // localStorage-backed pending queue. An SOS is only ever
  // marked "delivered" after a real 2xx response from the
  // backend — never assumed.

  const OFFLINE_SOS_KEY = "resqlink_pending_sos";

  const readOfflineQueue = () => {
    try {
      return JSON.parse(localStorage.getItem(OFFLINE_SOS_KEY) || "[]");
    } catch {
      return [];
    }
  };

  const writeOfflineQueue = (queue) => {
    localStorage.setItem(OFFLINE_SOS_KEY, JSON.stringify(queue));
    setPendingSOSCount(queue.length);
  };

  const queueOfflineSOS = (payload) => {
    const queue = readOfflineQueue();
    queue.push({ payload, queuedAt: new Date().toISOString() });
    writeOfflineQueue(queue);
  };

  const retryPendingSOS = async () => {
    const queue = readOfflineQueue();
    if (!queue.length || !navigator.onLine) return;

    const remaining = [];

    for (const item of queue) {
      try {
        const res = await fetch(`${API}/sos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item.payload),
        });

        if (!res.ok) {
          remaining.push(item);
        }
        // Only dropped from the queue on a real success response.
      } catch {
        remaining.push(item);
      }
    }

    writeOfflineQueue(remaining);

    if (remaining.length < queue.length) {
      await loadDashboard().catch(() => {});
    }
  };

  // =====================================================
  // EMERGENCY MODAL
  // =====================================================

  const openEmergency = () => {
    setEmergencyMode("choice");
    setEmergencyStatus(null);
    setShowEmergency(true);
  };

  const closeEmergency = () => {
    if (isSubmitting) return;

    setShowEmergency(false);
    setEmergencyMode("choice");
  };

  // =====================================================
  // QUICK SOS
  // =====================================================

  const handleQuickAction = async () => {
    setIsSubmitting(true);

    try {
      let location = userLocation;

      if (!location) {
        location =
          await getCurrentLocation();
      }

      const response = await fetch(
        `${API}/sos`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            disasterType: "Emergency",

            description:
              "Immediate danger reported. Quick action required.",

            severity: "Critical",

            peopleCount: 1,

            medicalRequired: true,

            vulnerablePeople: {
              children: 0,
              elderly: 0,
              disabled: 0,
            },

            location,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
            "Unable to create SOS."
        );
      }

      const id =
        data.sos?._id ||
        data.sos?.id ||
        data._id ||
        data.id;

      // Refresh data
      if (data.sos) {
        setAlerts((currentAlerts) => [data.sos, ...currentAlerts]);
      }
      await loadDashboard();

      // Feature 2: AI SOS classification — surface it
      // right after submission instead of discarding it.
      setLastClassification(data.aiClassification || null);

      // Show status
      setEmergencyStatus({
        id:
          id ||
          `RQ-${Date.now()}`,

        type:
          "CRITICAL EMERGENCY",

        status:
          "ACTIVE",

        location:
          location.address,
      });

      setShowEmergency(false);
      setEmergencyMode("choice");

    } catch (error) {
      console.error(
        "SOS ERROR:",
        error
      );

      alert(
        error.message ||
          "Could not send SOS."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // =====================================================
  // REPORT EMERGENCY
  // =====================================================

  const handleReportSubmit = async (
    e
  ) => {
    e.preventDefault();

    if (
      !reportForm.description.trim()
    ) {
      alert(
        "Please describe the emergency."
      );
      return;
    }

    if (
      !reportForm.location.trim()
    ) {
      alert(
        "Please enter location or use My Location."
      );
      return;
    }

    setIsSubmitting(true);

    try {
      let finalLocation =
        userLocation;

      // ---------------------------------
      // GEOCODE MANUAL LOCATION
      // ---------------------------------

      if (!finalLocation) {
        const geoResponse =
          await fetch(
            `${API}/emergencies/geocode?q=${encodeURIComponent(
              reportForm.location
            )}`
          );

        const geoData =
          await geoResponse.json();

        if (
          !geoResponse.ok ||
          !geoData.success
        ) {
          throw new Error(
            geoData.message ||
              "Location could not be found."
          );
        }

        finalLocation = {
          address:
            geoData.location.address,

          city:
            geoData.location.city ||
            "",

          state:
            geoData.location.state ||
            "",

          country:
            "India",

          coordinates: [
            geoData.location.longitude,
            geoData.location.latitude,
          ],
        };
      }

      // ---------------------------------
      // CREATE SOS
      // ---------------------------------

      const sosPayload = {
        disasterType:
          reportForm.type,

        severity:
          reportForm.severity,

        description:
          reportForm.description,

        peopleCount:
          Number(
            reportForm.peopleCount
          ) || 1,

        medicalRequired:
          Boolean(
            reportForm.medicalRequired
          ) ||
          reportForm.type ===
            "Medical",

        vulnerablePeople: {
          children:
            Number(
              reportForm.children
            ) || 0,

          elderly:
            Number(
              reportForm.elderly
            ) || 0,

          disabled:
            Number(
              reportForm.disabled
            ) || 0,
        },

        location:
          finalLocation,
      };

      // Feature 10: offline / low-network SOS.
      // Never pretend a locally-saved SOS reached the
      // backend — only mark it delivered once the fetch
      // actually succeeds.
      if (!navigator.onLine) {
        queueOfflineSOS(sosPayload);

        await loadDashboard().catch(() => {});

        setEmergencyStatus({
          success: true,
          offline: true,
          message:
            "NETWORK UNAVAILABLE — SOS saved locally. It will send automatically when your connection returns.",
        });

        setEmergencyMode("status");
        setIsSubmitting(false);
        return;
      }

      let response;

      try {
        response =
          await fetch(`${API}/sos`, {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify(sosPayload),
          });
      } catch (networkError) {
        // fetch itself failed (e.g. connection dropped
        // mid-request) — treat exactly like offline.
        queueOfflineSOS(sosPayload);

        setEmergencyStatus({
          success: true,
          offline: true,
          message:
            "NETWORK UNAVAILABLE — SOS saved locally. It will send automatically when your connection returns.",
        });

        setEmergencyMode("status");
        setIsSubmitting(false);
        return;
      }

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
            "Unable to submit emergency."
        );
      }

      if (data.sos) {
        setAlerts((currentAlerts) => [data.sos, ...currentAlerts]);
      }
      await loadDashboard();

      // Feature 2: AI SOS classification.
      setLastClassification(data.aiClassification || null);

      // ---------------------------------
      // RESET
      // ---------------------------------

      setReportForm({
        type: "Flood",
        severity: "Medium",
        description: "",
        location: "",
        peopleCount: 1,
        medicalRequired: false,
        children: 0,
        elderly: 0,
        disabled: 0,
      });

      setUserLocation(null);

      setShowEmergency(false);

      setEmergencyMode(
        "choice"
      );

      alert(
        "Emergency reported successfully."
      );

    } catch (error) {
      console.error(
        "REPORT ERROR:",
        error
      );

      alert(
        error.message ||
          "Could not submit emergency."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // =====================================================
  // AI TEAM RECOMMENDATION
  // =====================================================

  const getAIRecommendation = async (
    emergencyId
  ) => {
    if (!emergencyId) {
      alert(
        "Emergency ID not available."
      );
      return;
    }

    setAiLoading(true);
    setAiResult(null);
    setAiMessage("");

    try {
      const response =
        await fetch(
          `${API}/resource-allocation/ai-recommend/${emergencyId}`
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
            "AI recommendation failed."
        );
      }

      setAiResult(data);

      setAiMessage(
        data.fallback
          ? "AI unavailable — intelligent local fallback used."
          : "AI selected the best available response team."
      );

    } catch (error) {
      console.error(
        "AI TEAM ERROR:",
        error
      );

      setAiMessage(
        error.message ||
          "AI recommendation unavailable."
      );
    } finally {
      setAiLoading(false);
    }
  };

  // =====================================================
  // AI RESOURCE RECOMMENDATION
  // =====================================================

  // =====================================================
// AI RESOURCE RECOMMENDATION
// =====================================================

const getResourceRecommendation = async (emergencyId) => {
  if (!emergencyId) {
    setResourceMessage("Emergency ID not available.");
    return;
  }

  setResourceLoading(true);
  setResourceResult(null);
  setResourceMessage("");

  try {
    const response = await fetch(
      `${API}/resource-allocation/resources/ai-recommend/${emergencyId}`
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(
        data.message || "Resource recommendation failed."
      );
    }

    setResourceResult(data);

    setResourceMessage(
      "AI generated resource requirements for this emergency."
    );

  } catch (error) {
    console.error("RESOURCE AI ERROR:", error);

    setResourceMessage(
      error.message || "Resource recommendation unavailable."
    );

  } finally {
    setResourceLoading(false);
  }
};

// Feature 6 entry point from the roadmap card: run the
// recommendation against the most recent active SOS (if
// any) and scroll to the result panel either way.
const scrollToId = (id) => {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
};

const openResourceAllocation = () => {
  const activeAlert = alerts?.[0];
  const id = activeAlert?._id || activeAlert?.id;

  if (id) {
    getResourceRecommendation(id);
  } else {
    setResourceMessage(
      "No active SOS to allocate resources for right now."
    );
  }

  scrollToId("resource-allocation");
};
  // =====================================================
  // AI RESPONSE FOR LATEST EMERGENCY
  // =====================================================

  const activateAIBrain = async () => {
    if (!alerts.length) {
      alert(
        "No active emergency available for AI analysis."
      );
      return;
    }

    const latest =
      alerts[0];

    const id =
      latest._id ||
      latest.id;

    await getAIRecommendation(id);

    await getResourceRecommendation(
      id
    );
  };

  // =====================================================
  // NAVIGATION
  // =====================================================

  const openAssistant = () => {
    navigate(
      "/emergency-assistant"
    );
  };

  const openResponseMap = () => {
    navigate(
      "/response-map"
    );
  };

  const openRescueControl = () => {
    navigate(
      "/rescue-team"
    );
  };

  // =====================================================
  // ASSIGN AI-RECOMMENDED TEAM
  // =====================================================

  const assignRecommendedTeam = async () => {
    const teamId = aiResult?.recommendation?.teamId;
    const emergencyId =
      aiResult?.emergency?.id ||
      alerts[0]?._id ||
      alerts[0]?.id;

    if (!teamId || !emergencyId) {
      if (!alerts.length) {
        alert("No active emergency is available for team assignment.");
        return;
      }

      // If AI has not returned a recommendation yet, run it first.
      await activateAIBrain();
      return;
    }

    try {
      setAssigningTeam(true);
      setAssignmentMessage("");

      const response = await fetch(
        `${API}/rescue-teams/assign`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            teamId,
            emergencyId,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "Unable to assign rescue team."
        );
      }

      setAssignmentMessage(
        `✓ ${data.assignment?.teamName || aiResult?.recommendation?.teamName || "Response team"} assigned successfully.`
      );

      // Refresh dashboard so the assigned team becomes unavailable.
      await loadDashboard();
    } catch (error) {
      console.error("ASSIGN TEAM ERROR:", error);
      setAssignmentMessage(
        error.message || "Unable to assign rescue team."
      );
    } finally {
      setAssigningTeam(false);
    }
  };

  // LIVE RESPONSE TIMELINE
  const latestAlert = alerts[0] || null;
  const latestStatus = String(
    latestAlert?.status || emergencyStatus?.status || "Pending"
  );
  const normalizedLatestStatus = latestStatus.toLowerCase();
  const assignedTeam = latestAlert?.assignedTeam;
  const recommendedTeam =
    aiResult?.recommendation?.teamName ||
    aiResult?.recommendation?.team?.teamName ||
    (assignmentMessage.startsWith("✓") ? assignmentMessage.replace(/^✓\s*/, "") : "");
  const hasSelectedTeam = Boolean(
    assignedTeam || aiResult?.recommendation?.teamId || recommendedTeam
  );
  const isResolved = ["completed", "resolved"].includes(normalizedLatestStatus);
  const isRescueActive = ["reached", "rescuing"].includes(normalizedLatestStatus);
  const isDispatched = [
    "dispatched",
    "on the way",
    "reached",
    "rescuing",
    "completed",
    "resolved",
  ].includes(normalizedLatestStatus);
  const isDispatchActive = ["assigned", "dispatched", "on the way"].includes(
    normalizedLatestStatus
  );
  const timelineSteps = [
    {
      title: "SOS RECEIVED",
      state: latestAlert ? "completed" : "pending",
    },
    {
      title: "AI ANALYSIS",
      state: aiLoading ? "active" : aiResult ? "completed" : "pending",
    },
    {
      title: "TEAM SELECTED",
      state: hasSelectedTeam ? "completed" : "pending",
    },
    {
      title: "DISPATCHED",
      state: isDispatched ? "completed" : isDispatchActive ? "active" : "pending",
    },
    {
      title: "RESCUE",
      state: isResolved ? "completed" : isRescueActive ? "active" : "pending",
    },
    {
      title: "COMPLETED",
      state: isResolved ? "completed" : "pending",
    },
  ];

  // =====================================================
  // FEATURE CARDS
  // =====================================================

  const features = [
    {
      icon: "🤖",
      title: "AI Emergency Agent",
      text:
        "AI analyzes emergency information and recommends the next response action.",
      action: openAssistant,
      button:
        "Open AI Assistant",
    },

    {
      icon: "🧠",
      title: "AI SOS Classification",
      text:
        "Automatically understand emergency type severity and response priority.",
      action: openEmergency,
      button:
        "Create SOS",
    },

    {
      icon: "🎯",
      title: "AI Team Decision",
      text:
        "Select the most suitable available rescue team using skills capacity and location.",
      action:
        activateAIBrain,
      button:
        "Run AI Decision",
    },

    {
      icon: "🚦",
      title: "Automatic Escalation",
      text:
        "Critical emergencies can be prioritized for faster response.",
      action:
        openResponseMap,
      button:
        "View Response",
    },

    {
      icon: "⏱️",
      title: "ETA Prediction",
      text:
        "Estimate response time using team availability and distance.",
      action:
        openResponseMap,
      button:
        "View ETA",
    },

    {
      icon: "🗺️",
      title: "Safe Route Engine",
      text:
        "Find safer navigation paths around emergency zones.",
      action:
        openResponseMap,
      button:
        "Open Map",
    },

    {
      icon: "📡",
      title: "Low Network SOS",
      text:
        "Emergency workflow is designed to keep the SOS path lightweight.",
      action:
        openEmergency,
      button:
        "Send SOS",
    },

    {
      icon: "📊",
      title: "Predictive Analytics",
      text:
        "Use response data to understand emergency patterns and performance.",
      action:
        () =>
          document
            .getElementById(
              "analytics"
            )
            ?.scrollIntoView({
              behavior:
                "smooth",
            }),
      button:
        "View Analytics",
    },

    {
      icon: "🔥",
      title: "Disaster Hotspots",
      text:
        "Identify areas where emergency activity is increasing.",
      action:
        openResponseMap,
      button:
        "View Hotspots",
    },

    {
      icon: "🏥",
      title: "Hospital Awareness",
      text:
        "Connect emergency response with nearby medical support.",
      action:
        openResponseMap,
      button:
        "Find Hospitals",
    },

    {
      icon: "📡",
      title: "Cross-Agency Network",
      text:
        "Connect citizens rescue teams resources and authorities.",
      action:
        openRescueControl,
      button:
        "Command View",
    },

    {
      icon: "📦",
      title: "Smart Resources",
      text:
        "Coordinate available response resources based on emergency requirements.",
      action:
        openResponseMap,
      button:
        "View Resources",
    },
  ];

  // =====================================================
  // UI
  // =====================================================

  return (
    <div
      className={`resqlink ${
        darkMode
          ? "dark-mode"
          : ""
      }`}
    >

      {/* =================================================
          NAVBAR
      ================================================= */}

      <header className="navbar">

        <div className="brand">

          <div className="brand-mark">
            R
          </div>

          <div className="brand-text">

            <h2>
              ResQLink
            </h2>

            <span>
              AI Emergency Response Network
            </span>

          </div>

        </div>
<nav className="nav-links">
  <a href="#map">Live Map</a>
  <a href="#alerts">Incidents</a>
  <a href="#ai-brain">AI Brain</a>
  <Link to="/rescue-team">Response Teams</Link>
  <Link to="/inventory">Resources</Link>
  <Link to="/analytics">Analytics</Link>
  <Link to="/command-center">Command Center</Link>
  <Link to="/emergency-assistant">Assistant</Link>
</nav>
        <div className="nav-actions">

          <button
            className="theme-btn"
            onClick={() =>
              setDarkMode((prev) => {
                const next = !prev;
                localStorage.setItem("resqlink_dark_mode", next ? "1" : "0");
                return next;
              })
            }
          >
            {darkMode
              ? "☀"
              : "☾"}
          </button>

          {isUserSignedIn ? (
            <div className="user-menu">
              <button
                className="user-avatar"
                title="Account menu"
                aria-label="Account menu"
                aria-expanded={showUserMenu}
                onClick={() => setShowUserMenu((visible) => !visible)}
              >
                U
              </button>
              {showUserMenu && (
                <div className="user-menu-panel">
                  <span>Signed in</span>
                  <button
                    type="button"
                    onClick={() => {
                      localStorage.removeItem("resqlink_user_token");
                      navigate("/login");
                    }}
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              className="login-btn"
              onClick={() => navigate("/login")}
            >
              Sign in
            </button>
          )}

          <button
            className="major-emergency-btn"
            onClick={
              openEmergency
            }
          >
            <span className="emergency-symbol">
              !
            </span>

            Emergency
          </button>

        </div>

      </header>

      {/* =================================================
          MAIN
      ================================================= */}

      <main>

        {/* =================================================
            HERO
        ================================================= */}

        <section className="hero">

          <div className="network-decoration">

            <span className="network-node node-1" />
            <span className="network-node node-2" />
            <span className="network-node node-3" />
            <span className="network-node node-4" />
            <span className="network-node node-5" />

            <div className="network-line line-1" />
            <div className="network-line line-2" />
            <div className="network-line line-3" />
            <div className="network-line line-4" />

          </div>

          <div className="hero-left">

            <div className="eyebrow">

              <span className="status-dot" />

              AI-POWERED DISASTER RESPONSE

            </div>

            <h1>

              One network.

              <br />

              <em>
                Smarter emergency response.
              </em>

            </h1>

            <p>

              ResQLink connects citizens,
              rescue teams, hospitals,
              resources and authorities
              through one intelligent
              emergency response network.

            </p>

            <div className="hero-actions">

              <button
                className="primary-btn"
                onClick={
                  openResponseMap
                }
              >

                Open Response Map

                <span>
                  →
                </span>

              </button>

              <button
                className="outline-btn"
                onClick={
                  openAssistant
                }
              >

                🤖 AI Emergency Assistant

                <span>
                  →
                </span>

              </button>

            </div>

            <div className="hero-note">

              <span className="online-dot" />

              AI response network operational

              <b>
                •
              </b>

              Available 24/7

            </div>

            {pendingSOSCount > 0 && (
              <div
                style={{
                  marginTop: "12px",
                  padding: "8px 14px",
                  borderRadius: "10px",
                  background: "#fef3c7",
                  color: "#92400e",
                  fontSize: "11px",
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  width: "fit-content",
                }}
              >
                📡 {pendingSOSCount} SOS pending — retrying automatically
              </div>
            )}

            {/* =================================================
                LIVE RESPONSE TIMELINE
            ================================================= */}
            <section className="timeline-card live-response-timeline" aria-labelledby="live-response-timeline-title">
              <div className="live-response-timeline-header">
                <div>
                  <span className="section-label">LIVE RESPONSE TIMELINE</span>
                  <h2 id="live-response-timeline-title">Emergency Response Flow</h2>
                  <p>Track the emergency response from SOS to resolution.</p>
                </div>
                <span className="timeline-live-badge">
                  <span>●</span> LIVE
                </span>
              </div>

              <div className="timeline-steps">
                {timelineSteps.map((step, index) => (
                  <div className={`timeline-step ${step.state}`} key={step.title}>
                    <div className="timeline-step-marker">
                      {step.state === "completed" ? "✓" : index + 1}
                    </div>
                    <div className="timeline-step-copy">
                      <strong>{step.title}</strong>
                      <span>{step.state === "completed" ? "Completed" : step.state === "active" ? "Active" : "Pending"}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="timeline-summary">
                <div>
                  <small>INCIDENT</small>
                  <strong>{latestAlert?.disasterType || "No active incident"}</strong>
                </div>
                <div>
                  <small>LOCATION</small>
                  <strong>{latestAlert?.location?.address || latestAlert?.location?.city || "Unavailable"}</strong>
                </div>
                <div>
                  <small>SEVERITY</small>
                  <strong className="timeline-severity">{latestAlert?.severity || "Pending"}</strong>
                </div>
                <div>
                  <small>STATUS</small>
                  <strong>{latestAlert ? latestStatus : "Waiting"}</strong>
                </div>
                <div>
                  <small>TEAM</small>
                  <strong>{assignedTeam?.teamName || recommendedTeam || "Unassigned"}</strong>
                </div>
              </div>

              <div className="timeline-actions">
                <button className="primary-btn" onClick={openResponseMap}>
                  Open Live Map →
                </button>
              </div>
            </section>

          </div>

          {/* =================================================
              LIVE MAP
          ================================================= */}

          <div
            className="hero-right"
            id="map"
          >

            <div className="map-card">

              <div className="map-header">

                <div>

                  <span>
                    LIVE RESPONSE
                  </span>

                  <h3>
                    Incident Overview
                  </h3>

                </div>

                <div className="live-indicator">

                  <span />

                  LIVE

                </div>

              </div>

              <div className="map-area">

                <div className="map-grid" />

                <div className="road road-one" />
                <div className="road road-two" />
                <div className="road road-three" />
                <div className="road road-four" />
                <div className="road road-five" />

                <div className="risk-zone zone-one" />
                <div className="risk-zone zone-two" />

                <div className="map-marker incident-one">

                  <span />

                  <small>
                    INCIDENT
                  </small>

                </div>

                <div className="map-marker incident-two">
                  <span />
                </div>

                <div className="map-marker incident-three">
                  <span />
                </div>

                <div className="user-marker">

                  <div className="user-point" />

                  <div className="user-label">

                    <strong>
                      You
                    </strong>

                    <span>
                      Your location
                    </span>

                  </div>

                </div>

                <div className="shelter-marker">

                  <div>
                    ✓
                  </div>

                  <span>
                    Safe shelter
                  </span>

                </div>

                <div className="hospital-marker">

                  <div>
                    +
                  </div>

                  <span>
                    Hospital
                  </span>

                </div>

                <div className="map-label flood-label">

                  <strong>
                    AI RISK ZONE
                  </strong>

                  <span>
                    High emergency activity
                  </span>

                </div>

                <div className="map-label location-label">

                  <strong>
                    {teams.length}
                  </strong>

                  <span>
                    Teams available
                  </span>

                </div>

                <div className="compass">

                  <span>
                    N
                  </span>

                  <div />

                </div>

              </div>

              <div className="map-bottom">

                <div>

                  <strong>
                    {String(
                      alerts.length
                    ).padStart(
                      2,
                      "0"
                    )}
                  </strong>

                  <span>
                    Active incidents
                  </span>

                </div>

                <div>

                  <strong>
                    {String(
                      teams.length
                    ).padStart(
                      2,
                      "0"
                    )}
                  </strong>

                  <span>
                    Teams available
                  </span>

                </div>

                <div>

                  <strong>
                    {String(
                      resources.length
                    ).padStart(
                      2,
                      "0"
                    )}
                  </strong>

                  <span>
                    Resources
                  </span>

                </div>

              </div>

            </div>

            {/* =================================================
                LIVE INCIDENT + RECOMMENDED RESPONSE
                Existing functions preserved:
                - View Incident Map
                - Recheck / Analyze AI decision
                - Assign Team
            ================================================= */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: "12px",
                marginTop: "12px",
                alignItems: "start",
              }}
            >
              {/* ================= LIVE INCIDENT ================= */}
              <div
                style={{
                  padding: "16px",
                  borderRadius: "18px",
                  background: "var(--card-solid)",
                  border: "1px solid var(--border)",
                  minWidth: 0,
                  boxShadow: "0 8px 30px rgba(0,0,0,0.05)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "10px",
                  }}
                >
                  <span className="section-label" style={{ fontSize: "10px" }}>
                    LIVE RESPONSE
                  </span>

                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "6px 9px",
                      borderRadius: "999px",
                      background: "#eaf7f1",
                      color: "#168b61",
                      fontSize: "9px",
                      fontWeight: 800,
                    }}
                  >
                    <span>●</span> SYSTEM LIVE
                  </span>
                </div>

                <h3 style={{ margin: "12px 0 8px", fontSize: "22px" }}>
                  Incident Status
                </h3>

                {alerts.length > 0 ? (
                  <>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "9px",
                        marginBottom: "7px",
                      }}
                    >
                      <span
                        style={{
                          width: "8px",
                          height: "8px",
                          borderRadius: "50%",
                          background: "#ef5538",
                          display: "inline-block",
                        }}
                      />
                      <strong style={{ fontSize: "17px" }}>
                        {alerts[0]?.disasterType || "Emergency"}
                      </strong>
                    </div>

                    <p
                      style={{
                        margin: 0,
                        fontSize: "12px",
                        lineHeight: 1.5,
                        color: "var(--text-muted)",
                      }}
                    >
                      {alerts[0]?.location?.address ||
                        alerts[0]?.location?.city ||
                        "Location unavailable"}
                    </p>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(3, 1fr)",
                        gap: "8px",
                        marginTop: "16px",
                      }}
                    >
                      <div
                        style={{
                          padding: "10px",
                          border: "1px solid var(--border)",
                          borderRadius: "12px",
                        }}
                      >
                        <small style={{ display: "block", fontSize: "9px", opacity: 0.65 }}>
                          SEVERITY
                        </small>
                        <strong style={{ fontSize: "13px", color: "#ef5538" }}>
                          {(alerts[0]?.severity || "High").toUpperCase()}
                        </strong>
                      </div>

                      <div
                        style={{
                          padding: "10px",
                          border: "1px solid var(--border)",
                          borderRadius: "12px",
                        }}
                      >
                        <small style={{ display: "block", fontSize: "9px", opacity: 0.65 }}>
                          ACTIVE
                        </small>
                        <strong style={{ fontSize: "13px" }}>{alerts.length}</strong>
                      </div>

                      <div
                        style={{
                          padding: "10px",
                          border: "1px solid var(--border)",
                          borderRadius: "12px",
                        }}
                      >
                        <small style={{ display: "block", fontSize: "9px", opacity: 0.65 }}>
                          TEAMS
                        </small>
                        <strong style={{ fontSize: "13px" }}>{teams.length}</strong>
                      </div>
                    </div>

                    <button
                      className="outline-btn"
                      style={{
                        width: "100%",
                        marginTop: "14px",
                        padding: "11px 12px",
                        fontSize: "11px",
                      }}
                      onClick={openResponseMap}
                    >
                      View Incident Map →
                    </button>
                  </>
                ) : (
                  <>
                    <h3 style={{ margin: "10px 0 6px", fontSize: "18px" }}>
                      No active incident
                    </h3>
                    <p
                      style={{
                        margin: 0,
                        fontSize: "12px",
                        color: "var(--text-muted)",
                      }}
                    >
                      Waiting for emergency reports.
                    </p>
                  </>
                )}
              </div>

              {/* ================= RECOMMENDED RESPONSE ================= */}
              <div
                style={{
                  padding: "20px",
                  borderRadius: "18px",
                  background: "var(--card-solid)",
                  border: "1px solid var(--border)",
                  minWidth: 0,
                  boxShadow: "0 8px 30px rgba(0,0,0,0.05)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "10px",
                  }}
                >
                  <span className="section-label" style={{ fontSize: "10px" }}>
                    AI RECOMMENDATION
                  </span>

                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "6px 9px",
                      borderRadius: "999px",
                      background: "#eaf7f1",
                      color: "#168b61",
                      fontSize: "9px",
                      fontWeight: 800,
                    }}
                  >
                    <span>●</span> {aiLoading ? "ANALYZING" : "AI READY"}
                  </span>
                </div>

                <h3 style={{ margin: "12px 0 8px", fontSize: "22px" }}>
                  Recommended Response
                </h3>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    marginTop: "6px",
                  }}
                >
                  <div
                    style={{
                      width: "42px",
                      height: "42px",
                      borderRadius: "12px",
                      display: "grid",
                      placeItems: "center",
                      background: "#eef7f4",
                      fontSize: "22px",
                      flexShrink: 0,
                    }}
                  >
                    🚑
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <strong style={{ display: "block", fontSize: "16px" }}>
                      {aiLoading
                        ? "Analyzing available teams..."
                        : aiResult?.recommendation?.teamName ||
                          aiResult?.recommendation?.team?.teamName ||
                          "Response team ready"}
                    </strong>
                    <span
                      style={{
                        display: "block",
                        marginTop: "3px",
                        fontSize: "11px",
                        color: "var(--text-muted)",
                      }}
                    >
                      {aiResult?.recommendation?.teamCode
                        ? `Unit ${aiResult.recommendation.teamCode}`
                        : "Best available response unit"}
                    </span>
                  </div>
                </div>

                <p
                  style={{
                    margin: "14px 0 0",
                    fontSize: "12px",
                    lineHeight: 1.5,
                    color: "var(--text-muted)",
                  }}
                >
                  {aiLoading
                    ? "AI is selecting the best available team."
                    : aiResult?.recommendation?.reasons?.[0] ||
                      aiResult?.recommendation?.reasoning ||
                      aiMessage ||
                      "AI will recommend the best team for the latest incident."}
                </p>

                {aiResult?.recommendation?.breakdown ? (
                  <div style={{ marginTop: "16px" }}>
                    {[
                      ["Location Match", aiResult.recommendation.breakdown.locationMatch],
                      ["Skill Match", aiResult.recommendation.breakdown.skillMatch],
                      ["Availability", aiResult.recommendation.breakdown.availability],
                      ["Distance", aiResult.recommendation.breakdown.distance],
                      ["Response Capacity", aiResult.recommendation.breakdown.responseCapacity],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          marginBottom: "6px",
                        }}
                      >
                        <span style={{ fontSize: "10px", width: "108px", flexShrink: 0, color: "var(--text-muted)" }}>
                          {label}
                        </span>
                        <div
                          style={{
                            flex: 1,
                            height: "6px",
                            borderRadius: "999px",
                            background: "var(--border)",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${Math.max(0, Math.min(100, value))}%`,
                              height: "100%",
                              background: "var(--green)",
                              borderRadius: "999px",
                            }}
                          />
                        </div>
                        <strong style={{ fontSize: "11px", width: "32px", textAlign: "right" }}>
                          {value}%
                        </strong>
                      </div>
                    ))}

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginTop: "8px",
                        paddingTop: "8px",
                        borderTop: "1px solid var(--border)",
                      }}
                    >
                      <small style={{ fontSize: "9px", opacity: 0.65 }}>OVERALL SCORE</small>
                      <strong style={{ fontSize: "15px" }}>
                        {aiResult.recommendation.breakdown.overall}%
                      </strong>
                    </div>

                    <p
                      style={{
                        margin: "10px 0 0",
                        fontSize: "11px",
                        lineHeight: 1.5,
                        color: "var(--text-muted)",
                        fontStyle: "italic",
                      }}
                    >
                      "Why this team?" {aiResult.recommendation.breakdown.why}
                      {aiResult.recommendation.breakdown.distanceEstimated &&
                        " (distance estimated from location, not GPS.)"}
                    </p>
                  </div>
                ) : (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "8px",
                      marginTop: "16px",
                    }}
                  >
                    <div
                      style={{
                        padding: "10px",
                        border: "1px solid var(--border)",
                        borderRadius: "12px",
                      }}
                    >
                      <small style={{ display: "block", fontSize: "9px", opacity: 0.65 }}>
                        AI SCORE
                      </small>
                      <strong style={{ fontSize: "15px" }}>
                        {aiResult?.recommendation?.score || 0}
                      </strong>
                    </div>

                    <div
                      style={{
                        padding: "10px",
                        border: "1px solid var(--border)",
                        borderRadius: "12px",
                      }}
                    >
                      <small style={{ display: "block", fontSize: "9px", opacity: 0.65 }}>
                        AVAILABLE UNITS
                      </small>
                      <strong style={{ fontSize: "15px" }}>{teams.length}</strong>
                    </div>
                  </div>
                )}

                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: "8px",
                    marginTop: "14px",
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    className="outline-btn"
                    style={{ padding: "10px 13px", fontSize: "11px" }}
                    onClick={activateAIBrain}
                    disabled={aiLoading || assigningTeam || !alerts.length}
                  >
                    {aiLoading ? "Analyzing..." : "Analyze →"}
                  </button>

                  <button
                    className="primary-btn"
                    style={{ padding: "10px 15px", fontSize: "11px" }}
                    onClick={assignRecommendedTeam}
                    disabled={aiLoading || assigningTeam || !alerts.length}
                  >
                    {assigningTeam ? "Assigning..." : "Assign Team →"}
                  </button>
                </div>

                {assignmentMessage && (
                  <p
                    style={{
                      margin: "10px 0 0",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: assignmentMessage.startsWith("✓")
                        ? "#168b61"
                        : "#ef5538",
                    }}
                  >
                    {assignmentMessage}
                  </p>
                )}
              </div>
            </div>

          </div>

        </section>

        {lastClassification && (
          <div
            style={{
              margin: "0 6%",
              padding: "16px 20px",
              borderRadius: "14px",
              border: "1px solid var(--border)",
              background: "var(--card-solid)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "12px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "20px", flexWrap: "wrap" }}>
              <strong style={{ fontSize: "11px", letterSpacing: "1px", opacity: 0.7 }}>
                🧠 AI SOS CLASSIFICATION
              </strong>

              <span style={{ fontSize: "12px" }}>
                TYPE: <strong>{lastClassification.disasterType}</strong>
              </span>

              <span style={{ fontSize: "12px" }}>
                SEVERITY: <strong>{lastClassification.severity}</strong>
              </span>

              <span style={{ fontSize: "12px" }}>
                URGENCY: <strong>{lastClassification.urgency}</strong>
              </span>

              <span style={{ fontSize: "12px" }}>
                CONFIDENCE: <strong>{lastClassification.confidence}%</strong>
              </span>
            </div>

            <button
              onClick={() => setLastClassification(null)}
              style={{
                border: "none",
                background: "transparent",
                cursor: "pointer",
                fontSize: "16px",
                opacity: 0.6,
              }}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        )}

        {/* =================================================
            AI BRAIN
        ================================================= */}

        <section
          className="stats-section"
          id="ai"
        >

          <div className="stats-heading">

            <span>
              🟢 LIVE SYSTEM STATUS
            </span>

            <h2>
              Every capability,
              <br />
              working right now.
            </h2>

            <p>

              A quick pulse on the AI layer
              before you scroll into the full
              incident, map and roadmap
              detail below.

            </p>

          </div>

          <div className="stats-grid">

            <div
              className="stat"
              onClick={
                openAssistant
              }
              style={{
                cursor:
                  "pointer",
              }}
            >

              <div className="stat-top">

                <strong>
                  🤖
                </strong>

                <span className="stat-status safe">
                  AI
                </span>

              </div>

              <span>
                Emergency Agent
              </span>

              <small>
                Understand → analyze → respond
              </small>

            </div>

            <div
              className="stat"
              onClick={
                activateAIBrain
              }
              style={{
                cursor:
                  "pointer",
              }}
            >

              <div className="stat-top">

                <strong>
                  🎯
                </strong>

                <span className="stat-status safe">
                  LIVE
                </span>

              </div>

              <span>
                Team Decision
              </span>

              <small>
                Skills + capacity + location
              </small>

            </div>

            <div className="stat">

              <div className="stat-top">

                <strong>
                  🚦
                </strong>

                <span className="stat-status warning">
                  AUTO
                </span>

              </div>

              <span>
                Priority Engine
              </span>

              <small>
                Critical emergencies first
              </small>

            </div>

            <div className="stat">

              <div className="stat-top">

                <strong>
                  ⏱️
                </strong>

                <span className="stat-status safe">
                  ETA
                </span>

              </div>

              <span>
                Response Prediction
              </span>

              <small>
                Faster response planning
              </small>

            </div>

          </div>

        </section>

        {/* =================================================
            AI RESULT
        ================================================= */}

        {(aiLoading ||
          aiResult ||
          aiMessage) && (

          <section className="intro-section">

            <div className="intro-heading">

              <span className="section-label">
                AI DECISION
              </span>

              <h2>
                Recommended
                <br />
                response team.
              </h2>

            </div>

            <div className="intro-content">

              {aiLoading && (
                <p>
                  🧠 AI is analyzing
                  available teams,
                  emergency requirements
                  and response suitability...
                </p>
              )}

              {aiMessage &&
                !aiLoading && (
                  <p>
                    {aiMessage}
                  </p>
                )}

              {aiResult?.recommendation && (

                <div>

                  <div
                    style={{
                      padding:
                        "22px",
                      borderRadius:
                        "16px",
                      border:
                        "1px solid var(--border)",
                      background:
                        "var(--card-solid)",
                      marginTop:
                        "18px",
                    }}
                  >

                    <h3>
                      🚑{" "}
                      {
                        aiResult
                          .recommendation
                          .team
                          ?.teamName ||
                        aiResult
                          .recommendation
                          .teamName ||
                        "Recommended Team"
                      }
                    </h3>

                    <p>

                      <strong>
                        Score:
                      </strong>{" "}

                      {
                        aiResult
                          .recommendation
                          .score ||
                        0
                      }

                    </p>

                    <p>

                      <strong>
                        Reason:
                      </strong>{" "}

                      {
                        aiResult
                          .recommendation
                          .reasoning ||
                        "Best available team based on emergency requirements."
                      }

                    </p>

                    {aiResult
                      .recommendation
                      .team
                      ?.skills && (

                      <p>

                        <strong>
                          Skills:
                        </strong>{" "}

                        {aiResult
                          .recommendation
                          .team
                          .skills
                          .join(
                            ", "
                          )}

                      </p>

                    )}

                  </div>

                  {aiResult
                    .recommendation
                    ?.team && (

                    <button
                      className="primary-btn"
                      style={{
                        marginTop:
                          "15px",
                      }}
                      onClick={
                        openRescueControl
                      }
                    >
                      Open Rescue Control →
                    </button>

                  )}
{/* =================================================
    AI RESOURCE ALLOCATION RESULT
================================================= */}
<div id="resource-allocation">

{(resourceLoading ||
  resourceResult ||
  resourceMessage) && (
  <div
    style={{
      marginTop: "24px",
      padding: "22px",
      borderRadius: "16px",
      border: "1px solid var(--border)",
      background: "var(--card-solid)",
    }}
  >
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "15px",
        marginBottom: "18px",
      }}
    >
      <div>
        <span
          className="section-label"
          style={{ fontSize: "11px" }}
        >
          AI RESOURCE ALLOCATION
        </span>

        <h3 style={{ margin: "7px 0 4px" }}>
          📦 Recommended Resources
        </h3>

        <p style={{ margin: 0 }}>
          AI matched emergency requirements with
          available resources.
        </p>
      </div>

      {resourceResult?.allocation && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: "12px",
            background: "#eff6ff",
            textAlign: "center",
          }}
        >
          <strong
            style={{
              display: "block",
              fontSize: "24px",
              color: "#2563eb",
            }}
          >
            {resourceResult.allocation.totalResources}
          </strong>

          <small>Resources</small>
        </div>
      )}
    </div>

    {resourceLoading && (
      <p>
        🧠 AI is analyzing available resources...
      </p>
    )}

    {resourceMessage && !resourceLoading && (
      <p>{resourceMessage}</p>
    )}

    {resourceResult?.allocation?.resources?.length > 0 && (
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "14px",
          marginTop: "18px",
        }}
      >
        {resourceResult.allocation.resources.map(
          (resource) => (
            <div
              key={resource.resourceId}
              style={{
                padding: "17px",
                borderRadius: "14px",
                background: "var(--background)",
                border:
                  "1px solid var(--border)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent:
                    "space-between",
                  alignItems: "flex-start",
                  gap: "10px",
                }}
              >
                <div>
                  <strong>
                    {resource.name}
                  </strong>

                  <div
                    style={{
                      fontSize: "12px",
                      opacity: 0.65,
                      marginTop: "4px",
                    }}
                  >
                    {resource.category}
                  </div>
                </div>

                <span
                  style={{
                    fontWeight: 700,
                    color: "#16a34a",
                  }}
                >
                  {resource.score}
                </span>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(3, 1fr)",
                  gap: "6px",
                  marginTop: "15px",
                }}
              >
                <div>
                  <strong>
                    {resource.requiredQuantity}
                  </strong>
                  <small
                    style={{
                      display: "block",
                      fontSize: "10px",
                      opacity: 0.6,
                    }}
                  >
                    Required
                  </small>
                </div>

                <div>
                  <strong>
                    {resource.allocatedQuantity}
                  </strong>
                  <small
                    style={{
                      display: "block",
                      fontSize: "10px",
                      opacity: 0.6,
                    }}
                  >
                    Allocated
                  </small>
                </div>

                <div>
                  <strong>
                    {resource.availableQuantity}
                  </strong>
                  <small
                    style={{
                      display: "block",
                      fontSize: "10px",
                      opacity: 0.6,
                    }}
                  >
                    Available
                  </small>
                </div>
              </div>

              <div
                style={{
                  marginTop: "12px",
                  paddingTop: "10px",
                  borderTop:
                    "1px solid var(--border)",
                  fontSize: "11px",
                  opacity: 0.7,
                }}
              >
                Status: {resource.status}
              </div>
            </div>
          )
        )}
      </div>
    )}

    {resourceResult?.allocation?.reasons?.length > 0 && (
      <div style={{ marginTop: "18px" }}>
        <strong>
          🧠 AI reasoning
        </strong>

        {resourceResult.allocation.reasons.map(
          (reason, index) => (
            <p
              key={index}
              style={{
                margin: "7px 0 0",
                fontSize: "13px",
              }}
            >
              ✓ {reason}
            </p>
          )
        )}
      </div>
    )}

    {resourceResult?.success &&
      !resourceResult?.allocation?.resources?.length &&
      !resourceLoading && (
        <p>
          No suitable resources are currently
          available.
        </p>
      )}
  </div>
)}
</div>
                </div>

              )}

            </div>

          </section>

        )}

        {/* =================================================
            LIVE ALERT
        ================================================= */}

        <section
          className="alert-section"
          id="alerts"
        >

          <div className="alert-icon">
            !
          </div>

          <div className="alert-info">

            <span>
              ACTIVE ALERT
            </span>

            <strong>

              {alerts.length
                ? `${
                    alerts[0]
                      ?.disasterType ||
                    "Emergency"
                  } emergency reported in ${
                    alerts[0]
                      ?.location
                      ?.address ||
                    alerts[0]
                      ?.location
                      ?.city ||
                    "India"
                  }`
                : "No active emergency reported yet"}

            </strong>

          </div>

          <div className="alert-meta">

            <span>

              {alerts.length
                ? (
                    alerts[0]
                      ?.severity ||
                    "High"
                  ).toUpperCase() +
                  " SEVERITY"
                : "NETWORK READY"}

            </span>

            <small>
              {alerts.length
                ? "Live"
                : "Waiting"}
            </small>

          </div>

          <button
            className="alert-btn"
            onClick={
              openResponseMap
            }
          >
            View response →
          </button>

        </section>

        {/* =================================================
            FEATURE GRID
        ================================================= */}

        <section
          className="intro-section"
          id="features"
        >

          <div className="intro-heading">

            <span className="section-label">
              RESQLINK ROADMAP
            </span>

            <h2>
              Intelligence at
              <br />
              every stage.
            </h2>

          </div>

          <div className="intro-content">

            <p>

              Every emergency moves through
              an intelligent response pipeline —
              from SOS classification to team
              allocation navigation analytics
              and recovery.

            </p>

            <div
              style={{
                display:
                  "grid",
                gridTemplateColumns:
                  "repeat(auto-fit,minmax(240px,1fr))",
                gap: "18px",
                marginTop:
                  "25px",
              }}
            >

              {features.map(
                (
                  feature,
                  index
                ) => (

                  <div
                    key={
                      feature.title
                    }
                    style={{
                      padding:
                        "22px",
                      borderRadius:
                        "18px",
                      background:
                        "var(--card)",
                      border:
                        "1px solid var(--border)",
                      backdropFilter:
                        "blur(12px)",
                    }}
                  >

                    <div
                      style={{
                        fontSize:
                          "30px",
                        marginBottom:
                          "10px",
                      }}
                    >
                      {
                        feature.icon
                      }
                    </div>

                    <small>
                      {String(
                        index + 1
                      ).padStart(
                        2,
                        "0"
                      )}
                    </small>

                    <h3
                      style={{
                        margin:
                          "8px 0",
                      }}
                    >
                      {
                        feature.title
                      }
                    </h3>

                    <p>
                      {
                        feature.text
                      }
                    </p>

                    <button
                      className="outline-btn"
                      style={{
                        marginTop:
                          "14px",
                      }}
                      onClick={
                        feature.action
                      }
                    >
                      {
                        feature.button
                      }{" "}
                      →
                    </button>

                  </div>

                )
              )}

            </div>

          </div>

        </section>

        {/* =================================================
            ANALYTICS
        ================================================= */}

        <section
          className="stats-section"
          id="analytics"
        >

          <div className="stats-heading">

            <span>
              LIVE INTELLIGENCE
            </span>

            <h2>
              See the response
              <br />
              network in real time.
            </h2>

            <p>

              ResQLink continuously updates
              operational information so
              responders can understand what
              needs attention.

            </p>

          </div>

          <div className="stats-grid">

            <div className="stat">

              <div className="stat-top">

                <strong>
                  {String(
                    alerts.length
                  ).padStart(
                    2,
                    "0"
                  )}
                </strong>

                <span className="stat-status danger">
                  ACTIVE
                </span>

              </div>

              <span>
                Emergency requests
              </span>

              <small>
                Currently monitored
              </small>

            </div>

            <div className="stat">

              <div className="stat-top">

                <strong>
                  {String(
                    teams.length
                  ).padStart(
                    2,
                    "0"
                  )}
                </strong>

                <span className="stat-status safe">
                  READY
                </span>

              </div>

              <span>
                Available teams
              </span>

              <small>
                Ready for deployment
              </small>

            </div>

            <div className="stat">

              <div className="stat-top">

                <strong>
                  {String(
                    resources.length
                  ).padStart(
                    2,
                    "0"
                  )}
                </strong>

                <span className="stat-status safe">
                  LIVE
                </span>

              </div>

              <span>
                Resources
              </span>

              <small>
                Available for allocation
              </small>

            </div>

            <div className="stat">

              <div className="stat-top">

                <strong>
                  AI
                </strong>

                <span className="stat-status warning">
                  ON
                </span>

              </div>

              <span>
                Intelligence layer
              </span>

              <small>
                Decision support enabled
              </small>

            </div>

          </div>

        </section>

        {/* =================================================
            WORKFLOW
        ================================================= */}

        <section className="intro-section">

          <div className="intro-heading">

            <span className="section-label">
              RESPONSE WORKFLOW
            </span>

            <h2>
              SOS to rescue
              <br />
              in one flow.
            </h2>

          </div>

          <div className="intro-content">

            <div className="intro-points">

              <div>

                <span>
                  01
                </span>

                <strong>
                  Detect
                </strong>

                <p>
                  Citizen reports
                  an emergency.
                </p>

              </div>

              <div>

                <span>
                  02
                </span>

                <strong>
                  Understand
                </strong>

                <p>
                  AI classifies
                  severity and
                  requirements.
                </p>

              </div>

              <div>

                <span>
                  03
                </span>

                <strong>
                  Decide
                </strong>

                <p>
                  AI recommends
                  the best response
                  team.
                </p>

              </div>

              <div>

                <span>
                  04
                </span>

                <strong>
                  Respond
                </strong>

                <p>
                  Team gets
                  dispatched and
                  tracked.
                </p>

              </div>

              <div>

                <span>
                  05
                </span>

                <strong>
                  Recover
                </strong>

                <p>
                  Data becomes
                  intelligence for
                  future disasters.
                </p>

              </div>

            </div>

          </div>

        </section>
{/* =========================================================
    AI BRAIN
   ========================================================= */}

<section className="ai-brain-section" id="ai-brain">

  <div className="ai-brain-header">
    <div>
      <span className="section-label">RESQLINK AI BRAIN</span>

      <h2>
        From emergency
        <br />
        <em>to intelligent action.</em>
      </h2>
    </div>

    <p>
      AI analyzes emergency information, understands the situation
      and helps response teams make faster and smarter decisions.
    </p>
  </div>

  {/* ================= PHASE 1 ================= */}

  <div className="ai-phase">

    <div className="ai-phase-title">
      <span>01</span>
      <div>
        <small>PHASE 1</small>
        <h3>AI Emergency Intelligence</h3>
      </div>
    </div>

    <div className="ai-feature-grid">

      <div className="ai-feature-card featured">
        <div className="feature-number">01</div>
        <div className="feature-icon">🤖</div>

        <h4>AI Emergency Agent</h4>

        <span className="feature-status feature-status-live">LIVE</span>

        <p>
          Understands emergency context and recommends the
          next response action.
        </p>

        <button className="feature-btn" onClick={activateAIBrain}>
          {aiLoading ? "Analyzing…" : "Run Agent →"}
        </button>
      </div>

      <div className="ai-feature-card">
        <div className="feature-number">02</div>
        <div className="feature-icon">🧠</div>

        <h4>AI SOS Classification</h4>

        <span className="feature-status feature-status-live">LIVE</span>

        <p>
          Automatically identifies emergency type, severity
          and response priority.
        </p>

        <button className="feature-btn" onClick={openEmergency}>
          Create SOS →
        </button>
      </div>

      <div className="ai-feature-card">
        <div className="feature-number">03</div>
        <div className="feature-icon">🎯</div>

        <h4>AI Team Decision</h4>

        <span className="feature-status feature-status-live">LIVE</span>

        <p>
          Selects the most suitable rescue team using skills,
          capacity and location.
        </p>

        <button className="feature-btn" onClick={activateAIBrain}>
          {aiLoading ? "Analyzing…" : "Run Decision →"}
        </button>
      </div>

      <div className="ai-feature-card">
        <div className="feature-number">04</div>
        <div className="feature-icon">💬</div>

        <h4>AI Emergency Assistant</h4>

        <span className="feature-status feature-status-live">LIVE</span>

        <p>
          Provides step-by-step emergency guidance and
          response information.
        </p>

        <button className="feature-btn" onClick={openAssistant}>
          Ask AI →
        </button>
      </div>

      <div className="ai-feature-card">
        <div className="feature-number">05</div>
        <div className="feature-icon">🗣️</div>

        <h4>Multilingual + Voice</h4>

        <span className="feature-status feature-status-live">LIVE</span>

        <p>
          Communicate with citizens through multiple
          languages and voice interaction.
        </p>

        <button className="feature-btn" onClick={openAssistant}>
          Try Voice →
        </button>
      </div>

    </div>
  </div>

  {/* ================= PHASE 2 ================= */}

  <div className="ai-phase">

    <div className="ai-phase-title">
      <span>02</span>
      <div>
        <small>PHASE 2</small>
        <h3>Advanced Response</h3>
      </div>
    </div>

    <div className="ai-feature-grid">

      <div className="ai-feature-card">
        <div className="feature-number">06</div>
        <div className="feature-icon">🔥</div>
        <h4>Dynamic Resource Allocation</h4>
        <span className="feature-status feature-status-live">LIVE</span>
        <p>Automatically allocates available resources based on emergency priority.</p>
        <button className="feature-btn" onClick={openResourceAllocation}>
          Allocate →
        </button>
      </div>

      <div className="ai-feature-card">
        <div className="feature-number">07</div>
        <div className="feature-icon">🚨</div>
        <h4>Automatic Escalation</h4>
        <span className="feature-status feature-status-live">LIVE</span>
        <p>Escalates critical emergencies to the appropriate authorities.</p>
        <button className="feature-btn" onClick={() => navigate("/command-center")}>
          View Escalations →
        </button>
      </div>

      <div className="ai-feature-card">
        <div className="feature-number">08</div>
        <div className="feature-icon">⏱️</div>
        <h4>ETA + Response Prediction</h4>
        <span className="feature-status feature-status-live">LIVE</span>
        <p>Predicts response time using team availability and location.</p>
        <button className="feature-btn" onClick={() => navigate("/response-map")}>
          Check ETA →
        </button>
      </div>

      <div className="ai-feature-card">
        <div className="feature-number">09</div>
        <div className="feature-icon">🗺️</div>
        <h4>Dynamic Safe-Route Engine</h4>
        <span className="feature-status feature-status-local">LOCAL</span>
        <p>Identifies safer routes while considering emergency zones.</p>
        <button className="feature-btn" onClick={() => navigate("/response-map")}>
          Open Map →
        </button>
      </div>

      <div className="ai-feature-card">
        <div className="feature-number">10</div>
        <div className="feature-icon">📡</div>
        <h4>Offline / Low-Network SOS</h4>
        <span className="feature-status feature-status-local">LOCAL</span>
        <p>Maintains emergency communication even with limited connectivity.</p>
        <button className="feature-btn" onClick={openEmergency}>
          Try SOS →
        </button>
      </div>

    </div>
  </div>

  {/* ================= PHASE 3 ================= */}

  <div className="ai-phase">

    <div className="ai-phase-title">
      <span>03</span>
      <div>
        <small>PHASE 3</small>
        <h3>Predictive Intelligence</h3>
      </div>
    </div>

    <div className="ai-feature-grid">

      <div className="ai-feature-card">
        <div className="feature-number">11</div>
        <div className="feature-icon">📊</div>
        <h4>Predictive Emergency Analytics</h4>
        <span className="feature-status feature-status-live">LIVE</span>
        <p>Analyze emergency patterns and predict future response demand.</p>
        <button className="feature-btn" onClick={() => navigate("/analytics")}>
          Open Analytics →
        </button>
      </div>

      <div className="ai-feature-card">
        <div className="feature-number">12</div>
        <div className="feature-icon">🔥</div>
        <h4>Disaster Hotspot Prediction</h4>
        <span className="feature-status feature-status-live">LIVE</span>
        <p>Identify areas with higher probability of future emergencies.</p>
        <button className="feature-btn" onClick={() => navigate("/analytics")}>
          View Hotspots →
        </button>
      </div>

      <div className="ai-feature-card">
        <div className="feature-number">13</div>
        <div className="feature-icon">🏥</div>
        <h4>Hospital Capacity Awareness</h4>
        <span className="feature-status feature-status-local">LOCAL</span>
        <p>Consider hospital availability when planning emergency response.</p>
        <button className="feature-btn" onClick={() => navigate("/hospitals")}>
          View Hospitals →
        </button>
      </div>

      <div className="ai-feature-card">
        <div className="feature-number">14</div>
        <div className="feature-icon">🧬</div>
        <h4>Emergency Digital Twin</h4>
        <span className="feature-status feature-status-beta">BETA</span>
        <p>Simulate emergency situations to understand possible outcomes.</p>
        <button className="feature-btn" onClick={() => navigate("/command-center")}>
          Open Twin →
        </button>
      </div>

    </div>
  </div>

  {/* ================= PHASE 4 ================= */}

  <div className="ai-phase">

    <div className="ai-phase-title">
      <span>04</span>
      <div>
        <small>PHASE 4</small>
        <h3>Government & Scale</h3>
      </div>
    </div>

    <div className="ai-feature-grid">

      <div className="ai-feature-card">
        <div className="feature-number">15</div>
        <div className="feature-icon">📡</div>
        <h4>Cross-Agency Interoperability</h4>
        <span className="feature-status feature-status-local">LOCAL</span>
        <p>Connect multiple government and emergency platforms.</p>
        <button className="feature-btn" onClick={() => navigate("/agencies")}>
          View Agencies →
        </button>
      </div>

      <div className="ai-feature-card">
        <div className="feature-number">16</div>
        <div className="feature-icon">🏛️</div>
        <h4>Authority Command Center</h4>
        <span className="feature-status feature-status-live">LIVE</span>
        <p>Provide authorities with a unified operational dashboard.</p>
        <button className="feature-btn" onClick={() => navigate("/command-center")}>
          Open Command Center →
        </button>
      </div>

      <div className="ai-feature-card">
        <div className="feature-number">17</div>
        <div className="feature-icon">👨‍👩‍👧</div>
        <h4>Family / Group SOS</h4>
        <span className="feature-status feature-status-live">LIVE</span>
        <p>Coordinate emergency requests for families and groups.</p>
        <button className="feature-btn" onClick={() => navigate("/groups")}>
          Manage Groups →
        </button>
      </div>

      <div className="ai-feature-card">
        <div className="feature-number">18</div>
        <div className="feature-icon">📦</div>
        <h4>Intelligent Resource Inventory</h4>
        <span className="feature-status feature-status-live">LIVE</span>
        <p>Track emergency resources, equipment and availability.</p>
        <button className="feature-btn" onClick={() => navigate("/inventory")}>
          Open Inventory →
        </button>
      </div>

      <div className="ai-feature-card">
        <div className="feature-number">19</div>
        <div className="feature-icon">📈</div>
        <h4>Post-Disaster Intelligence</h4>
        <span className="feature-status feature-status-live">LIVE</span>
        <p>Generate reports and insights after emergency operations.</p>
        <button className="feature-btn" onClick={() => navigate("/command-center")}>
          Generate Report →
        </button>
      </div>

    </div>
  </div>

  {/* ================= AI FLOW ================= */}

  <div className="ai-flow">

    <div>
      <span>01</span>
      <strong>Detect</strong>
      <small>Emergency reported</small>
    </div>

    <div className="flow-arrow">→</div>

    <div>
      <span>02</span>
      <strong>Understand</strong>
      <small>AI analyzes context</small>
    </div>

    <div className="flow-arrow">→</div>

    <div>
      <span>03</span>
      <strong>Decide</strong>
      <small>Best response selected</small>
    </div>

    <div className="flow-arrow">→</div>

    <div>
      <span>04</span>
      <strong>Respond</strong>
      <small>Teams take action</small>
    </div>

  </div>

</section>
        {/* =================================================
            FOOTER
        ================================================= */}

        <footer>

          <div className="footer-brand">

            <div className="brand-mark">
              R
            </div>

            <div>

              <strong>
                ResQLink
              </strong>

              <span>
                AI Emergency Response Network
              </span>

            </div>

          </div>

          <p>
            Faster decisions.
            Smarter response.
            Safer communities.
          </p>

          <span className="footer-status">
            ● AI SYSTEM ONLINE
          </span>

        </footer>

      </main>

      {/* =================================================
          EMERGENCY MODAL
      ================================================= */}

      {showEmergency && (

        <div
          className="emergency-overlay"
          onClick={
            closeEmergency
          }
        >

          <div
            className={`emergency-modal ${
              emergencyMode ===
              "report"
                ? "report-modal"
                : ""
            }`}
            onClick={(e) =>
              e.stopPropagation()
            }
          >

            {/* =========================
                CHOICE
            ========================= */}

            {emergencyMode ===
              "choice" && (

              <>

                <div className="emergency-modal-icon">
                  !
                </div>

                <div className="emergency-modal-tag">
                  EMERGENCY RESPONSE
                </div>

                <h2>
                  What kind of help do you need?
                </h2>

                <p>

                  Choose Quick Action for
                  immediate danger or submit
                  detailed information for
                  normal emergency response.

                </p>

                <div className="emergency-choice-grid">

                  <button
                    className="emergency-choice quick-choice"
                    onClick={() =>
                      setEmergencyMode(
                        "quick"
                      )
                    }
                  >

                    <span className="choice-icon">
                      !
                    </span>

                    <strong>
                      Serious Emergency
                    </strong>

                    <small>
                      Immediate danger
                      • Quick action
                    </small>

                    <span className="choice-arrow">
                      →
                    </span>

                  </button>

                  <button
                    className="emergency-choice report-choice"
                    onClick={() =>
                      setEmergencyMode(
                        "report"
                      )
                    }
                  >

                    <span className="choice-icon">
                      +
                    </span>

                    <strong>
                      Report Emergency
                    </strong>

                    <small>
                      Submit incident
                      details
                    </small>

                    <span className="choice-arrow">
                      →
                    </span>

                  </button>

                </div>

                <button
                  className="modal-back-btn"
                  onClick={
                    closeEmergency
                  }
                >
                  Cancel
                </button>

              </>
            )}

            {/* =========================
                QUICK SOS
            ========================= */}

            {emergencyMode ===
              "quick" && (

              <>

                <div className="emergency-modal-icon">
                  !
                </div>

                <div className="emergency-modal-tag">
                  CRITICAL EMERGENCY
                </div>

                <h2>
                  Activate Quick Action?
                </h2>

                <p>

                  This will immediately
                  create a{" "}
                  <strong>
                    Critical
                  </strong>{" "}
                  emergency request.

                </p>

                <div className="emergency-warning">

                  <span>
                    !
                  </span>

                  <div>

                    <strong>
                      Use only when immediate action is needed
                    </strong>

                    <small>

                      Life-threatening injury
                      trapped person major fire
                      severe flooding or another
                      critical situation.

                    </small>

                  </div>

                </div>

                <div className="emergency-modal-actions">

                  <button
                    className="cancel-btn"
                    onClick={() =>
                      setEmergencyMode(
                        "choice"
                      )
                    }
                    disabled={
                      isSubmitting
                    }
                  >
                    Back
                  </button>

                  <button
                    className="send-sos-btn"
                    onClick={
                      handleQuickAction
                    }
                    disabled={
                      isSubmitting
                    }
                  >

                    {isSubmitting
                      ? "Sending..."
                      : "Send SOS"}

                    <span>
                      →
                    </span>

                  </button>

                </div>

              </>
            )}

            {/* =========================
                REPORT
            ========================= */}

            {emergencyMode ===
              "report" && (

              <>

                <div className="report-modal-heading">

                  <div className="report-icon">
                    +
                  </div>

                  <div>

                    <div className="emergency-modal-tag">
                      REPORT EMERGENCY
                    </div>

                    <h2>
                      Tell us what happened
                    </h2>

                  </div>

                </div>

                <p>

                  Submit details so the
                  response network can
                  assess and coordinate help.

                </p>

                <form
                  className="report-form"
                  onSubmit={
                    handleReportSubmit
                  }
                >

                  <label>

                    Emergency type

                    <select
                      value={
                        reportForm.type
                      }
                      onChange={(e) =>
                        setReportForm({
                          ...reportForm,
                          type: e.target
                            .value,
                        })
                      }
                    >

                      <option>
                        Flood
                      </option>

                      <option>
                        Fire
                      </option>

                      <option>
                        Accident
                      </option>

                      <option>
                        Medical
                      </option>

                      <option>
                        Earthquake
                      </option>

                      <option>
                        Cyclone
                      </option>

                      <option>
                        Other
                      </option>

                    </select>

                  </label>

                  <label>

                    Severity

                    <select
                      value={
                        reportForm.severity
                      }
                      onChange={(e) =>
                        setReportForm({
                          ...reportForm,
                          severity:
                            e.target.value,
                        })
                      }
                    >

                      <option>
                        Low
                      </option>

                      <option>
                        Medium
                      </option>

                      <option>
                        High
                      </option>

                      <option>
                        Critical
                      </option>

                    </select>

                  </label>

                  <label>

                    Emergency location

                    <div
                      style={{
                        display:
                          "flex",
                        gap: "10px",
                      }}
                    >

                      <input
                        type="text"
                        value={
                          reportForm.location
                        }
                        onChange={(e) => {
                          setReportForm(
                            (prev) => ({
                              ...prev,
                              location:
                                e.target
                                  .value,
                            })
                          );

                          setUserLocation(
                            null
                          );
                        }}
                        placeholder="City, area or address"
                      />

                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await getCurrentLocation();
                          } catch (
                            error
                          ) {
                            alert(
                              error.message
                            );
                          }
                        }}
                        disabled={
                          locationLoading ||
                          isSubmitting
                        }
                        style={{
                          whiteSpace:
                            "nowrap",
                        }}
                      >

                        {locationLoading
                          ? "Locating..."
                          : "📍 My Location"}

                      </button>

                    </div>

                    {userLocation && (
                      <small>
                        ✓ Location captured
                      </small>
                    )}

                  </label>

                  <label>

                    People affected

                    <input
                      type="number"
                      min="1"
                      value={
                        reportForm.peopleCount
                      }
                      onChange={(e) =>
                        setReportForm({
                          ...reportForm,
                          peopleCount:
                            e.target.value,
                        })
                      }
                    />

                  </label>

                  <label
                    style={{
                      display:
                        "flex",
                      alignItems:
                        "center",
                      gap: "10px",
                    }}
                  >

                    <input
                      type="checkbox"
                      checked={
                        reportForm.medicalRequired
                      }
                      onChange={(e) =>
                        setReportForm({
                          ...reportForm,
                          medicalRequired:
                            e.target.checked,
                        })
                      }
                    />

                    Medical assistance required

                  </label>

                  <div
                    style={{
                      display:
                        "grid",
                      gridTemplateColumns:
                        "repeat(3,1fr)",
                      gap: "10px",
                    }}
                  >

                    <label>

                      Children

                      <input
                        type="number"
                        min="0"
                        value={
                          reportForm.children
                        }
                        onChange={(e) =>
                          setReportForm({
                            ...reportForm,
                            children:
                              e.target
                                .value,
                          })
                        }
                      />

                    </label>

                    <label>

                      Elderly

                      <input
                        type="number"
                        min="0"
                        value={
                          reportForm.elderly
                        }
                        onChange={(e) =>
                          setReportForm({
                            ...reportForm,
                            elderly:
                              e.target
                                .value,
                          })
                        }
                      />

                    </label>

                    <label>

                      Disabled

                      <input
                        type="number"
                        min="0"
                        value={
                          reportForm.disabled
                        }
                        onChange={(e) =>
                          setReportForm({
                            ...reportForm,
                            disabled:
                              e.target
                                .value,
                          })
                        }
                      />

                    </label>

                  </div>

                  <label>

                    Description

                    <textarea
                      value={
                        reportForm.description
                      }
                      onChange={(e) =>
                        setReportForm({
                          ...reportForm,
                          description:
                            e.target.value,
                        })
                      }
                      placeholder="Describe the emergency..."
                      rows="4"
                    />

                  </label>

                  <div className="emergency-modal-actions">

                    <button
                      type="button"
                      className="cancel-btn"
                      onClick={() =>
                        setEmergencyMode(
                          "choice"
                        )
                      }
                      disabled={
                        isSubmitting
                      }
                    >
                      Back
                    </button>

                    <button
                      type="submit"
                      className="report-submit-btn"
                      disabled={
                        isSubmitting
                      }
                    >

                      {isSubmitting
                        ? "Submitting..."
                        : "Report Emergency"}

                      <span>
                        →
                      </span>

                    </button>

                  </div>

                </form>

              </>
            )}

          </div>

        </div>
      )}

      {/* =================================================
          SOS STATUS
      ================================================= */}

      {emergencyStatus && emergencyStatus.offline && (

        <div className="emergency-status-overlay">

          <div className="emergency-status-card">

            <div className="status-danger-icon" style={{ background: "#f59e0b" }}>
              📡
            </div>

            <div className="status-tag" style={{ background: "#fef3c7", color: "#92400e" }}>
              SAVED LOCALLY — NOT YET SENT
            </div>

            <h2>
              Network unavailable
            </h2>

            <p className="status-description">
              {emergencyStatus.message}
            </p>

            <div
              style={{
                display: "flex",
                gap: "10px",
                marginTop: "20px",
                flexWrap: "wrap",
              }}
            >
              <button
                className="status-home-btn"
                onClick={() => setEmergencyStatus(null)}
              >
                Back to Home →
              </button>
            </div>

          </div>

        </div>
      )}

      {emergencyStatus && !emergencyStatus.offline && (

        <div className="emergency-status-overlay">

          <div className="emergency-status-card">

            <div className="status-danger-icon">
              !
            </div>

            <div className="status-tag">
              QUICK ACTION ACTIVATED
            </div>

            <h2>
              Emergency response has been notified
            </h2>

            <p className="status-description">

              Your emergency has been
              registered as a{" "}
              <strong>
                Critical Emergency.
              </strong>

            </p>

            <div className="status-details">

              <div>

                <span>
                  Emergency ID
                </span>

                <strong>
                  #{emergencyStatus.id}
                </strong>

              </div>

              <div>

                <span>
                  Location
                </span>

                <strong>
                  {
                    emergencyStatus.location
                  }
                </strong>

              </div>

              <div>

                <span>
                  Status
                </span>

                <strong className="active-status">
                  ● ACTIVE
                </strong>

              </div>

            </div>

            <div className="response-timeline">

              <div className="timeline-step active">

                <span>
                  ✓
                </span>

                <div>

                  <strong>
                    Emergency Registered
                  </strong>

                  <small>
                    Request received
                    successfully
                  </small>

                </div>

              </div>

              <div className="timeline-line" />

              <div className="timeline-step active">

                <span>
                  ✓
                </span>

                <div>

                  <strong>
                    AI Analysis Ready
                  </strong>

                  <small>
                    Response intelligence
                    can be activated
                  </small>

                </div>

              </div>

              <div className="timeline-line" />

              <div className="timeline-step pending">

                <span>
                  3
                </span>

                <div>

                  <strong>
                    Response Team Assignment
                  </strong>

                  <small>
                    AI can recommend
                    the best available team
                  </small>

                </div>

              </div>

            </div>

            <div
              style={{
                display:
                  "flex",
                gap: "10px",
                marginTop:
                  "20px",
                flexWrap:
                  "wrap",
              }}
            >

              <button
                className="primary-btn"
                onClick={() =>
                  getAIRecommendation(
                    emergencyStatus.id
                  )
                }
              >
                🎯 Find Best Team
              </button>

              <button
                className="status-home-btn"
                onClick={() =>
                  setEmergencyStatus(
                    null
                  )
                }
              >
                Back to Home →
              </button>

            </div>

          </div>

        </div>
      )}
      {/* =================================================
    FIXED AI CHATBOT BUTTON
================================================= */}
<div className="floating-ai-wrapper">
  <button
    className="floating-ai-button"
    onClick={openAssistant}
    aria-label="Open AI Emergency Assistant"
  >
    <span className="floating-ai-icon">🤖</span>

    <span className="floating-ai-text">
      <strong>AI Assistant</strong>
      <small>Need help?</small>
    </span>
  </button>
</div>

    </div>
  );
}

export default Home;
