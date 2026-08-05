import { Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import Navbar from './components/Navbar.jsx';
import Footer from './components/Footer.jsx';
import { ToastProvider } from './components/Toast.jsx';
import Home from './pages/Home.jsx';
import GameDetail from './pages/GameDetail.jsx';
import Leaderboard from './pages/Leaderboard.jsx';
import SubmitGame from './pages/SubmitGame.jsx';
import Announcements from './pages/Announcements.jsx';
import AnnouncementDetail from './pages/AnnouncementDetail.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import VerifyEmail from './pages/VerifyEmail.jsx';
import Settings from './pages/Settings.jsx';
import Profile from './pages/Profile.jsx';
import Notifications from './pages/Notifications.jsx';
import Appeals from './pages/Appeals.jsx';
import { reportVisit } from './api.js';

export default function App() {
  useEffect(() => {
    reportVisit(); // 页面加载上报访问（当日人数统计）
  }, []);

  return (
    <ToastProvider>
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Navbar />
        <div style={{ flex: 1 }}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/games/:id" element={<GameDetail />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/submit" element={<SubmitGame />} />
            <Route path="/announcements" element={<Announcements />} />
            <Route path="/announcements/:id" element={<AnnouncementDetail />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/appeals" element={<Appeals />} />
            <Route path="*" element={<div className="empty">页面不存在</div>} />
          </Routes>
        </div>
        <Footer />
      </div>
    </ToastProvider>
  );
}
