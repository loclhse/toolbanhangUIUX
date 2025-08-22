import React, { useEffect, useState } from 'react';
import { API_BASE_URL } from '../config';

// Types for food items and order payload
export type FoodItem = {
  id: string;
  name: string;
  price: number;
  img?: string;
};

export type OrderItem = {
  foodItemId: string;
  quantity: number;
};

interface OrderModalProps {
  open: boolean;
  tableId?: string | null;
  tableIds?: string[];
  onClose: () => void;
  contained?: boolean;
}

const OrderModal: React.FC<OrderModalProps> = ({ open, tableId, tableIds = [], onClose, contained = false }) => {
  const [foodItems, setFoodItems] = useState<FoodItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [numberOfPeople, setNumberOfPeople] = useState(1);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Fetch food items when modal opens
  useEffect(() => {
    if (open) {
      setLoading(true);
      fetch(`${API_BASE_URL}/api/food-items`)
        .then((res) => {
          if (!res.ok) throw new Error('Failed to fetch food items');
          return res.json();
        })
        .then((data) => {
          setFoodItems(data.data || []);
          setOrderItems([]); // Reset order items
          setLoading(false);
        })
        .catch((err) => {
          setError(err.message);
          setLoading(false);
        });
    }
  }, [open]);

  // Handle quantity change for a food item
  const handleQuantityChange = (foodItemId: string, quantity: number) => {
    setOrderItems((prev) => {
      if (quantity <= 0) {
        return prev.filter((item) => item.foodItemId !== foodItemId);
      }
      const exists = prev.find((item) => item.foodItemId === foodItemId);
      if (exists) {
        return prev.map((item) =>
          item.foodItemId === foodItemId ? { ...item, quantity } : item
        );
      } else {
        return [...prev, { foodItemId, quantity }];
      }
    });
  };

  // Handle increment/decrement
  const handleIncrement = (foodItemId: string) => {
    const current = orderItems.find(item => item.foodItemId === foodItemId)?.quantity || 0;
    handleQuantityChange(foodItemId, current + 1);
  };

  const handleDecrement = (foodItemId: string) => {
    const current = orderItems.find(item => item.foodItemId === foodItemId)?.quantity || 0;
    if (current > 0) {
      handleQuantityChange(foodItemId, current - 1);
    }
  };

  // Handle order submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const usedTableIds = tableIds.length > 0 ? tableIds : (tableId ? [tableId] : []);
    if (usedTableIds.length === 0 || orderItems.length === 0) {
      setError('Please select at least one food item.');
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(false);
    try {
      console.log('🚀 Creating order from UI with data:', {
        tableIds: usedTableIds,
        numberOfPeople,
        items: orderItems,
      });
      
      const res = await fetch(`${API_BASE_URL}/api/orders/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableIds: usedTableIds,
          numberOfPeople,
          items: orderItems,
        }),
      });
      
      if (!res.ok) throw new Error('Failed to create order');
      
      const responseData = await res.json();
      console.log('✅ Order created successfully from UI:', responseData);
      
      // 🚀 Store the new order globally for immediate UI update
      (window as any).latestOrderCreated = responseData.data;
      console.log('📦 Stored new order globally for immediate display:', responseData.data?.id);
      
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1200);
    } catch (err: any) {
      setError(err.message || 'Unknown error');
    } finally {
      setSubmitting(false);
    }
  };

  // Helper to format VND
  const formatVND = (amount: number) => amount.toLocaleString('vi-VN') + ' VND';

  // Calculate total
  const total = orderItems.reduce((sum, oi) => {
    const food = foodItems.find(f => f.id === oi.foodItemId);
    return sum + (food ? food.price * oi.quantity : 0);
  }, 0);

  if (!open) return null;

  // Check if mobile
  const isMobile = window.innerWidth <= 768;

  return (
    <div style={isMobile ? styles.mobileOverlay : styles.overlay}>
      <div style={{
        ...(contained 
          ? (isMobile ? styles.mobileContainedModal : styles.containedModal)
          : (isMobile ? styles.mobileModal : styles.modal)
        )
      }}>
        {/* Header */}
        <div style={styles.header}>
          <h2 style={{
            fontSize: isMobile ? 20 : (contained ? 24 : 36),
            fontWeight: 700,
            color: '#263238',
            margin: 0,
            letterSpacing: 0.5,
            textAlign: 'center'
          }}>
            Tạo Đơn
          </h2>
          <button 
            style={{
              ...styles.closeBtn,
              fontSize: isMobile ? 24 : 28,
              top: isMobile ? 12 : 18,
              right: isMobile ? 16 : 22
            }} 
            onClick={onClose} 
            disabled={submitting}
          >
            &times;
          </button>
        </div>

        {loading ? (
          <div style={{ fontSize: 16, color: '#1976d2', margin: '32px 0', textAlign: 'center' }}>
            Đang tải thực đơn...
          </div>
        ) : error ? (
          <div style={{ color: 'red', fontSize: 14, padding: '12px', background: '#ffebee', borderRadius: 6 }}>
            {error}
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {/* Number of People */}
            <div style={styles.peopleSection}>
              <label style={styles.peopleLabel}>Số người:</label>
              <div style={styles.peopleControls}>
                <button
                  type="button"
                  style={styles.peopleBtn}
                  onClick={() => setNumberOfPeople(Math.max(1, numberOfPeople - 1))}
                  disabled={submitting || numberOfPeople <= 1}
                >
                  -
                </button>
                <span style={styles.peopleNumber}>{numberOfPeople}</span>
                <button
                  type="button"
                  style={styles.peopleBtn}
                  onClick={() => setNumberOfPeople(numberOfPeople + 1)}
                  disabled={submitting}
                >
                  +
                </button>
              </div>
            </div>

            {/* Current Order Summary */}
            {orderItems.length > 0 && (
              <div style={styles.orderSummary}>
                <h4 style={styles.summaryTitle}>Món đã chọn:</h4>
                <div style={styles.summaryItems}>
                  {orderItems.map((orderItem) => {
                    const food = foodItems.find(f => f.id === orderItem.foodItemId);
                    if (!food) return null;
                    return (
                      <div key={orderItem.foodItemId} style={styles.summaryItem}>
                        <span style={styles.summaryItemName}>{food.name}</span>
                        <span style={styles.summaryItemDetails}>
                          {orderItem.quantity} × {formatVND(food.price)} = {formatVND(food.price * orderItem.quantity)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Food Menu */}
            <div style={styles.menuSection}>
              <h4 style={styles.menuTitle}>Thực Đơn:</h4>
              <div style={styles.menuContainer}>
                {foodItems.length > 4 && (
                  <>
                    <div style={{
                      position: 'absolute',
                      top: 0,
                      right: 8,
                      background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8))',
                      width: '20px',
                      height: '100%',
                      pointerEvents: 'none',
                      zIndex: 1
                    }} />
                    <div style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      height: '20px',
                      background: 'linear-gradient(180deg, rgba(255,255,255,0.9), transparent)',
                      pointerEvents: 'none',
                      zIndex: 1,
                      borderRadius: '8px 8px 0 0'
                    }} />
                  </>
                )}
                {foodItems.map((item) => {
                  const currentQuantity = orderItems.find(oi => oi.foodItemId === item.id)?.quantity || 0;
                  return (
                    <div key={item.id} style={isMobile ? styles.mobileMenuItem : styles.menuItem}>
                      {/* Food Image */}
                      {item.img && (
                        <img 
                          src={item.img} 
                          alt={item.name} 
                          style={isMobile ? styles.mobileFoodImage : styles.foodImage}
                        />
                      )}
                      
                      {/* Food Info */}
                      <div style={styles.foodInfo}>
                <div style={isMobile ? styles.mobileFoodName : styles.foodName}>{item.name}</div>
                <div style={isMobile ? styles.mobileFoodPrice : styles.foodPrice}>{formatVND(item.price)}</div>
                      </div>
                      
                      {/* Quantity Controls */}
                      <div style={styles.quantityControls}>
                        <button
                          type="button"
                          style={{
                            ...(isMobile ? styles.mobileQuantityBtn : styles.quantityBtn),
                            opacity: currentQuantity === 0 ? 0.5 : 1
                          }}
                          onClick={() => handleDecrement(item.id)}
                          disabled={submitting || currentQuantity === 0}
                        >
                          -
                        </button>
                        <span style={styles.quantityDisplay}>{currentQuantity}</span>
                        <button
                          type="button"
                          style={isMobile ? styles.mobileQuantityBtn : styles.quantityBtn}
                          onClick={() => handleIncrement(item.id)}
                          disabled={submitting}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
                {/* removed scroll hint */}
              </div>
            </div>

            {/* Total and Submit */}
            <div style={styles.footer}>
              <div style={styles.totalSection}>
                <span style={styles.totalLabel}>Tổng cộng:</span>
                <span style={styles.totalAmount}>{formatVND(total)}</span>
              </div>
              
              <button
                type="submit"
                disabled={submitting || orderItems.length === 0}
                style={{
                  ...styles.submitBtn,
                  opacity: submitting || orderItems.length === 0 ? 0.6 : 1,
                  cursor: submitting || orderItems.length === 0 ? 'not-allowed' : 'pointer',
                }}
                onMouseOver={e => {
                  if (!(submitting || orderItems.length === 0)) {
                    e.currentTarget.style.background = '#fb8c00';
                  }
                }}
                onMouseOut={e => {
                  if (!(submitting || orderItems.length === 0)) {
                    e.currentTarget.style.background = '#ff9800';
                  }
                }}
              >
                {submitting ? 'Đang gửi...' : 'Tạo Đơn'}
              </button>
              

            </div>
          </form>
        )}
        
        {/* Success Banner */}
        {success && (
          <div style={styles.successBannerOverlay}>
            <div style={styles.successBanner}>
              
              <div style={styles.successBannerText}>Tạo đơn thành công</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '180vw',
    height: '100vh',
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    fontFamily: 'Segoe UI , Arial, sans-serif',
    padding: '8px',
    boxSizing: 'border-box',
  },
  mobileOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'stretch',
    justifyContent: 'stretch',
    zIndex: 1000,
    fontFamily: 'Segoe UI, Arial, sans-serif',
    padding: '0px',
    boxSizing: 'border-box',
  },
  modal: {
    background: '#fff',
    borderRadius: 16,
    width: '100%',
    maxWidth: '600px',
    maxHeight: '90vh',
    boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
    position: 'relative',
    fontFamily: 'Segoe UI, Arial, sans-serif',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  mobileModal: {
    maxWidth: '100vw',
    maxHeight: '100vh',
    margin: '0px',
    borderRadius: '0px',
  },
  mobileMenuItem: {
    display: 'flex',
    alignItems: 'flex-start',
    padding: '16px',
    marginBottom: '12px',
    background: '#fff',
    borderRadius: '10px',
    boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
    gap: '12px',
    minHeight: '88px',
  },
  mobileFoodImage: {
    width: '64px',
    height: '64px',
    objectFit: 'cover',
    borderRadius: '8px',
    flexShrink: 0,
  },
  mobileFoodName: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#111827',
    marginBottom: '6px',
    overflow: 'visible',
    whiteSpace: 'normal',
    width: '100%',
    lineHeight: '1.3',
    textAlign: 'left',
    wordWrap: 'break-word',
  },
  mobileFoodPrice: {
    fontSize: '16px',
    fontWeight: 800,
    color: '#000000',
    whiteSpace: 'normal',
    overflow: 'visible',
    width: '100%',
    textAlign: 'left',
    wordWrap: 'break-word',
  },
  mobileQuantityBtn: {
    width: '44px',
    height: '44px',
    borderRadius: '50%',
    border: '3px solid #ff9800',
    background: '#fff',
    color: '#ff9800',
    fontSize: '22px',
    fontWeight: 'bold',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
    boxShadow: '0 3px 8px rgba(255, 152, 0, 0.25)'
  },
  containedOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    background: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    fontFamily: 'Segoe UI, Arial, sans-serif',
    padding: '20px',
    boxSizing: 'border-box',
  },
  containedModal: {
    background: '#fff',
    borderRadius: 12,
    padding: '16px',
    width: '100%',
    maxWidth: '550px',
    maxHeight: '85vh',
    overflowY: 'auto',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
    border: '2px solid #ff9800',
    position: 'relative',
    fontFamily: 'Segoe UI, Arial, sans-serif',
  },
  mobileContainedModal: {
    background: '#fff',
    borderRadius: 0,
    padding: '12px',
    width: '100%',
    maxWidth: '100vw',
    maxHeight: '100vh',
    overflowY: 'auto',
    boxShadow: 'none',
    border: 'none',
    position: 'relative',
    fontFamily: 'Segoe UI, Arial, sans-serif',
  },
  header: {
    padding: '8px 16px 8px 16px',
    borderBottom: '1px solid #f0f0f0',
    position: 'relative',
  },
  closeBtn: {
    position: 'absolute',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#666',
    transition: 'color 0.2s',
    padding: '4px',
    borderRadius: '50%',
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  peopleSection: {
    padding: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: '1px solid #f0f0f0',
  },
  peopleLabel: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#111827',
  },
  peopleControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  peopleBtn: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    border: '3px solid #ff9800',
    background: '#fff',
    color: '#ff9800',
    fontSize: '20px',
    fontWeight: 'bold',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
    boxShadow: '0 2px 6px rgba(255, 152, 0, 0.2)'
  },
  peopleNumber: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#111827',
    minWidth: '28px',
    textAlign: 'center',
  },
  orderSummary: {
    padding: '20px',
    background: '#f8f9fa',
    borderBottom: '1px solid #f0f0f0',
    borderRadius: '8px',
    margin: '0 16px',
  },
  summaryTitle: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#263238',
    margin: '0 0 12px 0',
  },
  summaryItems: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  summaryItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '16px',
    padding: '8px 12px',
    background: '#fff',
    borderRadius: '6px',
    border: '1px solid #e0e0e0',
  },
  summaryItemName: {
    fontWeight: 700,
    color: '#263238',
    fontSize: '16px',
  },
  summaryItemDetails: {
    color: '#ff9800',
    fontWeight: 600,
    fontSize: '16px',
  },
  menuSection: {
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  menuTitle: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#111827',
    margin: '0',
    padding: '16px 16px 8px 16px',
  },
  menuContainer: {
    flex: 1,
    overflowY: 'auto',
    padding: '8px 16px',
    maxHeight: '440px', // Exact height for 4 items (110px per item)
    border: '1px solid #e0e0e0',
    borderRadius: 8,
    position: 'relative',
  },
  menuItem: {
    display: 'flex',
    alignItems: 'flex-start',
    padding: '20px',
    marginBottom: '16px',
    background: '#fff',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    gap: '16px',
    minHeight: '100px',
  },
  foodImage: {
    width: '80px',
    height: '80px',
    objectFit: 'cover',
    borderRadius: '10px',
    flexShrink: 0,
  },
  foodInfo: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-start',
    overflow: 'visible',
    paddingLeft: '8px',
    paddingTop: '4px',
  },
  foodName: {
    fontSize: '20px',
    fontWeight: 700,
    color: '#111827',
    marginBottom: '8px',
    overflow: 'visible',
    whiteSpace: 'normal',
    width: '100%',
    lineHeight: '1.3',
    textAlign: 'left',
    wordWrap: 'break-word',
  },
  foodPrice: {
    fontSize: '18px',
    fontWeight: 800,
    color: '#000000',
    whiteSpace: 'normal',
    overflow: 'visible',
    width: '100%',
    textAlign: 'left',
    wordWrap: 'break-word',
  },
  quantityControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexShrink: 0,
    minWidth: 'fit-content',
    marginLeft: '8px',
  },
  quantityBtn: {
    width: '44px',
    height: '44px',
    borderRadius: '50%',
    border: '3px solid #ff9800',
    background: '#fff',
    color: '#ff9800',
    fontSize: '22px',
    fontWeight: 'bold',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
    boxShadow: '0 3px 8px rgba(255, 152, 0, 0.25)'
  },
  quantityDisplay: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#111827',
    minWidth: '26px',
    textAlign: 'center',
  },
  footer: {
    padding: '16px',
    borderTop: '1px solid #f0f0f0',
  },
  totalSection: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
    padding: '12px',
    background: '#f8f9fa',
    borderRadius: '8px',
  },
  totalLabel: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#111827',
  },
  totalAmount: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#ff9800',
  },
  submitBtn: {
    width: 'auto',
    padding: '10px 28px',
    fontSize: '16px',
    fontWeight: 600,
    borderRadius: '8px',
    border: 'none',
    background: '#ff9800',
    color: '#fff',
    cursor: 'pointer',
    transition: 'all 0.2s',
    letterSpacing: '1px',
    boxShadow: '0 2px 8px rgba(255, 152, 0, 0.08)',
    display: 'block',
    margin: '0 auto',
  },
  successBannerOverlay: {
    position: 'fixed',
    top: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 2000,
  },
  successBanner: {
    background: '#f0f9f0',
    border: '2px solid #4caf50',
    borderRadius: '12px',
    padding: '16px 20px',
    boxShadow: '0 6px 20px rgba(0, 0, 0, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '16px',
    minWidth: '300px',
    maxWidth: '400px',
  },
  successBannerIcon: {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    background: '#4caf50',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkmark: {
    color: 'white',
    fontSize: '14px',
    fontWeight: 'bold',
  },
  successBannerText: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#2e7d32',
    lineHeight: 1.2,
  },
};

export default OrderModal; 