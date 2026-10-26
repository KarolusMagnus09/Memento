
  import { createRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import "./styles/index.css";
  import "./styles/portrait-lock.css";
  import { initPortraitLock } from "./app/lib/portraitLock";

  initPortraitLock();
  createRoot(document.getElementById("root")!).render(<App />);
