import { useEffect, useMemo, useState } from "react";
import {
  Circle,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./ResponseMap.css";

const API_URL = "http://localhost:5000/api/emergencies";
const SOS_API_URL = "http://localhost:5000/api/sos";
const RESCUE_API_URL = "http://localhost:5000/api/rescue-teams";
const GEOCODE_API_URL = "http://localhost:5000/api/emergencies/geocode";
const INDIA_CENTER = [22.5937, 78.9629];

const emergencyPulseStyle = `
@keyframes resqlinkCriticalPulse {
  0%, 100% { transform: scale(1); box-shadow: 0 0 0 5px rgba(239,68,68,.35), 0 4px 12px rgba(0,0,0,.28); }
  50% { transform: scale(1.12); box-shadow: 0 0 0 10px rgba(239,68,68,.12), 0 4px 14px rgba(0,0,0,.32); }
}`;

if (typeof document !== "undefined" && !document.getElementById("resqlink-emergency-style")) {
  const style = document.createElement("style");
  style.id = "resqlink-emergency-style";
  style.innerHTML = emergencyPulseStyle;
  document.head.appendChild(style);
}

const userIcon = L.divIcon({
  className: "",
  html: `<div style="width:18px;height:18px;background:#2563eb;border:4px solid white;border-radius:50%;box-shadow:0 0 0 5px rgba(37,99,235,.2)"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

function emergencyIcon(severity, priorityScore = 0) {
  const config = {
    Critical: { bg: "#ef4444", size: 34, font: 18, ring: 7 },
    High: { bg: "#f97316", size: 31, font: 17, ring: 6 },
    Medium: { bg: "#eab308", size: 28, font: 16, ring: 5 },
    Low: { bg: "#22c55e", size: 24, font: 15, ring: 4 },
  }[severity] || { bg: "#22c55e", size: 24, font: 15, ring: 4 };

  const pulse = severity === "Critical" || Number(priorityScore) >= 100;
  const total = config.size + config.ring * 2;

  return L.divIcon({
    className: "",
    html: `<div style="width:${config.size}px;height:${config.size}px;background:${config.bg};border:${config.ring}px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-size:${config.font}px;font-weight:800;box-shadow:0 0 0 ${Math.max(config.ring, 4)}px ${config.bg}55,0 4px 12px rgba(0,0,0,.28);${pulse ? "animation:resqlinkCriticalPulse 1.4s infinite;" : ""}">!</div>`,
    iconSize: [total, total],
    iconAnchor: [total / 2, total / 2],
  });
}

const hospitalIcon = L.divIcon({
  className: "",
  html: `<div style="width:24px;height:24px;background:#7c3aed;border:4px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-size:13px;box-shadow:0 0 0 5px rgba(124,58,237,.18)">✚</div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const shelterIcon = L.divIcon({
  className: "",
  html: `<div style="width:24px;height:24px;background:#0891b2;border:4px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-size:13px;box-shadow:0 0 0 5px rgba(8,145,178,.18)">⌂</div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const rescueIcon = L.divIcon({
  className: "",
  html: `<div style="width:30px;height:30px;background:#16a34a;border:4px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 0 0 5px rgba(22,163,74,.2)">🚑</div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

function MapController({ userLocation }) {
  const map = useMap();

  useEffect(() => {
    if (userLocation) map.setView(userLocation, 12);
  }, [userLocation, map]);

  return null;
}

function distanceKm(lat1, lon1, lat2, lon2) {
  const rad = (v) => (v * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(value) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value < 1 ? `${Math.round(value * 1000)} m` : `${value.toFixed(1)} km`;
}

function getEmergencyCoordinates(item) {
  const c = item?.location?.coordinates?.coordinates;
  if (!Array.isArray(c) || c.length !== 2) return null;
  const lon = Number(c[0]);
  const lat = Number(c[1]);
  return Number.isFinite(lat) && Number.isFinite(lon) ? [lat, lon] : null;
}

function getTeamCoordinates(team) {
  const c = team?.location?.coordinates?.coordinates;
  if (!Array.isArray(c) || c.length !== 2) return null;
  const lon = Number(c[0]);
  const lat = Number(c[1]);
  return Number.isFinite(lat) && Number.isFinite(lon) ? [lat, lon] : null;
}

// =========================================================
// FEATURE 9 — DYNAMIC SAFE-ROUTE ENGINE (local fallback)
// =========================================================
// There is no live routing/traffic API wired into this
// project, so this generates a deterministic, clearly-
// labelled LOCAL route between two points instead of a
// straight line — structured so a real routing provider
// (OSRM, Google Directions, Mapbox) can be dropped in here
// later by replacing buildLocalRoute() with an API call.

function seededOffset(seedStr, index) {
  // Deterministic pseudo-random in [-1, 1], stable per
  // route + waypoint so the path doesn't jitter on re-render.
  let h = 0;
  const s = `${seedStr}-${index}`;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return (h % 2000) / 1000 - 1; // -1..1
}

const ROUTE_MODES = {
  fastest: { label: "Fastest", color: "#2563eb", waypoints: 4, spread: 0.06, speedFactor: 1.35 },
  safest: { label: "Safest", color: "#16a34a", waypoints: 7, spread: 0.12, speedFactor: 0.85 },
  balanced: { label: "Balanced", color: "#f97316", waypoints: 5, spread: 0.08, speedFactor: 1.05 },
};

function buildLocalRoute(start, end, mode, seed) {
  if (!start || !end) return null;

  const config = ROUTE_MODES[mode] || ROUTE_MODES.balanced;
  const points = [start];

  for (let i = 1; i < config.waypoints; i++) {
    const t = i / config.waypoints;
    const baseLat = start[0] + (end[0] - start[0]) * t;
    const baseLon = start[1] + (end[1] - start[1]) * t;

    // Perpendicular offset so the path isn't a straight
    // line — "safest" routes wander more (avoiding a
    // straight line through risk zones), "fastest" stays
    // tighter to the direct line.
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const len = Math.hypot(dx, dy) || 1;
    const perpLat = -dy / len;
    const perpLon = dx / len;

    const wobble = seededOffset(seed, i) * config.spread * (len || 0.05);

    points.push([
      baseLat + perpLat * wobble,
      baseLon + perpLon * wobble,
    ]);
  }

  points.push(end);

  let km = 0;
  for (let i = 1; i < points.length; i++) {
    km += distanceKm(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1]);
  }

  const avgSpeedKmh = 30 * config.speedFactor;
  const etaMinutes = Math.max(2, Math.round((km / avgSpeedKmh) * 60));

  return {
    points,
    distanceKm: Math.round(km * 10) / 10,
    etaMinutes,
    mode,
    color: config.color,
    label: config.label,
  };
}

function ResourcePopup({ resource, userLocation, onDirections, onCall }) {
  const d = userLocation
    ? distanceKm(userLocation[0], userLocation[1], resource.latitude, resource.longitude)
    : null;

  return (
    <div style={{ minWidth: 230 }}>
      <h3 style={{ marginTop: 0 }}>
        {resource.type === "Hospital" ? "🏥 Hospital / Clinic" : "🛟 Emergency Shelter"}
      </h3>
      <p><strong>Name:</strong> {resource.name}</p>
      {resource.address && <p><strong>Address:</strong> {resource.address}</p>}
      {resource.phone && <p><strong>Phone:</strong> {resource.phone}</p>}
      <p style={{ color: "#2563eb", fontWeight: 700 }}>
        📍 {d == null ? "India resource" : `${formatDistance(d)} from you`}
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={() => onDirections(resource)} style={buttonStyle("#2563eb")}>🧭 Directions</button>
        {resource.phone ? (
          <button onClick={() => onCall(resource)} style={buttonStyle("#16a34a")}>📞 Call</button>
        ) : null}
      </div>
    </div>
  );
}

const buttonStyle = (background) => ({
  padding: "9px 12px",
  border: "none",
  borderRadius: 8,
  background,
  color: "white",
  fontWeight: 700,
  cursor: "pointer",
});

export default function ResponseMap() {
  const [emergencies, setEmergencies] = useState([]);
  const [rescueTeams, setRescueTeams] = useState([]);
  const [resources, setResources] = useState([]);
  const [userLocation, setUserLocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [locationLoading, setLocationLoading] = useState(false);
  const [resourceLoading, setResourceLoading] = useState(false);
  const [error, setError] = useState("");
  const [resourceError, setResourceError] = useState("");
  const [activeFilter, setActiveFilter] = useState("All");
  const [searchText, setSearchText] = useState("");
  const [routeMode, setRouteMode] = useState("balanced");
  const [routeEnabled, setRouteEnabled] = useState(false);

  // Load BOTH normal emergency reports and Quick SOS requests.
  // They are stored in different MongoDB collections/routes.
  const fetchEmergencies = async () => {
    try {
      const [emergencyResult, sosResult] = await Promise.allSettled([
        fetch(API_URL).then(async (response) => {
          const data = await response.json();
          if (!response.ok || !data.success) {
            throw new Error(data.message || "Unable to load emergencies.");
          }
          return Array.isArray(data.emergencies) ? data.emergencies : [];
        }),
        fetch(SOS_API_URL).then(async (response) => {
          const data = await response.json();
          if (!response.ok || !data.success) {
            throw new Error(data.message || "Unable to load SOS requests.");
          }
          return Array.isArray(data.sosRequests) ? data.sosRequests : [];
        }),
      ]);

      const normalEmergencies =
        emergencyResult.status === "fulfilled" ? emergencyResult.value : [];

      const sosRequests =
        sosResult.status === "fulfilled" ? sosResult.value : [];

      // SOS uses statuses such as Pending/Assigned/Dispatched, while the
      // emergency collection uses Active. Normalize active SOS records to
      // Active so the existing map/statistics logic treats them correctly.
      const activeSOSStatuses = new Set([
        "pending",
        "assigned",
        "dispatched",
        "on the way",
        "reached",
        "rescuing",
      ]);

      const normalizedSOS = sosRequests.map((sos) => {
        const rawStatus = String(sos.status || "Pending").toLowerCase();
        const isActiveSOS = activeSOSStatuses.has(rawStatus);

        return {
          ...sos,
          _id: `sos-${sos._id || Math.random()}`,
          type: sos.disasterType || "Emergency",
          status: isActiveSOS ? "Active" : sos.status || "Completed",
          source: "SOS",
          originalSOSStatus: sos.status || "Pending",
        };
      });

      const normalizedEmergencies = normalEmergencies.map((item) => ({
        ...item,
        source: "Emergency",
      }));

      // One list drives the cards, filters and map markers.
      setEmergencies([...normalizedEmergencies, ...normalizedSOS]);

      if (emergencyResult.status === "rejected" && sosResult.status === "rejected") {
        throw new Error("Both emergency and SOS services are unavailable.");
      }

      setError("");

      if (emergencyResult.status === "rejected") {
        console.warn("Emergency API unavailable:", emergencyResult.reason);
      }
      if (sosResult.status === "rejected") {
        console.warn("SOS API unavailable:", sosResult.reason);
      }
    } catch (err) {
      console.error("Fetch Emergency/SOS Error:", err);
      setError("Unable to load emergency data. Check that the backend is running on port 5000.");
      setEmergencies([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchRescueTeams = async () => {
    try {
      const response = await fetch(RESCUE_API_URL);
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "Unable to load rescue teams.");
      setRescueTeams(Array.isArray(data.teams) ? data.teams : []);
    } catch (err) {
      console.error("Fetch Rescue Teams Error:", err);
    }
  };

  const fetchNearbyResources = async (location) => {
    if (!location) {
      setResources([]);
      return;
    }

    const [lat, lon] = location;
    setResourceLoading(true);
    setResourceError("");

    const query = `
      [out:json][timeout:35];
      (
        nwr(around:10000,${lat},${lon})[amenity=hospital];
        nwr(around:10000,${lat},${lon})[amenity=clinic];
        nwr(around:10000,${lat},${lon})[amenity=shelter];
        nwr(around:10000,${lat},${lon})[social_facility=shelter];
        nwr(around:10000,${lat},${lon})[social_facility=homeless_shelter];
        nwr(around:10000,${lat},${lon})[emergency=shelter];
      );
      out center tags;
    `;

    const endpoints = [
      "https://overpass-api.de/api/interpreter",
      "https://overpass.kumi.systems/api/interpreter",
    ];

    try {
      let data = null;
      let lastError = null;

      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=UTF-8" },
            body: query,
          });
          if (!response.ok) throw new Error(`Overpass ${response.status}`);
          data = await response.json();
          break;
        } catch (err) {
          lastError = err;
        }
      }

      if (!data) throw lastError || new Error("Resource service unavailable");

      const parsed = (data.elements || [])
        .map((item) => {
          const itemLat = Number(item.lat ?? item.center?.lat);
          const itemLon = Number(item.lon ?? item.center?.lon);
          if (!Number.isFinite(itemLat) || !Number.isFinite(itemLon)) return null;

          const tags = item.tags || {};
          const isShelter =
            tags.amenity === "shelter" ||
            tags.social_facility === "shelter" ||
            tags.social_facility === "homeless_shelter" ||
            tags.emergency === "shelter";

          return {
            id: `${item.type}-${item.id}`,
            name: tags.name || (isShelter ? "Emergency Shelter" : "Hospital / Clinic"),
            type: isShelter ? "Shelter" : "Hospital",
            latitude: itemLat,
            longitude: itemLon,
            address:
              tags["addr:full"] ||
              [tags["addr:housenumber"], tags["addr:street"], tags["addr:city"], tags["addr:state"]]
                .filter(Boolean)
                .join(", "),
            phone: tags.phone || tags["contact:phone"] || "",
          };
        })
        .filter(Boolean);

      setResources(parsed);
      if (!parsed.length) setResourceError("No mapped hospital or shelter was found within 10 km.");
    } catch (err) {
      console.error("Nearby Resources Error:", err);
      setResources([]);
      setResourceError("Nearby hospital and shelter data is temporarily unavailable.");
    } finally {
      setResourceLoading(false);
    }
  };

  useEffect(() => {
    fetchEmergencies();
    fetchRescueTeams();

    const interval = setInterval(() => {
      fetchEmergencies();
      fetchRescueTeams();
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (userLocation) fetchNearbyResources(userLocation);
  }, [userLocation]);

  useEffect(() => {
    const query = searchText.trim();
    if (query.length < 3) return undefined;

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`${GEOCODE_API_URL}?q=${encodeURIComponent(query)}`);
        if (!response.ok) return;
        const data = await response.json();
        const lat = Number(data?.location?.latitude);
        const lon = Number(data?.location?.longitude);
        if (data?.success && Number.isFinite(lat) && Number.isFinite(lon)) {
          setUserLocation([lat, lon]);
        }
      } catch (err) {
        console.error("Search Location Error:", err);
      }
    }, 700);

    return () => clearTimeout(timer);
  }, [searchText]);

  const getMyLocation = () => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by this browser.");
      return;
    }

    setLocationLoading(true);
    setError("");

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const location = [coords.latitude, coords.longitude];
        setUserLocation(location);
        setLocationLoading(false);
      },
      (err) => {
        console.error("Location Error:", err);
        setLocationLoading(false);
        setError("Location permission was denied or your location could not be detected.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const activeEmergencies = useMemo(
    () => emergencies.filter((item) => String(item.status || "").toLowerCase() === "active"),
    [emergencies]
  );

  const critical = activeEmergencies.filter((x) => x.severity === "Critical");
  const high = activeEmergencies.filter((x) => x.severity === "High");
  const medium = activeEmergencies.filter((x) => x.severity === "Medium");
  const low = activeEmergencies.filter((x) => x.severity === "Low");

  // MongoDB normally provides createdAt through timestamps.
  // The ObjectId timestamp is used as a safe fallback for older records.
  const getItemCreatedTime = (item) => {
    if (item?.createdAt) {
      const time = new Date(item.createdAt).getTime();
      if (Number.isFinite(time)) return time;
    }

    const id = String(item?._id || "").replace(/^sos-/, "");
    if (/^[a-fA-F0-9]{24}$/.test(id)) {
      const seconds = parseInt(id.slice(0, 8), 16);
      const time = seconds * 1000;
      if (Number.isFinite(time)) return time;
    }

    return null;
  };

  const newAlerts = emergencies.filter((item) => {
    const createdTime = getItemCreatedTime(item);
    if (createdTime == null) return false;

    const age = Date.now() - createdTime;
    return age >= 0 && age < 24 * 60 * 60 * 1000;
  });

  const normalizedSearch = searchText.trim().toLowerCase();
  const matches = (value) => String(value || "").toLowerCase().includes(normalizedSearch);

  const filteredEmergencies = activeEmergencies.filter((item) => {
    if (["Hospitals", "Shelters", "Rescue Teams"].includes(activeFilter)) return false;
    const severityOk = activeFilter === "All" || item.severity === activeFilter;
    const searchOk =
      !normalizedSearch ||
      matches(item.type) ||
      matches(item.severity) ||
      matches(item.location?.address) ||
      matches(item.description);
    return severityOk && searchOk;
  });

  const filteredResources = resources.filter((item) => {
    if (activeFilter === "Rescue Teams") return false;
    const typeOk =
      activeFilter === "All" ||
      (activeFilter === "Hospitals" && item.type === "Hospital") ||
      (activeFilter === "Shelters" && item.type === "Shelter");
    const searchOk = !normalizedSearch || matches(item.name) || matches(item.address) || matches(item.type);
    return typeOk && searchOk;
  });

  const filteredRescueTeams = rescueTeams.filter((team) => {
    if (activeFilter !== "All" && activeFilter !== "Rescue Teams") return false;
    return (
      !normalizedSearch ||
      matches(team.teamName) ||
      matches(team.teamCode) ||
      matches(team.location?.city) ||
      matches(team.location?.state) ||
      matches(team.availability) ||
      matches(team.status)
    );
  });

  // Feature 9: pick the highest-priority active emergency
  // and its nearest available rescue team as the default
  // route pair (no manual selection UI needed to see it work).
  const activeRoute = useMemo(() => {
    if (!routeEnabled) return null;

    const withCoords = filteredEmergencies
      .map((e) => ({ e, pos: getEmergencyCoordinates(e) }))
      .filter((x) => x.pos);

    if (!withCoords.length) return null;

    const target = [...withCoords].sort(
      (a, b) => (Number(b.e.priorityScore) || 0) - (Number(a.e.priorityScore) || 0)
    )[0];

    const teamsWithCoords = filteredRescueTeams
      .map((t) => ({ t, pos: getTeamCoordinates(t) }))
      .filter((x) => x.pos);

    if (!teamsWithCoords.length) return null;

    const nearestTeam = teamsWithCoords
      .map((x) => ({
        ...x,
        dist: distanceKm(target.pos[0], target.pos[1], x.pos[0], x.pos[1]),
      }))
      .sort((a, b) => a.dist - b.dist)[0];

    const seed = `${target.e._id || target.pos.join(",")}-${nearestTeam.t._id || nearestTeam.pos.join(",")}`;
    const route = buildLocalRoute(nearestTeam.pos, target.pos, routeMode, seed);

    if (!route) return null;

    return {
      ...route,
      teamName: nearestTeam.t.teamName || "Rescue Team",
      emergencyType: target.e.type || "Emergency",
    };
  }, [routeEnabled, routeMode, filteredEmergencies, filteredRescueTeams]);

  const nearestHospital = userLocation
    ? resources
        .filter((x) => x.type === "Hospital")
        .map((x) => ({ ...x, distance: distanceKm(userLocation[0], userLocation[1], x.latitude, x.longitude) }))
        .filter((x) => x.distance <= 10)
        .sort((a, b) => a.distance - b.distance)[0] || null
    : null;

  const nearestShelter = userLocation
    ? resources
        .filter((x) => x.type === "Shelter")
        .map((x) => ({ ...x, distance: distanceKm(userLocation[0], userLocation[1], x.latitude, x.longitude) }))
        .filter((x) => x.distance <= 10)
        .sort((a, b) => a.distance - b.distance)[0] || null
    : null;

  const openDirections = (resource) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${resource.latitude},${resource.longitude}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const callResource = (resource) => {
    if (resource?.phone) window.location.href = `tel:${resource.phone}`;
  };

  const filterNames = ["All", "Critical", "High", "Medium", "Low", "Hospitals", "Shelters", "Rescue Teams"];

  return (
    <div style={pageStyle}>
      <header style={containerStyle}>
        <div style={headerRowStyle}>
          <div>
            <div style={eyebrowStyle}>LIVE RESPONSE NETWORK</div>
            <h1 style={{ margin: 0, fontSize: 42 }}>India Response Map</h1>
            <p style={{ color: "#68736e", marginTop: 10 }}>Monitor active emergencies across India in real time.</p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={getMyLocation} disabled={locationLoading} style={buttonStyle("#101915")}>
              {locationLoading ? "Finding..." : "📍 Use My Location"}
            </button>
            <button
              onClick={() => {
                setLoading(true);
                fetchEmergencies();
                fetchRescueTeams();
                if (userLocation) fetchNearbyResources(userLocation);
              }}
              style={{ ...buttonStyle("white"), color: "#101915", border: "1px solid #d8dfdc" }}
            >
              🔄 Refresh
            </button>
          </div>
        </div>
      </header>

      <section style={statsGridStyle}>
        <StatCard value={activeEmergencies.length} title="Active incidents" subtitle="Currently monitored" />
        <StatCard value={critical.length} title="🔴 Critical" subtitle="Immediate attention" color="#ef4444" />
        <StatCard value={high.length} title="🟠 High" subtitle="Requires response" color="#f97316" />
        <StatCard value={medium.length} title="🟡 Medium" subtitle="Monitor situation" color="#eab308" />
        <StatCard value={low.length} title="🟢 Low" subtitle="Low priority" color="#22c55e" />
        <StatCard value={newAlerts.length} title="New alerts" subtitle="Last 24 hours" />
        <StatCard value={resources.length} title="Hospitals & shelters" subtitle="Nearby OSM data" color="#7c3aed" />
      </section>

      <div style={containerStyle}>
        <div style={rescueBarStyle}>
          <div>
            <strong style={{ fontSize: 24, color: "#16a34a" }}>🚑 {rescueTeams.length}</strong>
            <div style={{ fontWeight: 700, color: "#166534", marginTop: 4 }}>Rescue teams across India</div>
          </div>
          <div style={{ color: "#15803d", fontWeight: 700 }}>
            🟢 {rescueTeams.filter((team) => team.availability === "Available").length} Available
          </div>
        </div>
      </div>

      {activeEmergencies.length > 0 && (
        <div style={containerStyle}>
          <div style={alertBarStyle}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#c2410c", letterSpacing: 1.5 }}>ACTIVE ALERT</div>
              <div style={{ fontSize: 20, fontWeight: 700, marginTop: 5 }}>
                {activeEmergencies.length} active emergency area{activeEmergencies.length !== 1 ? "s" : ""} across India
              </div>
            </div>
            <div style={{ color: "#16a34a", fontWeight: 700 }}>● LIVE</div>
          </div>
        </div>
      )}

      <section style={containerStyle}>
        <div style={filterBoxStyle}>
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search emergency, city, hospital or shelter..."
            style={inputStyle}
          />
          {filterNames.map((filter) => {
            const selected = activeFilter === filter;
            const color =
              { Critical: "#ef4444", High: "#f97316", Medium: "#eab308", Low: "#22c55e", Hospitals: "#7c3aed", Shelters: "#0891b2", "Rescue Teams": "#16a34a" }[filter] || "#101915";
            return (
              <button key={filter} onClick={() => setActiveFilter(filter)} style={{ ...filterButtonStyle, ...(selected ? { borderColor: color, color, background: `${color}15` } : {}) }}>
                {filter === "Critical" && "🔴 "}
                {filter === "High" && "🟠 "}
                {filter === "Medium" && "🟡 "}
                {filter === "Low" && "🟢 "}
                {filter === "Hospitals" && "🟣 "}
                {filter === "Shelters" && "🔷 "}
                {filter === "Rescue Teams" && "🚑 "}
                {filter}
              </button>
            );
          })}
          <button onClick={() => { setActiveFilter("All"); setSearchText(""); }} style={buttonStyle("#101915")}>Clear</button>
        </div>
        <div style={{ marginTop: 8, color: "#68736e", fontSize: 13 }}>
          Showing {filteredEmergencies.length} emergencies, {filteredResources.length} resources and {filteredRescueTeams.length} rescue teams.
        </div>

        <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={() => setRouteEnabled((v) => !v)}
            style={buttonStyle(routeEnabled ? "#16a34a" : "#101915")}
          >
            {routeEnabled ? "🗺️ Route: ON" : "🗺️ Show Safe Route"}
          </button>

          {routeEnabled && (
            <>
              {Object.entries(ROUTE_MODES).map(([key, cfg]) => (
                <button
                  key={key}
                  onClick={() => setRouteMode(key)}
                  style={{
                    ...buttonStyle(routeMode === key ? cfg.color : "#e5e9e7"),
                    color: routeMode === key ? "white" : "#374151",
                  }}
                >
                  {cfg.label}
                </button>
              ))}

              {activeRoute ? (
                <span style={{ fontSize: 13, color: "#374151" }}>
                  <strong>{activeRoute.teamName}</strong> → {activeRoute.emergencyType}:{" "}
                  {activeRoute.distanceKm} km · ETA {activeRoute.etaMinutes} min
                  <em style={{ marginLeft: 6, opacity: 0.6 }}>(local route model — no live traffic API)</em>
                </span>
              ) : (
                <span style={{ fontSize: 13, color: "#9ca3af" }}>
                  No active emergency + team pair with coordinates to route between yet.
                </span>
              )}
            </>
          )}
        </div>
      </section>

      <section style={containerStyle}>
        <div style={{ height: 650, borderRadius: 20, overflow: "hidden", border: "1px solid #dce2df", boxShadow: "0 12px 35px rgba(0,0,0,.08)" }}>
          <MapContainer center={INDIA_CENTER} zoom={5} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
            <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <MapController userLocation={userLocation} />

            {activeRoute && (
              <Polyline
                positions={activeRoute.points}
                pathOptions={{ color: activeRoute.color, weight: 5, opacity: 0.8, dashArray: routeMode === "safest" ? "1 8" : undefined }}
              />
            )}

            {userLocation && (
              <>
                <Marker position={userLocation} icon={userIcon}>
                  <Popup><strong>📍 Your Location</strong></Popup>
                </Marker>
                <Circle center={userLocation} radius={5000} pathOptions={{ color: "#2563eb", fillColor: "#2563eb", fillOpacity: 0.08, weight: 2 }} />
              </>
            )}

            {filteredResources.map((resource) => (
              <Marker key={resource.id} position={[resource.latitude, resource.longitude]} icon={resource.type === "Hospital" ? hospitalIcon : shelterIcon}>
                <Popup>
                  <ResourcePopup resource={resource} userLocation={userLocation} onDirections={openDirections} onCall={callResource} />
                </Popup>
              </Marker>
            ))}

            {filteredRescueTeams.map((team) => {
              const position = getTeamCoordinates(team);
              if (!position) return null;
              return (
                <Marker key={team._id || team.teamCode || team.teamName} position={position} icon={rescueIcon}>
                  <Popup>
                    <div style={{ minWidth: 240 }}>
                      <h3 style={{ marginTop: 0, color: "#15803d" }}>🚑 {team.teamName || "Rescue Team"}</h3>
                      <p><strong>Team Code:</strong> {team.teamCode || "N/A"}</p>
                      <p><strong>📍 Location:</strong> {team.location?.city || ""}{team.location?.state ? `, ${team.location.state}` : ""}</p>
                      <p><strong>👥 Members:</strong> {team.members ?? "N/A"}</p>
                      <p><strong>📞 Phone:</strong> {team.phone || "N/A"}</p>
                      <p><strong>Availability:</strong> <b style={{ color: team.availability === "Available" ? "#16a34a" : "#dc2626" }}>{team.availability || "Unknown"}</b></p>
                      <p><strong>Status:</strong> {team.status || "Available"}</p>
                      {Array.isArray(team.skills) && team.skills.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                          {team.skills.map((skill, index) => <span key={`${skill}-${index}`} style={{ background: "#dcfce7", color: "#166534", padding: "5px 8px", borderRadius: 6, fontSize: 12 }}>{skill}</span>)}
                        </div>
                      )}
                      <button onClick={() => openDirections({ latitude: position[0], longitude: position[1] })} style={{ ...buttonStyle("#16a34a"), width: "100%", marginTop: 12 }}>🧭 Get Directions</button>
                    </div>
                  </Popup>
                </Marker>
              );
            })}

            {filteredEmergencies.map((emergency) => {
              const position = getEmergencyCoordinates(emergency);
              if (!position) return null;
              const distance = userLocation ? distanceKm(userLocation[0], userLocation[1], position[0], position[1]) : null;
              return (
                <Marker key={emergency._id || `${position[0]}-${position[1]}`} position={position} icon={emergencyIcon(emergency.severity, emergency.priorityScore)}>
                  <Popup>
                    <div style={{ minWidth: 250 }}>
                      <h3 style={{ marginTop: 0 }}>🚨 Emergency</h3>
                      <p><strong>Type:</strong> {emergency.type || "Unknown"}</p>
                      <p><strong>Severity:</strong> <b style={{ color: emergency.severity === "Critical" ? "#ef4444" : emergency.severity === "High" ? "#f97316" : emergency.severity === "Medium" ? "#eab308" : "#22c55e" }}>{emergency.severity || "Unknown"}</b></p>
                      <p><strong>Priority:</strong> <b>{Number(emergency.priorityScore) || 0}/100</b></p>
                      <p><strong>Location:</strong> {emergency.location?.address || "Unknown"}</p>
                      <p><strong>Status:</strong> <b style={{ color: "#16a34a" }}>● {emergency.status || "Active"}</b></p>
                      {distance != null && <p style={{ color: "#2563eb", fontWeight: 700 }}>📍 Distance from you: {formatDistance(distance)}</p>}
                      <p><strong>Description:</strong> {emergency.description || "No description available."}</p>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
                        <button onClick={() => openDirections({ latitude: position[0], longitude: position[1] })} style={{ ...buttonStyle("#2563eb"), flex: 1 }}>🧭 Directions</button>
                        <button onClick={() => { window.location.href = "tel:112"; }} style={{ ...buttonStyle("#dc2626"), flex: 1 }}>📞 Call 112</button>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        </div>
      </section>

      <section style={containerStyle}>
        <div style={panelStyle}>
          <div style={headerRowStyle}>
            <div>
              <div style={eyebrowStyle}>NEAREST HELP</div>
              <h2 style={{ margin: "5px 0 0", fontSize: 24 }}>Help closest to you</h2>
            </div>
            <span style={{ color: "#68736e", fontSize: 13 }}>{userLocation ? "Based on your selected location" : "Use My Location or search a city"}</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 14 }}>
            <NearestCard title="🏥 NEAREST HOSPITAL" color="#7c3aed" background="#faf7ff" border="#ddd6fe" loading={resourceLoading} item={nearestHospital} empty="No hospital found within 10 km." onDirections={openDirections} onCall={callResource} userLocation={userLocation} />
            <NearestCard title="🛟 NEAREST SHELTER" color="#0891b2" background="#f0fbfd" border="#a5f3fc" loading={resourceLoading} item={nearestShelter} empty="No shelter found within 10 km." onDirections={openDirections} onCall={callResource} userLocation={userLocation} />
          </div>
        </div>
      </section>

      <section style={containerStyle}>
        <div style={panelStyle}>
          <strong>Nearby response resources</strong>
          <div style={{ color: "#68736e", fontSize: 13, marginTop: 4 }}>
            {userLocation ? "Showing mapped hospitals and shelters within 10 km of your selected location." : "Use My Location to find nearby hospitals and shelters."}
          </div>
          {resourceLoading && <div style={{ color: "#7c3aed", fontWeight: 600, marginTop: 8 }}>🔎 Finding nearby help...</div>}
          {resourceError && <div style={{ color: "#b42318", fontSize: 13, marginTop: 8 }}>{resourceError}</div>}
        </div>
      </section>

      <section style={containerStyle}>
        <div style={{ ...panelStyle, display: "flex", gap: 25, flexWrap: "wrap", color: "#68736e", fontSize: 14 }}>
          <span>🔴 Critical</span><span>🟠 High</span><span>🟡 Medium</span><span>🟢 Low</span><span>🔵 Your location</span><span>🟣 Hospital / Clinic</span><span>🔷 Emergency Shelter</span><span>🚑 Rescue Team</span><span>🚨 Click marker for details</span>
        </div>
      </section>

      {loading && <div style={{ textAlign: "center", margin: 15, color: "#68736e" }}>Loading emergency data...</div>}
      {error && <div style={{ ...containerStyle, color: "#b42318" }}>{error}</div>}
    </div>
  );
}

function StatCard({ value, title, subtitle, color = "#17201c" }) {
  return (
    <div style={{ ...panelStyle, minHeight: 105 }}>
      <div style={{ fontSize: 34, fontWeight: 700, color }}>{String(value).padStart(2, "0")}</div>
      <div style={{ fontWeight: 700, marginTop: 5, color }}>{title}</div>
      <div style={{ color: "#7b8580", fontSize: 13, marginTop: 5 }}>{subtitle}</div>
    </div>
  );
}

function NearestCard({ title, color, background, border, loading, item, empty, onDirections, onCall, userLocation }) {
  return (
    <div style={{ padding: 18, borderRadius: 14, background, border: `1px solid ${border}` }}>
      <div style={{ color, fontWeight: 800, fontSize: 13, marginBottom: 8 }}>{title}</div>
      {!userLocation ? (
        <p style={{ margin: 0, color: "#68736e" }}>📍 Select a location to find nearby help.</p>
      ) : loading ? (
        <p style={{ margin: 0, color: "#68736e" }}>🔎 Finding nearby help...</p>
      ) : item ? (
        <>
          <h3 style={{ margin: "0 0 6px", fontSize: 18 }}>{item.name}</h3>
          {item.address && <p style={{ margin: "5px 0", color: "#68736e", fontSize: 13 }}>{item.address}</p>}
          <p style={{ margin: "10px 0", color: "#2563eb", fontWeight: 800 }}>📍 {formatDistance(item.distance)} from you</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => onDirections(item)} style={buttonStyle("#2563eb")}>🧭 Directions</button>
            {item.phone && <button onClick={() => onCall(item)} style={buttonStyle("#16a34a")}>📞 Call</button>}
          </div>
        </>
      ) : (
        <p style={{ margin: 0, color: "#68736e" }}>{empty}</p>
      )}
    </div>
  );
}

const pageStyle = { minHeight: "100vh", background: "#f5f7f6", fontFamily: "Arial, sans-serif", color: "#17201c", paddingBottom: 50 };
const containerStyle = { maxWidth: 1400, margin: "18px auto", padding: "0 30px" };
const headerRowStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20, flexWrap: "wrap" };
const eyebrowStyle = { color: "#e05235", fontSize: 12, fontWeight: 800, letterSpacing: 2, marginBottom: 8 };
const statsGridStyle = { ...containerStyle, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 15 };
const panelStyle = { background: "white", padding: 22, borderRadius: 15, border: "1px solid #e2e7e4", boxShadow: "0 8px 25px rgba(0,0,0,.04)" };
const rescueBarStyle = { background: "#f0fdf4", padding: "18px 25px", borderRadius: 15, border: "1px solid #bbf7d0", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 15, flexWrap: "wrap" };
const alertBarStyle = { ...panelStyle, background: "#fff7ed", borderColor: "#fed7aa", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20, flexWrap: "wrap" };
const filterBoxStyle = { ...panelStyle, padding: 16, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" };
const inputStyle = { flex: "1 1 260px", minWidth: 220, boxSizing: "border-box", padding: "12px 14px", border: "1px solid #d8dfdc", borderRadius: 10, outline: "none", fontSize: 14 };
const filterButtonStyle = { padding: "10px 14px", borderRadius: 9, border: "1px solid #d8dfdc", background: "white", color: "#53605a", fontWeight: 700, cursor: "pointer" };