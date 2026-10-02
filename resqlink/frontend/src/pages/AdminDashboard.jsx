import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import "./Admin.css";

const API = "http://localhost:5000/api";
const statusOptions = ["Pending", "Assigned", "Dispatched", "On the Way", "Reached", "Rescuing", "Completed", "Cancelled"];
const navItems = [
  ["/admin", "▦", "Dashboard"], ["/admin/incidents", "⚠", "Live Incidents"], ["/admin/sos", "⌁", "SOS Management"],
  ["/admin/teams", "✚", "Rescue Teams"], ["/admin/hospitals", "＋", "Hospitals"], ["/admin/resources", "□", "Resources"],
  ["/admin/agencies", "◎", "Agencies"], ["/admin/users", "◉", "Users"], ["/admin/analytics", "◒", "Analytics"],
  ["/admin/logs", "≡", "System Logs"], ["/admin/settings", "⚙", "Settings"],
];

function AdminDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("resqlink_dark_mode") === "1");
  const [admin, setAdmin] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [workingId, setWorkingId] = useState("");

  const token = localStorage.getItem("resqlink_admin_token");
  const activePath = location.pathname;
  const currentLabel = navItems.find(([path]) => path === activePath)?.[2] || "Dashboard";

  const request = async (path, options = {}) => {
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) },
    });
    const result = await response.json().catch(() => ({}));
    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem("resqlink_admin_token");
      navigate("/admin/login", { replace: true });
      throw new Error("Your administrator session has expired.");
    }
    if (!response.ok) throw new Error(result.message || "Administrator request failed.");
    return result;
  };

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [me, overview] = await Promise.all([request("/admin/auth/me"), request("/admin/overview")]);
      setAdmin(me.admin);
      setData(overview);
    } catch (requestError) {
      setError(requestError.message || "Unable to load administrator data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) {
      navigate("/admin/login", { replace: true });
      return;
    }
    load();
    // The request helper and loader intentionally use the current session token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, token]);

  const mutate = async (id, path, body) => {
    setWorkingId(id);
    setActionError("");
    try {
      await request(path, { method: "PUT", body: JSON.stringify(body) });
      await load();
    } catch (requestError) {
      setActionError(requestError.message || "Unable to complete action.");
    } finally {
      setWorkingId("");
    }
  };

  const patch = async (id, path, body) => {
    setWorkingId(id);
    setActionError("");
    try {
      await request(path, { method: "PATCH", body: JSON.stringify(body) });
      await load();
    } catch (requestError) {
      setActionError(requestError.message || "Unable to complete action.");
    } finally {
      setWorkingId("");
    }
  };

  const logout = async () => {
    try { await request("/admin/auth/logout", { method: "POST" }); } catch { /* token is cleared below */ }
    localStorage.removeItem("resqlink_admin_token");
    navigate("/admin/login", { replace: true });
  };

  const analytics = useMemo(() => {
    if (!data) return null;
    const incidents = data.incidents || [];
    const byType = incidents.reduce((result, incident) => { result[incident.disasterType] = (result[incident.disasterType] || 0) + 1; return result; }, {});
    const bySeverity = incidents.reduce((result, incident) => { result[incident.severity] = (result[incident.severity] || 0) + 1; return result; }, {});
    return { byType, bySeverity };
  }, [data]);

  if (loading) return <main className={`admin-shell ${darkMode ? "dark-mode" : ""}`}><div className="admin-loading">Loading Admin Control Center...</div></main>;
  if (error) return <main className={`admin-shell ${darkMode ? "dark-mode" : ""}`}><div className="admin-error-panel"><h1>Administrator access unavailable</h1><p>{error}</p><button className="admin-primary-button" onClick={() => navigate("/admin/login")}>Return to sign in</button></div></main>;

  const stats = data.stats;
  const incidents = data.incidents || [];
  const teams = data.teams || [];
  const hospitals = data.hospitals || [];
  const resources = data.resources || [];

  return (
    <div className={`admin-shell ${darkMode ? "dark-mode" : ""}`}>
      <aside className="admin-sidebar">
        <Link to="/admin" className="admin-brand"><span className="admin-mark">R</span><span><strong>ResQLink</strong><small>ADMIN CONTROL</small></span></Link>
        <nav className="admin-nav">{navItems.map(([path, icon, label]) => <Link className={activePath === path ? "active" : ""} to={path} key={path}><span>{icon}</span>{label}</Link>)}</nav>
        <div className="admin-sidebar-footer"><div className="admin-profile"><span className="admin-avatar">{admin?.name?.[0] || "A"}</span><span><strong>{admin?.name || "Administrator"}</strong><small>{admin?.email}</small></span></div><button className="admin-logout" onClick={logout}>Logout</button></div>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar"><div><p className="admin-kicker">RESQLINK / OPERATIONS</p><h1>{currentLabel === "Dashboard" ? "Admin Control Center" : currentLabel}</h1><p className="admin-subtitle">Live emergency-response network overview</p></div><div className="admin-top-actions"><span className="admin-live-dot">● SYSTEM LIVE</span><button className="admin-theme-button" onClick={() => { const next = !darkMode; setDarkMode(next); localStorage.setItem("resqlink_dark_mode", next ? "1" : "0"); }}>{darkMode ? "☀" : "☾"}</button></div></header>
        {actionError && <div className="admin-inline-error" role="alert">{actionError}</div>}

        {activePath === "/admin" && <DashboardHome stats={stats} incidents={incidents} />}
        {activePath === "/admin/incidents" && <LiveIncidentsSection incidents={incidents} teams={teams} workingId={workingId} onStatus={(id, status) => mutate(id, `/admin/incidents/${id}/status`, { status })} onAssign={(id, teamId) => mutate(id, `/admin/incidents/${id}/assign`, { teamId })} />}
        {activePath === "/admin/sos" && <SOSManagementSection incidents={incidents} teams={teams} workingId={workingId} onStatus={(id, status) => mutate(id, `/admin/incidents/${id}/status`, { status })} onAssign={(id, teamId) => mutate(id, `/admin/incidents/${id}/assign`, { teamId })} />}
        {activePath === "/admin/teams" && <TeamsSection teams={teams} workingId={workingId} onAvailability={(id, availability) => patch(id, `/admin/teams/${id}/availability`, { availability })} onStatus={(id, status) => patch(id, `/admin/teams/${id}/status`, { status })} />}
        {activePath === "/admin/hospitals" && <HospitalsSection hospitals={hospitals} workingId={workingId} onStatus={(id, status) => mutate(id, `/admin/hospitals/${id}`, { status })} />}
        {activePath === "/admin/resources" && <ResourcesSection resources={resources} workingId={workingId} onStatus={(id, status) => patch(id, `/admin/resources/${id}/status`, { status })} />}
        {activePath === "/admin/agencies" && <AgenciesSection agencies={data.agencies || []} />}
        {activePath === "/admin/users" && <UsersSection admins={data.admins || []} workingId={workingId} onStatus={(id, status) => patch(id, `/admin/users/${id}`, { status })} />}
        {activePath === "/admin/analytics" && <AnalyticsSection analytics={analytics} stats={stats} incidents={incidents} />}
        {activePath === "/admin/logs" && <LogsSection logs={data.logs || []} />}
        {activePath === "/admin/settings" && <section className="admin-panel"><div className="admin-section-heading"><div><p className="admin-kicker">SYSTEM</p><h2>Settings</h2></div></div><div className="admin-settings-grid"><div><strong>Authentication</strong><p>JWT administrator sessions expire after eight hours.</p></div><div><strong>Data source</strong><p>All dashboard values are read from the live ResQLink database.</p></div></div></section>}
      </main>
    </div>
  );
}

function DashboardHome({ stats, incidents }) {
  const cards = [["Active Incidents", stats.activeIncidents, "orange"], ["Critical Incidents", stats.criticalIncidents, "red"], ["Available Teams", stats.availableTeams, "green"], ["Assigned Teams", stats.assignedTeams, "blue"], ["Hospitals", stats.hospitals, "blue"], ["Available Resources", stats.availableResources, "green"], ["Pending SOS", stats.pendingSOS, "orange"], ["Completed Incidents", stats.completedIncidents, "green"]];
  return <><section className="admin-stat-grid">{cards.map(([label, value, tone]) => <div className="admin-stat-card" key={label}><span>{label}</span><strong className={tone}>{value}</strong></div>)}</section><section className="admin-panel"><div className="admin-section-heading"><div><p className="admin-kicker">PRIORITY QUEUE</p><h2>Live Incidents</h2></div><Link className="admin-text-link" to="/admin/incidents">View all →</Link></div><IncidentTable incidents={incidents.slice(0, 6)} compact /></section></>;
}

function LiveIncidentsSection({ incidents, teams, workingId, onStatus, onAssign }) {
  const activeIncidents = incidents.filter((incident) => !["Completed", "Cancelled"].includes(incident.status));
  return <section className="admin-panel">
    <div className="admin-section-heading">
      <div><p className="admin-kicker">FIELD RESPONSE</p><h2>Live Incidents</h2><p className="admin-section-note">Active cases currently moving through the response workflow.</p></div>
      <span className="admin-count">{activeIncidents.length} active</span>
    </div>
    <div className="admin-incident-strip"><span><strong>{activeIncidents.filter((incident) => incident.severity === "Critical").length}</strong> critical</span><span><strong>{activeIncidents.filter((incident) => incident.assignedTeam).length}</strong> assigned</span><span><strong>{activeIncidents.filter((incident) => !incident.assignedTeam).length}</strong> awaiting team</span></div>
    <IncidentTable incidents={activeIncidents} teams={teams} workingId={workingId} onStatus={onStatus} onAssign={onAssign} />
  </section>;
}

function SOSManagementSection({ incidents, teams, workingId, onStatus, onAssign }) {
  const incoming = incidents.filter((incident) => !["Completed", "Cancelled"].includes(incident.status));
  return <section className="admin-panel">
    <div className="admin-section-heading">
      <div><p className="admin-kicker">INCOMING REQUESTS</p><h2>SOS Management</h2><p className="admin-section-note">Triage incoming SOS requests, review risk details, and dispatch support.</p></div>
      <span className="admin-count">{incoming.length} open SOS</span>
    </div>
    <div className="admin-sos-grid">
      {incoming.length === 0 ? <div className="admin-empty">No open SOS requests.</div> : incoming.map((incident) => <SOSCard key={incident._id} incident={incident} teams={teams} workingId={workingId} onStatus={onStatus} onAssign={onAssign} />)}
    </div>
  </section>;
}

function SOSCard({ incident, teams, workingId, onStatus, onAssign }) {
  const vulnerable = incident.vulnerablePeople || {};
  const vulnerableCount = Number(vulnerable.children || 0) + Number(vulnerable.elderly || 0) + Number(vulnerable.disabled || 0);
  return <article className="admin-sos-card">
    <div className="admin-sos-card-header"><div><span className="admin-id">SOS-{String(incident._id).slice(-6)}</span><h3>{incident.disasterType}</h3></div><span className={`admin-badge ${incident.severity.toLowerCase()}`}>{incident.severity}</span></div>
    <p className="admin-sos-description">{incident.description || "No additional description provided."}</p>
    <div className="admin-sos-location"><span>LOCATION</span><strong>{incident.location?.address || incident.location?.city || "Location unavailable"}</strong>{incident.location?.city && incident.location?.state && <small>{incident.location.city}, {incident.location.state}</small>}</div>
    <div className="admin-sos-facts"><div><span>People</span><strong>{incident.peopleCount}</strong></div><div><span>Medical</span><strong className={incident.medicalRequired ? "danger" : ""}>{incident.medicalRequired ? "Required" : "No"}</strong></div><div><span>Vulnerable</span><strong>{vulnerableCount}</strong></div><div><span>Priority</span><strong>{incident.priorityScore || "—"}</strong></div></div>
    <div className="admin-sos-vulnerable"><span>VULNERABLE PEOPLE</span><strong>Children {vulnerable.children || 0} · Elderly {vulnerable.elderly || 0} · Disabled {vulnerable.disabled || 0}</strong></div>
    <div className="admin-sos-actions"><label>Status<select className="admin-select" value={incident.status} disabled={workingId === incident._id} onChange={(event) => onStatus(incident._id, event.target.value)}>{statusOptions.map((status) => <option key={status}>{status}</option>)}</select></label><label>Assign team<select className="admin-select" value={incident.assignedTeam?._id || ""} disabled={workingId === incident._id} onChange={(event) => event.target.value && onAssign(incident._id, event.target.value)}><option value="">Unassigned</option>{teams.map((team) => <option value={team._id} key={team._id}>{team.teamName}</option>)}</select></label></div>
  </article>;
}
function IncidentTable({ incidents, teams = [], workingId, onStatus, onAssign, compact = false }) { return <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>ID</th><th>Type</th><th>Location</th><th>Severity</th><th>People</th><th>Medical</th><th>Status</th><th>Assigned Team</th>{!compact && <th>Created</th>}</tr></thead><tbody>{incidents.length === 0 ? <tr><td colSpan="9" className="admin-empty">No incidents found.</td></tr> : incidents.map((incident) => <tr key={incident._id}><td className="admin-id">{String(incident._id).slice(-6)}</td><td><strong>{incident.disasterType}</strong></td><td>{incident.location?.city || incident.location?.address || "Unknown"}</td><td><span className={`admin-badge ${incident.severity.toLowerCase()}`}>{incident.severity}</span></td><td>{incident.peopleCount}</td><td>{incident.medicalRequired ? "Required" : "No"}</td><td>{onStatus ? <select className="admin-select" value={incident.status} disabled={workingId === incident._id} onChange={(event) => onStatus(incident._id, event.target.value)}>{statusOptions.map((status) => <option key={status}>{status}</option>)}</select> : <span className="admin-status-text">{incident.status}</span>}</td><td>{onAssign ? <select className="admin-select" value={incident.assignedTeam?._id || ""} disabled={workingId === incident._id} onChange={(event) => event.target.value && onAssign(incident._id, event.target.value)}><option value="">Unassigned</option>{teams.map((team) => <option value={team._id} key={team._id}>{team.teamName}</option>)}</select> : incident.assignedTeam?.teamName || "Unassigned"}</td>{!compact && <td>{new Date(incident.createdAt).toLocaleString()}</td>}</tr>)}</tbody></table></div>; }
function TeamsSection({ teams, workingId, onAvailability, onStatus }) { return <section className="admin-panel"><div className="admin-section-heading"><div><p className="admin-kicker">FIELD OPERATIONS</p><h2>Rescue Teams</h2></div><span className="admin-count">{teams.length} teams</span></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Team</th><th>Code</th><th>Members</th><th>Skills</th><th>Location</th><th>Availability</th><th>Status</th><th>Phone</th></tr></thead><tbody>{teams.length ? teams.map((team) => <tr key={team._id}><td><strong>{team.teamName}</strong></td><td>{team.teamCode}</td><td>{team.members}</td><td>{team.skills?.join(", ") || "—"}</td><td>{team.location?.city || team.location?.address || "—"}</td><td><select className="admin-select" value={team.availability} disabled={workingId === team._id} onChange={(event) => onAvailability(team._id, event.target.value)}>{["Available", "Busy", "Offline"].map((value) => <option key={value}>{value}</option>)}</select></td><td><select className="admin-select" value={team.status} disabled={workingId === team._id} onChange={(event) => onStatus(team._id, event.target.value)}>{VALID_TEAM_STATUS_OPTIONS.map((value) => <option key={value}>{value}</option>)}</select></td><td>{team.phone || "—"}</td></tr>) : <tr><td colSpan="8" className="admin-empty">No rescue teams found.</td></tr>}</tbody></table></div></section>; }
const VALID_TEAM_STATUS_OPTIONS = ["Available", "Assigned", "Dispatched", "On the Way", "Reached", "Rescuing", "Completed"];
function HospitalsSection({ hospitals, workingId, onStatus }) { return <section className="admin-panel"><div className="admin-section-heading"><div><p className="admin-kicker">MEDICAL NETWORK</p><h2>Hospitals</h2></div></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Hospital</th><th>Location</th><th>Available Beds</th><th>ICU</th><th>Ambulances</th><th>Status</th></tr></thead><tbody>{hospitals.length ? hospitals.map((hospital) => <tr key={hospital._id}><td><strong>{hospital.name}</strong></td><td>{hospital.city || hospital.address || "—"}</td><td>{hospital.availableBeds} / {hospital.totalBeds}</td><td>{hospital.icuAvailable} / {hospital.icuBeds}</td><td>{hospital.ambulancesAvailable} / {hospital.ambulancesTotal}</td><td><select className="admin-select" value={hospital.status} disabled={workingId === hospital._id} onChange={(event) => onStatus(hospital._id, event.target.value)}>{["Operational", "Near Capacity", "Full", "Not Responding"].map((value) => <option key={value}>{value}</option>)}</select></td></tr>) : <tr><td colSpan="6" className="admin-empty">No hospitals found.</td></tr>}</tbody></table></div></section>; }
function ResourcesSection({ resources, workingId, onStatus }) { return <section className="admin-panel"><div className="admin-section-heading"><div><p className="admin-kicker">LOGISTICS</p><h2>Resources</h2></div></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Resource</th><th>Category</th><th>Quantity</th><th>Available</th><th>Location</th><th>Status</th></tr></thead><tbody>{resources.length ? resources.map((resource) => <tr key={resource._id}><td><strong>{resource.name}</strong></td><td>{resource.category}</td><td>{resource.quantity}</td><td>{resource.availableQuantity}</td><td>{resource.location?.city || resource.location?.address || "—"}</td><td><select className="admin-select" value={resource.status} disabled={workingId === resource._id} onChange={(event) => onStatus(resource._id, event.target.value)}>{["Available", "Low Stock", "Out of Stock"].map((value) => <option key={value}>{value}</option>)}</select></td></tr>) : <tr><td colSpan="6" className="admin-empty">No resources found.</td></tr>}</tbody></table></div></section>; }
function AgenciesSection({ agencies }) { return <section className="admin-panel"><div className="admin-section-heading"><div><p className="admin-kicker">COORDINATION</p><h2>Agencies</h2></div></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Agency</th><th>Type</th><th>Jurisdiction</th><th>Contact</th><th>Status</th><th>Active Incidents</th></tr></thead><tbody>{agencies.length ? agencies.map((agency) => <tr key={agency._id}><td><strong>{agency.name}</strong></td><td>{agency.type}</td><td>{agency.jurisdiction}</td><td>{agency.contact || "—"}</td><td><span className="admin-badge live">{agency.status}</span></td><td>{agency.activeIncidents}</td></tr>) : <tr><td colSpan="6" className="admin-empty">No agencies found.</td></tr>}</tbody></table></div></section>; }
function UsersSection({ admins, workingId, onStatus }) { return <section className="admin-panel"><div className="admin-section-heading"><div><p className="admin-kicker">ACCESS CONTROL</p><h2>Administrator Accounts</h2></div></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th><th>Last Login</th></tr></thead><tbody>{admins.map((user) => <tr key={user._id}><td>{user.name}</td><td>{user.email}</td><td>{user.role}</td><td><select className="admin-select" value={user.status} disabled={workingId === user._id} onChange={(event) => onStatus(user._id, event.target.value)}><option>Active</option><option>Inactive</option></select></td><td>{new Date(user.createdAt).toLocaleDateString()}</td><td>{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "Never"}</td></tr>)}</tbody></table></div></section>; }
function AnalyticsSection({ analytics, stats, incidents }) { return <section className="admin-panel"><div className="admin-section-heading"><div><p className="admin-kicker">LIVE METRICS</p><h2>Analytics</h2></div></div><div className="admin-analytics-grid"><div><h3>Incidents by Type</h3>{Object.entries(analytics.byType).map(([name, count]) => <div className="admin-bar-row" key={name}><span>{name}</span><strong>{count}</strong><i style={{ width: `${Math.min(100, count / Math.max(1, incidents.length) * 100)}%` }} /></div>)}</div><div><h3>Incidents by Severity</h3>{Object.entries(analytics.bySeverity).map(([name, count]) => <div className="admin-bar-row" key={name}><span>{name}</span><strong>{count}</strong><i className={name.toLowerCase()} style={{ width: `${Math.min(100, count / Math.max(1, incidents.length) * 100)}%` }} /></div>)}</div></div><div className="admin-mini-stat-row"><div><span>Active</span><strong>{stats.activeIncidents}</strong></div><div><span>Critical</span><strong>{stats.criticalIncidents}</strong></div><div><span>Completed</span><strong>{stats.completedIncidents}</strong></div></div></section>; }
function LogsSection({ logs }) { return <section className="admin-panel"><div className="admin-section-heading"><div><p className="admin-kicker">AUDIT TRAIL</p><h2>System Logs</h2></div></div><div className="admin-log-list">{logs.length ? logs.map((log) => <div className="admin-log-row" key={log._id}><span className="admin-log-dot" /><div><strong>{log.action}</strong><p>{log.adminEmail} · {new Date(log.createdAt).toLocaleString()}</p></div><small>{log.targetType}</small></div>) : <div className="admin-empty">No administrator activity recorded.</div>}</div></section>; }

export default AdminDashboard;
