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

  // Disable body scroll when modal is open
  useEffect(() => {
    if (open) {
      // Save original overflow
      const originalOverflow = document.body.style.overflow;
      // Disable scroll
      document.body.style.overflow = 'hidden';
      
      return () => {
        // Restore original overflow when modal closes
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [open]);

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
  const formatVND = (amount: number) => amount.toLocaleString('vi-VN') + 'đ';

  // Calculate total
  const total = orderItems.reduce((sum, oi) => {
    const food = foodItems.find(f => f.id === oi.foodItemId);
    return sum + (food ? food.price * oi.quantity : 0);
  }, 0);

  if (!open) return null;

  // Check if mobile
  const isMobile = window.innerWidth <= 768;

  return (
    <div 
      style={isMobile ? styles.mobileOverlay : styles.overlay}
      onClick={(e) => {
        // Only close if clicking on the overlay itself, not on the modal content
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
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
          <div style={{ margin: '32px 0', textAlign: 'center' }}>
            {/* Skeleton Loader */}
            <style>{`
              @keyframes skeleton-shimmer {
                0% { background-position: -400px 0; }
                100% { background-position: 400px 0; }
              }
              .skeleton {
                background: #f0f0f0;
                border-radius: 8px;
                position: relative;
                overflow: hidden;
              }
              .skeleton.shimmer::after {
                content: '';
                position: absolute;
                top: 0; left: 0; right: 0; bottom: 0;
                background: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.5) 50%, rgba(255,255,255,0) 100%);
                animation: skeleton-shimmer 1.2s infinite;
              }
            `}</style>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'center', marginTop: 32 }}>
              {[1,2,3,4].map(i => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', width: 320, gap: 16 }}>
                  <div className="skeleton shimmer" style={{ width: 64, height: 64, borderRadius: '50%' }} />
                  <div style={{ flex: 1 }}>
                    <div className="skeleton shimmer" style={{ width: '80%', height: 18, marginBottom: 10 }} />
                    <div className="skeleton shimmer" style={{ width: '60%', height: 14 }} />
                  </div>
                </div>
              ))}
            </div>
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
                  onMouseOver={e => {
                    if (!(submitting || numberOfPeople <= 1)) {
                      e.currentTarget.style.background = '#ff9800';
                      e.currentTarget.style.color = '#fff';
                      e.currentTarget.style.transform = 'scale(1.05)';
                    }
                  }}
                  onMouseOut={e => {
                    if (!(submitting || numberOfPeople <= 1)) {
                      e.currentTarget.style.background = '#fff';
                      e.currentTarget.style.color = '#ff9800';
                      e.currentTarget.style.transform = 'scale(1)';
                    }
                  }}
                >
                  -
                </button>
                <span style={styles.peopleNumber}>{numberOfPeople}</span>
                <button
                  type="button"
                  style={styles.peopleBtn}
                  onClick={() => setNumberOfPeople(numberOfPeople + 1)}
                  disabled={submitting}
                  onMouseOver={e => {
                    if (!submitting) {
                      e.currentTarget.style.background = '#ff9800';
                      e.currentTarget.style.color = '#fff';
                      e.currentTarget.style.transform = 'scale(1.05)';
                    }
                  }}
                  onMouseOut={e => {
                    if (!submitting) {
                      e.currentTarget.style.background = '#fff';
                      e.currentTarget.style.color = '#ff9800';
                      e.currentTarget.style.transform = 'scale(1)';
                    }
                  }}
                >
                  +
                </button>
              </div>
            </div>



            {/* Food Menu */}
            <div style={styles.menuSection}>
              <h4 style={styles.menuTitle}>Thực Đơn:</h4>
              <div style={styles.menuContainer}>
                {foodItems.length > 3 && (
                  <>
                    <div style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      height: '14px',
                      background: 'linear-gradient(0deg, rgba(255,255,255,0.95), transparent)',
                      pointerEvents: 'none',
                      zIndex: 2,
                      borderRadius: '0 0 8px 8px'
                    }} />
                    <div style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      height: '16px',
                      background: 'linear-gradient(180deg, rgba(255,255,255,0.95), transparent)',
                      pointerEvents: 'none',
                      zIndex: 2,
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
          <div style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: 2000,
          }}>
            <div style={{
              animation: 'slideInRight 0.3s ease-out, slideOutRight 0.3s ease-in 2.7s forwards',
              background: '#f0f9f0',
              border: '3px solid rgb(191, 235, 193)',
              borderRadius: '8px',
              padding: '12px 60px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#388e3c',
              textAlign: 'center',
              lineHeight: 1.1,
              minHeight: '0',
              minWidth: '170px',
              width: 'auto',
              maxWidth: 'none',
              overflow: 'visible',
              whiteSpace: 'nowrap',
            }}>
              <span style={{
                fontSize: '13px',
                fontWeight: 700,
                color: '#388e3c',
                lineHeight: 1.1,
                display: 'block',
                textAlign: 'center',
                whiteSpace: 'nowrap',
              }}>
                Tạo đơn thành công
              </span>
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
    width: '100vw',
    height: '100vh',
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    fontFamily: 'Segoe UI, Arial, sans-serif',
    padding: '20px',
    boxSizing: 'border-box',
    isolation: 'isolate',
  },
  mobileOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    fontFamily: 'Segoe UI, Arial, sans-serif',
    padding: '25px',
    boxSizing: 'border-box',
    isolation: 'isolate',
  },
  modal: {
    background: '#fff',
    borderRadius: 16,
    width: '90%',
    maxWidth: '380px',
    maxHeight: '450px',
    boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
    position: 'relative',
    fontFamily: 'Segoe UI, Arial, sans-serif',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    pointerEvents: 'auto',
  },
  mobileModal: {
    background: '#fff',
    width: '90%',
    maxWidth: '350px',
    maxHeight: '75vh',
    borderRadius: '16px',
    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.3)',
    position: 'relative',
    fontFamily: 'Segoe UI, Arial, sans-serif',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    pointerEvents: 'auto',
  },
  mobileMenuItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '15px',
    marginBottom: '6px',
    background: '#fff',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    gap: '8px',
    minHeight: '64px',
    border: '1px solid #f0f0f0',
    width: '100%',
    justifyContent: 'flex-start',
  },
  mobileFoodImage: {
    width: '60px',
    height: '64px',
    objectFit: 'cover',
    borderRadius: '8px',
    flexShrink: 0,
  },
  mobileFoodName: {
    fontSize: '16px',
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
    fontSize: '15px',
    fontWeight: 800,
    color: '#000000',
    whiteSpace: 'normal',
    overflow: 'visible',
    width: '100%',
    textAlign: 'left',
    wordWrap: 'break-word',
  },
  mobileQuantityBtn: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    border: '2px solid #ff9800',
    background: '#fff',
    color: '#ff9800',
    fontSize: '18px',
    fontWeight: 'bold',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
    boxShadow: '0 2px 6px rgba(255, 152, 0, 0.2)',
    minWidth: '36px',
    touchAction: 'manipulation',
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
    zIndex: 9999,
    fontFamily: 'Segoe UI, Arial, sans-serif',
    padding: '20px',
    boxSizing: 'border-box',
    isolation: 'isolate',
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
    pointerEvents: 'auto',
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
    pointerEvents: 'auto',
  },
  header: {
    padding: '20px 24px 16px 24px',
    borderBottom: '2px solid #f8f9fa',
    position: 'relative',
    background: 'linear-gradient(135deg, #fff 0%, #f8f9fa 100%)',
  },
  closeBtn: {
    position: 'absolute',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#666',
    transition: 'color 0.2s',
    padding: '6px',
    borderRadius: '50%',
    width: '40px',
    height: '40px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '20px',
  },
  peopleSection: {
    padding: '20px 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: '1px solid #f0f0f0',
    background: '#fafbfc',
  },
  peopleLabel: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#263238',
  },
  peopleControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  peopleBtn: {
    width: '44px',
    height: '44px',
    borderRadius: '50%',
    border: '2px solid #ff9800',
    background: '#fff',
    color: '#ff9800',
    fontSize: '22px',
    fontWeight: 'bold',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
    boxShadow: '0 3px 10px rgba(255, 152, 0, 0.15)',
  },
  peopleNumber: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#111827',
    minWidth: '28px',
    textAlign: 'center',
  },
  orderSummary: {
    padding: '24px',
    background: 'linear-gradient(135deg, #f8f9fa 0%, #e3f2fd 100%)',
    borderBottom: '1px solid #e0e0e0',
    borderRadius: '12px',
    margin: '0 24px 16px 24px',
    border: '1px solid #e3f2fd',
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
    padding: '12px 16px',
    background: '#fff',
    borderRadius: '8px',
    border: '1px solid #e0e0e0',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
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
    color: '#263238',
    margin: '0',
    padding: '20px 24px 12px 24px',
  },
  menuContainer: {
    flex: 1,
    overflowY: 'auto',
    padding: '17px',
    maxHeight: '250px',
    minHeight: '150px',
    border: '1px solid #e0e0e0',
    borderRadius: 12,
    position: 'relative',
    background: '#fafbfc',
    scrollBehavior: 'smooth',
    WebkitOverflowScrolling: 'touch',
  },
  menuItem: {
    display: 'flex',
    alignItems: 'flex-start',
    padding: '20px',
    marginBottom: '16px',
    background: '#fff',
    borderRadius: '16px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
    gap: '16px',
    minHeight: '100px',
    border: '1px solid #f0f0f0',
    transition: 'all 0.2s ease',
  },
  foodImage: {
    width: '80px',
    height: '80px',
    objectFit: 'cover',
    borderRadius: '12px',
    flexShrink: 0,
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
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
    padding: '20px 24px',
    borderTop: '2px solid #f8f9fa',
    background: 'linear-gradient(135deg, #f8f9fa 0%, #fff 100%)',
  },
  totalSection: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    padding: '16px 20px',
    background: 'linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%)',
    borderRadius: '12px',
    border: '2px solid #ff9800',
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
    width: '100%',
    padding: '16px 32px',
    fontSize: '18px',
    fontWeight: 700,
    borderRadius: '12px',
    border: 'none',
    background: 'linear-gradient(135deg, #ff9800 0%, #f57c00 100%)',
    color: '#fff',
    cursor: 'pointer',
    transition: 'all 0.3s',
    letterSpacing: '1px',
    boxShadow: '0 4px 16px rgba(255, 152, 0, 0.3)',
    display: 'block',
    margin: '0 auto',
    textTransform: 'uppercase',
  },
  successBannerOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    background: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
    fontFamily: 'Segoe UI, Arial, sans-serif',
    padding: '20px',
    boxSizing: 'border-box',
    isolation: 'isolate',
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