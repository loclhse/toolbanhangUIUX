import React, { useEffect, useState, useCallback } from 'react';
import { API_BASE_URL } from '../config';
import { useLocation, useNavigate } from 'react-router-dom';
import type { TableFromApi } from '../types';
import { useWebSocket } from '../contexts/WebSocketContext';

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

interface FoodItem {
  id: string;
  name: string;
  price: number;
}

const formatVND = (amount: number) => amount.toLocaleString('vi-VN') + 'đ';

const formatVNDForTotal = (amount: number) => amount.toLocaleString('vi-VN');

const formatVNDForTable = (amount: number) => amount.toLocaleString('vi-VN');

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

const getStatusLabel = (status: string) => {
  if (status === 'DONE') return 'Hoàn Thành';
  if (status === 'PENDING') return 'Đang Chế Biến';
  return status;
};

// Add keyframes for toast/snackbar animation
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.innerHTML = `
    @keyframes slideInRight {
      from {
        transform: translateX(120%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    @keyframes slideOutRight {
      from {
        transform: translateX(0);
        opacity: 1;
      }
      to {
        transform: translateX(120%);
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(style);
}

const OrdersPage: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
    const { isConnected, on, off, connect, send } = useWebSocket();
  const [adjustOrderId, setAdjustOrderId] = useState<string | null>(null);
  const [adjustOrderLoading, setAdjustOrderLoading] = useState(false);
  const [adjustOrderDetails, setAdjustOrderDetails] = useState<Order | null>(null);
  const [showAdjustForm, setShowAdjustForm] = useState(false);
    const [showPaymentOptions, setShowPaymentOptions] = useState<string | null>(null);
  const [foodItems, setFoodItems] = useState<FoodItem[]>([]);
  const [foodItemsLoading, setFoodItemsLoading] = useState(false);
  const [adjustFormData, setAdjustFormData] = useState<{
    tableIds: string[];
    numberOfPeople: number;
    items: { foodItemId: string; quantity: number }[];
  }>({
    tableIds: [],
    numberOfPeople: 1,
    items: []
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const navigate = useNavigate();
    const [tables, setTables] = useState<TableFromApi[]>([]);
    const [paymentLoading, setPaymentLoading] = useState<string | null>(null);
    const [showMarkOverlay, setShowMarkOverlay] = useState<string | null>(null);
  const [markedItems, setMarkedItems] = useState<Map<string, Set<string>>>(() => {
    // Load marked items from localStorage on component mount
      try {
    const saved = localStorage.getItem('markedItems');
        if (saved) {
          const parsed = JSON.parse(saved);
          const map = new Map();
          Object.entries(parsed).forEach(([orderId, itemIds]) => {
            map.set(orderId, new Set(itemIds as string[]));
          });
          console.log('📋 Loaded marked items from localStorage:', map);
          return map;
        }
      } catch (error) {
        console.error('Error loading marked items from localStorage:', error);
      }
      return new Map();
    });
    
    const [lastFetchTime, setLastFetchTime] = useState<number>(0);
    const [hasRecentWebSocketData, setHasRecentWebSocketData] = useState<boolean>(false);

  const [notification, setNotification] = useState<{ message: string; type: 'error' | 'warning' | 'success' } | null>(null);
  const location = useLocation();

  // Show success banner when navigated from PaymentPage
  useEffect(() => {
    const state = location.state as { paymentSuccess?: boolean } | null;
    if (state?.paymentSuccess) {
      setNotification({ message: 'Thanh toán thành công', type: 'success' });
      // Clear route state in a microtask to avoid interrupting the auto-dismiss timer
      setTimeout(() => {
        navigate(location.pathname, { replace: true });
      }, 0);
    }
  }, [location.state, location.pathname, navigate]);

  // Disable body scroll when overlays are open
  useEffect(() => {
    if (showAdjustForm || showMarkOverlay || showPaymentOptions) {
      // Save original overflow
      const originalOverflow = document.body.style.overflow;
      // Disable scroll
      document.body.style.overflow = 'hidden';
      
      return () => {
        // Restore original overflow when overlays close
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [showAdjustForm, showMarkOverlay, showPaymentOptions]);

  // Auto-dismiss success banner after 3 seconds
  useEffect(() => {
    if (notification?.type === 'success') {
      const t = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(t);
    }
  }, [notification?.type]);
    
    // Keep track of deleted order IDs in component state
    const [deletedOrderIds, setDeletedOrderIds] = useState<string[]>([]);

    // Listen for realtime item mark events
    useEffect(() => {
      const handleMarkEvt = (evt: { orderId: string; itemId: string; marked: boolean }) => {
        console.log('📋 Received realtime item mark event:', evt);
        setMarkedItems(prev => {
          const next = new Map(prev);
          const setForOrder = new Set(next.get(evt.orderId) || []);
          if (evt.marked) {
            setForOrder.add(evt.itemId);
          } else {
            setForOrder.delete(evt.itemId);
          }
          next.set(evt.orderId, setForOrder);
          
          // Persist to localStorage
          try {
            const serialized = Object.fromEntries(
              Array.from(next.entries()).map(([oid, itemSet]) => [oid, Array.from(itemSet)])
            );
            localStorage.setItem('markedItems', JSON.stringify(serialized));
          } catch (error) {
            console.error('Error saving marked items to localStorage:', error);
          }
          
          return next;
        });
      };

      on('order_item_marked', handleMarkEvt);
      return () => {
        off('order_item_marked');
      };
    }, [on, off]);

    // Filter out deleted orders from API response
    const filterDeletedOrders = useCallback((orders: Order[]) => {
      const missedDeletions = localStorage.getItem('missedOrderDeletions');
      
      // Combine localStorage and component state deleted order IDs
      let allDeletedOrderIds = [...deletedOrderIds];
      
      if (missedDeletions) {
        try {
          const localStorageDeletedIds = JSON.parse(missedDeletions);
          allDeletedOrderIds = [...allDeletedOrderIds, ...localStorageDeletedIds];
          
          // Clear the missed deletions from localStorage
          localStorage.removeItem('missedOrderDeletions');
          console.log('🗑️ Cleared missedOrderDeletions from localStorage');
          
          // Update component state with the new deleted order IDs
          setDeletedOrderIds(allDeletedOrderIds);
        } catch (error) {
          console.error('❌ Error parsing missed order deletions:', error);
          localStorage.removeItem('missedOrderDeletions');
        }
      }
      
      if (allDeletedOrderIds.length > 0) {
        return orders.filter(order => !allDeletedOrderIds.includes(order.id));
      }
      
      return orders;
    }, [deletedOrderIds]);

    const fetchOrders = useCallback(async (showLoading = true) => {
      if (showLoading) {
        setLoading(true);
      }
      try {
              const res = await fetch(`${API_BASE_URL}/api/orders?t=${Date.now()}`, {
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
          },
        });
        
        if (!res.ok) throw new Error('Failed to fetch orders');
        const data = await res.json();
        
        // Filter out any orders that were deleted while the page was inactive
        const filteredOrders = filterDeletedOrders(data.data || []);
        
        // Merge with any orders that were immediately added to UI
        setOrders(prevOrders => {
          const merged = [...filteredOrders];
          
          // Add any orders from prevOrders that aren't in the API response
          prevOrders.forEach(prevOrder => {
            const existsInAPI = merged.find(apiOrder => apiOrder.id === prevOrder.id);
            if (!existsInAPI) {
              merged.unshift(prevOrder); // Add to beginning
            }
          });
          
          // Sort orders by createdAt in ascending order (oldest first)
          const sorted = merged.sort((a, b) => {
            const dateA = new Date(a.createdAt).getTime();
            const dateB = new Date(b.createdAt).getTime();
            return dateA - dateB; // Ascending order (oldest first)
          });
          
          return sorted;
        });
        
        // Update timestamps and mark as having fresh data
        setLastFetchTime(Date.now());
        setHasRecentWebSocketData(true);
        
        // Clear the flag after 5 minutes
        setTimeout(() => {
          setHasRecentWebSocketData(false);
          console.log('📋 Cleared recent WebSocket data flag from initial fetch');
        }, 300000);
        
        if (showLoading) {
          setLoading(false);
        }
      } catch (error) {
        console.error('Error fetching orders:', error);
        setError('Failed to fetch orders. Please try again.');
      } finally {
        if (showLoading) {
          setLoading(false);
        }
      }
    }, [filterDeletedOrders, deletedOrderIds]);

    // Fetch orders on component mount and when user navigates back
    useEffect(() => {
      console.log('📋 OrdersPage mounted/activated, fetching orders...');
      
      // 🚀 Check for immediately created order and add it to UI first
      const latestOrder = (window as any).latestOrderCreated;
      if (latestOrder && !latestOrder.deleted) {
        console.log('📦 Found immediately created order, adding to UI:', latestOrder.id);
        setOrders(prevOrders => {
          // Check if order already exists to avoid duplicates
          const exists = prevOrders.find(order => order.id === latestOrder.id);
          if (!exists) {
            console.log('📦 Adding new order immediately to UI:', latestOrder.id);
            return [latestOrder, ...prevOrders];
          }
          return prevOrders;
        });
        // Clear the global variable
        (window as any).latestOrderCreated = null;
      } else if (latestOrder && latestOrder.deleted) {
        console.log('📦 Skipping deleted order from global variable:', latestOrder.id);
        // Clear the global variable
        (window as any).latestOrderCreated = null;
      }
      
      // Then fetch fresh data from API - WebSocket will handle deletions
      fetchOrders();
      
      // Also fetch orders when page becomes visible (user navigates back)
      const handleVisibilityChange = () => {
        if (!document.hidden) {
          console.log('📋 Page became visible, checking if refresh needed...');
          
          // Skip refresh if we have recent WebSocket data
          if (hasRecentWebSocketData) {
            console.log('📋 Skipping refresh - recent WebSocket data available');
            return;
          }
          
          const now = Date.now();
          const timeSinceLastFetch = now - lastFetchTime;
          
          console.log('📋 Time since last fetch:', Math.round(timeSinceLastFetch / 1000), 'seconds');
          console.log('📋 Orders count:', orders.length);
          
          // Skip refresh if we have any orders and data is less than 2 minutes old
          if (orders.length > 0 && timeSinceLastFetch < 120000) {
            console.log('📋 Skipping refresh - orders available and data is recent (last fetch:', Math.round(timeSinceLastFetch / 1000), 'seconds ago)');
            return;
          }
          
          // Only refresh if we have no orders or data is very old (more than 2 minutes)
          if (orders.length === 0 || timeSinceLastFetch > 120000) {
            console.log('📋 Refreshing orders (no orders or very stale data)');
            fetchOrders(false); // Don't show loading screen for background refreshes
          } else {
            console.log('📋 Skipping refresh - orders are recent (last fetch:', Math.round(timeSinceLastFetch / 1000), 'seconds ago)');
          }
        }
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);
      
      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }, []); // Remove fetchOrders dependency to prevent double mounting







    // Store the last deleted order ID to handle missed WebSocket messages
    const [lastDeletedOrderId, setLastDeletedOrderId] = useState<string | null>(null);



   
    useEffect(() => {
      console.log('🔌 Setting up WebSocket listeners, connection status:', isConnected);
      
      // Debug: Check if WebSocket is connected
      if (!isConnected) {
        console.warn('⚠️ WebSocket not connected! Messages may not be received.');
        console.log('🔌 Attempting to connect WebSocket...');
        connect();
      }
              const handleOrderUpdate = (updatedOrder: Order) => {
          console.log('📋 Received order update via WebSocket:', updatedOrder);
          
          // Check if order status changed to DONE and clear marked items
          const existingOrder = orders.find(o => o.id === updatedOrder.id);
          if (existingOrder && existingOrder.status !== 'DONE' && updatedOrder.status === 'DONE') {
            console.log('📋 Order marked as DONE, clearing marked items');
            setMarkedItems(prev => {
              const next = new Map(prev);
              next.delete(updatedOrder.id);
              try {
                const serialized = Object.fromEntries(
                  Array.from(next.entries()).map(([oid, itemSet]) => [oid, Array.from(itemSet)])
                );
                localStorage.setItem('markedItems', JSON.stringify(serialized));
              } catch (error) {
                console.error('Error saving marked items to localStorage:', error);
              }
              return next;
            });
          }
          
          // Update the orders list
        setOrders(prevOrders => {
          const index = prevOrders.findIndex(o => o.id === updatedOrder.id);
          if (index !== -1) {
            const existingOrder = prevOrders[index];
            const statusChanged = existingOrder.status !== updatedOrder.status;
            
            const newOrders = [...prevOrders];
            newOrders[index] = updatedOrder;
            
            if (statusChanged) {
              console.log('📋 Order status changed from', existingOrder.status, 'to', updatedOrder.status);
              // Update timestamp since we got fresh data via WebSocket
              setLastFetchTime(Date.now());
              setHasRecentWebSocketData(true);
              console.log('📋 Updated lastFetchTime and marked as having recent WebSocket data');
              
              // Clear the flag after 5 minutes
              setTimeout(() => {
                setHasRecentWebSocketData(false);
                console.log('📋 Cleared recent WebSocket data flag');
              }, 300000);
            } else {
              console.log('📋 Updated orders list with fresh data (no status change)');
              // Also update timestamp for any WebSocket update to prevent refreshes
              setLastFetchTime(Date.now());
              setHasRecentWebSocketData(true);
              
              // Clear the flag after 5 minutes
              setTimeout(() => {
                setHasRecentWebSocketData(false);
                console.log('📋 Cleared recent WebSocket data flag');
              }, 300000);
            }
            
            // Sort orders by createdAt in ascending order (oldest first)
            const sorted = newOrders.sort((a, b) => {
              const dateA = new Date(a.createdAt).getTime();
              const dateB = new Date(b.createdAt).getTime();
              return dateA - dateB; // Ascending order (oldest first)
            });
            
            return sorted;
          } else {
            console.log('📋 Adding new order to list');
            // Add new order and sort by createdAt in ascending order
            const newOrders = [updatedOrder, ...prevOrders];
            const sorted = newOrders.sort((a, b) => {
              const dateA = new Date(a.createdAt).getTime();
              const dateB = new Date(b.createdAt).getTime();
              return dateA - dateB; // Ascending order (oldest first)
            });
            return sorted;
          }
        });
        

        
        // Update form data if this order is being edited
        if (adjustOrderId === updatedOrder.id) {
          console.log('🔄 Order being edited was updated, refreshing form data');
          if (!submitting) {
            setAdjustOrderDetails(updatedOrder);
            // Also update the form data to match the fresh data
            setAdjustFormData({
              tableIds: updatedOrder.tableNumbers.map(num => {
                const table = tables?.find(t => t.number === num);
                return table?.id || '';
              }).filter(id => id),
              numberOfPeople: updatedOrder.numberOfPeople,
              items: updatedOrder.items.map(item => ({
                foodItemId: item.id,
                quantity: item.quantity
              }))
            });
          } else {
            console.log('🔄 Skipping form update because user is actively submitting');
          }
        }
      };

      const handleOrderDeleted = (orderId: string) => {
        console.log('🗑️ Received order_deleted for orderId:', orderId);
        
        // Validate orderId
        if (!orderId || typeof orderId !== 'string') {
          console.error('🗑️ Invalid orderId received:', orderId);
          return;
        }
        
        // Remove order from UI immediately
        setOrders(prevOrders => {
          const filtered = prevOrders.filter(order => order.id !== orderId);
          console.log('🗑️ Order removed from UI:', orderId);
          return filtered;
        });
        
        // Store deleted order ID to prevent it from being re-added by fetchOrders
        setDeletedOrderIds(prev => [...prev, orderId]);
        
        // Clean up marked items for deleted order
        setMarkedItems(prev => {
          const newMap = new Map(prev);
          newMap.delete(orderId);
          return newMap;
        });
      };



      const handlePaymentUpdate = (payment: any) => {
        console.log('💳 Received payment update via WebSocket:', payment);
        
        // Handle payment confirmation - immediately remove order from UI
        if (payment.paymentStatus === 'PAID' || 
            payment.paymentStatus === 'SUCCESS' || 
            payment.paymentStatus === 'CONFIRMED' ||
            payment.status === 'SUCCESS' ||
            payment.status === 'CONFIRMED' ||
            payment.confirmed) {
          
          console.log('💳 Payment confirmed - removing order immediately');
          
          // Get orderId from payment object
          const orderId = payment.orderId || payment.order?.id;
          
          if (orderId) {
            console.log('💳 Removing order immediately:', orderId);
            
            // Immediately remove the order from UI
            setOrders(prevOrders => {
              const filtered = prevOrders.filter(order => order.id !== orderId);
              console.log('💳 Orders before payment removal:', prevOrders.length, 'after:', filtered.length);
              return filtered;
            });
            
            // Add to deleted list to prevent re-addition by fetchOrders
            setDeletedOrderIds(prev => {
              const updated = [...prev, orderId];
              console.log('💳 Added to deleted order IDs:', updated);
              return updated;
            });
            
            // Clean up marked items for deleted order
            setMarkedItems(prev => {
              const newMap = new Map(prev);
              newMap.delete(orderId);
              
              // Save updated state to localStorage
              try {
                const serialized = Object.fromEntries(
                  Array.from(newMap.entries()).map(([orderId, itemSet]) => [
                    orderId, 
                    Array.from(itemSet)
                  ])
                );
                localStorage.setItem('markedItems', JSON.stringify(serialized));
              } catch (error) {
                console.error('Error saving marked items to localStorage:', error);
              }
              
              return newMap;
            });
          } else {
            console.warn('💳 Payment confirmed but no orderId found in payment object');
          }
        } else if (payment.paymentStatus === 'PENDING') {
          console.log('💳 Payment pending, refreshing orders');
          fetchOrders(false); // Don't show loading screen for background refreshes
        } else {
          console.log('💳 Ignoring payment update (likely order status change)');
        }
      };

      on('order_update', handleOrderUpdate);
      on('order_deleted', handleOrderDeleted);
      on('payment_update', handlePaymentUpdate);
      

      

      
      // Add a test message handler to verify WebSocket is working
      on('test_message', (data) => {
        console.log('🧪 Test message received:', data);
      });
      
      // Add connection status handlers
      on('connect', () => {
        console.log('✅ WebSocket connected - ready to receive real-time updates');
      });
      
      on('disconnect', () => {
        console.log('❌ WebSocket disconnected');
      });
      
      on('connect_error', (error) => {
        console.error('❌ WebSocket connection error:', error);
      });
      
      // Removed WebSocket test and periodic connection check for performance

      return () => {
        console.log('🔌 Cleaning up WebSocket listeners');
        off('order_update');
        off('order_deleted');
        off('payment_update');
        off('test_message');
        off('connect');
        off('disconnect');
      };
    }, [on, off, fetchOrders]);

    // Clean up marked items for orders that no longer exist
    useEffect(() => {
      if (orders.length > 0 && markedItems.size > 0) {
        const existingOrderIds = new Set(orders.map(order => order.id));
        let hasChanges = false;
        
        setMarkedItems(prev => {
          const newMap = new Map(prev);
          
          for (const [orderId] of newMap) {
            if (!existingOrderIds.has(orderId)) {
              newMap.delete(orderId);
              hasChanges = true;
            }
          }
          
          if (hasChanges) {
            // Save updated state to localStorage
            try {
              const serialized = Object.fromEntries(
                Array.from(newMap.entries()).map(([orderId, itemSet]) => [
                  orderId, 
                  Array.from(itemSet)
                ])
              );
              localStorage.setItem('markedItems', JSON.stringify(serialized));
            } catch (error) {
              console.error('Error saving marked items to localStorage:', error);
            }
          }
          
          return newMap;
        });
      }
    }, [orders]);

  // Fetch order details when adjustOrderId changes
  useEffect(() => {
    if (adjustOrderId) {
      setAdjustOrderLoading(true);
      setAdjustOrderDetails(null);
        fetch(`${API_BASE_URL}/api/orders/${adjustOrderId}?t=${Date.now()}`, {
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
          },
        })
        .then(res => {
          if (!res.ok) throw new Error('Failed to fetch order details');
          return res.json();
        })
        .then(data => {
            console.log('📋 Fetched fresh order details:', data.data);
          setAdjustOrderDetails(data.data);
          setAdjustOrderLoading(false);
        })
        .catch(err => {
            console.error('❌ Error fetching order details:', err);
          setAdjustOrderLoading(false);
          setAdjustOrderDetails(null);
        });
    }
  }, [adjustOrderId]);

  // Fetch food items for the menu
  useEffect(() => {
    if (showAdjustForm) {
      setFoodItemsLoading(true);
      fetch(`${API_BASE_URL}/api/food-items`)
        .then((res) => {
          if (!res.ok) throw new Error('Failed to fetch food items');
          return res.json();
        })
        .then((data) => {
          setFoodItems(data.data || []);
          setFoodItemsLoading(false);
        })
        .catch((err) => {
          setFoodItemsLoading(false);
        });
    }
  }, [showAdjustForm]);

  // Fetch all tables for table selection
  useEffect(() => {
    if (showAdjustForm) {
      console.log('📋 Loading tables for adjustment form...');
      fetch(`${API_BASE_URL}/api/tables`)
        .then((res) => res.json())
        .then((data) => {
          console.log('📋 Loaded tables:', data.data);
          setTables(data.data || []);
        })
        .catch((error) => {
          console.error('❌ Error loading tables:', error);
          setTables([]);
        });
    }
  }, [showAdjustForm]);

  // Initialize form data when order details are loaded
  useEffect(() => {
      if (adjustOrderDetails && showAdjustForm && foodItems.length > 0 && tables.length > 0 && !submitting) {
      console.log('Order details:', adjustOrderDetails);
      console.log('Order items:', adjustOrderDetails.items);
      console.log('Food items:', foodItems);
      
      // Map order items to food items by matching name and price
      const mappedItems = adjustOrderDetails.items.map(orderItem => {
        console.log(`Looking for food item matching: "${orderItem.foodItemName}" with price ${orderItem.price}`);
        
        const matchingFoodItem = foodItems.find(foodItem => 
          foodItem.name === orderItem.foodItemName && foodItem.price === orderItem.price
        );
        
        if (matchingFoodItem) {
          console.log(`✅ Successfully matched "${orderItem.foodItemName}" (order item ID: ${orderItem.id}) to food item ID: ${matchingFoodItem.id}`);
          return {
            foodItemId: matchingFoodItem.id,
            quantity: orderItem.quantity
          };
        } else {
          console.warn(`❌ Could not match order item "${orderItem.foodItemName}" with price ${orderItem.price}. Available food items:`, 
            foodItems.map(fi => ({ name: fi.name, price: fi.price, id: fi.id }))
          );
          return null;
        }
      }).filter(Boolean); // Remove null entries
      
      console.log(`📋 Final mapped items for form:`, mappedItems);
      
      // Map table numbers to actual table IDs
      const mappedTableIds = adjustOrderDetails.tableNumbers.map(tableNumber => {
        const matchingTable = tables.find(table => table.number === tableNumber);
        if (matchingTable) {
          console.log(`✅ Mapped table number ${tableNumber} to table ID: ${matchingTable.id}`);
          return matchingTable.id;
        } else {
          console.warn(`❌ Could not find table with number ${tableNumber}. Available tables:`, 
            tables.map(t => ({ number: t.number, id: t.id }))
          );
          return null;
        }
      }).filter(Boolean) as string[];
      
      setAdjustFormData({
        tableIds: mappedTableIds,
        numberOfPeople: adjustOrderDetails.numberOfPeople,
        items: mappedItems as { foodItemId: string; quantity: number }[]
      });
    }
    }, [adjustOrderDetails, showAdjustForm, foodItems, tables, submitting]);

  const handleQuantityChange = (foodItemId: string, quantity: number) => {
    setAdjustFormData(prev => {
      if (quantity <= 0) {
        return {
          ...prev,
          items: prev.items.filter((item) => item.foodItemId !== foodItemId)
        };
      }
      const exists = prev.items.find((item) => item.foodItemId === foodItemId);
      if (exists) {
        return {
          ...prev,
          items: prev.items.map((item) =>
            item.foodItemId === foodItemId ? { ...item, quantity } : item
          )
        };
      } else {
        return {
          ...prev,
          items: [...prev.items, { foodItemId, quantity }]
        };
      }
    });
  };

  const handleIncrement = (foodItemId: string) => {
    setAdjustFormData(prev => {
      const exists = prev.items.find((item) => item.foodItemId === foodItemId);
      if (exists) {
        return {
          ...prev,
          items: prev.items.map((item) =>
            item.foodItemId === foodItemId ? { ...item, quantity: item.quantity + 1 } : item
          )
        };
      } else {
        return {
          ...prev,
          items: [...prev.items, { foodItemId, quantity: 1 }]
        };
      }
    });
  };
  const handleDecrement = (foodItemId: string) => {
    setAdjustFormData(prev => {
      const exists = prev.items.find((item) => item.foodItemId === foodItemId);
      if (exists) {
        if (exists.quantity <= 1) {
          return {
            ...prev,
            items: prev.items.filter((item) => item.foodItemId !== foodItemId)
          };
        } else {
          return {
            ...prev,
            items: prev.items.map((item) =>
              item.foodItemId === foodItemId ? { ...item, quantity: item.quantity - 1 } : item
            )
          };
        }
      }
      return prev;
    });
  };
  const handleDeleteFood = (foodItemId: string) => {
    setAdjustFormData(prev => ({
      ...prev,
      items: prev.items.filter((item) => item.foodItemId !== foodItemId)
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustOrderId) return;
    
    console.log('🚀 Submitting adjustment with data:', adjustFormData);
    console.log('📍 Adjust Order ID:', adjustOrderId);
    console.log('🏢 Tables available:', tables);
    
    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);
    
    try {
      const res = await fetch(`${API_BASE_URL}/api/orders/${adjustOrderId}/adjust`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(adjustFormData),
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error('❌ API Error Response:', errorText);
        throw new Error(`Failed to adjust order: ${res.status} ${errorText}`);
      }
      
      const responseData = await res.json();
      console.log('✅ Adjustment successful:', responseData);
      
      setSubmitSuccess(true);
      
      // Update the order details with the new data from response
      if (responseData.data) {
        setAdjustOrderDetails(responseData.data);
        
                 // Update form data with the new order data
         if (foodItems.length > 0) {
           const mappedItems = responseData.data.items.map((orderItem: any) => {
             const matchingFoodItem = foodItems.find(foodItem => 
               foodItem.name === orderItem.foodItemName && foodItem.price === orderItem.price
             );
             
             if (matchingFoodItem) {
               return {
                 foodItemId: matchingFoodItem.id,
                 quantity: orderItem.quantity
               };
             } else {
               console.warn(`Could not match order item "${orderItem.foodItemName}" with price ${orderItem.price} after update`);
               return null;
             }
           }).filter(Boolean);
           
           setAdjustFormData({
             tableIds: responseData.data.tableNumbers.map((num: any) => {
               const table = tables?.find(t => t.number === num);
               return table?.id || '';
             }).filter((id: any) => id),
             numberOfPeople: responseData.data.numberOfPeople,
             items: mappedItems as { foodItemId: string; quantity: number }[]
           });
         }
      }
        
      setTimeout(() => {
        handleCloseAdjust();
          fetchOrders(false); // Don't show loading screen
          setTimeout(() => {
            setNotification(null);
          }, 2000);
        }, 1000);
    } catch (err: any) {
      console.error('❌ Submit error:', err);
      setSubmitError(err.message || 'Unknown error');
        setNotification({
          message: `❌ Lỗi cập nhật đơn hàng: ${err.message || 'Unknown error'}`,
          type: 'error'
        });
        setTimeout(() => {
          setNotification(null);
        }, 2500);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseAdjust = () => {
    setAdjustOrderId(null);
    setShowAdjustForm(false);
    setAdjustOrderDetails(null);
    setAdjustFormData({ tableIds: [], numberOfPeople: 1, items: [] });
    setSubmitError(null);
    setSubmitSuccess(false);
  };

      const handleShowMarkOverlay = (orderId: string) => {
      setShowMarkOverlay(orderId);
    };

  const handleCloseMarkOverlay = () => {
    setShowMarkOverlay(null);
  };

    const handleToggleMark = (orderId: string, itemId: string) => {
      const currentlyMarked = !!(markedItems.get(orderId)?.has(itemId));
      const willMark = !currentlyMarked;

      setMarkedItems(prev => {
        const newMap = new Map(prev);
        const orderMarkedItems = new Set(newMap.get(orderId) || []);
        
        if (willMark) {
          orderMarkedItems.add(itemId);
        } else {
          orderMarkedItems.delete(itemId);
        }
        
        if (orderMarkedItems.size === 0) {
          newMap.delete(orderId);
        } else {
          newMap.set(orderId, orderMarkedItems);
        }
        
        // Save to localStorage
        try {
          const serialized = Object.fromEntries(
            Array.from(newMap.entries()).map(([oid, itemSet]) => [
              oid, 
              Array.from(itemSet)
            ])
          );
          localStorage.setItem('markedItems', JSON.stringify(serialized));
        } catch (error) {
          console.error('Error saving marked items to localStorage:', error);
        }
        
        return newMap;
      });

      // Send realtime event to backend
      try {
        console.log('📤 Sending item mark event:', { orderId, itemId, marked: willMark });
        send('/app/order-item-marks', { orderId, itemId, marked: willMark });
      } catch (error) {
        console.warn('⚠️ Failed to send item mark event, keeping optimistic state:', error);
      }
    };

        

  const handlePayment = async (orderId: string, paymentMethod: 'CASH' | 'BANK_TRANSFER') => {
      console.log('💰 Starting payment process for order:', orderId);
      console.log('🔌 WebSocket connection status before payment:', isConnected);
    try {
      // Check if order is still pending
      const order = orders.find(o => o.id === orderId);
      if (order && order.status === 'PENDING') {
        setNotification({ message: 'Đơn Hàng Chưa Hoàn Thành', type: 'warning' });
          setTimeout(() => setNotification(null), 4000);
        setShowPaymentOptions(null); // Close payment options
        return;
      }

        // Immediately navigate to payment page; let PaymentPage initiate the payment
        setShowPaymentOptions(null);
        navigate(`/payment?orderId=${orderId}&method=${paymentMethod}`);
    } catch (error) {
        console.error('Payment navigation error:', error);
        setNotification({ message: 'Có lỗi xảy ra khi chuyển đến trang thanh toán.', type: 'error' });
        setTimeout(() => setNotification(null), 4000);
    } finally {
      setPaymentLoading(null);
    }
  };

  const handleMarkDone = async (orderId: string) => {
    try {
        const response = await fetch(`${API_BASE_URL}/api/orders/${orderId}/status`, {
        method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'DONE' })
        });

        if (!response.ok) throw new Error('Failed to update order status');

        console.log('✅ Order marked as done');
        
        // Show success notification
        setNotification({
          message: 'Đơn hàng đã được đánh dấu hoàn thành!',
          type: 'success'
        });

      } catch (error) {
        console.error('❌ Error marking order as done:', error);
        setNotification({
          message: 'Có lỗi xảy ra khi cập nhật trạng thái đơn hàng.',
          type: 'error'
        });
      }
    };

    const handleAdjustOrder = (orderId: string) => {
      setAdjustOrderId(orderId);
      setShowAdjustForm(true);
    };

    if (loading) return (
    <div style={{ 
      maxWidth: window.innerWidth <= 768 ? '100%' : 900, 
      margin: window.innerWidth <= 768 ? '16px auto' : '32px auto', 
      padding: window.innerWidth <= 768 ? '12px' : '24px',
      width: '100%',
      boxSizing: 'border-box'
    }}>
      {/* Header skeleton */}
      <div style={{ 
        width: '100%', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: 24 
      }}>
        <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
          <div style={{
            background: '#e0e0e0',
            borderRadius: 8,
            padding: '8px 20px',
            width: '120px',
            height: '36px',
            animation: 'pulse 1.5s ease-in-out infinite'
          }} />
          <div style={{
            background: '#e0e0e0',
            borderRadius: 8,
            padding: '8px 20px',
            width: '120px',
            height: '36px',
            animation: 'pulse 1.5s ease-in-out infinite'
          }} />
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '12px',
          color: '#666'
        }}>
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: '#e0e0e0',
            animation: 'pulse 1.5s ease-in-out infinite'
          }} />
          <div style={{
            background: '#e0e0e0',
            borderRadius: 4,
            width: '60px',
            height: '12px',
            animation: 'pulse 1.5s ease-in-out infinite'
          }} />
        </div>
      </div>
      
      {/* Order cards skeleton */}
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        gap: 24,
        position: 'relative'
      }}>
        {[1, 2, 3].map((index) => (
          <div key={index} style={{
            background: '#fff',
            borderRadius: 12,
            boxShadow: '0 2px 12px rgba(0,0,0,0.07)',
            padding: 20,
            animation: 'pulse 1.5s ease-in-out infinite'
          }}>
            {/* Order ID skeleton */}
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              marginBottom: 8 
            }}>
              <div style={{
                background: '#e0e0e0',
                borderRadius: 4,
                width: '200px',
                height: '20px',
                marginBottom: 8
              }} />
            </div>
            
            {/* Table info skeleton */}
            <div style={{ 
              marginBottom: 8, 
              display: 'flex', 
              justifyContent: 'center', 
              alignItems: 'center', 
              gap: 18 
            }}>
              <div style={{
                background: '#e0e0e0',
                borderRadius: 4,
                width: '150px',
                height: '18px'
              }} />
              <div style={{
                background: '#e0e0e0',
                borderRadius: 4,
                width: '150px',
                height: '18px'
              }} />
              <div style={{
                background: '#e0e0e0',
                borderRadius: 4,
                width: '150px',
                height: '18px'
              }} />
            </div>
            
            {/* Table skeleton */}
            <div style={{
              fontFamily: "'Roboto', 'Segoe UI', Arial, sans-serif",
              fontSize: 15,
              color: '#222',
              background: '#fff',
              borderRadius: 12,
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              padding: 16,
              margin: 8,
              border: '1px solid #eee',
              maxWidth: 400,
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', margin: '12px 0' }}>
                <thead>
                  <tr>
                    <th style={{ 
                      background: '#e0e0e0', 
                      padding: '8px 12px', 
                      borderRadius: 4,
                      height: '20px'
                    }} />
                    <th style={{ 
                      background: '#e0e0e0', 
                      padding: '8px 12px', 
                      borderRadius: 4,
                      height: '20px'
                    }} />
                    <th style={{ 
                      background: '#e0e0e0', 
                      padding: '8px 12px', 
                      borderRadius: 4,
                      height: '20px'
                    }} />
                    <th style={{ 
                      background: '#e0e0e0', 
                      padding: '8px 12px', 
                      borderRadius: 4,
                      height: '20px'
                    }} />
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ 
                      background: '#e0e0e0', 
                      padding: '8px 12px', 
                      borderRadius: 4,
                      height: '20px'
                    }} />
                    <td style={{ 
                      background: '#e0e0e0', 
                      padding: '8px 12px', 
                      borderRadius: 4,
                      height: '20px'
                    }} />
                    <td style={{ 
                      background: '#e0e0e0', 
                      padding: '8px 12px', 
                      borderRadius: 4,
                      height: '20px'
                    }} />
                    <td style={{ 
                      background: '#e0e0e0', 
                      padding: '8px 12px', 
                      borderRadius: 4,
                      height: '20px'
                    }} />
                  </tr>
                </tbody>
              </table>
            </div>
            
            {/* Total skeleton */}
            <div style={{
              marginTop: 16, 
              textAlign: 'center', 
              padding: '12px', 
              background: '#e0e0e0', 
              borderRadius: 8, 
              height: '20px'
            }} />
          </div>
        ))}
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
  
  if (error) return (
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
        fontSize: '18px',
        fontWeight: 500
      }}>
        Lỗi: {error}
      </div>
    </div>
  );

  const isMobile = window.innerWidth <= 768;

  return (
    <div style={{ 
      maxWidth: isMobile ? '100%' : 900, 
      margin: isMobile ? '16px auto' : '32px auto', 
      padding: isMobile ? '12px' : '24px',
      width: '100%',
      boxSizing: 'border-box'
    }}>
        {/* Banner Notification - Warning */}
       {/* Toast Notification - Warning */}
{/* Toast Notification - Warning */}
{notification && notification.type === 'warning' && (
  <div
    style={{
      position: 'fixed',
      top: '20px',
      right: '20px',
      zIndex: 2000,
      animation: 'slideInRight 0.3s ease-out, slideOutRight 0.3s ease-in 2.7s forwards',
      background: '#ffebee',
      border: '3px solidrgba(229, 56, 53, 0.81)',
      borderRadius: '5px',
      padding: '40px 60px',
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
     
      color: '#d32f2f',
      textAlign: 'center',
      lineHeight: 1.1,
      minHeight: '45px',
      minWidth: '300px',
      width: 'auto',
      maxWidth: 'none',
      overflow: 'visible',
      whiteSpace: 'nowrap',
    }}
  >
    <span style={{
      fontSize: '13px',
      fontWeight: 700,
      color: '#d32f2f',
      lineHeight: 1.1,
      display: 'block',
      textAlign: 'center',
      whiteSpace: 'nowrap',
    }}>
      Đơn Hàng Chưa Hoàn Thành
    </span>
  </div>
)}

      
                {/* Banner Notification - Success */}
        {notification && notification.type === 'success' && (
        <div
        style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 2000,
          animation: 'slideInRight 0.3s ease-out, slideOutRight 0.3s ease-in 2.7s forwards',
          background: '#f0f9f0',
          border: '3px solidrgba(88, 204, 94, 0.96)',
          borderRadius: '5px',
          padding: '40px 60px',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#388e3c',
          textAlign: 'center',
          lineHeight: 1.1,
          minHeight: '45px',
          minWidth: '300px',
          width: 'auto',
          maxWidth: 'none',
          overflow: 'visible',
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{
          fontSize: '13px',
          fontWeight: 700,
          color: '#388e3c',
          lineHeight: 1.1,
          display: 'block',
          textAlign: 'center',
          whiteSpace: 'nowrap',
        }}>
          Thanh toán thành công
        </span>
      </div>
      
       
        )}
      <div style={{ width: '100%', display: 'flex', justifyContent: 'space-evenly', alignItems: 'center', marginBottom: 24 }}>
        <button
          onClick={() => navigate('/')}
          style={{
            background: '#ff9800',
            color: '#fff',
            fontWeight: 550,
            fontSize: 12,
            border: 'none',
            borderRadius: 6,
            padding: '6px 14px',
            cursor: 'pointer',
            boxShadow: '0 2px 6px rgba(255, 152, 0, 0.08)',
            letterSpacing: 0.5,
            transition: 'background 0.2s',
            minWidth: '90px',
            textAlign: 'center',
          }}
          onMouseOver={e => (e.currentTarget.style.background = '#fb8c00')}
          onMouseOut={e => (e.currentTarget.style.background = '#ff9800')}
        >
          Quay lại
        </button>
            
        <button
          onClick={() => navigate('/revenue')}
          style={{
            background: '#ff9800',
            color: '#fff',
            fontWeight: 550,
            fontSize: 12,
            border: 'none',
            borderRadius: 6,
            padding: '6px 14px',
            cursor: 'pointer',
            boxShadow: '0 2px 6px rgba(255, 152, 0, 0.08)',
            letterSpacing: 0.5,
            transition: 'background 0.2s',
            minWidth: '90px',
            textAlign: 'center',
          }}
          onMouseOver={e => (e.currentTarget.style.background = '#fb8c00')}
          onMouseOut={e => (e.currentTarget.style.background = '#ff9800')}
        >
          Doanh Thu
        </button>
        
        {/* WebSocket Connection Status */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '12px',
          color: isConnected ? '#4caf50' : '#f44336',
          fontWeight: 500,
        }}>
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: isConnected ? '#4caf50' : '#f44336',
            animation: isConnected ? 'none' : 'pulse 2s infinite',
          }} />
          {isConnected ? 'Đã kết nối' : 'Đang kết nối'}
        </div>
      </div>
              
      
      {/* Orders list */}
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        gap: 24,
        position: 'relative'
      }}>
        {orders.length === 0 ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '60px 20px',
            background: '#f8f9fa',
            borderRadius: 12,
            border: '2px dashed #dee2e6',
            textAlign: 'center',
            minHeight: '200px'
          }}>
            <div>
              <div style={{
                fontSize: 24,
                fontWeight: 600,
                color: '#6c757d',
                marginBottom: 8
              }}>
                Không có đơn hàng nào
      </div>
              <div style={{
                fontSize: 16,
                color: '#adb5bd',
                fontWeight: 400
              }}>
                Hiện tại chưa có đơn hàng nào trong hệ thống
              </div>
            </div>
          </div>
        ) : (
          orders.map((order, index) => (
            <OrderCard 
              key={order.id} 
              order={order} 
              onAdjust={() => {
                setAdjustOrderId(order.id);
                setShowAdjustForm(false); // Reset modal state when selecting a different order
              }}
              isAdjusting={adjustOrderId === order.id}
              onShowForm={() => setShowAdjustForm(true)}
              onCloseAdjust={handleCloseAdjust}
              orderIndex={index}
              totalOrders={orders.length}
              showAdjustForm={showAdjustForm && adjustOrderId === order.id}
              showPaymentOptions={showPaymentOptions === order.id}
              adjustOrderId={adjustOrderId}
              adjustOrderLoading={adjustOrderLoading}
              adjustOrderDetails={adjustOrderDetails}
              foodItems={foodItems}
              foodItemsLoading={foodItemsLoading}
              adjustFormData={adjustFormData}
              setAdjustFormData={setAdjustFormData}
              handleIncrement={handleIncrement}
              handleDecrement={handleDecrement}
              handleDeleteFood={handleDeleteFood}
              handleSubmit={handleSubmit}
              submitting={submitting}
              submitError={submitError}
              submitSuccess={submitSuccess}
              tables={tables}
              onShowPayment={() => setShowPaymentOptions(order.id)}
              onClosePayment={() => setShowPaymentOptions(null)}
              onPayment={handlePayment}
              paymentLoading={paymentLoading}
              showMarkOverlay={showMarkOverlay === order.id}
              onShowMarkOverlay={() => handleShowMarkOverlay(order.id)}
              onCloseMarkOverlay={handleCloseMarkOverlay}
              markedItems={markedItems}

            />
          ))
        )}
      </div>
      
      {/* Adjustment modal overlay */}
      {showAdjustForm && adjustOrderId && adjustOrderLoading !== undefined && adjustOrderDetails && foodItems && adjustFormData && handleIncrement && handleDecrement && handleDeleteFood && handleSubmit && tables && (
        <AdjustOrderModal
          open={showAdjustForm}
          onClose={handleCloseAdjust}
          adjustOrderLoading={adjustOrderLoading}
          adjustOrderDetails={adjustOrderDetails}
          foodItems={foodItems}
          foodItemsLoading={foodItemsLoading}
          adjustFormData={adjustFormData}
          setAdjustFormData={setAdjustFormData}
          handleIncrement={handleIncrement}
          handleDecrement={handleDecrement}
          handleDeleteFood={handleDeleteFood}
          handleSubmit={handleSubmit}
          submitting={submitting}
          submitError={submitError}
          submitSuccess={submitSuccess}
          tables={tables}
        />
      )}

        {/* Mark Overlay */}
      {showMarkOverlay && (
          <MarkOverlay
          open={!!showMarkOverlay}
          onClose={handleCloseMarkOverlay}
          order={orders.find(order => order.id === showMarkOverlay) || null}
            markedItems={markedItems.get(showMarkOverlay) || new Set()}
            onToggleMark={(itemId) => handleToggleMark(showMarkOverlay, itemId)}
            setOrders={setOrders}
        />
      )}
      
      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        
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
          
          @keyframes checkmark {
            0% {
              transform: scale(0);
              opacity: 0;
            }
            50% {
              transform: scale(1.2);
              opacity: 1;
            }
            100% {
              transform: scale(1);
              opacity: 1;
            }
          }
        
        @media (max-width: 700px) {
          div[style*='max-width: 900px'] {
            padding: 4px !important;
          }
          h1 {
            font-size: 16px !important;
          }
          table {
            font-size: 12px !important;
          }
          div[style*='box-shadow'] {
            padding: 6px !important;
            font-size: 12px !important;
          }
          div[style*='color: #1976d2'][style*='font-size: 18px'] {
            font-size: 13px !important;
          }
          span[style*='font-size: 16px'] {
            font-size: 11px !important;
          }
        }
        @media (max-width: 480px) {
          div[style*='max-width: 900px'] {
            padding: 1px !important;
          }
          h1 {
            font-size: 13px !important;
          }
          table {
            font-size: 10px !important;
          }
          div[style*='box-shadow'] {
            padding: 3px !important;
            font-size: 10px !important;
          }
          div[style*='color: #1976d2'][style*='font-size: 18px'] {
            font-size: 10px !important;
          }
          span[style*='font-size: 16px'] {
            font-size: 9px !important;
          }
        }
      `}</style>
    </div>
  );
};

// Add React.memo for OrderCard
const OrderCard = React.memo(({ 
  order, 
  onAdjust, 
  isAdjusting, 
  onShowForm, 
  onCloseAdjust,
  orderIndex = 0,
  totalOrders = 1,
  showAdjustForm = false,
  showPaymentOptions = false,
  adjustOrderId,
  adjustOrderLoading,
  adjustOrderDetails,
  foodItems,
  foodItemsLoading,
  adjustFormData,
  setAdjustFormData,
  handleIncrement,
  handleDecrement,
  handleDeleteFood,
  handleSubmit,
  submitting,
  submitError,
  submitSuccess,
  tables,
  onShowPayment,
  onClosePayment,
  onPayment,
  paymentLoading,
  showMarkOverlay,
  onShowMarkOverlay,
  onCloseMarkOverlay,
  markedItems
}: { 
  order: Order, 
  onAdjust: () => void, 
  isAdjusting: boolean,
  onShowForm: () => void,
  onCloseAdjust: () => void,
  orderIndex?: number,
  totalOrders?: number,
  showAdjustForm?: boolean,
  showPaymentOptions?: boolean,
  adjustOrderId?: string | null,
  adjustOrderLoading?: boolean,
  adjustOrderDetails?: Order | null,
  foodItems?: FoodItem[],
  foodItemsLoading?: boolean,
  adjustFormData?: { tableIds: string[]; numberOfPeople: number; items: { foodItemId: string; quantity: number }[] },
  setAdjustFormData?: React.Dispatch<React.SetStateAction<{ tableIds: string[]; numberOfPeople: number; items: { foodItemId: string; quantity: number }[] }>>,
  handleIncrement?: (foodItemId: string) => void,
  handleDecrement?: (foodItemId: string) => void,
  handleDeleteFood?: (foodItemId: string) => void,
  handleSubmit?: (e: React.FormEvent) => Promise<void>,
  submitting?: boolean,
  submitError?: string | null,
  submitSuccess?: boolean,
  tables?: TableFromApi[],
  onShowPayment?: () => void,
  onClosePayment?: () => void,
  onPayment?: (orderId: string, paymentMethod: 'CASH' | 'BANK_TRANSFER') => Promise<void>,
  paymentLoading?: string | null,
  showMarkOverlay?: boolean,
  onShowMarkOverlay?: () => void,
  onCloseMarkOverlay?: () => void,
    markedItems?: Map<string, Set<string>>
}) => {
  const [clickCount, setClickCount] = useState(0);
  const [clickTimeout, setClickTimeout] = useState<number | null>(null);

  const handleButtonClick = (action: () => void) => {
    setClickCount(prev => prev + 1);
    
    if (clickTimeout) {
      clearTimeout(clickTimeout);
    }
    
    const timeout = setTimeout(() => {
      if (clickCount === 0) {
        // Single click - perform normal action
        action();
      } else if (clickCount === 1) {
        // Double click - hide overlay
        console.log('Double click detected - hiding overlay');
        onCloseAdjust();
      }
      setClickCount(0);
    }, 300);
    
    setClickTimeout(timeout);
  };

  // Cleanup timeout on unmount
  React.useEffect(() => {
    return () => {
      if (clickTimeout) {
        clearTimeout(clickTimeout);
      }
    };
  }, [clickTimeout]);


  // Calculate modal position based on order position
  const getModalPosition = () => {
    const position = orderIndex / (totalOrders - 1); // 0 to 1
    if (position <= 0.33) return 'top';
    if (position >= 0.67) return 'bottom';
    return 'center';
  };

  const modalPosition = getModalPosition();



  return ( 
  <div style={{ position: 'relative' }}>
    <div 
      style={{ 
        background: '#fff', 
        borderRadius: 12, 
        boxShadow: '0 2px 12px rgba(0,0,0,0.07)', 
        padding: 20, 
        fontSize: 15,
        cursor: 'pointer',
        transition: 'box-shadow 0.2s, transform 0.1s',
        filter: (showAdjustForm && order.id !== adjustOrderId) ? 'blur(2px)' : 'none',
        pointerEvents: (showAdjustForm && order.id !== adjustOrderId) ? 'none' : 'auto',
      }}
      onClick={onAdjust}
      onMouseOver={e => {
        if (!isAdjusting) {
          e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.12)';
          e.currentTarget.style.transform = 'translateY(-1px)';
        }
      }}
      onMouseOut={e => {
        if (!isAdjusting) {
          e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.07)';
          e.currentTarget.style.transform = 'translateY(0)';
        }
      }}
    >
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
      <div style={{ fontWeight: 600, color: '#222', fontSize: 17 }}>
        Mã Đơn Hàng:
  <span
    style={{
      marginLeft: 8,
          fontWeight: 600,
      color: '#424242', // blue for order ID
      fontSize: 17,
    }}>
    {order.id}
  </span>
  <span
    style={{
          marginLeft: 12,
      padding: '6px 14px', // add padding for badge-like appearance
      borderRadius: 6,
      backgroundColor:
        order.status === 'DONE'
          ? '#e8f5e9' // light green background for done
          : order.status === 'PENDING'
          ? '#ffebee' // light red background for pending
          : '#e3f2fd', // light blue background for others
      color:
        order.status === 'DONE'
          ? '#2e7d32' // dark green text
          : order.status === 'PENDING'
          ? '#c62828' // dark red text
          : '#1565c0', // dark blue text
      fontSize: 15,
          fontWeight: 600,
      minWidth: '100px',
      display: 'inline-block',
      textAlign: 'center',
        }}>
          {getStatusLabel(order.status)}
        </span>

      </div>
    </div>
    <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, fontSize: 14, flexWrap: 'wrap', padding: '0 4px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontWeight: 600, fontSize: 18 }}>Bàn:</span>
        <span style={{ fontWeight: 700, color: '#424242', fontSize: 18 }}>{order.tableNumbers.join(', ')}</span>
      </div>
      <span style={{ fontWeight: 600, color: '#666', fontSize: 14 }}>|</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontWeight: 600, fontSize: 18 }}>Số người:</span>
        <span style={{ fontWeight: 700, color: '#424242', fontSize: 18 }}>{order.numberOfPeople}</span>
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontWeight: 600, fontSize: 18 }}>Thời gian:</span>
        <span style={{ fontWeight: 700, color: '#424242', fontSize: 18 }}>{formatDate(order.createdAt)}</span>
      </div>
    </div>
      <div
        style={{
          fontFamily: "'Roboto', 'Segoe UI', Arial, sans-serif",
          fontSize: 15,
          color: '#222',
          background: '#fff',
          borderRadius: 12,
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          padding: 10,
          margin: 4,
          border: '1px solid #eee',
          maxWidth: '100%',
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
      >
        {/* ...order content... */}
        <table style={{ width: '100%', borderCollapse: 'collapse', margin: '12px 0', fontFamily: "'Roboto', 'Segoe UI', Arial, sans-serif" }}>
          <thead>
            <tr>
              <th style={{ fontWeight: 600, fontSize: 15, color: '#444', background: '#f3f4f6', padding: '8px 12px', borderBottom: '1px solid #eee', textAlign: 'center', verticalAlign: 'middle' }}>Tên món</th>
              <th style={{ fontWeight: 600, fontSize: 15, color: '#444', background: '#f3f4f6', padding: '8px 12px', borderBottom: '1px solid #eee', textAlign: 'center', verticalAlign: 'middle' }}>Đơn giá</th>
              <th style={{ fontWeight: 600, fontSize: 15, color: '#444', background: '#f3f4f6', padding: '8px 12px', borderBottom: '1px solid #eee', textAlign: 'center', verticalAlign: 'middle' }}>SL</th>
              <th style={{ fontWeight: 600, fontSize: 15, color: '#444', background: '#f3f4f6', padding: '8px 12px', borderBottom: '1px solid #eee', textAlign: 'center', verticalAlign: 'middle' }}>Tổng</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item, index) => (
              <tr key={item.id || index}>
                <td style={{ fontWeight: 600, fontSize: 17, color: '#222', padding: '8px 12px', borderBottom: '1px solid #f0f0f0', textAlign: 'center', verticalAlign: 'middle' }}>
                  {item.foodItemName}
                </td>
                <td style={{ fontWeight: 600, fontSize: 17, color: '#222', padding: '8px 12px', borderBottom: '1px solid #f0f0f0', textAlign: 'center', verticalAlign: 'middle' }}>
                  {formatVNDForTable(item.price)}
                </td>
                <td style={{ fontWeight: 600, fontSize: 17, color: '#222', padding: '8px 12px', borderBottom: '1px solid #f0f0f0', textAlign: 'center', verticalAlign: 'middle' }}>
                  {item.quantity}
                </td>
                <td style={{ fontWeight: 600, fontSize: 17, color: '#222', padding: '8px 12px', borderBottom: '1px solid #f0f0f0', textAlign: 'center', verticalAlign: 'middle' }}>
                  {formatVNDForTable(item.subtotal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {/* ...rest of order card... */}
      </div>
        <div style={{marginTop: 16, textAlign: 'center', fontWeight: 800, fontSize: 18, color: '#fff', padding: '12px', background: '#ff9800', borderRadius: 8, border: '2px solid #f57c00', textShadow: '0 1px 2px rgba(0, 0, 0, 0.3)' }}>
          Tổng cộng: <span style={{ color: '#fff', fontWeight: 900, fontSize: 22, textShadow: '0 1px 3px rgba(0, 0, 0, 0.4)' }}>{formatVNDForTotal(order.totalAmount)} <span style={{ fontSize: 17, fontWeight: 700 }}>Đồng</span></span>
    </div>
  </div>
    
        {/* Adjust overlay positioned over the order card */}
    {isAdjusting && !showAdjustForm && !showPaymentOptions && (
      <div 
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.18)',
          borderRadius: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          cursor: 'pointer',
        }}
        onClick={() => onCloseAdjust?.()}
      >
        <div style={{ 
          display: 'flex', 
          flexDirection: 'row',
          gap: 12, 
          alignItems: 'center', 
          justifyContent: 'center',
          padding: '0 16px',
          width: '100%',
          margin: '8px 0'
        }}>
          <button
            style={{
              background: '#ff9800',
              color: '#fff',
              fontFamily: "'Roboto', 'Segoe UI', Arial, sans-serif",
              fontWeight: 500,
              fontSize: 15,
              border: 'none',
              borderRadius: 8,
              padding: '10px 16px',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(255, 152, 0, 0.2)',
              letterSpacing: 0.5,
              transition: 'all 0.2s',
              flex: '1 1 auto',
              minWidth: '80px',
              maxWidth: '120px',
            }}
            onClick={(e) => {
              e.stopPropagation();
              handleButtonClick(onShowForm);
            }}
            onMouseOver={e => (e.currentTarget.style.background = '#fb8c00')}
            onMouseOut={e => (e.currentTarget.style.background = '#ff9800')}
          >
            Điều Chỉnh
          </button>
          <button
            style={{
              background: '#ff9800',
              color: '#fff',
              fontFamily: "'Roboto', 'Segoe UI', Arial, sans-serif",
              fontWeight: 500,
              fontSize: 15,
              border: 'none',
              borderRadius: 8,
              padding: '10px 16px',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(255, 152, 0, 0.2)',
              letterSpacing: 0.5,
              transition: 'all 0.2s',
              flex: '1 1 auto',
              minWidth: '80px',
              maxWidth: '120px',
            }}
            onClick={(e) => {
              e.stopPropagation();
                handleButtonClick(() => onShowMarkOverlay?.());
            }}
            onMouseOver={e => (e.currentTarget.style.background = '#fb8c00')}
            onMouseOut={e => (e.currentTarget.style.background = '#ff9800')}
          >
              Đánh Dấu
              {(() => {
                const orderMarkedItems = markedItems?.get(order.id);
                const markedCount = orderMarkedItems?.size || 0;
                const totalItems = order.items.length;
                if (markedCount > 0) {
                  return (
                    <span style={{
                      marginLeft: '4px',
                      marginTop: '2px',
                      fontSize: '18px',
                      background: '#fff',
                      color: '#ff9800',
                      borderRadius: '50%',
                      width: '23px',
                      height: '20px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 'bold',
                      border: '1px solid #fff'
                    }}>
                      {markedCount}
                    </span>
                  );
                }
                return null;
              })()}
          </button>
          <button
            style={{
              background: '#ff9800',
              color: '#fff',
              fontFamily: "'Roboto', 'Segoe UI', Arial, sans-serif",
              fontWeight: 500,
              fontSize: 15,
              border: 'none',
              borderRadius: 8,
              padding: '10px 16px',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(255, 152, 0, 0.2)',
              letterSpacing: 0.5,
              transition: 'all 0.2s',
              flex: '1 1 auto',
              minWidth: '80px',
              maxWidth: '120px',
            }}
            onClick={(e) => {
              e.stopPropagation();
                handleButtonClick(() => onShowPayment?.());
            }}
            onMouseOver={e => (e.currentTarget.style.background = '#fb8c00')}
            onMouseOut={e => (e.currentTarget.style.background = '#ff9800')}
          >
              Thanh Toán
          </button>
        </div>
      </div>
    )}

    {/* Payment options overlay */}
    {isAdjusting && showPaymentOptions && (
      <div 
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.18)',
          borderRadius: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          cursor: 'pointer',
        }}
        onClick={() => onClosePayment?.()}
      >
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', position: 'relative' }}>
          {/* Close button */}
          <button
            style={{
              position: 'absolute',
              top: -35,
              right: -20,
              background: '#666',
              color: '#fff',
              border: 'none',
              borderRadius: '30%',
              width: 45,
              height: 40,
              cursor: 'pointer',
              fontSize: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1001,
              boxShadow: '0 3px 6px rgba(0,0,0,0.3)',
            }}
            onClick={onClosePayment}
          >
            ×
          </button>
          
          <button
            style={{
              background: '#ff9800',
              color: '#fff',
              fontFamily: "'Roboto', 'Segoe UI', Arial, sans-serif",
              fontWeight: 500,
              fontSize: 16,
              border: 'none',
              borderRadius: 10,
              padding: '14px 32px',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(255, 152, 0, 0.2)',
              letterSpacing: 1,
              transition: 'all 0.2s',
              width: '140px',
              height: '48px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onClick={(e) => {
              e.stopPropagation();
              handleButtonClick(() => onPayment?.(order.id, 'CASH'));
            }}
            disabled={paymentLoading === order.id}
            onMouseOver={e => (e.currentTarget.style.background = '#fb8c00')}
            onMouseOut={e => (e.currentTarget.style.background = '#ff9800')}
          >
            {paymentLoading === order.id ? 'Đang xử lý...' : 'Tiền Mặt'}
          </button>
          
          <button
            style={{
              background: '#ff9800',
              color: '#fff',
              fontFamily: "'Roboto', 'Segoe UI', Arial, sans-serif",
              fontWeight: 500,
              fontSize: 16,
              border: 'none',
              borderRadius: 10,
              padding: '14px 32px',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(255, 152, 0, 0.2)',
              letterSpacing: 1,
              transition: 'all 0.2s',
              width: '140px',
              height: '48px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onClick={(e) => {
              e.stopPropagation();
              handleButtonClick(() => onPayment?.(order.id, 'BANK_TRANSFER'));
            }}
            disabled={paymentLoading === order.id}
            onMouseOver={e => (e.currentTarget.style.background = '#fb8c00')}
            onMouseOut={e => (e.currentTarget.style.background = '#ff9800')}
          >
            {paymentLoading === order.id ? 'Đang xử lý...' : 'Chuyển Khoản'}
          </button>
        </div>
      </div>
    )}
    


    

  </div>
  );
});

// Full-screen adjustment modal
const AdjustOrderModal = ({ 
  open, 
  onClose, 
  adjustOrderLoading,
  adjustOrderDetails,
  foodItems,
  foodItemsLoading,
  adjustFormData,
  setAdjustFormData,
  handleIncrement,
  handleDecrement,
  handleDeleteFood,
  handleSubmit,
  submitting,
  submitError,
  submitSuccess,
  tables
}: {
  open: boolean;
  onClose: () => void;
  adjustOrderLoading: boolean;
  adjustOrderDetails: Order | null;
  foodItems: FoodItem[];
  foodItemsLoading: boolean;
  adjustFormData: { tableIds: string[]; numberOfPeople: number; items: { foodItemId: string; quantity: number }[] };
  setAdjustFormData: React.Dispatch<React.SetStateAction<{ tableIds: string[]; numberOfPeople: number; items: { foodItemId: string; quantity: number }[] }>>;
  handleIncrement: (foodItemId: string) => void;
  handleDecrement: (foodItemId: string) => void;
  handleDeleteFood: (foodItemId: string) => void;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
  submitting: boolean;
  submitError: string | null;
  submitSuccess: boolean;
  tables: TableFromApi[];
}) => {
  const [showTableDropdown, setShowTableDropdown] = React.useState(false);
  
  if (!open) return null;

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '20px',
        overflowY: 'auto',
        isolation: 'isolate',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div style={{
        background: '#fff',
        borderRadius: 12,
        padding: '24px',
        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.3)',
        border: '2px solid #ff9800',
        position: 'relative',
        fontFamily: 'Segoe UI, Arial, sans-serif',
        width: '95%',
        maxWidth: 1000,
        maxHeight: '90vh',
        overflowY: 'auto',
        overflowX: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        backdropFilter: 'blur(0px)',
        WebkitBackdropFilter: 'blur(0px)',
        transform: 'translateZ(0)',
        willChange: 'transform',
        textRendering: 'optimizeLegibility',
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
        imageRendering: 'crisp-edges',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          marginBottom: 20,
          paddingBottom: 12,
          borderBottom: '2px solid #f0f0f0',
        }}>
          <h2 style={{ 
            fontSize: 19, 
            fontWeight: 700, 
            color: '#263238', 
            margin: '12px 0 0 0',
            letterSpacing: 0.5, 
            textAlign: 'center',
            textRendering: 'optimizeLegibility',
            WebkitFontSmoothing: 'antialiased',
            MozOsxFontSmoothing: 'grayscale',
            width: '100%',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          }}>
            Điều Chỉnh Đơn Hàng
          </h2>
          <button
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              background: 'none',
              border: 'none',
                fontSize: 32,
              cursor: 'pointer',
              color: '#666',
                width: 40,
                height: 40,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s',
                fontWeight: 'bold',
            }}
            onClick={onClose}
            onMouseOver={e => (e.currentTarget.style.background = '#f5f5f5')}
            onMouseOut={e => (e.currentTarget.style.background = 'none')}
          >
            ×
          </button>
        </div>

        {adjustOrderLoading ? (
          <div style={{ fontSize: 16, color: '#1976d2', textAlign: 'center', padding: '24px' }}>
            Đang tải thông tin đơn hàng...
          </div>
        ) : adjustOrderDetails ? (
          <form onSubmit={handleSubmit} style={{ 
            width: '100%', 
            flex: 1, 
            display: 'flex', 
            flexDirection: 'column',
            textRendering: 'optimizeLegibility',
            WebkitFontSmoothing: 'antialiased',
            MozOsxFontSmoothing: 'grayscale',
          }}>
            {/* Table Selection */}
            <div style={{ marginBottom: 16 }}>
              {/* Chọn bàn */}
              <div style={{ 
                marginBottom: 10, 
                display: 'flex', 
                flexDirection: 'column',
                alignItems: 'stretch',
                gap: 6
              }}>
                <label style={{ 
                  fontWeight: 700, 
                  fontSize: 17, 
                  color: '#263238', 
                  marginRight: 0, 
                  minWidth: 'auto',
                  marginBottom: 4
                }}>
                  Chọn bàn:
                </label>
                <div style={{ position: 'relative', width: '100%' }}>
                  <button
                    type="button"
                    onClick={() => setShowTableDropdown(!showTableDropdown)}
                    style={{
                      border: '1px solid #cfd8dc',
                      borderRadius: 8,
                      padding: '12px 16px',
                      fontSize: 17,
                      outline: 'none',
                      width: '100%',
                      background: '#fff',
                      textAlign: 'left',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                    disabled={submitting}
                  >
                    <span>Thêm Bàn</span>
                    <span style={{ fontSize: 12 }}>▼</span>
                  </button>
                  
                  {showTableDropdown && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      background: '#fff',
                      border: '1px solid #cfd8dc',
                      borderRadius: 8,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                      zIndex: 10,
                      maxHeight: '200px',
                      overflowY: 'auto',
                      marginTop: 4,
                    }}>
                      {tables.filter(tb => !adjustFormData.tableIds.includes(tb.id)).map(table => (
                        <button
                          key={table.id}
                          type="button"
                          onClick={() => {
                            setAdjustFormData(prev => ({ ...prev, tableIds: [...prev.tableIds, table.id] }));
                            setShowTableDropdown(false);
                          }}
                          style={{
                            width: '100%',
                            padding: '12px 16px',
                            border: 'none',
                            background: 'none',
                            textAlign: 'left',
                            fontSize: 16,
                            cursor: 'pointer',
                            borderBottom: '1px solid #f0f0f0',
                          }}
                          onMouseOver={e => e.currentTarget.style.background = '#f5f5f5'}
                          onMouseOut={e => e.currentTarget.style.background = 'none'}
                        >
                          Bàn {table.number}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Bàn đã chọn */}
              <div style={{ 
                marginBottom: 12, 
                display: 'flex', 
                flexDirection: 'column',
                alignItems: 'stretch',
                gap: 6
              }}>
                <label style={{ 
                  fontWeight: 700, 
                  fontSize: 17, 
                  color: '#263238', 
                  marginRight: 0, 
                  minWidth: 'auto',
                  marginBottom: 4
                }}>
                  Đã chọn:
                </label>

                {adjustFormData.tableIds.length === 0 ? (
                  <span style={{ color: '#888', fontSize: 14, fontStyle: 'italic' }}>
                    Chưa chọn bàn nào
                  </span>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {adjustFormData.tableIds.map(tid => {
                      const t = tables.find(tb => tb.id === tid);
                      return t ? (
                        <span key={tid} style={{
                          background: '#f5f5f5',
                          color: '#000',
                          padding: '10px 18px',
                          borderRadius: 10,
                          fontSize: 18,
                          fontWeight: 600,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 10,
                          border: '1px solid #ddd',
                        }}>
                          <span>Bàn {t.number}</span>
                          <button
                            type="button"
                            onClick={() => setAdjustFormData(prev => ({ ...prev, tableIds: prev.tableIds.filter(id => id !== tid) }))}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#d32f2f',
                              fontWeight: 700,
                              fontSize: 27,
                              cursor: 'pointer',
                              borderRadius: 4,
                              width: 20,
                              height: 20,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              lineHeight: 1.0,
                              padding: 0,
                              margin: 0,
                              marginTop: 0,
                            }}
                          >
                            ×
                          </button>
                        </span>
                      ) : null;
                    })}
                  </div>
                )}
              </div>

              {/* Số người */}
              <div style={{ 
                marginBottom: 10, 
                display: 'flex', 
                flexDirection: 'column',
                alignItems: 'stretch',
                gap: 6
              }}>
                <label style={{ 
                  fontWeight: 700, 
                  fontSize: 17, 
                  color: '#263238', 
                  marginRight: 0, 
                  minWidth: 'auto',
                  marginBottom: 4
                }}>
                  Số người:
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                  <button
                    type="button"
                    onClick={() => setAdjustFormData(prev => ({ ...prev, numberOfPeople: Math.max(1, prev.numberOfPeople - 1) }))}
                    disabled={submitting || adjustFormData.numberOfPeople <= 1}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 8,
                      border: '2px solid #ff9800',
                      background: '#fff',
                      color: '#ff9800',
                      fontSize: 20,
                      fontWeight: 700,
                      cursor: submitting || adjustFormData.numberOfPeople <= 1 ? 'not-allowed' : 'pointer',
                      opacity: submitting || adjustFormData.numberOfPeople <= 1 ? 0.5 : 1,
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    -
                  </button>
                  <span style={{
                    fontSize: 18,
                    fontWeight: 'bold',
                    color: '#263238',
                    minWidth: 40,
                    textAlign: 'center',
                    padding: '10px 16px',
                    background: '#f8f9fa',
                    borderRadius: 6,
                    border: '1px solid #e9ecef',
                  }}>
                    {adjustFormData.numberOfPeople}
                  </span>
                  <button
                    type="button"
                    onClick={() => setAdjustFormData(prev => ({ ...prev, numberOfPeople: prev.numberOfPeople + 1 }))}
                    disabled={submitting}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 8,
                      border: '2px solid #ff9800',
                      background: '#fff',
                      color: '#ff9800',
                      fontSize: 20,
                      fontWeight: 700,
                      cursor: submitting ? 'not-allowed' : 'pointer',
                      opacity: submitting ? 0.5 : 1,
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>


                        {/* Food Menu */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
              {/* Show current order items */}
              {adjustFormData.items.length > 0 && (
                <div style={{ 
                  marginBottom: 16, 
                  padding: 12, 
                    background: '#fff7ed', /* light orange */
                  borderRadius: 8, 
                    border: '2px solid #ff9800',
                  flexShrink: 0
                }}>
                  <div style={{ 
                    fontWeight: 700, 
                    fontSize: 16, 
                      color: '#111827', 
                    marginBottom: 10 
                  }}>
                     Món ăn hiện tại trong đơn:
                  </div>
                  {adjustFormData.items.map((orderItem) => {
                    const foodItem = foodItems.find(fi => fi.id === orderItem.foodItemId);
                    return foodItem ? (
                      <div key={orderItem.foodItemId} style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center',
                          padding: '12px 14px',
                          fontSize: 16,
                          background: '#ffffff',
                        borderRadius: 6,
                          marginBottom: 8
                      }}>
                        <span style={{ 
                            fontWeight: 800, 
                            color: '#111827',
                          flex: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                            marginRight: 16,
                            fontSize: 18
                        }}>
                          {foodItem.name}
                        </span>
                        <span style={{ 
                            fontWeight: 800, 
                            color: '#111827', 
                            fontSize: 15,
                          whiteSpace: 'nowrap'
                        }}>
                          SL: {orderItem.quantity} | {(foodItem.price * orderItem.quantity).toLocaleString('vi-VN')} Đồng
                        </span>
                      </div>
                     ) : null;
                  })}
                </div>
              )}
              
              <div style={{ 
                fontWeight: 700, 
                fontSize: 17, 
                color: '#263238', 
                marginBottom: 8,
                flexShrink: 0
              }}>
                Thực Đơn:
              </div>
              
              {foodItemsLoading ? (
                <div style={{ 
                  fontSize: 14, 
                  color: '#1976d2', 
                  textAlign: 'center', 
                  padding: '20px',
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  Đang tải thực đơn...
                </div>
              ) : (
                <div style={{ 
                  flex: 1, 
                  overflowY: 'auto', 
                  paddingRight: 4,
                  minHeight: 0,
                  maxHeight: '280px', // Exact height for 4 items (70px per item)
                  border: '1px solid #e0e0e0',
                  borderRadius: 8,
                  padding: '12px',
                  position: 'relative'
                }}>
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
                     const orderItem = adjustFormData.items.find((oi) => oi.foodItemId === item.id);
                     const currentQuantity = orderItem ? orderItem.quantity : 0;
                     return (
                       <div key={item.id} style={{
                         display: 'flex',
                         alignItems: 'center',
                          background: currentQuantity > 0 ? '#fff7ed' : '#fff',
                         borderRadius: 8,
                         boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
                         marginBottom: 12,
                         padding: '16px',
                          border: currentQuantity > 0 ? '2px solid #ff9800' : '1px solid #e0e0e0',
                        }}>
                         <div style={{ flex: 1, minWidth: 0 }}>
                           <div style={{ 
                              fontWeight: 700, 
                              fontSize: 18, 
                              color: '#111827', 
                             marginBottom: 6,
                             overflow: 'hidden',
                             textOverflow: 'ellipsis',
                             whiteSpace: 'nowrap'
                           }}>
                             {item.name}
                           </div>
                           {currentQuantity > 0 && (
                             <div style={{ 
                               marginBottom: 6, 
                                fontSize: 13, 
                                fontWeight: 800,
                               background: '#ff9800',
                                color: '#ffffff',
                                border: '1px solid #fb8c00',
                               display: 'inline-block',
                                padding: '4px 10px',
                                borderRadius: 8,
                                letterSpacing: 0.2
                             }}>
                               Trong đơn: {currentQuantity}
                             </div>
                           )}
                           <div style={{ 
                                fontWeight: 900, 
                             fontSize: 14, 
                                color: '#111827' 
                           }}>
                             {formatVNDForTable(item.price)}
                           </div>
                         </div>

                          <div style={{ display: 'flex', alignItems: 'center', marginLeft: 16 }}>
                           <button
                             type="button"
                             onClick={() => handleDecrement(item.id)}
                             disabled={submitting || currentQuantity <= 0}
                              style={{
                               width: 36,
                               height: 36,
                               borderRadius: 8,
                                border: '2px solid #111827',
                               background: '#fff',
                                color: '#111827',
                               fontSize: 18,
                               fontWeight: 700,
                               cursor: submitting || currentQuantity <= 0 ? 'not-allowed' : 'pointer',
                               opacity: submitting || currentQuantity <= 0 ? 0.5 : 1,
                               transition: 'all 0.2s',
                               display: 'flex',
                               alignItems: 'center',
                               justifyContent: 'center',
                             }}
                           >
                             -
                           </button>
                           <span style={{
                                fontSize: 24,
                                fontWeight: 800,
                             color: '#263238',
                             minWidth: 44,
                             textAlign: 'center',
                             padding: '10px 14px',
                                background: '#ffffff',
                                borderRadius: 10,
                                border: '2px solid #cfd8dc',
                           }}>
                             {currentQuantity}
                           </span>
                           <button
                             type="button"
                             onClick={() => handleIncrement(item.id)}
                             disabled={submitting}
                              style={{
                               width: 36,
                               height: 36,
                               borderRadius: 8,
                                border: '2px solid #111827',
                               background: '#fff',
                                color: '#111827',
                               fontSize: 18,
                               fontWeight: 700,
                               cursor: submitting ? 'not-allowed' : 'pointer',
                               opacity: submitting ? 0.5 : 1,
                               transition: 'all 0.2s',
                               display: 'flex',
                               alignItems: 'center',
                               justifyContent: 'center',
                             }}
                           >
                             +
                           </button>
                           {currentQuantity > 0 && (
                             <button
                               type="button"
                               onClick={() => handleDeleteFood(item.id)}
                               disabled={submitting}
                               style={{
                                 marginLeft: 6,
                                 width: 36,
                                 height: 36,
                                 borderRadius: 6,
                                 border: '2px solid #e57373',
                                 background: '#fff',
                                 color: '#e57373',
                                 fontSize: 16,
                                 fontWeight: 700,
                                 cursor: submitting ? 'not-allowed' : 'pointer',
                                 opacity: submitting ? 0.5 : 1,
                                 transition: 'all 0.2s',
                                 display: 'flex',
                                 alignItems: 'center',
                                 justifyContent: 'center',
                               }}
                             >
                               🗑
                             </button>
                           )}
                         </div>
                       </div>
                     );
                   })}
                    {/* removed scroll hint */}
                 </div>
               )}
            </div>

            {/* Submit Button */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'center', 
              marginTop: 12,
              paddingTop: 12,
              borderTop: '1px solid #f0f0f0',
              flexShrink: 0
            }}>
              <button
                type="submit"
                disabled={submitting || adjustFormData.items.length === 0}
                style={{
                  background: '#ff9800',
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: 16,
                  border: 'none',
                  borderRadius: 8,
                  padding: '12px 24px',
                  cursor: submitting || adjustFormData.items.length === 0 ? 'not-allowed' : 'pointer',
                  opacity: submitting || adjustFormData.items.length === 0 ? 0.6 : 1,
                  boxShadow: '0 2px 8px rgba(255, 152, 0, 0.08)',
                  letterSpacing: 0.5,
                  transition: 'all 0.2s',
                  width: 'auto',
                  minWidth: 160,
                }}
                onMouseOver={e => {
                  if (!(submitting || adjustFormData.items.length === 0)) {
                    e.currentTarget.style.background = '#fb8c00';
                  }
                }}
                onMouseOut={e => {
                  if (!(submitting || adjustFormData.items.length === 0)) {
                    e.currentTarget.style.background = '#ff9800';
                  }
                }}
              >
                {submitting ? 'Đang cập nhật...' : 'Cập nhật Đơn Hàng'}
              </button>
            </div>
            
            {submitError && (
              <div style={{ 
                color: '#d32f2f', 
                marginTop: 12, 
                textAlign: 'center', 
                fontSize: 12,
                padding: '8px 12px',
                background: '#ffebee',
                borderRadius: 4,
                border: '1px solid #ffcdd2'
              }}>
                {submitError}
              </div>
            )}
              {/* removed success line per request */}
          </form>
        ) : (
          <div style={{ 
            fontSize: 14, 
            color: 'red', 
            textAlign: 'center', 
            padding: '20px'
          }}>
            Không thể tải thông tin đơn hàng
          </div>
        )}
      </div>
    </div>
  );
};

  // Mark Overlay Component
  const MarkOverlay = ({ 
  open, 
  onClose, 
  order,
  markedItems,
    onToggleMark,
    setOrders
}: {
  open: boolean;
  onClose: () => void;
  order: Order | null;
    markedItems: Set<string>;
    onToggleMark: (itemId: string) => void;
    setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
}) => {
    const [isMarkingDone, setIsMarkingDone] = useState(false);
    
  if (!open || !order) return null;

    const markedCount = markedItems.size;
    const totalItems = order.items.length;

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '20px',
        isolation: 'isolate',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div style={{
        background: '#fff',
        borderRadius: 12,
          padding: '24px',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)',
        border: '2px solid #ff9800',
        position: 'relative',
        fontFamily: 'Segoe UI, Arial, sans-serif',
        width: '95%',
          maxWidth: 500,
          maxHeight: '80vh',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          marginBottom: 20,
          paddingBottom: 12,
          borderBottom: '2px solid #ff9800',
        }}>
          <h2 style={{ 
            fontSize: 22, 
            fontWeight: 700, 
            color: '#263238', 
            margin: 0,
            letterSpacing: 0.5, 
            textAlign: 'center' 
          }}>
            Đánh Dấu Món Ăn
          </h2>
          <button
            style={{
              position: 'absolute',
                top: -1,
                right: -1,
              background: '#666',
              color: '#fff',
              border: 'none',
              borderRadius: '50%',
                width: 50,
              height: 32,
              cursor: 'pointer',
              fontSize: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1001,
              boxShadow: '0 3px 6px rgba(0,0,0,0.3)',
            }}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {/* Order Info */}
        <div style={{
          background: '#f5f5f5',
          padding: 16,
          borderRadius: 8,
          marginBottom: 20,
          fontSize: 16,
        }}>
            {/* Mã Đơn Hàng hidden by request */}
          <div style={{ color: '#666', fontSize: 19, marginBottom: 8, textAlign: 'center',fontWeight:700 }}>
            Bàn: {order.tableNumbers.join(', ')} | Số người: {order.numberOfPeople}
          </div>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              gap: 8,
              padding: '10px 12px',
              borderRadius: 8,
              backgroundColor: order.status === 'DONE' ? '#e8f5e9' : '#fff3e0',
              border: `1px solid ${order.status === 'DONE' ? '#4caf50' : '#ff9800'}`,
              fontSize: 15,
              fontWeight: 700,
              color: order.status === 'DONE' ? '#2e7d32' : '#e65100'
            }}>
              <span>Trạng thái:</span>
              <span>{getStatusLabel(order.status)}</span>
          </div>
        </div>

        {/* Instructions */}
        <div style={{
          textAlign: 'center',
          marginBottom: 20,
          padding: 12,
          background: '#fff3e0',
          borderRadius: 8,
          border: '1px solid #ffcc02',
        }}>
          <p style={{ 
            margin: 0, 
            color: '#e65100', 
            fontSize: 16,
            fontWeight: 600
          }}>
              Nhấn vào món ăn để đánh dấu
          </p>
        </div>

        {/* Food items list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
          {order.items.map((item) => {
              const isMarked = markedItems.has(item.id);
              
            return (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                    padding: 18,
                    border: '2px solid #e0e0e0',
                    borderRadius: 12,
                  cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    background: isMarked ? '#fff8e1' : '#fff',
                  borderColor: isMarked ? '#ff9800' : '#e0e0e0',
                    boxShadow: isMarked ? '0 4px 12px rgba(255, 152, 0, 0.2)' : '0 2px 4px rgba(0, 0, 0, 0.1)',
                    transform: isMarked ? 'scale(1.02)' : 'scale(1)',
                }}
                  onClick={() => onToggleMark(item.id)}
                onMouseOver={(e) => {
                    e.currentTarget.style.background = isMarked ? '#ffe0b2' : '#f8f9fa';
                    e.currentTarget.style.transform = 'scale(1.03)';
                    e.currentTarget.style.boxShadow = isMarked 
                      ? '0 6px 16px rgba(255, 152, 0, 0.3)' 
                      : '0 4px 8px rgba(0, 0, 0, 0.15)';
                }}
                onMouseOut={(e) => {
                    e.currentTarget.style.background = isMarked ? '#fff8e1' : '#fff';
                    e.currentTarget.style.transform = isMarked ? 'scale(1.02)' : 'scale(1)';
                    e.currentTarget.style.boxShadow = isMarked 
                      ? '0 4px 12px rgba(255, 152, 0, 0.2)' 
                      : '0 2px 4px rgba(0, 0, 0, 0.1)';
                }}
              >
                {/* Mark indicator */}
                <div style={{
                    width: 28,
                    height: 28,
                  borderRadius: '50%',
                    border: '3px solid #ff9800',
                  marginRight: 16,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: isMarked ? '#ff9800' : 'transparent',
                    transition: 'all 0.3s ease',
                  flexShrink: 0,
                    position: 'relative',
                    cursor: 'pointer',
                  }}>
                    {isMarked ? (
                      <span style={{ 
                        color: '#fff', 
                        fontSize: 16, 
                        fontWeight: 'bold',
                        animation: 'checkmark 0.4s ease'
                      }}>✓</span>
                    ) : (
                      <span style={{ 
                        color: '#ff9800', 
                        fontSize: 12,
                        opacity: 0.3
                      }}>+</span>
                  )}
                </div>
                  
                {/* Food item details */}
                <div style={{ flex: 1 }}>
                  <div style={{ 
                    fontWeight: 600, 
                    fontSize: 18, 
                      color: isMarked ? '#666' : '#263238',
                      marginBottom: 8,
                      textDecoration: isMarked ? 'line-through' : 'none',
                      transition: 'all 0.3s ease',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                  }}>
                    {item.foodItemName}
                     
                  </div>
                  <div style={{ 
                    fontSize: 16, 
                    color: '#666',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <span style={{ fontSize: 18, fontWeight: 600, color: '#666' }}>Số lượng: {item.quantity}</span>
                    <span style={{ fontWeight: 700, color: '#ff9800', fontSize: 18 }}>
                      {formatVNDForTable(item.subtotal)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Summary */}
        <div style={{ 
          marginTop: 20, 
          padding: 16, 
          background: '#f5f5f5', 
          borderRadius: 8,
          textAlign: 'center',
          borderTop: '1px solid #e0e0e0',
          flexShrink: 0,
        }}>
                <div style={{ fontSize: 16, color: '#666', marginBottom: 10 }}>
              Đã đánh dấu: <span style={{ fontWeight: 600, color: '#ff9800' }}>{markedCount}</span> / {totalItems} món
            
                </div>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#263238', marginBottom: 16 }}>
                  Tổng cộng: {formatVNDForTotal(order.totalAmount)} Đồng
                </div>
            
                {/* Hoàn Thành Button - only show when all items are marked */}
            {markedCount === totalItems && totalItems > 0 && (
                  <button
                    style={{
                  background: isMarkingDone ? '#e0e0e0' : '#ff9800',
                      color: isMarkingDone ? '#666' : '#fff',
                      fontWeight: 600,
                      fontSize: 16,
                      border: 'none',
                      borderRadius: 8,
                      padding: '12px 24px',
                      cursor: isMarkingDone ? 'not-allowed' : 'pointer',
                  boxShadow: isMarkingDone
                    ? 'none'
                    : (order.status === 'DONE' ? '0 4px 12px rgba(33, 150, 243, 0.3)' : '0 4px 12px rgba(76, 175, 80, 0.3)'),
                      letterSpacing: 0.5,
                      transition: 'all 0.2s',
                      width: '100%',
                      maxWidth: '200px',
                    }}
                onClick={async () => {
                  setIsMarkingDone(true);
                  try {
                    const response = await fetch(`${API_BASE_URL}/api/orders/${order.id}/mark-done`, {
                      method: 'PUT',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                    });

                    if (!response.ok) {
                      throw new Error('Failed to mark order as done');
                    }

                    console.log('✅ Order marked as done via API');
                    
                    // Update local state immediately to reflect the change
                    setOrders(prevOrders => 
                      prevOrders.map(o => 
                        o.id === order.id 
                          ? { ...o, status: 'DONE' }
                          : o
                      )
                    );
                    
                    // Clear marked items for this order since it's done
                    // This will be handled by the parent component via WebSocket
                    console.log('✅ Order completed, marked items will be cleared via WebSocket');
                    
                    // Close the overlay after successful API call
                    onClose();
                    
                  } catch (error) {
                    console.error('❌ Error marking order as done:', error);
                    alert('Có lỗi xảy ra khi hoàn thành đơn hàng. Vui lòng thử lại.');
                  } finally {
                    setIsMarkingDone(false);
                  }
                }}
                disabled={isMarkingDone}
                    onMouseOver={e => {
                  if (!isMarkingDone) {
                    e.currentTarget.style.background = '#fb8c00';
                      }
                    }}
                    onMouseOut={e => {
                  if (!isMarkingDone) {
                    e.currentTarget.style.background = '#ff9800';
                      }
                    }}
                  >
                  {isMarkingDone ? 'Đang xử lý...' : order.status === 'DONE' ? 'Đã Hoàn Thành' : 'Hoàn Thành'}
                  </button>
                )}
        </div>
      </div>
    </div>
  );
};

export default OrdersPage; 