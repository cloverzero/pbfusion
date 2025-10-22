import { HashRouter, Routes, Route } from "react-router";

import { SidebarInset, SidebarProvider } from "./components/ui/sidebar";
import { AppSidebar } from "./components/app-sidebar";
import Homepage from "./pages/homepage";
import "./App.css";

function App() {
  return (
    <HashRouter>
      <SidebarProvider open={false}>
        <AppSidebar />
        <SidebarInset>
          <Routes>
            <Route index element={<Homepage />} />
          </Routes>
        </SidebarInset>
      </SidebarProvider>
    </HashRouter>
  );
}

export default App;
