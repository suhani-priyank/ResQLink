import { useEffect, useRef, useState } from "react";

function EmergencyAssistant() {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text:
        "Hi! I'm ResQLink AI Emergency Assistant. Tell me what is happening and I will guide you.",
    },
  ]);

  const [loading, setLoading] = useState(false);
  const [language, setLanguage] = useState("English");
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const recognitionRef = useRef(null);

  // =====================================================
  // LANGUAGE CONFIG
  // =====================================================

  const languageCodes = {
    English: "en-IN",
    Hindi: "hi-IN",
    Hinglish: "en-IN",
    Marathi: "mr-IN",
    Bengali: "bn-IN",
    Tamil: "ta-IN",
    Telugu: "te-IN",
  };

  // =====================================================
  // VOICE INPUT
  // =====================================================

  function startVoiceInput() {
    const SpeechRecognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert(
        "Voice input is not supported in this browser. Please use Google Chrome."
      );
      return;
    }

    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const recognition = new SpeechRecognition();

    recognition.lang =
      languageCodes[language] || "en-IN";

    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      setListening(true);
    };

    recognition.onresult = (event) => {
      const transcript =
        event.results[0][0].transcript;

      setMessage((prev) =>
        prev ? `${prev} ${transcript}` : transcript
      );
    };

    recognition.onerror = (event) => {
      console.error(
        "Voice recognition error:",
        event.error
      );

      if (event.error === "not-allowed") {
        alert(
          "Microphone permission was denied. Please allow microphone access."
        );
      }
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }

  // =====================================================
  // TEXT TO SPEECH
  // =====================================================

  function speakText(text) {
    if (!("speechSynthesis" in window)) {
      alert(
        "Voice output is not supported by this browser."
      );
      return;
    }

    window.speechSynthesis.cancel();

    const utterance =
      new SpeechSynthesisUtterance(text);

    const speechLanguages = {
      English: "en-IN",
      Hindi: "hi-IN",
      Hinglish: "en-IN",
      Marathi: "mr-IN",
      Bengali: "bn-IN",
      Tamil: "ta-IN",
      Telugu: "te-IN",
    };

    utterance.lang =
      speechLanguages[language] || "en-IN";

    utterance.rate = 0.95;
    utterance.pitch = 1;

    utterance.onstart = () => {
      setSpeaking(true);
    };

    utterance.onend = () => {
      setSpeaking(false);
    };

    utterance.onerror = () => {
      setSpeaking(false);
    };

    window.speechSynthesis.speak(
      utterance
    );
  }

  // Stop voice when component closes
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      window.speechSynthesis?.cancel();
    };
  }, []);

  // =====================================================
  // SEND MESSAGE
  // =====================================================

  async function sendMessage(customMessage = null) {
    const textToSend =
      customMessage !== null
        ? customMessage.trim()
        : message.trim();

    if (!textToSend || loading) return;

    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        text: textToSend,
      },
    ]);

    setMessage("");
    setLoading(true);

    try {
      const response = await fetch(
        "http://localhost:5000/api/ai-assistant/chat",
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            message: textToSend,
            language,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Request failed"
        );
      }

      const aiReply =
        data.reply ||
        "I could not generate a response.";

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: aiReply,
        },
      ]);
    } catch (error) {
      console.error(
        "Emergency Assistant Error:",
        error
      );

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text:
            "Sorry, the emergency assistant is temporarily unavailable. Please move to a safe location if possible and contact emergency services if someone is in immediate danger.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  // =====================================================
  // ENTER KEY
  // =====================================================

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  // =====================================================
  // QUICK PROMPTS
  // =====================================================

  const quickPrompts = [
    {
      icon: "🔥",
      label: "Fire",
      text:
        "There is a fire near me. What should I do?",
    },
    {
      icon: "🚑",
      label: "Medical",
      text:
        "Someone is seriously injured. What should I do?",
    },
    {
      icon: "🌊",
      label: "Flood",
      text:
        "There is flooding around me. How can I stay safe?",
    },
    {
      icon: "🏚️",
      label: "Trapped",
      text:
        "I am trapped and need emergency guidance.",
    },
  ];

  // =====================================================
  // UI
  // =====================================================

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(135deg, #f5f7f6 0%, #eef3f0 100%)",
        padding: "30px 15px",
        fontFamily:
          "Inter, Arial, sans-serif",
        color: "#17201c",
      }}
    >
      <div
        style={{
          maxWidth: "1000px",
          margin: "0 auto",
        }}
      >
        {/* =================================================
            HEADER
        ================================================= */}

        <div
          style={{
            background:
              "linear-gradient(135deg, #111915, #26342e)",
            color: "white",
            padding: "28px",
            borderRadius: "24px 24px 0 0",
            boxShadow:
              "0 12px 35px rgba(0,0,0,0.12)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: "20px",
              flexWrap: "wrap",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: "700",
                  letterSpacing: "2px",
                  color: "#f07b5f",
                  marginBottom: "8px",
                }}
              >
                RESQLINK AI
              </div>

              <h1
                style={{
                  margin: 0,
                  fontSize: "30px",
                }}
              >
                🤖 Emergency Assistant
              </h1>

              <p
                style={{
                  margin:
                    "8px 0 0",
                  color: "#c9d2ce",
                }}
              >
                Get situation-specific emergency
                guidance instantly.
              </p>
            </div>

            {/* ONLINE STATUS */}

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                background:
                  "rgba(255,255,255,0.08)",
                padding:
                  "9px 13px",
                borderRadius: "30px",
                fontSize: "13px",
              }}
            >
              <span
                style={{
                  width: "9px",
                  height: "9px",
                  borderRadius: "50%",
                  background: "#4ade80",
                  display: "inline-block",
                }}
              />

              AI Assistant Online
            </div>
          </div>
        </div>

        {/* =================================================
            QUICK ACTIONS
        ================================================= */}

        <div
          style={{
            background: "white",
            padding: "18px 20px",
            borderLeft:
              "1px solid #dfe5e2",
            borderRight:
              "1px solid #dfe5e2",
          }}
        >
          <div
            style={{
              fontSize: "12px",
              fontWeight: "700",
              color: "#68736e",
              letterSpacing: "1px",
              marginBottom: "10px",
            }}
          >
            QUICK HELP
          </div>

          <div
            style={{
              display: "flex",
              gap: "9px",
              overflowX: "auto",
            }}
          >
            {quickPrompts.map(
              (prompt) => (
                <button
                  key={prompt.label}
                  onClick={() =>
                    sendMessage(
                      prompt.text
                    )
                  }
                  disabled={loading}
                  style={{
                    whiteSpace:
                      "nowrap",
                    border:
                      "1px solid #dce3df",
                    background:
                      "#f8faf9",
                    padding:
                      "10px 14px",
                    borderRadius:
                      "12px",
                    cursor:
                      loading
                        ? "not-allowed"
                        : "pointer",
                    fontWeight: "600",
                    color: "#25322d",
                  }}
                >
                  {prompt.icon}{" "}
                  {prompt.label}
                </button>
              )
            )}
          </div>
        </div>

        {/* =================================================
            CHAT
        ================================================= */}

        <div
          style={{
            border:
              "1px solid #dfe5e2",
            borderTop: "none",
            minHeight: "430px",
            maxHeight: "500px",
            overflowY: "auto",
            padding: "22px",
            background:
              "#f7f9f8",
          }}
        >
          {messages.map(
            (item, index) => {
              const isUser =
                item.role ===
                "user";

              return (
                <div
                  key={index}
                  style={{
                    display: "flex",
                    justifyContent:
                      isUser
                        ? "flex-end"
                        : "flex-start",
                    gap: "10px",
                    marginBottom:
                      "18px",
                  }}
                >
                  {!isUser && (
                    <div
                      style={{
                        width: "36px",
                        height: "36px",
                        minWidth: "36px",
                        borderRadius:
                          "50%",
                        background:
                          "#17201c",
                        color: "white",
                        display: "flex",
                        alignItems:
                          "center",
                        justifyContent:
                          "center",
                        fontSize: "17px",
                      }}
                    >
                      🤖
                    </div>
                  )}

                  <div
                    style={{
                      maxWidth:
                        "76%",
                      padding:
                        "14px 17px",
                      borderRadius:
                        isUser
                          ? "18px 18px 5px 18px"
                          : "5px 18px 18px 18px",
                      background:
                        isUser
                          ? "#17201c"
                          : "white",
                      color:
                        isUser
                          ? "white"
                          : "#202923",
                      border:
                        isUser
                          ? "none"
                          : "1px solid #dfe5e2",
                      boxShadow:
                        "0 3px 10px rgba(0,0,0,0.04)",
                      whiteSpace:
                        "pre-wrap",
                      lineHeight: 1.55,
                    }}
                  >
                    {item.text}

                    {!isUser && (
                      <button
                        onClick={() =>
                          speakText(
                            item.text
                          )
                        }
                        style={{
                          display:
                            "block",
                          marginTop:
                            "10px",
                          border:
                            "none",
                          background:
                            "#f1f4f2",
                          borderRadius:
                            "8px",
                          padding:
                            "6px 9px",
                          cursor:
                            "pointer",
                          fontSize:
                            "12px",
                        }}
                      >
                        🔊 Listen
                      </button>
                    )}
                  </div>
                </div>
              );
            }
          )}

          {loading && (
            <div
              style={{
                display: "flex",
                gap: "10px",
                alignItems:
                  "center",
                color: "#68736e",
                fontSize: "14px",
              }}
            >
              <span
                style={{
                  fontSize: "20px",
                }}
              >
                🤖
              </span>

              AI is analyzing your
              situation...
            </div>
          )}
        </div>

        {/* =================================================
            INPUT
        ================================================= */}

        <div
          style={{
            background: "white",
            border:
              "1px solid #dfe5e2",
            borderTop: "none",
            padding: "16px",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: "10px",
              alignItems: "stretch",
              flexWrap: "wrap",
            }}
          >
            {/* LANGUAGE */}

            <select
              value={language}
              onChange={(e) =>
                setLanguage(
                  e.target.value
                )
              }
              style={{
                padding:
                  "12px 13px",
                borderRadius:
                  "12px",
                border:
                  "1px solid #d4ddd8",
                background:
                  "#f8faf9",
                fontWeight: "600",
                outline: "none",
              }}
            >
              <option>
                English
              </option>
              <option>
                Hindi
              </option>
              <option>
                Hinglish
              </option>
              <option>
                Marathi
              </option>
              <option>
                Bengali
              </option>
              <option>
                Tamil
              </option>
              <option>
                Telugu
              </option>
            </select>

            {/* TEXT BOX */}

            <textarea
              value={message}
              onChange={(e) =>
                setMessage(
                  e.target.value
                )
              }
              onKeyDown={
                handleKeyDown
              }
              placeholder="Describe your emergency..."
              rows={2}
              style={{
                flex: 1,
                minWidth:
                  "220px",
                resize: "none",
                padding:
                  "13px 15px",
                borderRadius:
                  "12px",
                border:
                  "1px solid #d4ddd8",
                fontSize:
                  "15px",
                outline: "none",
                fontFamily:
                  "inherit",
              }}
            />

            {/* VOICE */}

            <button
              onClick={
                startVoiceInput
              }
              title={
                listening
                  ? "Stop listening"
                  : "Voice input"
              }
              style={{
                width: "52px",
                border: "none",
                borderRadius:
                  "12px",
                background:
                  listening
                    ? "#dc2626"
                    : "#f1f4f2",
                color:
                  listening
                    ? "white"
                    : "#17201c",
                cursor:
                  "pointer",
                fontSize: "20px",
              }}
            >
              {listening
                ? "⏹️"
                : "🎙️"}
            </button>

            {/* SEND */}

            <button
              onClick={() =>
                sendMessage()
              }
              disabled={
                loading ||
                !message.trim()
              }
              style={{
                padding:
                  "12px 20px",
                border: "none",
                borderRadius:
                  "12px",
                background:
                  loading ||
                  !message.trim()
                    ? "#aeb8b3"
                    : "#17201c",
                color: "white",
                cursor:
                  loading ||
                  !message.trim()
                    ? "not-allowed"
                    : "pointer",
                fontWeight:
                  "700",
              }}
            >
              {loading
                ? "..."
                : "Send →"}
            </button>
          </div>

          {/* VOICE STATUS */}

          {listening && (
            <div
              style={{
                marginTop:
                  "10px",
                color: "#dc2626",
                fontSize:
                  "13px",
                fontWeight:
                  "600",
              }}
            >
              🔴 Listening... Speak
              clearly.
            </div>
          )}

          {speaking && (
            <div
              style={{
                marginTop:
                  "10px",
                color: "#2563eb",
                fontSize:
                  "13px",
                fontWeight:
                  "600",
              }}
            >
              🔊 AI is speaking...
            </div>
          )}
        </div>

        {/* =================================================
            SAFETY NOTICE
        ================================================= */}

        <div
          style={{
            background:
              "#fff7ed",
            border:
              "1px solid #fed7aa",
            borderRadius:
              "0 0 18px 18px",
            padding:
              "12px 16px",
            fontSize:
              "12px",
            color: "#9a3412",
          }}
        >
          ⚠️ <strong>Emergency notice:</strong>{" "}
          AI guidance is decision support only.
          If someone is in immediate danger,
          contact emergency services immediately.
        </div>

        <div
          style={{
            textAlign: "center",
            color: "#7b8580",
            fontSize: "12px",
            marginTop: "14px",
          }}
        >
          ResQLink Emergency Response Network
          • Available 24/7
        </div>
      </div>
    </div>
  );
}

export default EmergencyAssistant;