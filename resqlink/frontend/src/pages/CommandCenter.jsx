import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import "./ops.css";

const API = "http://localhost:5000/api";

function CommandCenter() {
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("resqlink_dark_mode") === "1");
  const [sos, setSos] = useState([]);
  const [teams, setTeams] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [hospitals, setHospitals] = useState([]);
  const [agencies, setAgencies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [twin, setTwin] = useState(null);
  const [twinLoading, setTwinLoading] = useState(false);
  const [twinError, setTwinError] = useState("");
  const [twinSosId, setTwinSosId] = useState(null);

  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const results = await Promise.allSettled([
        fetch(`${API}/sos`),
        fetch(`${API}/rescue-teams`),
        fetch(`${API}/analytics`),
        fetch(`${API}/hospitals`),
        fetch(`${API}/agencies`),
      ]);

      const [sosR, teamR, aR, hR, agR] = results;

      if (sosR.status === "fulfilled" && sosR.value.ok) {
        const j = await sosR.value.json();
        setSos(j.sosRequests || []);
      }
      if (teamR.status === "fulfilled" && teamR.value.ok) {
        const j = await teamR.value.json();
        setTeams(j.teams || []);
      }
      if (aR.status === "fulfilled" && aR.value.ok) {
        const j = await aR.value.json();
        setAnalytics(j.analytics);
      }
      if (hR.status === "fulfilled" && hR.value.ok) {
        const j = await hR.value.json();
        setHospitals(j.hospitals || []);
      }
      if (agR.status === "fulfilled" && agR.value.ok) {
        const j = await agR.value.json();
        setAgencies(j.agencies || []);
      }

      if (results.every((r) => r.status === "rejected")) {
        throw new Error("Unable to reach the backend.");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  const activeSos = sos.filter((s) => !["Completed", "Cancelled"].includes(s.status));
  const criticalSos = sos.filter((s) => s.severity === "Critical" && !["Completed", "Cancelled"].includes(s.status));
  const escalated = sos.filter((s) => s.escalation?.escalated);
  const availableTeams = teams.filter((t) => t.status === "Available");

  // Feature 14 — Emergency Digital Twin.
  // Compose incident -> team -> resources -> hospital -> status
  // for the highest-priority active incident.
  const loadDigitalTwin = async (id) => {
    if (!id) {
      setTwin(null);
      setTwinError("No active incident to build a digital twin for.");
      return;
    }
    setTwinLoading(true);
    setTwinError("");
    try {
      const res = await fetch(`${API}/reports/digital-twin/${id}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Unable to build digital twin");
      setTwin(json.twin);
      setTwinSosId(id);
    } catch (e) {
      setTwinError(e.message);
      setTwin(null);
    } finally {
      setTwinLoading(false);
    }
  };

  useEffect(() => {
    if (loading) return;
    const highestPriority = [...activeSos].sort(
      (a, b) => (Number(b.priorityScore) || 0) - (Number(a.priorityScore) || 0)
    )[0];
    const id = highestPriority?._id;
    if (id && id !== twinSosId) {
      loadDigitalTwin(id);
    } else if (!id) {
      setTwin(null);
      setTwinError("No active incident to build a digital twin for.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, sos]);

  // Feature 19 — Post-Disaster Intelligence / Reports.
  const generateReport = async () => {
    setReportLoading(true);
    setReportError("");
    try {
      const res = await fetch(`${API}/reports/generate`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Unable to generate report");
      setReport(json.report);
    } catch (e) {
      setReportError(e.message);
    } finally {
      setReportLoading(false);
    }
  };

  const downloadReportJson = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "resqlink-report.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`ops-page ${darkMode ? "dark-mode" : ""}`}>
      <div className="ops-header">
        <div>
          <Link to="/">← Back to Dashboard</Link>
          <h1>🏛️ Authority Command Center</h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="ops-badge badge-live">LIVE — auto-refreshing every 30s</span>
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
        {loading && <div className="ops-empty">Loading command center…</div>}

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
            <div className="ops-grid">
              <div className="ops-card">
                <span className="ops-label">Active Incidents</span>
                <div className="ops-metric">{activeSos.length}</div>
              </div>
              <div className="ops-card">
                <span className="ops-label">Critical</span>
                <div className="ops-metric" style={{ color: "var(--red)" }}>{criticalSos.length}</div>
              </div>
              <div className="ops-card">
                <span className="ops-label">Escalated</span>
                <div className="ops-metric" style={{ color: "var(--orange)" }}>{escalated.length}</div>
              </div>
              <div className="ops-card">
                <span className="ops-label">Teams Available</span>
                <div className="ops-metric">{availableTeams.length}/{teams.length}</div>
              </div>
              <div className="ops-card">
                <span className="ops-label">Hospitals Tracked</span>
                <div className="ops-metric">{hospitals.length}</div>
              </div>
              <div className="ops-card">
                <span className="ops-label">Agencies Online</span>
                <div className="ops-metric">{agencies.filter((a) => a.status === "Online").length}/{agencies.length}</div>
              </div>
              <div className="ops-card">
                <span className="ops-label">Avg Response Time</span>
                <div className="ops-metric">{analytics?.avgResponseMinutes ?? "—"}{analytics?.avgResponseMinutes != null && "m"}</div>
              </div>
            </div>

            <h2 className="ops-section-title">🚨 Critical / Escalated Incidents</h2>
            {criticalSos.length === 0 && escalated.length === 0 ? (
              <div className="ops-empty">No critical or escalated incidents right now.</div>
            ) : (
              <div className="ops-table-wrap" style={{ marginBottom: 32 }}>
                <table className="ops-table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Severity</th>
                      <th>Status</th>
                      <th>Team</th>
                      <th>Escalation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...new Map([...criticalSos, ...escalated].map((s) => [s._id, s])).values()].map((s) => (
                      <tr key={s._id}>
                        <td>{s.disasterType}</td>
                        <td><span className={`ops-badge badge-${(s.severity || "").toLowerCase()}`}>{s.severity}</span></td>
                        <td>{s.status}</td>
                        <td>{s.assignedTeam?.teamName || "Unassigned"}</td>
                        <td>
                          {s.escalation?.escalated ? (
                            <span style={{ color: "var(--red)", fontWeight: 700 }}>
                              ⚠ {s.escalation.reason}
                            </span>
                          ) : (
                            <span style={{ color: "var(--muted)" }}>Normal</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="ops-two-col">
              <div>
                <h2 className="ops-section-title">Agencies</h2>
                <div className="ops-card">
                  {agencies.map((a) => (
                    <div key={a._id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                      <span>{a.name}</span>
                      <span className={`ops-badge ${a.status === "Online" ? "badge-live" : "badge-critical"}`}>{a.status}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h2 className="ops-section-title">Hospitals Near Capacity</h2>
                <div className="ops-card">
                  {hospitals.filter((h) => h.status !== "Operational").length === 0 && (
                    <p style={{ color: "var(--muted)" }}>All hospitals operating normally.</p>
                  )}
                  {hospitals.filter((h) => h.status !== "Operational").map((h) => (
                    <div key={h._id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                      <span>{h.name}</span>
                      <span className="ops-badge badge-critical">{h.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <h2 className="ops-section-title" style={{ marginTop: 32 }}>🧬 Emergency Digital Twin</h2>
            <div className="ops-card">
              {twinLoading && <p style={{ color: "var(--muted)" }}>Building live twin…</p>}
              {!twinLoading && twinError && <p style={{ color: "var(--muted)" }}>{twinError}</p>}
              {!twinLoading && !twinError && twin && (
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "stretch", gap: 12 }}>
                  {[
                    {
                      label: "Incident",
                      lines: [twin.incident?.type, twin.incident?.severity, twin.incident?.status],
                    },
                    {
                      label: "Team",
                      lines: twin.team
                        ? [twin.team.name, twin.team.code, twin.team.status]
                        : ["Unassigned"],
                    },
                    {
                      label: "Resources",
                      lines: twin.resources?.length ? twin.resources : ["None linked"],
                    },
                    {
                      label: "Hospital",
                      lines: twin.hospital
                        ? [
                            twin.hospital.name,
                            `${twin.hospital.availableBeds ?? "—"}/${twin.hospital.totalBeds ?? "—"} beds`,
                            twin.hospital.capacityPercent != null ? `${twin.hospital.capacityPercent}% full` : null,
                          ].filter(Boolean)
                        : ["No hospital on record nearby"],
                    },
                  ].map((node, i, arr) => (
                    <div key={node.label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div
                        style={{
                          minWidth: 160,
                          padding: "12px 14px",
                          borderRadius: 12,
                          border: "1px solid var(--border)",
                          background: "var(--bg)",
                        }}
                      >
                        <span className="ops-label">{node.label}</span>
                        {node.lines.map((line, li) => (
                          <div key={li} style={{ fontSize: 13, fontWeight: li === 0 ? 700 : 400 }}>
                            {line}
                          </div>
                        ))}
                      </div>
                      {i < arr.length - 1 && <span style={{ color: "var(--muted)" }}>→</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <h2 className="ops-section-title" style={{ marginTop: 32 }}>📈 Post-Disaster Intelligence</h2>
            <div className="ops-card">
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: report ? 20 : 0 }}>
                <button className="ops-btn" onClick={generateReport} disabled={reportLoading}>
                  {reportLoading ? "Generating…" : "Generate Report"}
                </button>
                {report && (
                  <>
                    <button className="ops-btn secondary" onClick={downloadReportJson}>Download JSON</button>
                    <a
                      className="ops-btn secondary"
                      style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
                      href={`${API}/reports/export.csv`}
                    >
                      Download CSV
                    </a>
                    <button className="ops-btn secondary" onClick={() => window.print()}>Print</button>
                  </>
                )}
              </div>

              {reportError && <p style={{ color: "var(--red)" }}>{reportError}</p>}

              {report && (
                <div>
                  <div className="ops-grid" style={{ marginBottom: 20 }}>
                    <div className="ops-card">
                      <span className="ops-label">Total Emergencies</span>
                      <div className="ops-metric">{report.summary.totalEmergencies}</div>
                    </div>
                    <div className="ops-card">
                      <span className="ops-label">Critical</span>
                      <div className="ops-metric" style={{ color: "var(--red)" }}>{report.summary.criticalEmergencies}</div>
                    </div>
                    <div className="ops-card">
                      <span className="ops-label">Resolved</span>
                      <div className="ops-metric">{report.summary.resolvedCases} ({report.summary.resolutionRate}%)</div>
                    </div>
                    <div className="ops-card">
                      <span className="ops-label">Teams Deployed</span>
                      <div className="ops-metric">{report.summary.teamsDeployed}/{report.summary.totalTeams}</div>
                    </div>
                    <div className="ops-card">
                      <span className="ops-label">Avg Response Time</span>
                      <div className="ops-metric">{report.summary.avgResponseMinutes ?? "—"}{report.summary.avgResponseMinutes != null && "m"}</div>
                    </div>
                    <div className="ops-card">
                      <span className="ops-label">Escalations</span>
                      <div className="ops-metric" style={{ color: "var(--orange)" }}>{report.summary.escalations}</div>
                    </div>
                    <div className="ops-card">
                      <span className="ops-label">Hospitals on Record</span>
                      <div className="ops-metric">{report.summary.hospitalsOnRecord}</div>
                    </div>
                  </div>

                  <h3 style={{ fontSize: 14, marginBottom: 10 }}>Resource Consumption</h3>
                  <div className="ops-table-wrap" style={{ marginBottom: 24 }}>
                    <table className="ops-table">
                      <thead>
                        <tr><th>Resource</th><th>Category</th><th>Used</th><th>Remaining</th></tr>
                      </thead>
                      <tbody>
                        {report.resourceConsumption.length === 0 && (
                          <tr><td colSpan={4} style={{ color: "var(--muted)" }}>No resources on record.</td></tr>
                        )}
                        {report.resourceConsumption.map((r) => (
                          <tr key={r.name}>
                            <td>{r.name}</td>
                            <td>{r.category}</td>
                            <td>{r.used}</td>
                            <td>{r.remaining}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <h3 style={{ fontSize: 14, marginBottom: 10 }}>Incident Timeline</h3>
                  <div className="ops-table-wrap">
                    <table className="ops-table">
                      <thead>
                        <tr><th>Date</th><th>Type</th><th>Severity</th><th>Status</th><th>Team</th></tr>
                      </thead>
                      <tbody>
                        {report.timeline.map((t) => (
                          <tr key={t.id}>
                            <td>{new Date(t.at).toLocaleString()}</td>
                            <td>{t.disasterType}</td>
                            <td><span className={`ops-badge badge-${(t.severity || "").toLowerCase()}`}>{t.severity}</span></td>
                            <td>{t.status}</td>
                            <td>{t.team || "Unassigned"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div style={{ marginTop: 24 }}>
              <Link to="/response-map" className="ops-btn secondary" style={{ textDecoration: "none", display: "inline-block" }}>
                🗺️ Open Live Response Map
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default CommandCenter;
