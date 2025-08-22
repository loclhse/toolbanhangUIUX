import { BrowserRouter as RouterProvider, Routes, Route } from 'react-router-dom';
import TablesPage from './pages/TablesPage';
import OrdersPage from './pages/OrdersPage';
import PaymentPage from './pages/PaymentPage';
import RevenuePage from './pages/RevenuePage';
import Layout from './components/Layout';

function Router() {
  return (
    <RouterProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<TablesPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/payment" element={<PaymentPage />} />
          <Route path="/revenue" element={<RevenuePage />} />
        </Routes>
      </Layout>
    </RouterProvider>
  );
}

export default Router; 