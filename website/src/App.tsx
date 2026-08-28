import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Features from './pages/Features';
import Download from './pages/Download';
import Privacy from './pages/Privacy';
import VerifyAuth from './pages/VerifyAuth';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="features" element={<Features />} />
        <Route path="download" element={<Download />} />
        <Route path="privacy" element={<Privacy />} />
        <Route path="auth/verify" element={<VerifyAuth />} />
      </Route>
    </Routes>
  );
}
