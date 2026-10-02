import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import "./ops.css";

const API = "http://localhost:5000/api";

function Agencies() {
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("resqlink_dark_mode") === "1");
  const [agencies, setAgencies] = useState([]);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/agencies`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Unable to load agencies");
      setAgencies(json.agencies || []);
      setNote(json.note || "");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const icon = { Police: "🚓", Fire: "🚒", Medical: "🚑", "Disaster Management": "🛰️", "Municipal Authority": "🏛️" };

  return (
    <div className={`ops-page ${darkMode ? "dark-mode" : ""}`}>
      <div className="ops-header">
        <div>
          <Link to="/">← Back to Dashboard</Link>
          <h1>📡 Cross-Agency Interoperability</h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="ops-badge badge-simulation">SIMULATION — no external government APIs connected</span>
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
        {loading && <div className="ops-empty">Loading agencies…</div>}

        {!loading && error && (
          <div className="ops-error">
            {error}
            <div style={{ marginTop: 12 }}>
              <button className="ops-btn" onClick={load}>Retry</button>
            </div>
          </div>
        )}

        {!loading && !error && (
          <>
            {note && (
              <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 20 }}>ℹ️ {note}</p>
            )}
            <div className="ops-grid">
              {agencies.map((a) => (
                <div className="ops-card" key={a._id}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                    <div>
                      <span style={{ fontSize: 20 }}>{icon[a.type] || "🏢"}</span>{" "}
                      <strong>{a.name}</strong>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>{a.jurisdiction}</div>
                    </div>
                    <span className={`ops-badge ${a.status === "Online" ? "badge-live" : "badge-critical"}`}>
                      {a.status}
                    </span>
                  </div>
                  <div className="ops-mini-grid" style={{ marginTop: 12 }}>
                    <div><strong>{a.activeIncidents}</strong><br /><small style={{ color: "var(--muted)" }}>Incidents</small></div>
                    <div><strong>{a.availableTeams}</strong><br /><small style={{ color: "var(--muted)" }}>Teams</small></div>
                    <div><strong>{a.availableResources}</strong><br /><small style={{ color: "var(--muted)" }}>Resources</small></div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default Agencies;
