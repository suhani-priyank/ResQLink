# 🚨 ResQLink — AI-Powered Emergency Response Network

**ResQLink** is an AI-powered disaster and emergency response platform designed to connect citizens, rescue teams, hospitals, emergency resources, and authorities through a unified response network.

The platform aims to streamline emergency reporting, assist rescue-team selection, and improve coordination during disasters and medical emergencies.

## ✨ Features

- 🚨 **Emergency SOS:** Report emergencies with location and incident details.
- 🤖 **AI Emergency Assistant:** Analyze emergency information and provide response guidance.
- 🧠 **AI-Based SOS Classification:** Help identify emergency types, severity, and urgency.
- 🚑 **Smart Rescue-Team Recommendation:** Recommend teams based on availability, skills, capacity, and location.
- 🗺️ **Live Response Map:** Visualize incidents and available response resources.
- 🏥 **Hospital and Shelter Awareness:** Help users locate relevant emergency facilities where mapped data is available.
- 📍 **Location Support:** Use location information to assist emergency reporting and response planning.
- 📊 **Analytics Dashboard:** Present emergency activity and response information.
- 👨‍🚒 **Rescue-Team Management:** Support team availability and emergency assignment workflows.
- 🌙 **Dark and Light Modes:** Switch between interface themes.

*Feature availability depends on the current implementation, backend configuration, and connected data sources.*

## 🛠️ Tech Stack

**Frontend**
- React
- Vite
- JavaScript
- HTML and CSS
- React Router
- Leaflet / React Leaflet

**Backend**
- Node.js
- Express.js
- MongoDB
- Mongoose

**AI Integration**
- Google Gemini API

## 📁 Project Structure

```text
ResQLink/
├── resqlink/
│   ├── backend/
│   │   ├── config/
│   │   ├── middleware/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── .env.example
│   │   ├── package.json
│   │   └── server.js
│   └── frontend/
│       ├── public/
│       ├── src/
│       ├── index.html
│       └── package.json
└── README.md
```

*The structure above is illustrative; adjust it to match the files actually present in your repository.*

## ⚙️ Getting Started

### Prerequisites

Install:
- Node.js and npm
- MongoDB or a MongoDB Atlas database
- A Gemini API key if using Gemini-powered features

### 1. Clone the repository

```bash
git clone https://github.com/suhani-priyank/ResQLink.git
cd ResQLink
```

### 2. Configure the backend

```bash
cd resqlink/backend
npm install
```

Create a `.env` file using `.env.example` as a reference. Add your own configuration values:

```env
PORT=5000
MONGO_URI=your_mongodb_connection_string
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-3.6-flash
ADMIN_JWT_SECRET=your_long_random_secret
ADMIN_EMAIL=your_admin_email
ADMIN_PASSWORD=your_secure_admin_password
ADMIN_NAME=ResQLink Administrator
```

Use the model name supported by your configured Gemini account and SDK. Never commit your real `.env` file or credentials.

Start the backend using the script configured in `package.json`, for example:

```bash
npm run dev
```

### 3. Start the frontend

Open a second terminal:

```bash
cd resqlink/frontend
npm install
npm run dev
```

Open the local URL printed by Vite, commonly `http://localhost:5173`.

## 🔄 How It Works

1. A user submits an emergency report or SOS.
2. Emergency information is processed and classified.
3. The system identifies suitable available rescue teams.
4. The response team can be recommended and assigned through the supported workflow.
5. Incident status and response information can be monitored through the dashboard and map.

## 🔐 Security

- Store API keys, database credentials, and JWT secrets in environment variables.
- Never commit `.env` files or real administrator credentials.
- Validate and authorize administrator actions on the backend.
- Do not rely on frontend-only authentication for access control.

## 🚀 Future Scope

- Offline and low-network SOS support
- Multilingual and voice-based emergency reporting
- ETA prediction and safer route planning
- Duplicate emergency detection
- Predictive disaster analytics
- Improved coordination between emergency agencies

## 👩‍💻 Author

**Suhani Priyank**

GitHub: [@suhani-priyank](https://github.com/suhani-priyank)

## ⚠️ Disclaimer

ResQLink is a software project intended to support emergency coordination. It does not replace official emergency services. In India, call **112** for immediate emergency assistance.
