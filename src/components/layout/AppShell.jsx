import { useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import Header from "./Header";

export default function AppShell({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    function handleResize() {
      if (window.innerWidth > 980) setSidebarOpen(false);
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className={`app-shell ${sidebarOpen ? "sidebar-mobile-open" : ""}`}>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="app-main">
        <Header onOpenSidebar={() => setSidebarOpen(true)} />
        <main className="page-content">{children}</main>
      </div>

      <button
        type="button"
        className={`sidebar-backdrop ${sidebarOpen ? "visible" : ""}`}
        aria-label="Fechar menu lateral"
        onClick={() => setSidebarOpen(false)}
      />
    </div>
  );
}
