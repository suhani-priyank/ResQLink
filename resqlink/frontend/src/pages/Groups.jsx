import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import "./ops.css";

const API = "http://localhost:5000/api";

function Groups() {
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("resqlink_dark_mode") === "1");
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [groupName, setGroupName] = useState("");
  const [memberName, setMemberName] = useState("");
  const [members, setMembers] = useState([]);
  const [message, setMessage] = useState("");
  const [creating, setCreating] = useState(false);
  const [sosBusyId, setSosBusyId] = useState(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/groups`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Unable to load groups");
      setGroups(json.groups || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const addMember = () => {
    if (!memberName.trim()) return;
    setMembers([...members, { name: memberName.trim(), status: "Unknown" }]);
    setMemberName("");
  };

  const createGroup = async (e) => {
    e.preventDefault();
    setCreating(true);
    setMessage("");
    try {
      const res = await fetch(`${API}/groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupName, members }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Unable to create group");
      setGroupName("");
      setMembers([]);
      await load();
      setMessage(`✓ Group "${json.group.groupName}" created`);
    } catch (e) {
      setMessage(`✗ ${e.message}`);
    } finally {
      setCreating(false);
    }
  };

  const triggerGroupSOS = async (group) => {
    if (!navigator.geolocation) {
      setMessage("✗ Geolocation isn't available in this browser — can't attach a location to the group SOS.");
      return;
    }

    setSosBusyId(group._id);
    setMessage("");

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(`${API}/groups/${group._id}/sos`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              disasterType: "Other",
              severity: "Critical",
              location: {
                address: "Current location (device GPS)",
                coordinates: [pos.coords.longitude, pos.coords.latitude],
              },
            }),
          });
          const json = await res.json();
          if (!res.ok || !json.success) throw new Error(json.message || "Unable to trigger group SOS");
          await load();
          setMessage(`🚨 Group SOS sent for "${group.groupName}"`);
        } catch (e) {
          setMessage(`✗ ${e.message}`);
        } finally {
          setSosBusyId(null);
        }
      },
      () => {
        setMessage("✗ Location permission denied — group SOS needs a location.");
        setSosBusyId(null);
      }
    );
  };

  return (
    <div className={`ops-page ${darkMode ? "dark-mode" : ""}`}>
      <div className="ops-header">
        <div>
          <Link to="/">← Back to Dashboard</Link>
          <h1>👨‍👩‍👧 Family / Group SOS</h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="ops-badge badge-live">LIVE — creates real SOS cases</span>
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
        <form onSubmit={createGroup} className="ops-card" style={{ marginBottom: 24 }}>
          <span className="ops-label">Create a group</span>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
            <input
              placeholder="Group name (e.g. Sharma Family)"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              required
              className="ops-input" style={{ flex: "1 1 220px" }}
            />
            <input
              placeholder="Member name"
              value={memberName}
              onChange={(e) => setMemberName(e.target.value)}
              className="ops-input" style={{ flex: "1 1 160px" }}
            />
            <button type="button" className="ops-btn secondary" onClick={addMember}>+ Add member</button>
          </div>

          {members.length > 0 && (
            <div style={{ marginTop: 12, fontSize: 13 }}>
              Members: {members.map((m) => m.name).join(", ")}
            </div>
          )}

          <button className="ops-btn" style={{ marginTop: 12 }} disabled={creating}>
            {creating ? "Creating…" : "Create Group"}
          </button>
        </form>

        {message && <p style={{ marginBottom: 16, fontSize: 13 }}>{message}</p>}

        {loading && <div className="ops-empty">Loading groups…</div>}

        {!loading && error && (
          <div className="ops-error">
            {error}
            <div style={{ marginTop: 12 }}>
              <button className="ops-btn" onClick={load}>Retry</button>
            </div>
          </div>
        )}

        {!loading && !error && groups.length === 0 && (
          <div className="ops-empty">No groups yet. Create one above.</div>
        )}

        {!loading && !error && groups.length > 0 && (
          <div className="ops-grid">
            {groups.map((g) => (
              <div className="ops-card" key={g._id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <strong>{g.groupName}</strong>
                  <span className={`ops-badge ${g.status === "Group SOS Active" ? "badge-critical" : "badge-live"}`}>
                    {g.status}
                  </span>
                </div>

                <div style={{ marginTop: 10, fontSize: 13 }}>
                  {g.members.length === 0 && <span style={{ color: "var(--muted)" }}>No members added.</span>}
                  {g.members.map((m) => (
                    <div key={m._id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                      <span>{m.name}</span>
                      <span style={{ color: "var(--muted)" }}>{m.status}</span>
                    </div>
                  ))}
                </div>

                <button
                  className="ops-btn"
                  style={{ marginTop: 14, background: "var(--red)" }}
                  disabled={sosBusyId === g._id || g.status === "Group SOS Active"}
                  onClick={() => triggerGroupSOS(g)}
                >
                  {sosBusyId === g._id ? "Sending…" : g.status === "Group SOS Active" ? "SOS Active" : "🚨 Trigger Group SOS"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Groups;
