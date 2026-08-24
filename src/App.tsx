import { HashRouter, Routes, Route } from "react-router";

import { SidebarInset, SidebarProvider } from "./components/ui/sidebar";
import { AppSidebar } from "./components/app-sidebar";
import HomePage from "./pages/homepage";
import ProjectsPage from "./pages/projects-page";
import ProjectPage from "./pages/project-page";
import SettingsPage from "./pages/settings-page";
import "./App.css";

function App() {
  return (
    <HashRouter>
      <SidebarProvider open={false}>
        <AppSidebar />
        <SidebarInset>
          <Routes>
            <Route index element={<HomePage />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/project/:id" element={<ProjectPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </SidebarInset>
      </SidebarProvider>
    </HashRouter>
  );
}

export default App;
