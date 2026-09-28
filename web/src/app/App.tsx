import { lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { SiteShell } from "./SiteShell.js";
const SchedulePage = lazy(() => import("../pages/SchedulePage.js").then(page => ({default: page.SchedulePage})));
const EvacuationPage = lazy(() => import("../pages/EvacuationPage.js").then(page => ({default: page.EvacuationPage})));
const FindRoomPage = lazy(() => import("../pages/FindRoomPage.js").then(page => ({default: page.FindRoomPage})));
const GeneratedMapPage = lazy(() => import("../pages/GeneratedMapPage.js").then(page => ({default: page.GeneratedMapPage})));

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
