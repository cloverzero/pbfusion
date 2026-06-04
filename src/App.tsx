import { HashRouter, Routes, Route } from "react-router";

import { SidebarInset, SidebarProvider } from "./components/ui/sidebar";
import { AppSidebar } from "./components/app-sidebar";
import ProjectsPage from "./pages/homepage";
import ProjectPage from "./pages/project-page";
import "./App.css";

function App() {
  return (
    <HashRouter>
      <SidebarProvider open={false}>
        <AppSidebar />
        <SidebarInset>
          <Routes>
            <Route index element={<ProjectsPage />} />
            <Route path="/project/:id" element={<ProjectPage />} />
          </Routes>
        </SidebarInset>
      </SidebarProvider>
    </HashRouter>
  );
}

export default App;
