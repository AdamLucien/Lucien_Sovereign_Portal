import { Link, Route, Routes } from 'react-router-dom';

import AppShell from './layout/AppShell';
import PortalShell from './layout/PortalShell';
import AccessRolesPage from './pages/AccessRolesPage';
import BillingPage from './pages/BillingPage';
import ContractsPage from './pages/ContractsPage';
import DashboardPage from './pages/DashboardPage';
import DeliveryPipelinePage from './pages/DeliveryPipelinePage';
import IntelNodePage from './pages/IntelNodePage';
import InviteAcceptPage from './pages/InviteAcceptPage';
import LoginPage from './pages/LoginPage';
import OpsConsolePage from './pages/OpsConsolePage';
import OpsRequestsPage from './pages/OpsRequestsPage';
import OutputsPage from './pages/OutputsPage';
import ProtocolPage from './pages/ProtocolPage';
import SecureChannelPage from './pages/SecureChannelPage';
import SettlementPage from './pages/SettlementPage';
import { surface, text } from './styles/tokens';

const NotFound = () => {
  return (
    <div className={`${surface.panel} p-8`}>
      <h1 className="text-2xl font-semibold uppercase tracking-[0.3em]">Page not found</h1>
      <p className={`mt-3 text-sm ${text.muted}`}>Check the URL or return home.</p>
      <Link
        className="mt-6 inline-flex text-xs font-semibold uppercase tracking-widest text-indigo-200 hover:text-indigo-100"
        to="/"
      >
        Return home
      </Link>
    </div>
  );
};

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/invite" element={<InviteAcceptPage />} />
        <Route
          path="/*"
          element={
            <PortalShell>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/engagements/:id/intel" element={<IntelNodePage />} />
                <Route path="/protocol" element={<ProtocolPage />} />
                <Route path="/outputs" element={<OutputsPage />} />
                <Route path="/deliverables" element={<OutputsPage />} />
                <Route path="/secure-channel" element={<SecureChannelPage />} />
                <Route path="/settlement" element={<SettlementPage />} />
                <Route path="/billing" element={<BillingPage />} />
                <Route path="/ops" element={<OpsConsolePage />} />
                <Route path="/ops/requests" element={<OpsRequestsPage />} />
                <Route path="/ops/delivery" element={<DeliveryPipelinePage />} />
                <Route path="/ops/access" element={<AccessRolesPage />} />
                <Route path="/contracts" element={<ContractsPage />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </PortalShell>
          }
        />
      </Routes>
    </AppShell>
  );
}
