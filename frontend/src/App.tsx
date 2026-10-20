import { useEffect } from "react";
import { Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminRoute from "./components/AdminRoute";
import PublicRoute from "./components/PublicRoute";
import LoginPage from "./pages/Admin/LoginPage";
import DriverLoginPage from "./pages/Driver/LoginPage";
import DashboardPage from "./pages/Admin/DashboardPage";
import DriverPortal from "./pages/Driver/DriverPortal";
import NotFoundPage from "./pages/NotFoundPage";

function App() {
  useEffect(() => {
    const addTableTabStops = (root: ParentNode) => {
      root.querySelectorAll("table").forEach((table) => {
        if (!table.hasAttribute("tabindex")) table.tabIndex = 0;
      });
    };

    addTableTabStops(document);
    const observer = new MutationObserver((records) => {
      records.forEach((record) => record.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement) {
          if (node.matches("table")) addTableTabStops(node.parentNode ?? document);
          else addTableTabStops(node);
        }
      }));
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const handleTableArrowKeys = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.closest("input, textarea, select, button, a, [contenteditable='true'], [role='combobox']")) return;
      const table = target.closest("table");
      if (!table) return;

      let viewport: HTMLElement | null = table.parentElement;
      while (viewport && viewport !== document.body) {
        const style = window.getComputedStyle(viewport);
        if (viewport.scrollWidth > viewport.clientWidth + 1 && /(auto|scroll|overlay)/.test(style.overflowX)) break;
        viewport = viewport.parentElement;
      }
      if (!viewport || viewport === document.body) return;

      event.preventDefault();
      viewport.scrollBy({ left: (event.key === "ArrowRight" ? 1 : -1) * Math.max(80, viewport.clientWidth * 0.7), behavior: "smooth" });
    };
    document.addEventListener("keydown", handleTableArrowKeys);
    return () => {
      observer.disconnect();
      document.removeEventListener("keydown", handleTableArrowKeys);
    };
  }, []);

  return (
    <Routes>
      <Route
        path="/"
        element={
          <AdminRoute>
            <DashboardPage />
          </AdminRoute>
        }
      />

      <Route path="/trips" element={<AdminRoute><DashboardPage /></AdminRoute>} />
      <Route path="/reports" element={<AdminRoute><DashboardPage /></AdminRoute>} />
      <Route path="/reports/:reportKey" element={<AdminRoute><DashboardPage /></AdminRoute>} />
      <Route path="/trips/:tripId" element={<AdminRoute><DashboardPage /></AdminRoute>} />

      <Route
        path="/login"
        element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        }
      />

      <Route
        path="/trucker/login"
        element={
          <PublicRoute>
            <DriverLoginPage />
          </PublicRoute>
        }
      />

      <Route
        path="/trucker"
        element={
          <ProtectedRoute loginPath="/trucker/login">
            <DriverPortal />
          </ProtectedRoute>
        }
      />

      <Route
        path="/trucker/trips"
        element={
          <ProtectedRoute loginPath="/trucker/login">
            <DriverPortal />
          </ProtectedRoute>
        }
      />

      <Route
        path="/trucker/profile"
        element={
          <ProtectedRoute loginPath="/trucker/login">
            <DriverPortal />
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default App;
