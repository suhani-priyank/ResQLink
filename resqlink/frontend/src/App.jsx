import { BrowserRouter, Routes, Route } from "react-router-dom";

import Home from "./pages/home";
import ResponseMap from "./pages/ResponseMap";
import RescueTeam from "./pages/RescueTeam";
import EmergencyAssistant from "./pages/EmergencyAssistant";
import Auth from "./pages/Auth";
import Login from "./pages/Login";
import Analytics from "./pages/Analytics";
import CommandCenter from "./pages/CommandCenter";
import Inventory from "./pages/Inventory";
import Hospitals from "./pages/Hospitals";
import Agencies from "./pages/Agencies";
import Groups from "./pages/Groups";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";

function App() {
  return (
    <BrowserRouter>
      <Routes>

        {/* HOME */}
        <Route path="/" element={<Home />} />

        {/* RESPONSE MAP */}
        <Route
          path="/response-map"
          element={<ResponseMap />}
        />

        {/* RESCUE TEAM */}
        <Route
          path="/rescue-team"
          element={<RescueTeam />}
        />

        {/* AI EMERGENCY ASSISTANT */}
        <Route
          path="/emergency-assistant"
          element={<EmergencyAssistant />}
        />

        {/* ANALYTICS (Feature 11 + 12 hotspots) */}
        <Route path="/analytics" element={<Analytics />} />

        {/* AUTHORITY COMMAND CENTER (Feature 16, includes digital twin + escalations) */}
        <Route path="/command-center" element={<CommandCenter />} />

        {/* INTELLIGENT RESOURCE INVENTORY (Feature 18) */}
        <Route path="/inventory" element={<Inventory />} />

        {/* HOSPITAL CAPACITY AWARENESS (Feature 13) */}
        <Route path="/hospitals" element={<Hospitals />} />

        {/* CROSS-AGENCY INTEROPERABILITY (Feature 15) */}
        <Route path="/agencies" element={<Agencies />} />

        {/* FAMILY / GROUP SOS (Feature 17) */}
        <Route path="/groups" element={<Groups />} />

        {/* AUTH */}
        <Route
          path="/auth"
          element={<Auth />}
        />

        {/* LOGIN */}
        <Route
          path="/login"
          element={<Login />}
        />

        {/* ADMIN CONTROL CENTER */}
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/incidents" element={<AdminDashboard />} />
        <Route path="/admin/sos" element={<AdminDashboard />} />
        <Route path="/admin/teams" element={<AdminDashboard />} />
        <Route path="/admin/hospitals" element={<AdminDashboard />} />
        <Route path="/admin/resources" element={<AdminDashboard />} />
        <Route path="/admin/agencies" element={<AdminDashboard />} />
        <Route path="/admin/users" element={<AdminDashboard />} />
        <Route path="/admin/analytics" element={<AdminDashboard />} />
        <Route path="/admin/logs" element={<AdminDashboard />} />
        <Route path="/admin/settings" element={<AdminDashboard />} />

      </Routes>
    </BrowserRouter>
  );
}

export default App;