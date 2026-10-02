import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Admin.css";

const API = "http://localhost:5000/api";

function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API}/admin/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Unable to sign in.");
      localStorage.setItem("resqlink_admin_token", data.token);
      navigate("/admin", { replace: true });
    } catch (requestError) {
      setError(requestError.message || "Unable to sign in.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="admin-auth-page">
      <section className="admin-auth-card">
        <button className="admin-back-link" onClick={() => navigate("/")}>← Back to ResQLink</button>
        <div className="admin-mark">R</div>
        <p className="admin-kicker">RESQLINK</p>
        <h1>Admin Control Center</h1>
        <p className="admin-auth-copy">Secure access for emergency-response administrators.</p>

        <form onSubmit={handleSubmit} className="admin-form">
          <label htmlFor="admin-email">Email / Admin ID</label>
          <input id="admin-email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
          <label htmlFor="admin-password">Password</label>
          <input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          {error && <p className="admin-form-error" role="alert">{error}</p>}
          <button className="admin-primary-button" type="submit" disabled={loading}>{loading ? "Signing in..." : "Sign In →"}</button>
        </form>
      </section>
    </main>
  );
}

export default AdminLogin;
