import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import "./ops.css";

const API = "http://localhost:5000/api";

function Analytics() {
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("resqlink_dark_mode") === "1");
  const [data, setData] = useState(null);
  const [hotspots, setHotspots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [aRes, hRes] = await Promise.allSettled([
        fetch(`${API}/analytics`),
        fetch(`${API}/analytics/hotspots`),
      ]);

      if (aRes.status === "fulfilled" && aRes.value.ok) {
        const json = await aRes.value.json();
        setData(json.analytics);
      } else {
        throw new Error("Unable to load analytics");
      }

      if (hRes.status === "fulfilled" && hRes.value.ok) {
        const json = await hRes.value.json();
        setHotspots(json.hotspots || []);
      }
    } catch (e) {
      setError(e.message || "Unable to load analytics.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const maxTrend = data?.trend?.length ? Math.max(1, ...data.trend.map((t) => t.count)) : 1;

  return (
    <div className={`ops-page ${darkMode ? "dark-mode" : ""}`}>
      <div className="ops-header">
        <div>
          <Link to="/">← Back to Dashboard</Link>
          <h1>📊 Predictive Analytics</h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="ops-badge badge-live">LIVE — computed from real data</span>
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
        {loading && <div className="ops-empty">Loading analytics…</div>}

        {!loading && error && (
          <div className="ops-error">
            {error}
            <div style={{ marginTop: 12 }}>
              <button className="ops-btn" onClick={load}>Retry</button>
            </div>
          </div>
        )}

        {!loading && !error && data && (
          <>
            <div className="ops-grid">
              <div className="ops-card">
                <span className="ops-label">Total Emergencies</span>
                <div className="ops-metric">{data.totalEmergencies}</div>
              </div>
              <div className="ops-card">
                <span className="ops-label">Active</span>
                <div className="ops-metric" style={{ color: "var(--orange)" }}>{data.activeCount}</div>
              </div>
              <div className="ops-card">
                <span className="ops-label">Resolved</span>
                <div className="ops-metric" style={{ color: "var(--green)" }}>{data.resolvedCount}</div>
              </div>
              <div className="ops-card">
                <span className="ops-label">Resolution Rate</span>
                <div className="ops-metric">{data.resolutionRate}%</div>
              </div>
              <div className="ops-card">
                <span className="ops-label">Avg Response Time</span>
                <div className="ops-metric">
                  {data.avgResponseMinutes !== null ? `${data.avgResponseMinutes}m` : "—"}
                </div>
              </div>
              <div className="ops-card">
                <span className="ops-label">Team Utilization</span>
                <div className="ops-metric">{data.teams.utilizationPercent}%</div>
                <small style={{ color: "var(--muted)" }}>
                  {data.teams.busy}/{data.teams.total} deployed
                </small>
              </div>
              <div className="ops-card">
                <span className="ops-label">Resource Utilization</span>
                <div className="ops-metric">{data.resources.utilizationPercent}%</div>
                <small style={{ color: "var(--muted)" }}>
                  {data.resources.lowStockCount} low/out of stock
                </small>
              </div>
            </div>

            {/* 14-DAY TREND */}
            <h2 className="ops-section-title">14-Day Incident Trend</h2>
            <div className="ops-card" style={{ marginBottom: 32 }}>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 120 }}>
                {data.trend.map((t) => (
                  <div key={t.date} style={{ flex: 1, textAlign: "center" }}>
                    <div
                      title={`${t.date}: ${t.count}`}
                      style={{
                        height: `${Math.max(4, (t.count / maxTrend) * 100)}px`,
                        background: "var(--green)",
                        borderRadius: "4px 4px 0 0",
                      }}
                    />
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 10, color: "var(--muted)" }}>
                <span>{data.trend[0]?.date}</span>
                <span>{data.trend[data.trend.length - 1]?.date}</span>
              </div>
            </div>

            <div className="ops-two-col" style={{ marginBottom: 32 }}>
              <div>
                <h2 className="ops-section-title">By Type</h2>
                <div className="ops-card">
                  {Object.entries(data.byType).length === 0 && <p style={{ color: "var(--muted)" }}>No incidents yet.</p>}
                  {Object.entries(data.byType).map(([type, count]) => (
                    <div key={type} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                      <span>{type}</span>
                      <strong>{count}</strong>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h2 className="ops-section-title">By Severity</h2>
                <div className="ops-card">
                  {Object.entries(data.bySeverity).map(([sev, count]) => (
                    <div key={sev} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                      <span>{sev}</span>
                      <strong>{count}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* HOTSPOTS */}
            <h2 className="ops-section-title">🔥 Disaster Hotspots</h2>
            {hotspots.length === 0 ? (
              <div className="ops-empty">
                Not enough clustered incidents yet to identify a hotspot (needs 2+ incidents within ~3km of each other).
              </div>
            ) : (
              <div className="ops-table-wrap">
                <table className="ops-table">
                  <thead>
                    <tr>
                      <th>Location</th>
                      <th>Incidents</th>
                      <th>Dominant Type</th>
                      <th>Risk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hotspots.map((h, i) => (
                      <tr key={i}>
                        <td>{h.location.city || `${h.location.lat.toFixed(3)}, ${h.location.lng.toFixed(3)}`}</td>
                        <td>{h.incidentCount}</td>
                        <td>{h.dominantType}</td>
                        <td>
                          <span className={`ops-badge badge-${h.riskLevel.toLowerCase()}`}>{h.riskLevel}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default Analytics;
