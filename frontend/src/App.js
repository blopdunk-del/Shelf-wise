import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Layout from "@/components/app/Layout";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Dashboard from "@/pages/Dashboard";
import Inventory from "@/pages/Inventory";
import AddMedicine from "@/pages/AddMedicine";
import UploadReceipt from "@/pages/UploadReceipt";
import Membership from "@/pages/Membership";
import Admin from "@/pages/Admin";
import Tutorial from "@/pages/Tutorial";

const Loading = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="animate-pulse text-sm text-muted-foreground">Loading...</div>
  </div>
);

// Premium-only route — non-premium users redirected to tutorial
const Premium = ({ children, adminOnly }) => {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && !user.is_admin) return <Navigate to="/" replace />;
  if (!user.is_premium) return <Navigate to="/tutorial" replace />;
  return <Layout>{children}</Layout>;
};

// Available to any logged-in user (free or premium): Tutorial + Membership
const AnyUser = ({ children, hideLayout }) => {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (hideLayout) return children;
  return <Layout>{children}</Layout>;
};

const PublicOnly = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (user) return <Navigate to={user.is_premium ? "/" : "/tutorial"} replace />;
  return children;
};

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <Toaster position="top-center" richColors />
          <Routes>
            <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
            <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />

            {/* Free-tier accessible: only tutorial & membership */}
            <Route path="/tutorial" element={<AnyUser hideLayout><Tutorial /></AnyUser>} />
            <Route path="/membership" element={<AnyUser><Membership /></AnyUser>} />

            {/* Premium-only app */}
            <Route path="/" element={<Premium><Dashboard /></Premium>} />
            <Route path="/inventory" element={<Premium><Inventory /></Premium>} />
            <Route path="/add" element={<Premium><AddMedicine /></Premium>} />
            <Route path="/upload" element={<Premium><UploadReceipt /></Premium>} />
            <Route path="/admin" element={<Premium adminOnly><Admin /></Premium>} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
