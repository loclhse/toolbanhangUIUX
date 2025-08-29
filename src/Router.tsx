import { BrowserRouter, Routes, Route } from 'react-router-dom';
import TablesPage from './pages/TablesPage';
import OrdersPage from './pages/OrdersPage';
import PaymentPage from './pages/PaymentPage';
import RevenuePage from './pages/RevenuePage';
import Layout from './components/Layout';

function Router() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<TablesPage />} />
          <Route path="tables" element={<TablesPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="payment" element={<PaymentPage />} />
          <Route path="revenue" element={<RevenuePage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default Router; 