import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Login.css";

const API = "http://localhost:5000/api";

function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Unable to sign in.");
      localStorage.setItem("resqlink_user_token", data.token);
      navigate("/", { replace: true });
    } catch (loginError) {
      setError(loginError.message || "Unable to sign in.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">

      <div className="auth-card">

        <div className="auth-logo">
          R
        </div>

        <h1>Welcome back</h1>

        <p className="auth-subtitle">
          Sign in to your ResQLink account
        </p>

        <form onSubmit={handleLogin}>

          <label>Email</label>

          <input
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <label>Password</label>

          <input
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <button type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Sign In →"}
          </button>

          {error && <p className="login-error" role="alert">{error}</p>}

        </form>

        <p className="auth-bottom">
          Don't have an account?
          <span onClick={() => navigate("/auth")}>
            {" "}Create account
          </span>
        </p>

        <button
          className="back-home"
          onClick={() => navigate("/")}
        >
          ← Back to Home
        </button>

        <div className="admin-login-option">
          <span>ResQLink administrators</span>
          <button
            type="button"
            onClick={() => navigate("/admin/login")}
          >
            Admin Login →
          </button>
        </div>

      </div>

    </div>
  );
}

export default Login;