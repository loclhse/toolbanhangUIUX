import React, { useEffect, useMemo, useState } from 'react';
import { API_BASE_URL } from '../config';
import { useNavigate } from 'react-router-dom';

type PaymentItem = {
  foodItemName: string;
  price: number;
  quantity: number;
  subtotal: number;
};

type Payment = {
  id: string;
  orderId: string;
  tableIds?: string[];
  items: PaymentItem[];
  totalAmount: number;
  img?: string | null;
  orderCreatedAt?: string;
  paidAt: string;
  paymentMethod: string;
  paymentStatus?: string;
};

type AggregatedFood = {
  name: string;
  count: number;
  price: number;
  totalRevenue: number;
};

const formatCurrency = (value: number): string =>
  new Intl.NumberFormat('vi-VN').format(Math.round(value));

const formatDateTime = (iso: string): string => {
  const date = new Date(iso);
  return `${date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} ${date.toLocaleDateString('vi-VN')}`;
};

const formatPaymentMethod = (method: string): string => {
  const normalized = (method || '').toUpperCase();
  switch (normalized) {
    case 'CASH':
      return 'Tiền Mặt';
    case 'BANK_TRANSFER':
    case 'BANK-TRANSFER':
      return 'Chuyển Khoản';
    case 'CARD':
      return 'Thẻ';
    default:
      return method;
  }
};

const RevenuePage: React.FC = () => {
  const navigate = useNavigate();

  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState<boolean>(false);
  const [showFoodModal, setShowFoodModal] = useState<boolean>(false);

  const fetchPayments = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API_BASE_URL}/api/payments`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as Payment[];
      // Sort by orderCreatedAt descending (newest first); fallback to paidAt when missing
      const sorted = [...data].sort((a, b) =>
        new Date(b.orderCreatedAt || b.paidAt).getTime() - new Date(a.orderCreatedAt || a.paidAt).getTime()
      );
      setPayments(sorted);
    } catch (e: any) {
      setError(e?.message || 'Lỗi tải dữ liệu');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    window.location.reload();
  };

  useEffect(() => {
    fetchPayments();
  }, []);

  const totalOrders = useMemo(() => payments.length, [payments]);

  const totalRevenue = useMemo(
    () => payments.reduce((sum, p) => sum + (Number(p.totalAmount) || 0), 0),
    [payments]
  );

  const allFoodsByPopularity = useMemo<AggregatedFood[]>(() => {
    const map = new Map<string, AggregatedFood>();
    for (const p of payments) {
      for (const it of p.items || []) {
        const key = it.foodItemName || 'Khác';
        const prev = map.get(key);
        if (!prev) {
          map.set(key, {
            name: key,
            count: it.quantity || 0,
            price: it.price || 0,
            totalRevenue: (it.price || 0) * (it.quantity || 0),
          });
        } else {
          prev.count += it.quantity || 0;
          // keep the latest non-zero price
          prev.price = it.price || prev.price;
          prev.totalRevenue += (it.price || 0) * (it.quantity || 0);
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [payments]);

  const mostOrderedFood = useMemo(() => {
    if (allFoodsByPopularity.length === 0) return { name: '—', count: 0 } as { name: string; count: number };
    const first = allFoodsByPopularity[0];
    return { name: first.name, count: first.count };
  }, [allFoodsByPopularity]);

  const dailyRevenue = useMemo(() => {
    // last 7 days including today
    const days: { label: string; total: number; dateKey: string }[] = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({ label: d.toLocaleDateString('vi-VN', { weekday: 'short' }), total: 0, dateKey: key });
    }
    const map = new Map(days.map((d) => [d.dateKey, d]));
    for (const p of payments) {
      const key = new Date(p.paidAt).toISOString().slice(0, 10);
      const found = map.get(key);
      if (found) found.total += Number(p.totalAmount) || 0;
    }
    return days;
  }, [payments]);

  const maxDaily = Math.max(1, ...dailyRevenue.map((d) => d.total));

  const todayVsYesterday = useMemo(() => {
    const len = dailyRevenue.length;
    const todayTotal = len >= 1 ? dailyRevenue[len - 1].total : 0;
    const yesterdayTotal = len >= 2 ? dailyRevenue[len - 2].total : 0;
    let changePct = 0;
    if (yesterdayTotal === 0) {
      changePct = todayTotal > 0 ? 100 : 0;
    } else {
      changePct = ((todayTotal - yesterdayTotal) / yesterdayTotal) * 100;
    }
    const rounded = Math.round(changePct * 10) / 10;
    const direction = rounded > 0 ? 'up' : rounded < 0 ? 'down' : 'same';
    return { rounded, direction } as { rounded: number; direction: 'up' | 'down' | 'same' };
  }, [dailyRevenue]);

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb' }}>
      {/* Header */}
      <div style={{ background: 'white', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 16px' }}>
          <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '16px', paddingBottom: '16px' }}>
            <button
              onClick={() => navigate('/orders')}
              style={{
                background: '#ff9800',
                color: '#fff',
                fontWeight: 600,
                fontSize: 15,
                border: 'none',
                borderRadius: 8,
                padding: '8px 22px',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(255, 152, 0, 0.08)',
                letterSpacing: 1,
                transition: 'background 0.2s',
                minWidth: '120px',
                textAlign: 'center',
              }}
              onMouseOver={(e) => (e.currentTarget.style.background = '#fb8c00')}
              onMouseOut={(e) => (e.currentTarget.style.background = '#ff9800')}
            >
              Quay lại
            </button>

            <button
              onClick={handleRefresh}
              aria-label="Làm mới"
              title="Làm mới"
              style={{
                width: 54,
                height: 54,
                borderRadius: '50%',
                border: '1px solid #cbd5e1',
                background:
                  'radial-gradient(circle at 30% 30%, #ffffff 0%, #e5e7eb 35%, #d1d5db 60%, #9ca3af 100%)',
                boxShadow:
                  'inset 0 2px 6px rgba(255,255,255,0.6), inset 0 -2px 6px rgba(0,0,0,0.15), 0 4px 10px rgba(0,0,0,0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
              }}
            >
              <span
                className="refresh-icon"
                style={{
                  fontSize: 26,
                  lineHeight: 1,
                  fontWeight: 700,
                  color: '#0f172a',
                  fontFamily: "'Segoe UI Symbol','Noto Sans Symbols','Arial Unicode MS',system-ui,sans-serif",
                  userSelect: 'none',
                }}
              >
                ⭮
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '32px 16px' }}>
        {/* Page Title */}
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <h1 style={{ fontSize: '2.25rem', fontWeight: 'bold', color: '#ff9800' }}>Quản Lý Doanh Thu</h1>
        </div>

        {/* Metrics Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', marginBottom: '32px' }}>
          {/* Total Orders Card - Clickable */}
          <div
            onClick={() => setShowPaymentModal(true)}
            style={{
              background: 'white',
              borderRadius: '12px',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
              padding: '24px',
              border: '1px solid #e5e7eb',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              transform: 'translateY(0)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 8px 12px -2px rgba(0, 0, 0, 0.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#374151', margin: '0 0 8px 0' }}>Số Lượng Đơn</h3>
                <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#111827', lineHeight: '1' }}>
                  {totalOrders.toLocaleString()}
                </div>
              </div>
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>Nhấn vào để xem chi tiết</div>
          </div>

          {/* Total Revenue Card */}
          <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', padding: '24px', border: '1px solid #e5e7eb' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#374151', margin: '0 0 8px 0' }}>Doanh Thu</h3>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 36, fontWeight: 800, color: '#111827', lineHeight: 1 }}>
                    {formatCurrency(totalRevenue)}
                  </span>
                  <span style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>VND</span>
                </div>
                {/* Today vs Yesterday indicator */}
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {todayVsYesterday.direction === 'up' && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 15l6-6 6 6" />
                    </svg>
                  )}
                  {todayVsYesterday.direction === 'down' && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  )}
                  {todayVsYesterday.direction === 'same' && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 12h16" />
                    </svg>
                  )}
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color:
                        todayVsYesterday.direction === 'up'
                          ? '#10b981'
                          : todayVsYesterday.direction === 'down'
                          ? '#ef4444'
                          : '#6b7280',
                    }}
                  >
                    {todayVsYesterday.direction === 'up' && `Tăng ${Math.abs(todayVsYesterday.rounded)}% so với hôm qua`}
                    {todayVsYesterday.direction === 'down' && `Giảm ${Math.abs(todayVsYesterday.rounded)}% so với hôm qua`}
                    {todayVsYesterday.direction === 'same' && 'Không đổi so với hôm qua'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Most Ordered Food Card - Clickable */}
          <div
            onClick={() => setShowFoodModal(true)}
            style={{
              background: 'white',
              borderRadius: '12px',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
              padding: '24px',
              border: '1px solid #e5e7eb',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              transform: 'translateY(0)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 8px 12px -2px rgba(0, 0, 0, 0.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#374151', margin: '0 0 8px 0' }}>Món Được Gọi Nhiều Nhất</h3>
                <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#111827', lineHeight: '1.2', marginBottom: '4px' }}>
                  {mostOrderedFood.name}
                </div>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ff9800' }}>
                  {mostOrderedFood.count} lần
                </div>
              </div>
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>Nhấn vào để xem chi tiết</div>
          </div>
        </div>

        {/* Column Chart */}
        <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)', padding: '32px', marginBottom: '32px' }}>
          <div style={{ marginBottom: 16, fontWeight: 600, color: '#374151' }}>Doanh thu 7 ngày gần đây</div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', height: 180 }}>
            {dailyRevenue.map((d, idx) => {
              const height = Math.max(6, Math.round((d.total / maxDaily) * 160));
              return (
                <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div
                    style={{
                      height,
                      width: '100%',
                      minWidth: 20,
                      background: 'linear-gradient(180deg, #ffedd5, #fb923c)',
                      borderRadius: 6,
                      animation: 'slideUp 380ms ease',
                    }}
                    title={`${formatCurrency(d.total)} VND`}
                  />
                  <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>{d.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Payment Modal */}
      {showPaymentModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onClick={() => setShowPaymentModal(false)}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: 12,
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              maxWidth: '90vw',
              maxHeight: '80vh',
              width: 800,
              overflow: 'hidden',
              position: 'relative',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ background: '#f9fafb', padding: 24, borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#374151', margin: 0 }}>Chi Tiết Đơn Hàng ({totalOrders} đơn)</h2>
              <button
                onClick={() => setShowPaymentModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8, borderRadius: 6, color: '#6b7280' }}
              >
                <svg style={{ width: 24, height: 24 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div style={{ maxHeight: 'calc(80vh - 80px)', overflowY: 'auto' }}>
              {payments.length === 0 ? (
                <div style={{ padding: 48, textAlign: 'center', color: '#6b7280' }}>Chưa có thanh toán</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="payment-table" style={{ width: '100%', minWidth: '640px', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                    <colgroup>
                      <col className="col-method" style={{ width: '40%' }} />
                      <col className="col-amount" style={{ width: '22%' }} />
                      <col className="col-time" style={{ width: '38%' }} />
                    </colgroup>
                    <thead style={{ background: '#f9fafb', position: 'sticky', top: 0 }}>
                      <tr>
                        <th className="col-method" style={{ padding: '8px 10px 8px 12px', textAlign: 'left', fontSize: 14, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Phương Thức Thanh Toán</th>
                        <th className="col-amount" style={{ padding: '8px 6px', textAlign: 'left', fontSize: 14, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tổng Tiền</th>
                        <th className="col-time" style={{ padding: '8px 12px', textAlign: 'right', fontSize: 14, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ngày Tạo</th>
                      </tr>
                    </thead>
                    <tbody style={{ background: 'white' }}>
                      {payments.map((payment) => (
                        <tr key={payment.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                          <td className="col-method" style={{ padding: '10px 10px 10px 12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
                              <div style={{ width: 8, height: 8, background: '#10b981', borderRadius: '50%', marginRight: 12 }} />
                              <span style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>{formatPaymentMethod(payment.paymentMethod)}</span>
                            </div>
                          </td>
                          <td className="col-amount" style={{ padding: '10px 6px', whiteSpace: 'nowrap', textAlign: 'left' }}>
                            <div style={{ fontSize: 16, fontWeight: 'bold', color: '#111827' }}>{formatCurrency(payment.totalAmount)} VND</div>
                          </td>
                          <td className="col-time" style={{ padding: '10px 12px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                            <div style={{ fontSize: 16, fontWeight: 600, color: '#111827', display: 'inline-block' }}>{formatDateTime(payment.paidAt)}</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Food Popularity Modal */}
      {showFoodModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onClick={() => setShowFoodModal(false)}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: 12,
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              maxWidth: '90vw',
              maxHeight: '80vh',
              width: 800,
              overflow: 'hidden',
              position: 'relative',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ background: '#fef3c7', padding: 24, borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ background: '#f59e0b', padding: 8, borderRadius: 8 }}>
                  <svg style={{ width: 24, height: 24, color: 'white' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                  </svg>
                </div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#374151', margin: 0 }}>Thống Kê Món Ăn Theo Độ Phổ Biến</h2>
              </div>
              <button onClick={() => setShowFoodModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8, borderRadius: 6, color: '#6b7280' }}>
                <svg style={{ width: 24, height: 24 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Content */}
            <div style={{ maxHeight: 'calc(80vh - 80px)', overflowY: 'auto' }}>
              {allFoodsByPopularity.length === 0 ? (
                <div style={{ padding: 48, textAlign: 'center' }}>
                  <div style={{ width: 96, height: 96, background: '#fef3c7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                    <svg style={{ width: 48, height: 48, color: '#f59e0b' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12z" />
                    </svg>
                  </div>
                  <h4 style={{ fontSize: '1.125rem', fontWeight: 500, color: '#111827', marginBottom: 8 }}>Chưa có dữ liệu món ăn</h4>
                  <p style={{ color: '#6b7280' }}>Chưa có món ăn nào được đặt</p>
                </div>
              ) : (
                <div style={{ padding: 24 }}>
                  <div style={{ display: 'grid', gap: 16 }}>
                    {allFoodsByPopularity.map((food, index) => (
                      <div
                        key={food.name}
                        style={{
                          background: index === 0 ? '#fef3c7' : '#f9fafb',
                          borderRadius: 12,
                          padding: 20,
                          border: index === 0 ? '2px solid #f59e0b' : '1px solid #e5e7eb',
                          position: 'relative',
                        }}
                      >
                        <div>
                          <div>
                            <h3 style={{ fontSize: 18, fontWeight: 'bold', color: '#111827', margin: '0 0 8px 0' }}>
                              {food.name}
                              {index === 0 && <span style={{ marginLeft: 8, fontSize: 16 }}>⭐</span>}
                            </h3>
                            <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
                              <div>
                                <span style={{ fontSize: 24, fontWeight: 'bold', color: '#ff9800' }}>{food.count}</span>
                                <span style={{ fontSize: 16, color: '#374151', fontWeight: 600, marginLeft: 4 }}>lần gọi</span>
                              </div>
                              <div>
                                <span style={{ fontSize: 16, fontWeight: 'bold', color: '#000' }}>{formatCurrency(food.price)} VND</span>
                                <span style={{ fontSize: 16, color: '#374151', fontWeight: 600, marginLeft: 4 }}>/món</span>
                              </div>
                              <div>
                                <span style={{ fontSize: 16, fontWeight: 'bold', color: '#000' }}>{formatCurrency(food.totalRevenue)} VND</span>
                                <span style={{ fontSize: 16, color: '#374151', fontWeight: 600, marginLeft: 4 }}>tổng</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Loading / Error */}
      {loading && (
        <div style={{ position: 'fixed', bottom: 16, right: 16, background: 'white', padding: '8px 12px', borderRadius: 8, boxShadow: '0 4px 10px rgba(0,0,0,0.08)' }}>
          <span style={{ marginRight: 8, display: 'inline-block', width: 14, height: 14, border: '2px solid #ff9800', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          Đang tải...
        </div>
      )}
      {error && (
        <div style={{ position: 'fixed', bottom: 16, right: 16, background: '#fee2e2', color: '#991b1b', padding: '10px 14px', borderRadius: 8, boxShadow: '0 4px 10px rgba(0,0,0,0.08)' }}>
          Lỗi: {error}
        </div>
      )}

      {/* Animation Styles */}
      <style>{`
        @keyframes slideUp {
          from { height: 0; opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes spin { 0% { transform: rotate(0deg) } 100% { transform: rotate(360deg) } }
      `}</style>
    </div>
  );
};

export default RevenuePage;
