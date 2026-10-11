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
