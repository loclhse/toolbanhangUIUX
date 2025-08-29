import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../config';
import { useNavigate } from 'react-router-dom';
import type { TableApiResponse, TableFromApi } from '../types';
import TableColumn from '../components/TableColumn';
import OrderModal from '../components/OrderModal';

interface OrderItem {
  id: string;
  foodItemName: string;
  price: number;
  quantity: number;
  subtotal: number;
}

interface Order {
  id: string;
  tableNumbers: number[];
  numberOfPeople: number;
  items: OrderItem[];
  status: string;
  createdAt: string;
  totalAmount: number;
}

function TablesPage() {
  const [tables, setTables] = useState<TableFromApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTableIds, setSelectedTableIds] = useState<string[]>([]);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const navigate = useNavigate();

  // Check if device is mobile
  const isMobile = window.innerWidth <= 768;

  useEffect(() => {
    console.log('🚀 TablesPage: Fetching tables from API');
    
    fetch(`${API_BASE_URL}/api/tables`)
      .then((res) => {
        if (!res.ok) throw new Error(`Network response was not ok: ${res.status}`);
        return res.json();
      })
      .then((data: TableApiResponse) => {
        console.log('📊 TablesPage: Received', data.data.length, 'tables');
        setTables(data.data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('❌ TablesPage: Fetch error:', err);
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) return (
    <div
      style={{
        width: '100%',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        alignItems: 'center',
        padding: isMobile ? '0.5rem 0' : '1rem 0',
        position: 'relative',
        maxWidth: '100vw',
        boxSizing: 'border-box',
        margin: 0,
      }}
    >
      {/* Header skeleton */}
      <div style={{ 
        width: '100%', 
        display: 'flex', 
        justifyContent: 'center', 
        padding: isMobile ? '0 8px 8px 8px' : '0 16px 12px 16px', 
        marginBottom: isMobile ? 0 : 32,
        marginRight: 0,
        boxSizing: 'border-box'
      }}>
        <div style={{
          width: '100%',
          maxWidth: '100%',
          display: 'flex',
          justifyContent: 'flex-start',
          alignItems: 'center',
          position: 'relative',
          marginLeft: isMobile ? 35 : 16,
          gap: isMobile ? '0.75rem' : '2rem'
        }}>
          <div style={{
            background: '#e0e0e0',
            borderRadius: 8,
            padding: isMobile ? '8px 20px' : '10px 28px',
            width: isMobile ? '80px' : '100px',
            height: isMobile ? '36px' : '40px',
            animation: 'pulse 1.5s ease-in-out infinite'
          }} />
        </div>
      </div>
      
      {/* Tables container skeleton */}
      <div style={{ 
        position: 'relative', 
        width: '100%', 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center',
        padding: isMobile ? '0 8px' : '0 16px',
        boxSizing: 'border-box'
      }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: isMobile ? '0.75rem' : '2rem',
            width: '100%',
            maxWidth: '100%',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          {/* Table skeleton cards */}
          {[...Array(6)].map((_, i) => (
            <div key={i} style={{
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              justifyContent: 'center',
              position: 'relative',
              background: '#fff',
              borderRadius: '12px',
              boxShadow: '0 2px 12px rgba(0,0,0,0.07)',
              padding: '20px',
              minHeight: '120px',
              animation: 'pulse 1.5s ease-in-out infinite'
            }}>
              {/* Table number skeleton */}
              <div style={{
                background: '#e0e0e0',
                borderRadius: '50%',
                width: '60px',
                height: '60px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '12px'
              }} />
              
              {/* Table status skeleton */}
              <div style={{
                background: '#e0e0e0',
                borderRadius: '4px',
                width: '80px',
                height: '16px',
                marginBottom: '8px'
              }} />
              
              {/* Table info skeleton */}
              <div style={{
                background: '#e0e0e0',
                borderRadius: '4px',
                width: '60px',
                height: '12px'
              }} />
            </div>
          ))}
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
  if (error) return <div style={{padding: '20px', fontSize: '18px', color: 'red'}}>Error: {error}</div>;
  if (!tables.length) return <div style={{padding: '20px', fontSize: '18px'}}>No table data available</div>;

  const handleTableClick = (tableId: string) => {
    setSelectedTableIds((prev) =>
      prev.includes(tableId) ? prev.filter((id) => id !== tableId) : [...prev, tableId]
    );
  };

  const handleCloseModal = () => {
    setShowOrderModal(false);
    setSelectedTableIds([]);
  };

  return (
    <div
      style={{
        width: '100%',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        alignItems: 'center',
        padding: isMobile ? '0.5rem 0' : '1rem 0',
        position: 'relative',
        maxWidth: '100vw',
        boxSizing: 'border-box',
        margin: 0,
      }}
    >
      <div style={{ 
        width: '100%', 
        display: 'flex', 
        justifyContent: 'center', 
        padding: isMobile ? '0 8px 8px 8px' : '0 16px 12px 16px', 
        marginBottom: isMobile ? 0 : 32,
        marginRight: 0,
        boxSizing: 'border-box'
      }}>
        <div style={{
          width: '100%',
          maxWidth: '100%',
          display: 'flex',
          justifyContent: 'flex-start',
          alignItems: 'center',
          position: 'relative',
          marginLeft: isMobile ? 35 : 16,
          gap: isMobile ? '0.75rem' : '2rem'
        }}>
        <button
          onClick={() => navigate('/orders')}
          style={{
            background: '#ff9800',
            color: '#fff',
            fontWeight: 550,
            fontSize: isMobile ? 15 : 10,
            border: 'none',
            borderRadius: 8,
            padding: isMobile ? '8px 20px' : '10px 28px',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(255, 152, 0, 0.08)',
            letterSpacing: 1,
            transition: 'background 0.2s',
          }}
          onMouseOver={e => (e.currentTarget.style.background = '#fb8c00')}
          onMouseOut={e => (e.currentTarget.style.background = '#ff9800')}
        >
          Đơn Hàng
        </button>
        </div>
      </div>
      
      {/* Tables container with responsive grid layout */}
      <div style={{ 
        position: 'relative', 
        width: '100%', 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center',
        padding: isMobile ? '0 8px' : '0 16px',
        boxSizing: 'border-box'
      }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: isMobile ? '0.75rem' : '2rem',
            width: '100%',
            maxWidth: '100%',
            justifyContent: 'center',
            alignItems: 'center',
            filter: showOrderModal ? 'blur(2px)' : 'none',
            pointerEvents: showOrderModal ? 'none' : 'auto',
            transition: 'filter 0.3s ease',
          }}
        >
          {/* Render tables in a single grid instead of separate columns */}
          {tables.map((table) => {
            const selected = selectedTableIds.includes(table.id);
            return (
              <div key={table.id} style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center', 
                justifyContent: 'center',
                position: 'relative', 
                height: isMobile ? 110 : 140,
                width: '100%',
                placeSelf: 'center'
              }}>
                <div style={{ 
                  position: 'relative', 
                  width: isMobile ? 140 : 160, 
                  height: isMobile ? 100 : 120,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {/* Top Left Chair */}
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: isMobile ? 14 : 16,
                    width: isMobile ? 38 : 48,
                    height: isMobile ? 38 : 48,
                    borderRadius: '50%',
                    background: '#e0e0e0',
                    border: '2px solid #bdbdbd',
                    zIndex: 1,
                  }} />
                  {/* Top Right Chair */}
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: isMobile ? 88 : 96,
                    width: isMobile ? 38 : 48,
                    height: isMobile ? 38 : 48,
                    borderRadius: '50%',
                    background: '#e0e0e0',
                    border: '2px solid #bdbdbd',
                    zIndex: 1,
                  }} />
                  {/* Bottom Left Chair */}
                  <div style={{
                    position: 'absolute',
                    top: isMobile ? 62 : 72,
                    left: isMobile ? 14 : 16,
                    width: isMobile ? 38 : 48,
                    height: isMobile ? 38 : 48,
                    borderRadius: '50%',
                    background: '#e0e0e0',
                    border: '2px solid #bdbdbd',
                    zIndex: 1,
                  }} />
                  {/* Bottom Right Chair */}
                  <div style={{
                    position: 'absolute',
                    top: isMobile ? 62 : 72,
                    left: isMobile ? 88 : 96,
                    width: isMobile ? 38 : 48,
                    height: isMobile ? 38 : 48,
                    borderRadius: '50%',
                    background: '#e0e0e0',
                    border: '2px solid #bdbdbd',
                    zIndex: 1,
                  }} />
                  {/* Rectangle Table */}
                  <div
                    style={{
                      width: isMobile ? 84 : 96,
                      height: isMobile ? 56 : 64,
                      borderRadius: isMobile ? 12 : 16,
                      background: '#f5f5f5',
                      border: selected ? '3px solid #ffb74d' : '3px solid #888',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 'bold',
                      fontSize: isMobile ? '1.6rem' : '2rem',
                      cursor: 'pointer',
                      position: 'absolute',
                      top: isMobile ? 22 : 24,
                      left: isMobile ? 28 : 32,
                      zIndex: 2,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
                      transition: 'border 0.2s, background 0.2s',
                    }}
                    onClick={() => handleTableClick(table.id)}
                  >
                    {table.number}
                    {selected && (
                      <span style={{
                        position: 'absolute',
                        top: isMobile ? 4 : 6,
                        right: isMobile ? 6 : 8,
                        fontSize: isMobile ? 16 : 22,
                        color: '#ffb74d',
                        fontWeight: 900,
                        pointerEvents: 'none',
                      }}>✔</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        
        {selectedTableIds.length > 0 && (
          
          <button
            onClick={() => setShowOrderModal(true)}
            style={{
              marginTop: isMobile ? 20 : 32,
              background: '#ff9800',
              color: '#fff',
              fontWeight: 550,
              fontSize: isMobile ? 15 : 16,
              border: 'none',
              borderRadius: 8,
              padding: isMobile ? '8px 20px' : '10px 28px',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(255, 152, 0, 0.08)',
              letterSpacing: 1,
              transition: 'background 0.2s',
              filter: showOrderModal ? 'blur(2px)' : 'none',
              pointerEvents: showOrderModal ? 'none' : 'auto',
            }}
            onMouseOver={e => (e.currentTarget.style.background = '#fb8c00')}
            onMouseOut={e => (e.currentTarget.style.background = '#ff9800')}
          >
            Tạo Đơn
          </button>
        )}
        
        {/* Contained Order Modal */}
        <OrderModal 
          open={showOrderModal} 
          tableId={selectedTableIds[0] || null} 
          tableIds={selectedTableIds} 
          onClose={handleCloseModal}
          contained={true}
        />
      </div>
      <style>{`
        @media (max-width: 768px) {
          /* Ensure perfect grid alignment on mobile */
          div[style*="display: grid"] {
            place-items: center !important;
            margin: 0 auto !important;
          }

          /* Ensure each grid item is perfectly centered */
          div[style*="display: flex"][style*="flexDirection: column"] {
            place-self: center !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          /* Ensure consistent spacing between rows */
          div[style*="display: grid"] > div {
            margin: 0 !important;
            padding: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}

export default TablesPage; 