import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import "./ops.css";

const API = "http://localhost:5000/api";

function Hospitals() {
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("resqlink_dark_mode") === "1");
  const [hospitals, setHospitals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/hospitals`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Unable to load hospitals");
      setHospitals(json.hospitals || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const statusBadge = (status) => {
    if (status === "Operational") return "badge-live";
    if (status === "Near Capacity") return "badge-medium";
    if (status === "Full") return "badge-critical";
    return "badge-local";
  };

  return (
    <div className={`ops-page ${darkMode ? "dark-mode" : ""}`}>
      <div className="ops-header">
        <div>
          <Link to="/">← Back to Dashboard</Link>
          <h1>🏥 Hospital Capacity</h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="ops-badge badge-local">LOCAL DATASET — no external hospital API connected</span>
          <button
            className="ops-theme-btn"
            onClick={() => {
              setDarkMode((prev) => {
                const next = !prev;
                localStorage.setItem("resqlink_dark_mode", next ? "1" : "0");
                return next;
              });
            }}
          >
            {darkMode ? "☀" : "☾"}
          </button>
        </div>
      </div>

      <div className="ops-body">
        {loading && <div className="ops-empty">Loading hospitals…</div>}

        {!loading && error && (
          <div className="ops-error">
            {error}
            <div style={{ marginTop: 12 }}>
              <button className="ops-btn" onClick={load}>Retry</button>
            </div>
          </div>
        )}

        {!loading && !error && hospitals.length === 0 && (
          <div className="ops-empty">No hospitals on record.</div>
        )}

        {!loading && !error && hospitals.length > 0 && (
          <div className="ops-grid">
            {hospitals.map((h) => (
              <div className="ops-card" key={h._id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div>
                    <strong>{h.name}</strong>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>{h.address || h.city}</div>
                  </div>
                  <span className={`ops-badge ${statusBadge(h.status)}`}>{h.status}</span>
                </div>

                <div className="ops-mini-grid">
                  <div>Beds: <strong>{h.availableBeds}/{h.totalBeds}</strong></div>
                  <div>ICU: <strong>{h.icuAvailable}/{h.icuBeds}</strong></div>
                  <div>Ambulances: <strong>{h.ambulancesAvailable}/{h.ambulancesTotal}</strong></div>
                  <div>Emergency Cap.: <strong>{h.emergencyCapacity}</strong></div>
                </div>

                {typeof h.distanceKm === "number" && (
                  <div style={{ marginTop: 10, fontSize: 12, color: "var(--muted)" }}>
                    ~{h.distanceKm} km away
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Hospitals;
