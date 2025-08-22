import React, { useEffect, useState } from 'react';
import { API_BASE_URL } from '../config';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useWebSocket } from '../contexts/WebSocketContext';

interface PaymentDetails {
  id: string;
  orderId: string;
  tableIds: string[];
  items?: {
    foodItemName: string;
    price: number;
    quantity: number;
    subtotal: number;
  }[];
  totalAmount: number;
  img?: string | null;
  orderCreatedAt: string;
  paidAt?: string;
  paymentMethod: 'CASH' | 'BANK_TRANSFER';
  paymentStatus: 'PENDING' | 'COMPLETED' | 'PAID' | 'FAILED';
}

const PaymentPage: React.FC = () => {
  const [paymentDetails, setPaymentDetails] = useState<PaymentDetails | null>(null);
  const [tableNumbers, setTableNumbers] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { on, off, isConnected } = useWebSocket();
  
  const paymentId = searchParams.get('paymentId');
  const orderIdFromUrl = searchParams.get('orderId');
  const paymentMethodFromUrl = searchParams.get('method') as 'CASH' | 'BANK_TRANSFER' | null;

  // Fetch table numbers from table IDs
  const fetchTableNumbers = async (tableIds: string[]) => {
    if (!tableIds || tableIds.length === 0) return [];
    
    try {
      const tableNumbers: number[] = [];
      for (const tableId of tableIds) {
        const res = await fetch(`${API_BASE_URL}/api/tables/${tableId}`);
        if (res.ok) {
          const tableData = await res.json();
          if (tableData.data && tableData.data.number) {
            tableNumbers.push(tableData.data.number);
          }
        }
      }
      return tableNumbers;
    } catch (error) {
      console.error('Error fetching table numbers:', error);
      return [];
    }
  };

  // Normalize API response shape (handles cases where backend wraps in { success, message, data })
  const extractPaymentFromResponse = (raw: any): PaymentDetails | null => {
    if (!raw) return null;
    const data = raw && raw.data && raw.items === undefined ? raw.data : raw; // prefer raw.data if items is missing
    if (!data) return null;
    return {
      id: data.id,
      orderId: data.orderId,
      tableIds: Array.isArray(data.tableIds) ? data.tableIds : [],
      items: Array.isArray(data.items) ? data.items : [],
      totalAmount: data.totalAmount ?? 0,
      img: data.img ?? null,
      orderCreatedAt: data.orderCreatedAt ?? new Date().toISOString(),
      paidAt: data.paidAt,
      paymentMethod: data.paymentMethod ?? (paymentMethodFromUrl || 'CASH'),
      paymentStatus: data.paymentStatus ?? 'PENDING',
    } as PaymentDetails;
  };

  useEffect(() => {
    const fetchOrInitiate = async () => {
      try {
        setLoading(true);
        setError(null);

        if (paymentId) {
          const res = await fetch(`${API_BASE_URL}/api/payments/${paymentId}`);
          if (!res.ok) {
            const text = await res.text();
            throw new Error(text || 'Failed to fetch payment details');
          }
          const raw = await res.json();
          const normalized = extractPaymentFromResponse(raw);
          if (!normalized) throw new Error('Invalid payment response');
          setPaymentDetails(normalized);
          
          // Fetch table numbers
          const numbers = await fetchTableNumbers(normalized.tableIds);
          setTableNumbers(numbers);
          
          setLoading(false);
          return;
        }

        // If we don't have a paymentId, try to initiate by orderId + method
        if (orderIdFromUrl && paymentMethodFromUrl) {
          const initRes = await fetch(`${API_BASE_URL}/api/payments/initiate/${orderIdFromUrl}?method=${paymentMethodFromUrl}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });

          if (!initRes.ok) {
            // Try to parse server error message
            let message = 'Khởi tạo thanh toán thất bại';
            try {
              const errBody = await initRes.json();
              if (errBody && errBody.message) message = errBody.message;
            } catch {}
            throw new Error(message);
          }

          const rawPayment = await initRes.json();
          const normalized = extractPaymentFromResponse(rawPayment);
          if (!normalized) throw new Error('Invalid payment response');
          setPaymentDetails(normalized);
          
          // Fetch table numbers
          const numbers = await fetchTableNumbers(normalized.tableIds);
          setTableNumbers(numbers);
          
          setLoading(false);
          // Replace URL with paymentId for idempotent reloads
          navigate(`/payment?paymentId=${normalized.id}&method=${paymentMethodFromUrl}`, { replace: true });
          return;
        }

        setError('Thiếu thông tin thanh toán');
        setLoading(false);
      } catch (err: any) {
        console.error('PaymentPage init/fetch error:', err);
        setError(err?.message || 'Đã xảy ra lỗi khi tải thanh toán');
        setLoading(false);
      }
    };

    fetchOrInitiate();
  }, [paymentId, orderIdFromUrl, paymentMethodFromUrl, navigate]);

  // WebSocket listeners for real-time payment updates
  useEffect(() => {
    console.log('💰 Setting up WebSocket listeners for payment updates');
    console.log('🔌 WebSocket connection status:', isConnected);

    const handlePaymentUpdate = (payment: any) => {
      console.log('💰 PaymentPage received payment update:', payment);
      console.log('💰 Payment status:', payment.paymentStatus);
      
      // Update payment details if this is the same payment
      if (payment.id === paymentId) {
        console.log('💰 Updating payment details with WebSocket data');
        setPaymentDetails(payment);
        
        // If payment is confirmed, just update the UI
        if (payment.paymentStatus === 'PAID') {
          console.log('💰 Payment confirmed, UI updated');
        }
      }
    };

    const handleOrderDeleted = (orderId: string) => {
      console.log('🗑️ PaymentPage received order deletion:', orderId);
      
      // If the order for this payment is deleted, navigate back
      if (paymentDetails && paymentDetails.orderId === orderId) {
        console.log('🗑️ Order for this payment was deleted, navigating back');
        navigate('/orders');
      }
    };

    on('payment_update', handlePaymentUpdate);
    on('order_deleted', handleOrderDeleted);

    return () => {
      console.log('💰 Cleaning up PaymentPage WebSocket listeners');
      off('payment_update');
      off('order_deleted');
    };
  }, [on, off, paymentId, paymentDetails, navigate, isConnected]);

  const formatVND = (amount: number) => amount.toLocaleString('vi-VN') + ' VND';

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    
    // Convert to local timezone
    const localDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
    
    const timeString = localDate.toLocaleTimeString('vi-VN', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      hour12: false 
    });
    const formattedDate = localDate.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    return `${timeString} ${formattedDate}`;
  };

  const getPaymentMethodLabel = (method: string) => {
    return method === 'CASH' ? 'Tiền Mặt' : 'Chuyển khoản';
  };

  const getPaymentStatusLabel = (status: string) => {
    switch (status) {
      case 'PENDING': return 'Chờ Thanh Toán';
      case 'COMPLETED': return 'Đã Thanh Toán';
      case 'PAID': return 'Đã Thanh Toán';
      case 'FAILED': return 'Thanh Toán Thất Bại';
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING': return '#ff9800';
      case 'COMPLETED': return '#4caf50';
      case 'PAID': return '#4caf50';
      case 'FAILED': return '#f44336';
      default: return '#666';
    }
  };

  const handleConfirmPayment = async () => {
    if (!paymentDetails) return;
    
    try {
      setConfirming(true);
      
      const response = await fetch(`${API_BASE_URL}/api/payments/${paymentDetails.id}/confirm`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to confirm payment');
      }

      const confirmedPayment = await response.json();
      
      console.log('✅ Payment confirmed via API:', confirmedPayment);
      console.log('📡 WebSocket will handle real-time updates');
      
      // Update the payment details with the confirmed status
      setPaymentDetails(confirmedPayment);
      
      // Navigate back to orders with success banner
      navigate('/orders', { state: { paymentSuccess: true } });
      
      // Don't reload the page - let WebSocket handle real-time updates
      // The WebSocket will receive the confirmation and update the UI
      
    } catch (error) {
      console.error('Payment confirmation error:', error);
      // Show error in console instead of alert
      console.error('Có lỗi xảy ra khi xác nhận thanh toán. Vui lòng thử lại.');
    } finally {
      setConfirming(false);
    }
  };

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f5f5f5',
        fontFamily: 'Segoe UI, Arial, sans-serif'
      }}>
        <div style={{
          textAlign: 'center',
          color: '#1976d2',
          fontSize: '18px'
        }}>
          Đang tải thông tin thanh toán...
        </div>
      </div>
    );
  }

  if (error || !paymentDetails) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f5f5f5',
        fontFamily: 'Segoe UI, Arial, sans-serif'
      }}>
        <div style={{
          textAlign: 'center',
          color: '#f44336',
          fontSize: '18px'
        }}>
          {error || 'Không tìm thấy thông tin thanh toán'}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f5f5f5',
      fontFamily: 'Segoe UI, Arial, sans-serif',
      padding: '20px'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '24px'
      }}>
        <h1 style={{
          fontSize: '32px',
          fontWeight: 700,
          color: '#263238',
          margin: 0
        }}>
          Chi Tiết Thanh Toán
        </h1>
      </div>

      {/* Payment Card */}
      <div style={{
        background: '#fff',
        borderRadius: '16px',
        padding: '24px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
        maxWidth: '600px',
        margin: '0 auto'
      }}>
        {/* Payment Status */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '24px',
          padding: '16px',
          background: '#f8f9fa',
          borderRadius: '12px',
          border: `2px solid ${getStatusColor(paymentDetails.paymentStatus)}`
        }}>
          <div>
            <div style={{
              fontSize: '20px',
              fontWeight: 600,
              color: '#263238',
              marginBottom: '6px'
            }}>
              Trạng Thái Thanh Toán
            </div>
            <div style={{
              fontSize: '18px',
              color: getStatusColor(paymentDetails.paymentStatus),
              fontWeight: 600
            }}>
              {getPaymentStatusLabel(paymentDetails.paymentStatus)}
            </div>
          </div>
          <div style={{
           fontSize: '20px',
           
            color: '#666',
            textAlign: 'right'
          }}>
            <div>Phương Thức</div>
            <div style={{ fontWeight: 600, color: '#263238', fontSize: '18px' }}>
              {getPaymentMethodLabel(paymentDetails.paymentMethod)}
            </div>
          </div>
        </div>

        {/* Order Details */}
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{
            fontSize: '24px',
            fontWeight: 600,
            color: '#263238',
            marginBottom: '20px',
            textAlign:'center'
          }}>
            Thông Tin Đơn Hàng
          </h3>
          
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '16px',
            marginBottom: '16px'
          }}>
            <div>
              <div style={{ fontSize: '20px', color: '#666', marginBottom: '6px' }}>
                Số Bàn:
              </div>
              <div style={{ fontSize: '18px', fontWeight: 600, color: '#263238' }}>
                {tableNumbers.length > 0 
                  ? `Bàn ${tableNumbers.join(', ')}` 
                  : 'Đang tải thông tin bàn...'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '20px', color: '#666', marginBottom: '6px' }}>
                Ngày Tạo:
              </div>
              <div style={{ fontSize: '18px', fontWeight: 600, color: '#263238' }}>
                {formatDate(paymentDetails.orderCreatedAt)}
              </div>
            </div>
          </div>

          {/* Order Items */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{
              fontSize: '24px',
              fontWeight: 600,
              color: '#263238',
              marginBottom: '16px',
              textAlign:'center'
            }}>
              Chi Tiết Món Ăn:
            </div>
            {(paymentDetails.items ?? []).map((item, index) => (
              <div key={index} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 0',
                borderBottom: index < ((paymentDetails.items?.length ?? 0) - 1) ? '1px solid #f0f0f0' : 'none'
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: '22px',
                    fontWeight: 600,
                    color: '#263238',
                    marginBottom: '6px'
                  }}>
                    {item.foodItemName} × {item.quantity}
                  </div>
                </div>
                <div style={{
                  fontSize: '20px',
                  fontWeight: 600,
                  color: '#ff9800'
                }}>
                  {formatVND(item.subtotal)}
                </div>
              </div>
            ))}
          </div>

          {/* Total */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '16px',
            background: '#f8f9fa',
            borderRadius: '12px',
            border: '2px solid #ff9800'
          }}>
            <div style={{
              fontSize: '24px',
              fontWeight: 600,
              color: '#263238'
            }}>
              Tổng Cộng
            </div>
            <div style={{
              fontSize: '26px',
              fontWeight: 700,
              color: '#ff9800'
            }}>
              {formatVND(paymentDetails.totalAmount)}
            </div>
          </div>
        </div>

        {/* QR Code for Bank Transfer Only */}
        {paymentDetails.paymentMethod === 'BANK_TRANSFER' && paymentDetails.img && (
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{
              fontSize: '16px',
              fontWeight: 600,
              color: '#263238',
              marginBottom: '16px'
            }}>
              Quét Mã QR Để Thanh Toán
            </div>
            <div style={{
              display: 'inline-block',
              padding: '16px',
              background: '#fff',
              borderRadius: '12px',
              border: '2px solid #e0e0e0',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
            }}>
              <img
                src={paymentDetails.img}
                alt="QR Code"
                style={{
                  width: '200px',
                  height: '200px',
                  objectFit: 'contain'
                }}
              />
            </div>
            <div style={{
              fontSize: '14px',
              color: '#666',
              marginTop: '12px'
            }}>
              Sử dụng ứng dụng ngân hàng để quét mã QR và hoàn tất thanh toán
            </div>
          </div>
        )}

        {/* Cash Payment Instructions */}
        {paymentDetails.paymentMethod === 'CASH' && (
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
           
            <div style={{
                padding: '20px',
              background: '#f8f9fa',
              borderRadius: '12px',
              border: '2px solid #ff9800',
              color: '#666',
              fontSize: '18px'
            }}>
              Vui lòng thu tiền từ khách hàng và xác nhận thanh toán
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{
          display: 'flex',
          gap: '12px',
          justifyContent: 'center'
        }}>
          <button
            onClick={() => navigate('/orders')}
            style={{
              background: '#ff9800',
              color: '#fff',
              fontWeight: 600,
              fontSize: '15px',
              border: 'none',
              borderRadius: '8px',
              padding: '14px 28px',
              cursor: 'pointer',
              transition: 'background 0.2s',
              minWidth: '150px',
            }}
            onMouseOver={e => (e.currentTarget.style.background = '#fb8c00')}
            onMouseOut={e => (e.currentTarget.style.background = '#ff9800')}
          >
            Quay Lại
          </button>
          
          {paymentDetails.paymentStatus === 'PENDING' && (
            <button
              onClick={handleConfirmPayment}
              disabled={confirming}
              style={{
                background: confirming ? '#ccc' : '#ff9800',
                color: '#fff',
                fontWeight: 600,
                fontSize: '15px',
                border: 'none',
                borderRadius: '8px',
                padding: '14px 28px',
                cursor: confirming ? 'not-allowed' : 'pointer',
                transition: 'background 0.2s',
                minWidth: '150px',
              }}
              onMouseOver={e => {
                if (!confirming) {
                  e.currentTarget.style.background = '#fb8c00';
                }
              }}
              onMouseOut={e => {
                if (!confirming) {
                  e.currentTarget.style.background = '#ff9800';
                }
              }}
            >
              {confirming ? 'Đang xác nhận...' : 'Đã Thanh Toán'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PaymentPage; 