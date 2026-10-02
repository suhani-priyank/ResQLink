import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import "./ops.css";

const API = "http://localhost:5000/api";
const CATEGORIES = ["Medical", "Rescue", "Transport", "Food", "Water", "Equipment", "Shelter", "Other"];

function Inventory() {
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("resqlink_dark_mode") === "1");
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [form, setForm] = useState({ name: "", category: "Medical", quantity: 10 });
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/resources`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Unable to load inventory");
      setResources(json.resources || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const createResource = async (e) => {
    e.preventDefault();
    setCreating(true);
    setMessage("");
    try {
      const res = await fetch(`${API}/resources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Unable to add resource");
      setForm({ name: "", category: "Medical", quantity: 10 });
      await load();
      setMessage(`✓ ${json.resource.name} added to inventory`);
    } catch (e) {
      setMessage(`✗ ${e.message}`);
    } finally {
      setCreating(false);
    }
  };

  const mutateQuantity = async (resource, action) => {
    setBusyId(resource._id);
    setMessage("");
    try {
      const res = await fetch(`${API}/resource-allocation/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resourceId: resource._id, quantity: 1 }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || `Unable to ${action} resource`);
      setResources((prev) => prev.map((r) => (r._id === resource._id ? json.resource : r)));
      setMessage(`✓ ${json.message}`);
    } catch (e) {
      setMessage(`✗ ${e.message}`);
    } finally {
      setBusyId(null);
    }
  };

  const statusBadge = (status) => {
    if (status === "Available") return "badge-live";
    if (status === "Low Stock") return "badge-medium";
    return "badge-critical";
  };

  const lowStock = resources.filter((r) => r.status === "Low Stock" || r.status === "Out of Stock");

  return (
    <div className={`ops-page ${darkMode ? "dark-mode" : ""}`}>
      <div className="ops-header">
        <div>
          <Link to="/">← Back to Dashboard</Link>
          <h1>📦 Resource Inventory</h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="ops-badge badge-live">LIVE — backed by MongoDB</span>
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
        {lowStock.length > 0 && (
          <div className="ops-card ops-warning-card" style={{ marginBottom: 24 }}>
            <strong>⚠ Low stock warning</strong>
            <div style={{ marginTop: 8, fontSize: 13 }}>
              {lowStock.map((r) => (
                <div key={r._id}>
                  {r.name} — Available: {r.availableQuantity} / {r.quantity}
                </div>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={createResource} className="ops-card" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 24 }}>
          <div>
            <span className="ops-label">Name</span>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required
              className="ops-input" />
          </div>
          <div>
            <span className="ops-label">Category</span>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="ops-input">
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <span className="ops-label">Quantity</span>
            <input type="number" min="0" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              className="ops-input" style={{ width: 90 }} />
          </div>
          <button className="ops-btn" disabled={creating}>{creating ? "Adding…" : "+ Add Resource"}</button>
        </form>

        {message && <p style={{ marginBottom: 16, fontSize: 13 }}>{message}</p>}

        {loading && <div className="ops-empty">Loading inventory…</div>}

        {!loading && error && (
          <div className="ops-error">
            {error}
            <div style={{ marginTop: 12 }}>
              <button className="ops-btn" onClick={load}>Retry</button>
            </div>
          </div>
        )}

        {!loading && !error && resources.length === 0 && (
          <div className="ops-empty">No resources in inventory yet. Add one above.</div>
        )}

        {!loading && !error && resources.length > 0 && (
          <div className="ops-table-wrap">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Name</th><th>Category</th><th>Total</th><th>Available</th><th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {resources.map((r) => (
                  <tr key={r._id}>
                    <td>{r.name}</td>
                    <td>{r.category}</td>
                    <td>{r.quantity}</td>
                    <td>{r.availableQuantity}</td>
                    <td><span className={`ops-badge ${statusBadge(r.status)}`}>{r.status}</span></td>
                    <td style={{ display: "flex", gap: 6 }}>
                      <button
                        className="ops-btn secondary"
                        disabled={busyId === r._id || r.availableQuantity <= 0}
                        onClick={() => mutateQuantity(r, "allocate")}
                      >
                        Allocate 1
                      </button>
                      <button
                        className="ops-btn secondary"
                        disabled={busyId === r._id || r.availableQuantity >= r.quantity}
                        onClick={() => mutateQuantity(r, "release")}
                      >
                        Release 1
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default Inventory;
