import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./contexts/AuthContext";
import { ConfigProvider } from "./contexts/ConfigContext";
import { SoundProvider } from "./contexts/SoundContext";
import { PresenceProvider } from "./contexts/PresenceContext";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <ConfigProvider>
        <SoundProvider>
          <PresenceProvider>
            <App />
          </PresenceProvider>
        </SoundProvider>
      </ConfigProvider>
    </AuthProvider>
  </React.StrictMode>
);
