import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import "./RescueTeam.css";

const SOS_API = "http://localhost:5000/api/sos";
const TEAM_API = "http://localhost:5000/api/rescue-teams";

const STATUS_SEQUENCE = [
  "Pending",
  "Assigned",
  "Dispatched",
  "On the Way",
  "Reached",
  "Rescuing",
  "Completed",
];

function RescueTeam() {
  const location = useLocation();
  const incomingSosId = location.state?.sosId;

  const [sosList, setSosList] = useState([]);
  const [teams, setTeams] = useState([]);
  const [selectedSOS, setSelectedSOS] = useState(null);
  const [recommendedTeams, setRecommendedTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [teamLoading, setTeamLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // =====================================================
  // LOAD SOS
  // =====================================================
  const loadSOS = async () => {
    try {
      setError("");

      const response = await fetch(SOS_API);
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to load SOS requests.");
      }

      const requests = data.sosRequests || [];
      setSosList(requests);

      // Keep the selected SOS if it still exists.
      if (selectedSOS) {
        const updated = requests.find(
          (item) => item._id === selectedSOS._id
        );

        if (updated) {
          setSelectedSOS(updated);
        }
      }
    } catch (err) {
      console.error("Load SOS Error:", err);
      setError(err.message || "Unable to load SOS requests.");
    } finally {
      setLoading(false);
    }
  };

  // =====================================================
  // LOAD RESCUE TEAMS
  // =====================================================
  const loadTeams = async () => {
    try {
      setTeamLoading(true);

      const response = await fetch(TEAM_API);
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to load rescue teams.");
      }

      setTeams(data.teams || []);
    } catch (err) {
      console.error("Load Teams Error:", err);
      setError(err.message || "Unable to load rescue teams.");
    } finally {
      setTeamLoading(false);
    }
  };

  useEffect(() => {
    loadSOS();
    loadTeams();

    const interval = setInterval(() => {
      loadSOS();
      loadTeams();
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  // =====================================================
  // GET RECOMMENDED TEAMS FOR SELECTED SOS
  // =====================================================
  const loadRecommendedTeams = async (sos) => {
    try {
      setSelectedSOS(sos);
      setRecommendedTeams([]);
      setMessage("");
      setError("");

      const response = await fetch(
        `${SOS_API}/${sos._id}/recommended-teams`
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "Unable to find recommended rescue teams."
        );
      }

      setRecommendedTeams(data.recommendedTeams || []);
    } catch (err) {
      console.error("Recommended Teams Error:", err);
      setError(err.message || "Unable to find recommended teams.");
    }
  };

  // =====================================================
  // OPEN SOS PASSED FROM RESPONSE MAP
  // =====================================================
  useEffect(() => {
    if (!incomingSosId || sosList.length === 0) return;

    const targetSOS = sosList.find(
      (sos) => sos._id === incomingSosId
    );

    if (targetSOS && selectedSOS?._id !== targetSOS._id) {
      loadRecommendedTeams(targetSOS);
    }
  }, [incomingSosId, sosList]);

  // =====================================================
  // ASSIGN TEAM
  // =====================================================
  const assignTeam = async (teamId) => {
    if (!selectedSOS) return;

    try {
      setActionLoading(true);
      setMessage("");
      setError("");

      const response = await fetch(
        `${SOS_API}/${selectedSOS._id}/assign`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            teamId,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to assign rescue team.");
      }

      setMessage(
        `Rescue team "${data.team?.teamName || "team"}" assigned successfully.`
      );

      setSelectedSOS(data.sos);

      // Refresh everything so the assigned team becomes Busy.
      await loadSOS();
      await loadTeams();

      // Reload recommendations. The assigned team will disappear because
      // the backend only recommends Available teams.
      const recResponse = await fetch(
        `${SOS_API}/${data.sos._id}/recommended-teams`
      );
      const recData = await recResponse.json();

      if (recResponse.ok && recData.success) {
        setRecommendedTeams(recData.recommendedTeams || []);
      } else {
        setRecommendedTeams([]);
      }
    } catch (err) {
      console.error("Assign Team Error:", err);
      setError(err.message || "Unable to assign rescue team.");
    } finally {
      setActionLoading(false);
    }
  };

  // =====================================================
  // UPDATE SOS STATUS
  // =====================================================
  const updateStatus = async (status) => {
    if (!selectedSOS) return;

    try {
      setActionLoading(true);
      setMessage("");
      setError("");

      const response = await fetch(
        `${SOS_API}/${selectedSOS._id}/status`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to update SOS status.");
      }

      setSelectedSOS(data.sos);
      setMessage(`SOS status updated to "${status}".`);

      await loadSOS();
      await loadTeams();
    } catch (err) {
      console.error("Status Update Error:", err);
      setError(err.message || "Unable to update SOS status.");
    } finally {
      setActionLoading(false);
    }
  };

  // =====================================================
  // NEXT STATUS
  // =====================================================
  const getNextStatus = () => {
    if (!selectedSOS) return null;

    const currentIndex = STATUS_SEQUENCE.indexOf(
      selectedSOS.status
    );

    if (
      currentIndex === -1 ||
      currentIndex >= STATUS_SEQUENCE.length - 1
    ) {
      return null;
    }

    return STATUS_SEQUENCE[currentIndex + 1];
  };

  const nextStatus = getNextStatus();

  // =====================================================
  // HELPERS
  // =====================================================
  const statusClass = (status) => {
    if (status === "Completed") return "completed";
    if (status === "Rescuing") return "rescuing";
    if (status === "Pending") return "pending";
    if (status === "Assigned") return "assigned";
    return "progress";
  };

  const assignedTeam = selectedSOS?.assignedTeam
    ? teams.find(
        (team) =>
          team._id ===
          (selectedSOS.assignedTeam?._id || selectedSOS.assignedTeam)
      )
    : null;

  // =====================================================
  // UI
  // =====================================================
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f5f7f6",
        padding: "30px",
        fontFamily: "Arial, sans-serif",
        color: "#17201b",
      }}
    >
      <div
        style={{
          maxWidth: "1250px",
          margin: "0 auto",
        }}
      >
        <div
          style={{
            background: "#ffffff",
            borderRadius: "20px",
            padding: "28px",
            boxShadow: "0 8px 30px rgba(0,0,0,0.06)",
            marginBottom: "24px",
          }}
        >
          <h1 style={{ margin: 0, fontSize: "32px" }}>
            🚑 Rescue Team Control Center
          </h1>

          <p
            style={{
              color: "#66736c",
              marginTop: "8px",
              marginBottom: 0,
            }}
          >
            Select an SOS, view the best available rescue teams,
            assign a team, and update the response status.
          </p>
        </div>

        {message && (
          <div
            style={{
              background: "#dcfce7",
              color: "#166534",
              padding: "14px 18px",
              borderRadius: "12px",
              marginBottom: "18px",
              fontWeight: "600",
            }}
          >
            ✅ {message}
          </div>
        )}

        {error && (
          <div
            style={{
              background: "#fee2e2",
              color: "#991b1b",
              padding: "14px 18px",
              borderRadius: "12px",
              marginBottom: "18px",
              fontWeight: "600",
            }}
          >
            ❌ {error}
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
            gap: "22px",
            alignItems: "start",
          }}
        >
          {/* =================================================
              SOS LIST
          ================================================= */}
          <section
            style={{
              background: "#ffffff",
              borderRadius: "18px",
              padding: "22px",
              boxShadow: "0 8px 30px rgba(0,0,0,0.05)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "18px",
              }}
            >
              <h2 style={{ margin: 0 }}>
                🚨 Active SOS Requests
              </h2>

              <span
                style={{
                  background: "#fee2e2",
                  color: "#b91c1c",
                  padding: "7px 12px",
                  borderRadius: "20px",
                  fontWeight: "700",
                }}
              >
                {sosList.filter(
                  (sos) => sos.status !== "Completed"
                ).length}
              </span>
            </div>

            {loading ? (
              <p>Loading SOS requests...</p>
            ) : sosList.length === 0 ? (
              <p style={{ color: "#66736c" }}>
                No SOS requests found.
              </p>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                  maxHeight: "620px",
                  overflowY: "auto",
                }}
              >
                {sosList
                  .filter((sos) => sos.status !== "Completed")
                  .sort(
                    (a, b) =>
                      (b.priorityScore || 0) -
                      (a.priorityScore || 0)
                  )
                  .map((sos) => (
                    <button
                      key={sos._id}
                      onClick={() => loadRecommendedTeams(sos)}
                      style={{
                        textAlign: "left",
                        border:
                          selectedSOS?._id === sos._id
                            ? "2px solid #16a34a"
                            : "1px solid #e5e7eb",
                        background:
                          selectedSOS?._id === sos._id
                            ? "#f0fdf4"
                            : "#ffffff",
                        borderRadius: "14px",
                        padding: "16px",
                        cursor: "pointer",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "10px",
                        }}
                      >
                        <strong>
                          🚨{" "}
                          {sos.disasterType ||
                            "Emergency"}
                        </strong>

                        <span
                          className={statusClass(
                            sos.status
                          )}
                          style={{
                            background:
                              sos.status === "Pending"
                                ? "#fef3c7"
                                : sos.status ===
                                  "Completed"
                                ? "#dcfce7"
                                : "#dbeafe",
                            color:
                              sos.status === "Pending"
                                ? "#92400e"
                                : sos.status ===
                                  "Completed"
                                ? "#166534"
                                : "#1d4ed8",
                            padding: "4px 9px",
                            borderRadius: "15px",
                            fontSize: "12px",
                            fontWeight: "700",
                          }}
                        >
                          {sos.status}
                        </span>
                      </div>

                      <div
                        style={{
                          marginTop: "9px",
                          fontSize: "14px",
                          color: "#59655e",
                        }}
                      >
                        📍{" "}
                        {sos.location?.address ||
                          "Location unavailable"}
                      </div>

                      <div
                        style={{
                          display: "flex",
                          gap: "16px",
                          marginTop: "10px",
                          fontSize: "13px",
                        }}
                      >
                        <span>
                          Priority:{" "}
                          <strong>
                            {sos.priorityScore ?? "-"}
                          </strong>
                        </span>

                        <span>
                          People:{" "}
                          <strong>
                            {sos.peopleCount ?? "-"}
                          </strong>
                        </span>

                        <span>
                          Severity:{" "}
                          <strong>
                            {sos.severity || "-"}
                          </strong>
                        </span>
                      </div>
                    </button>
                  ))}
              </div>
            )}
          </section>

          {/* =================================================
              SELECTED SOS
          ================================================= */}
          <section
            style={{
              background: "#ffffff",
              borderRadius: "18px",
              padding: "22px",
              boxShadow: "0 8px 30px rgba(0,0,0,0.05)",
            }}
          >
            {!selectedSOS ? (
              <div
                style={{
                  minHeight: "400px",
                  display: "grid",
                  placeItems: "center",
                  textAlign: "center",
                  color: "#66736c",
                }}
              >
                <div>
                  <div style={{ fontSize: "55px" }}>
                    🚑
                  </div>
                  <h2>Select an SOS</h2>
                  <p>
                    Select an emergency from the left to
                    find and assign a rescue team.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <h2 style={{ marginTop: 0 }}>
                  🚨 SOS Details
                </h2>

                <div
                  style={{
                    background: "#f8faf9",
                    padding: "16px",
                    borderRadius: "14px",
                    marginBottom: "20px",
                  }}
                >
                  <p>
                    <strong>Type:</strong>{" "}
                    {selectedSOS.disasterType ||
                      "Emergency"}
                  </p>

                  <p>
                    <strong>Severity:</strong>{" "}
                    {selectedSOS.severity}
                  </p>

                  <p>
                    <strong>Priority Score:</strong>{" "}
                    {selectedSOS.priorityScore ?? "-"}
                  </p>

                  <p>
                    <strong>People:</strong>{" "}
                    {selectedSOS.peopleCount}
                  </p>

                  <p>
                    <strong>Medical:</strong>{" "}
                    {selectedSOS.medicalRequired
                      ? "Required"
                      : "Not required"}
                  </p>

                  <p>
                    <strong>Location:</strong>{" "}
                    {selectedSOS.location?.address ||
                      "Unavailable"}
                  </p>

                  <p>
                    <strong>Status:</strong>{" "}
                    {selectedSOS.status}
                  </p>

                  {selectedSOS.description && (
                    <p>
                      <strong>Description:</strong>{" "}
                      {selectedSOS.description}
                    </p>
                  )}
                </div>

                {/* =================================================
                    ASSIGNED TEAM
                ================================================= */}
                {assignedTeam && (
                  <div
                    style={{
                      background: "#ecfdf5",
                      border: "1px solid #bbf7d0",
                      borderRadius: "14px",
                      padding: "16px",
                      marginBottom: "20px",
                    }}
                  >
                    <h3 style={{ marginTop: 0 }}>
                      ✅ Assigned Team
                    </h3>

                    <p>
                      <strong>
                        {assignedTeam.teamName}
                      </strong>
                    </p>

                    <p>
                      Code: {assignedTeam.teamCode}
                    </p>

                    <p>
                      📍{" "}
                      {assignedTeam.location?.address ||
                        "Location unavailable"}
                    </p>

                    <p>
                      📞 {assignedTeam.phone || "N/A"}
                    </p>
                  </div>
                )}

                {/* =================================================
                    RECOMMENDED TEAMS
                ================================================= */}
                <h3>
                  🚑 Recommended Rescue Teams
                </h3>

                {teamLoading && (
                  <p>Loading rescue teams...</p>
                )}

                {!teamLoading &&
                  recommendedTeams.length === 0 &&
                  selectedSOS.status === "Pending" && (
                    <p
                      style={{
                        color: "#66736c",
                        background: "#f8faf9",
                        padding: "14px",
                        borderRadius: "10px",
                      }}
                    >
                      No recommendation loaded yet or no
                      available team was found.
                    </p>
                  )}

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                  }}
                >
                  {recommendedTeams.map(
                    (item, index) => {
                      const team = item.team || item;

                      return (
                        <div
                          key={
                            team._id ||
                            team.teamCode ||
                            index
                          }
                          style={{
                            border: "1px solid #e5e7eb",
                            borderRadius: "14px",
                            padding: "15px",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent:
                                "space-between",
                              gap: "10px",
                            }}
                          >
                            <strong>
                              🚑 {team.teamName}
                            </strong>

                            {item.score !== undefined && (
                              <strong
                                style={{
                                  color: "#15803d",
                                }}
                              >
                                Score: {item.score}
                              </strong>
                            )}
                          </div>

                          <p
                            style={{
                              fontSize: "13px",
                              color: "#59655e",
                              marginBottom: "8px",
                            }}
                          >
                            {team.teamCode} •{" "}
                            {team.location?.city},{" "}
                            {team.location?.state}
                          </p>

                          {item.distance !==
                            undefined && (
                            <p
                              style={{
                                fontSize: "13px",
                                color: "#2563eb",
                              }}
                            >
                              📍 {item.distance} km away
                            </p>
                          )}

                          <p
                            style={{
                              fontSize: "13px",
                            }}
                          >
                            👥 {team.members} members
                          </p>

                          <button
                            onClick={() =>
                              assignTeam(team._id)
                            }
                            disabled={
                              actionLoading ||
                              selectedSOS.status !==
                                "Pending"
                            }
                            style={{
                              width: "100%",
                              border: "none",
                              borderRadius: "10px",
                              padding: "11px",
                              background:
                                actionLoading ||
                                selectedSOS.status !==
                                  "Pending"
                                  ? "#d1d5db"
                                  : "#16a34a",
                              color: "#ffffff",
                              fontWeight: "700",
                              cursor:
                                actionLoading ||
                                selectedSOS.status !==
                                  "Pending"
                                  ? "not-allowed"
                                  : "pointer",
                            }}
                          >
                            {actionLoading
                              ? "Assigning..."
                              : "🚑 Assign This Team"}
                          </button>
                        </div>
                      );
                    }
                  )}
                </div>

                {/* =================================================
                    STATUS CONTROL
                ================================================= */}
                <div
                  style={{
                    marginTop: "25px",
                    paddingTop: "20px",
                    borderTop: "1px solid #e5e7eb",
                  }}
                >
                  <h3>📊 Response Status</h3>

                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "7px",
                      marginBottom: "16px",
                    }}
                  >
                    {STATUS_SEQUENCE.map((status) => {
                      const currentIndex =
                        STATUS_SEQUENCE.indexOf(
                          selectedSOS.status
                        );

                      const statusIndex =
                        STATUS_SEQUENCE.indexOf(status);

                      const isCurrent =
                        status === selectedSOS.status;

                      const isDone =
                        currentIndex >= 0 &&
                        statusIndex <= currentIndex;

                      return (
                        <span
                          key={status}
                          style={{
                            padding: "7px 10px",
                            borderRadius: "20px",
                            fontSize: "12px",
                            fontWeight: "700",
                            background: isCurrent
                              ? "#16a34a"
                              : isDone
                              ? "#dcfce7"
                              : "#f1f5f9",
                            color: isCurrent
                              ? "#ffffff"
                              : isDone
                              ? "#166534"
                              : "#64748b",
                          }}
                        >
                          {isDone && !isCurrent
                            ? "✓ "
                            : ""}
                          {status}
                        </span>
                      );
                    })}
                  </div>

                  {nextStatus &&
                    selectedSOS.status !==
                      "Pending" && (
                      <button
                        onClick={() =>
                          updateStatus(nextStatus)
                        }
                        disabled={actionLoading}
                        style={{
                          width: "100%",
                          padding: "13px",
                          border: "none",
                          borderRadius: "11px",
                          background: "#2563eb",
                          color: "#ffffff",
                          fontWeight: "700",
                          cursor: actionLoading
                            ? "not-allowed"
                            : "pointer",
                          opacity: actionLoading
                            ? 0.6
                            : 1,
                        }}
                      >
                        {actionLoading
                          ? "Updating..."
                          : `➡️ Move to ${nextStatus}`}
                      </button>
                    )}

                  {selectedSOS.status ===
                    "Pending" && (
                    <p
                      style={{
                        color: "#92400e",
                        background: "#fffbeb",
                        padding: "12px",
                        borderRadius: "10px",
                        fontSize: "13px",
                      }}
                    >
                      Assign a rescue team first. After
                      assignment, the response sequence can
                      be progressed.
                    </p>
                  )}

                  {selectedSOS.status ===
                    "Completed" && (
                    <p
                      style={{
                        color: "#166534",
                        background: "#dcfce7",
                        padding: "12px",
                        borderRadius: "10px",
                        fontWeight: "700",
                      }}
                    >
                      🎉 Rescue operation completed.
                    </p>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export default RescueTeam;