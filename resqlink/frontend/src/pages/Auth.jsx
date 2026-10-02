import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Auth.css";

const API = "http://localhost:5000/api";

function Auth() {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
  });

  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(`${API}/auth/${isLogin ? "login" : "register"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Unable to complete this request.");

      if (isLogin) {
        localStorage.setItem("resqlink_user_token", data.token);
        navigate("/", { replace: true });
      } else {
        setSuccess("Account created successfully. You can now sign in.");
        setIsLogin(true);
        setForm({ name: "", email: form.email, password: "" });
      }
    } catch (requestError) {
      setError(requestError.message || "Unable to complete this request.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">

      {/* LEFT BRAND PANEL */}

      <div className="auth-brand">

        <div className="auth-brand-logo">
          R
        </div>

        <div className="auth-brand-name">
          <strong>ResQLink</strong>
          <span>AI Emergency Response Network</span>
        </div>

        <div className="auth-brand-content">

          <span className="auth-label">
            RESQLINK
          </span>

          <h1>
            Smarter response.
            <br />
            When every second matters.
          </h1>

          <p>
            Connect with emergency services, rescue teams,
            hospitals and intelligent response tools through
            one unified network.
          </p>

        </div>

        <div className="auth-status">
          <span className="auth-status-dot"></span>
          Response network operational
        </div>

      </div>


      {/* RIGHT AUTH PANEL */}

      <div className="auth-panel">

        <div className="auth-card">

          <div className="auth-card-header">

            <span className="auth-small-label">
              {isLogin ? "WELCOME BACK" : "JOIN RESQLINK"}
            </span>

            <h2>
              {isLogin
                ? "Sign in to your account"
                : "Create your account"}
            </h2>

            <p>
              {isLogin
                ? "Access your emergency response dashboard."
                : "Create an account to access ResQLink services."}
            </p>

          </div>


          <form
            className="auth-form"
            onSubmit={handleSubmit}
          >

            {!isLogin && (
              <label>
                Full name

                <input
                  type="text"
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="Enter your name"
                  required
                />
              </label>
            )}


            <label>
              Email address

              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                placeholder="you@example.com"
                required
              />
            </label>


            <label>
              Password

              <input
                type="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                placeholder="Enter your password"
                required
              />
            </label>


            {isLogin && (
              <div className="auth-options">

                <label className="remember-option">
                  <input type="checkbox" />
                  <span>Remember me</span>
                </label>

                <button
                  type="button"
                  className="forgot-password"
                >
                  Forgot password?
                </button>

              </div>
            )}


            <button
              type="submit"
              className="auth-submit"
              disabled={loading}
            >
              {loading ? "Please wait..." : isLogin ? "Sign In" : "Create Account"}
              <span>→</span>
            </button>

            {error && <p className="auth-message auth-message-error" role="alert">{error}</p>}
            {success && <p className="auth-message auth-message-success" role="status">{success}</p>}

          </form>


          <div className="auth-divider">
            <span>OR</span>
          </div>


          <button
            type="button"
            className="google-auth"
          >
            <span>G</span>
            Continue with Google
          </button>


          <div className="auth-switch">

            {isLogin
              ? "Don't have an account?"
              : "Already have an account?"}

            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
            >
              {isLogin ? "Sign Up" : "Sign In"}
            </button>

          </div>

        </div>

      </div>

    </div>
  );
}

export default Auth;