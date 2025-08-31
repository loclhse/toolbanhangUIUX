import React, { useEffect, useState } from 'react';
import { API_BASE_URL } from '../config';
import { useNavigate, useSearchParams } from 'react-router-dom';

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
        } else if (orderIdFromUrl && paymentMethodFromUrl) {
          // Create new payment
          const res = await fetch(`${API_BASE_URL}/api/payments/initiate/${orderIdFromUrl}?method=${paymentMethodFromUrl}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });

          if (!res.ok) {
            const text = await res.text();
            throw new Error(text || 'Failed to create payment');
          }

          const raw = await res.json();
          const normalized = extractPaymentFromResponse(raw);
          if (!normalized) throw new Error('Invalid payment response');
          setPaymentDetails(normalized);
          
          // Fetch table numbers
          const numbers = await fetchTableNumbers(normalized.tableIds);
          setTableNumbers(numbers);
          
          setLoading(false);
        } else {
          throw new Error('Missing payment ID or order ID');
        }
      } catch (err: any) {
        console.error('Payment fetch/initiate error:', err);
        setError(err?.message || 'Đã xảy ra lỗi khi tải thanh toán');
        setLoading(false);
      }
    };

    fetchOrInitiate();
  }, [paymentId, orderIdFromUrl, paymentMethodFromUrl, navigate]);

  // Removed WebSocket listeners - not needed since user navigates back to orders immediately after payment
  // OrdersPage will handle all real-time updates via WebSocket

  const formatVND = (amount: number) => amount.toLocaleString('vi-VN');

const formatVNDWithCurrency = (amount: number) => amount.toLocaleString('vi-VN') + ' Đồng';

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
        background: '#f5f5f5',
        fontFamily: 'Segoe UI, Arial, sans-serif',
        padding: '20px'
      }}>
        {/* Header skeleton */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '24px'
        }}>
          <div style={{
            background: '#e0e0e0',
            borderRadius: '8px',
            width: '300px',
            height: '40px',
            animation: 'pulse 1.5s ease-in-out infinite'
          }} />
        </div>

        {/* Payment Card skeleton */}
        <div style={{
          background: '#fff',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
          maxWidth: '600px',
          margin: '0 auto'
        }}>
          {/* Payment Status skeleton */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '24px',
            padding: '16px',
            background: '#f8f9fa',
            borderRadius: '12px',
            border: '2px solid #e0e0e0'
          }}>
            <div>
              <div style={{
                background: '#e0e0e0',
                borderRadius: '4px',
                width: '200px',
                height: '24px',
                marginBottom: '8px',
                animation: 'pulse 1.5s ease-in-out infinite'
              }} />
              <div style={{
                background: '#e0e0e0',
                borderRadius: '4px',
                width: '150px',
                height: '20px',
                animation: 'pulse 1.5s ease-in-out infinite'
              }} />
            </div>
            <div>
              <div style={{
                background: '#e0e0e0',
                borderRadius: '4px',
                width: '120px',
                height: '16px',
                marginBottom: '8px',
                animation: 'pulse 1.5s ease-in-out infinite'
              }} />
              <div style={{
                background: '#e0e0e0',
                borderRadius: '4px',
                width: '100px',
                height: '20px',
                animation: 'pulse 1.5s ease-in-out infinite'
              }} />
            </div>
          </div>

          {/* Order Details skeleton */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{
              background: '#e0e0e0',
              borderRadius: '4px',
              width: '250px',
              height: '30px',
              margin: '0 auto 20px auto',
              animation: 'pulse 1.5s ease-in-out infinite'
            }} />
            
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '16px',
              marginBottom: '16px'
            }}>
              <div>
                <div style={{
                  background: '#e0e0e0',
                  borderRadius: '4px',
                  width: '80px',
                  height: '20px',
                  marginBottom: '8px',
                  animation: 'pulse 1.5s ease-in-out infinite'
                }} />
                <div style={{
                  background: '#e0e0e0',
                  borderRadius: '4px',
                  width: '120px',
                  height: '18px',
                  animation: 'pulse 1.5s ease-in-out infinite'
                }} />
              </div>
              <div>
                <div style={{
                  background: '#e0e0e0',
                  borderRadius: '4px',
                  width: '80px',
                  height: '20px',
                  marginBottom: '8px',
                  animation: 'pulse 1.5s ease-in-out infinite'
                }} />
                <div style={{
                  background: '#e0e0e0',
                  borderRadius: '4px',
                  width: '140px',
                  height: '18px',
                  animation: 'pulse 1.5s ease-in-out infinite'
                }} />
              </div>
            </div>

            {/* Order Items skeleton */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{
                background: '#e0e0e0',
                borderRadius: '4px',
                width: '200px',
                height: '30px',
                margin: '0 auto 16px auto',
                animation: 'pulse 1.5s ease-in-out infinite'
              }} />
              
              {[1, 2, 3].map((index) => (
                <div key={index} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 0',
                  borderBottom: index < 3 ? '1px solid #f0f0f0' : 'none'
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      background: '#e0e0e0',
                      borderRadius: '4px',
                      width: '180px',
                      height: '22px',
                      marginBottom: '6px',
                      animation: 'pulse 1.5s ease-in-out infinite'
                    }} />
                  </div>
                  <div style={{
                    background: '#e0e0e0',
                    borderRadius: '4px',
                    width: '100px',
                    height: '20px',
                    animation: 'pulse 1.5s ease-in-out infinite'
                  }} />
                </div>
              ))}
            </div>

            {/* Total skeleton */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '16px',
              background: '#f8f9fa',
              borderRadius: '12px',
              border: '2px solid #e0e0e0'
            }}>
              <div style={{
                background: '#e0e0e0',
                borderRadius: '4px',
                width: '120px',
                height: '24px',
                animation: 'pulse 1.5s ease-in-out infinite'
              }} />
              <div style={{
                background: '#e0e0e0',
                borderRadius: '4px',
                width: '140px',
                height: '26px',
                animation: 'pulse 1.5s ease-in-out infinite'
              }} />
            </div>
          </div>

          {/* QR Code skeleton */}
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{
              background: '#e0e0e0',
              borderRadius: '4px',
              width: '200px',
              height: '16px',
              margin: '0 auto 16px auto',
              animation: 'pulse 1.5s ease-in-out infinite'
            }} />
            <div style={{
              display: 'inline-block',
              padding: '16px',
              background: '#fff',
              borderRadius: '12px',
              border: '2px solid #e0e0e0',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
            }}>
              <div style={{
                background: '#e0e0e0',
                borderRadius: '4px',
                width: '200px',
                height: '200px',
                animation: 'pulse 1.5s ease-in-out infinite'
              }} />
            </div>
          </div>

          {/* Action buttons skeleton */}
          <div style={{
            display: 'flex',
            gap: '16px',
            justifyContent: 'center'
          }}>
            <div style={{
              background: '#e0e0e0',
              borderRadius: '8px',
              width: '120px',
              height: '48px',
              animation: 'pulse 1.5s ease-in-out infinite'
            }} />
            <div style={{
              background: '#e0e0e0',
              borderRadius: '8px',
              width: '120px',
              height: '48px',
              animation: 'pulse 1.5s ease-in-out infinite'
            }} />
          </div>
        </div>
        
        <style>{`
          @keyframes pulse {
            0% {
              opacity: 1;
            }
            50% {
              opacity: 0.5;
            }
            100% {
              opacity: 1;
            }
          }
        `}</style>
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
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px'
    }}>
      {/* Payment Card */}
      <div style={{
        background: '#fff',
        borderRadius: '16px',
        padding: '20px',
        boxShadow: '0 6px 24px rgba(0, 0, 0, 0.08)',
        maxWidth: '480px',
        width: '100%'
      }}>
        {/* Payment Status Header */}
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
              fontSize: '16px',
              fontWeight: 600,
              color: '#263238',
              marginBottom: '6px'
            }}>
              Trạng Thái Thanh Toán
            </div>
            <div style={{
              fontSize: '18px',
              color: getStatusColor(paymentDetails.paymentStatus),
              fontWeight: 700
            }}>
              {getPaymentStatusLabel(paymentDetails.paymentStatus)}
            </div>
          </div>
          <div style={{
            textAlign: 'right'
          }}>
            <div style={{ fontSize: '14px', color: '#666', marginBottom: '3px' }}>
              Phương Thức
            </div>
            <div style={{ 
              fontWeight: 600, 
              color: '#263238', 
              fontSize: '16px' 
            }}>
              {getPaymentMethodLabel(paymentDetails.paymentMethod)}
            </div>
          </div>
        </div>

        {/* Order Information */}
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{
            fontSize: '20px',
            fontWeight: 700,
            color: '#263238',
            marginBottom: '20px',
            textAlign: 'center'
          }}>
            Thông Tin Đơn Hàng
          </h3>
          
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '16px',
            marginBottom: '20px'
          }}>
            <div>
              <div style={{ 
                fontSize: '14px', 
                color: '#666', 
                marginBottom: '6px',
                fontWeight: 500
              }}>
                Số Bàn:
              </div>
              <div style={{ 
                fontSize: '16px', 
                fontWeight: 700, 
                color: '#263238' 
              }}>
                {tableNumbers.length > 0 
                  ? `Bàn ${tableNumbers.join(', ')}` 
                  : 'Đang tải thông tin bàn...'}
              </div>
            </div>
            <div>
              <div style={{ 
                fontSize: '14px', 
                color: '#666', 
                marginBottom: '6px',
                fontWeight: 500
              }}>
                Ngày Tạo:
              </div>
              <div style={{ 
                fontSize: '16px', 
                fontWeight: 700, 
                color: '#263238' 
              }}>
                {formatDate(paymentDetails.orderCreatedAt)}
              </div>
            </div>
          </div>

          {/* Order Items */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{
              fontSize: '20px',
              fontWeight: 700,
              color: '#263238',
              marginBottom: '16px',
              textAlign: 'center'
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
                    fontSize: '18px',
                    fontWeight: 600,
                    color: '#263238',
                    marginBottom: '3px'
                  }}>
                    {item.foodItemName} × {item.quantity}
                  </div>
                </div>
                <div style={{
                  fontSize: '18px',
                  fontWeight: 700,
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
            background: '#fff3e0',
            borderRadius: '12px',
            border: '2px solid #ff9800'
          }}>
            <div style={{
              fontSize: '13px',
              fontWeight: 700,
              color: '#263238'
            }}>
              Tổng Cộng:
            </div>
            <div style={{
              fontSize: '19px',
              fontWeight: 800,
              color: '#ff9800'
            }}>
              {formatVNDWithCurrency(paymentDetails.totalAmount)}
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
              boxShadow: '0 3px 12px rgba(0, 0, 0, 0.08)'
            }}>
              <img
                src={paymentDetails.img}
                alt="QR Code"
                style={{
                  width: '200px',
                  height: '200px',
                  borderRadius: '10px'
                }}
              />
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{
          display: 'flex',
          gap: window.innerWidth <= 768 ? '12px' : '16px',
          justifyContent: 'center',
          padding: window.innerWidth <= 768 ? '0 16px' : '0'
        }}>
          <button
            onClick={() => navigate('/orders')}
            style={{
              background: '#666',
              color: '#fff',
              fontWeight: 600,
              fontSize: window.innerWidth <= 768 ? '14px' : '16px',
              border: 'none',
              borderRadius: window.innerWidth <= 768 ? '8px' : '12px',
              padding: window.innerWidth <= 768 ? '12px 20px' : '16px 32px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              minWidth: window.innerWidth <= 768 ? '100px' : '140px',
              flex: window.innerWidth <= 768 ? '1' : 'auto'
            }}
            onMouseOver={e => (e.currentTarget.style.background = '#555')}
            onMouseOut={e => (e.currentTarget.style.background = '#666')}
          >
            Quay Lại
          </button>
          
          {paymentDetails.paymentStatus === 'PENDING' && (
            <button
              onClick={handleConfirmPayment}
              disabled={confirming}
              style={{
                background: confirming ? '#ccc' : '#4caf50',
                color: '#fff',
                fontWeight: 600,
                fontSize: window.innerWidth <= 768 ? '14px' : '16px',
                border: 'none',
                borderRadius: window.innerWidth <= 768 ? '8px' : '12px',
                padding: window.innerWidth <= 768 ? '12px 20px' : '16px 32px',
                cursor: confirming ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                minWidth: window.innerWidth <= 768 ? '100px' : '140px',
                flex: window.innerWidth <= 768 ? '1' : 'auto'
              }}
              onMouseOver={e => {
                if (!confirming) e.currentTarget.style.background = '#45a049';
              }}
              onMouseOut={e => {
                if (!confirming) e.currentTarget.style.background = '#4caf50';
              }}
            >
              {confirming ? 'Đang Xác Nhận...' : 'Xác Nhận Thanh Toán'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PaymentPage; 