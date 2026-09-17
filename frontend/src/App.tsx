import { Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "./pages/Admin/LoginPage";
import DashboardPage from "./pages/Admin/DashboardPage";
import DriverPortal from "./pages/Driver/DriverPortal";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/driver" element={<DriverPortal />} />
    </Routes>
  );
}

export default App;
