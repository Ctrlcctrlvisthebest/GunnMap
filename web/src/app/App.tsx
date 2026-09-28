import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { SiteShell } from "./SiteShell.js";
import { SchedulePage } from "../pages/SchedulePage.js";
import { EvacuationPage } from "../pages/EvacuationPage.js";
import { FindRoomPage } from "../pages/FindRoomPage.js";
import { GeneratedMapPage } from "../pages/GeneratedMapPage.js";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<SiteShell />}>
          <Route path="/" element={<SchedulePage />} />
          <Route path="/evacuation" element={<EvacuationPage />} />
          <Route path="/find-room" element={<FindRoomPage />} />
          <Route path="/generate-map" element={<GeneratedMapPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
