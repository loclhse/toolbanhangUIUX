import SockJS from 'sockjs-client';
import { Stomp } from '@stomp/stompjs';
import { WS_BASE_URL } from '../config';

class WebSocketService {
      private stompClient: any = null;
    private isConnected = false;
    private isConnecting = false;
    private reconnectAttempts = 0;
    private reconnectTimer: any = null;
  private eventListeners: Map<string, ((data: any) => void)[]> = new Map();
  private pingTimer: any = null;

  constructor() {
    // Khi mạng trở lại → thử reconnect ngay (không đợi backoff)
    window.addEventListener('online', () => {
      console.log('🌐 Online - trying to reconnect WS if needed');
      if (!this.isConnected && !this.isConnecting) {
        this.connect();
      }
    });

    window.addEventListener('offline', () => {
      console.log('🌐 Offline - WS will reconnect when online');
    });
  }

  // Kết nối WebSocket (được guard để tránh connect trùng)
  connect() {
    try {
      if (this.isConnected || this.isConnecting) {
        console.log('🔁 Bỏ qua connect: client đã', this.isConnected ? 'CONNECTED' : 'CONNECTING');
        return;
      }

      // Force real WebSocket connection for testing
      console.log('🔌 Force connecting to real WebSocket server...');

      console.log('🔌 Đang kết nối WebSocket...');
      this.isConnecting = true;
      
      const base = WS_BASE_URL || window.location.origin;
      
      // Connect to WebSocket broker
      const wsUrl = `${base}/ws`;
      console.log('🔌 Sử dụng SockJS URL:', wsUrl);
      console.log('🔌 Client origin: localhost:5173 → Server: 103.90.227.18/ws');
      
      // Tạo STOMP client với SockJS
      try {
        this.stompClient = Stomp.over(() => new SockJS(wsUrl));
      } catch (sockjsError) {
        console.error('❌ Failed to create SockJS connection:', sockjsError);
        this.isConnecting = false;
        this.emitEvent('connect_error', { error: 'Failed to create SockJS connection' });
        return;
      }
      
      // Enable debug logging
      this.stompClient.debug = (str: string) => {
        console.log('🔍 STOMP Debug:', str);
      };

      // Cấu hình heartbeat và auto-reconnect cơ bản (CompatClient API)
      this.stompClient.reconnectDelay = 5000;
      this.stompClient.heartbeatIncoming = 10000; // server → client
      this.stompClient.heartbeatOutgoing = 10000; // client → server

      // Kết nối đến STOMP server với delay để đảm bảo connection ready
      setTimeout(() => {
        this.stompClient.connect(
          {}, // headers
          (frame: any) => {
            console.log('✅ Kết nối WebSocket thành công:', frame);
            this.isConnected = true;
            this.isConnecting = false;
            this.reconnectAttempts = 0;
            if (this.reconnectTimer) {
              clearTimeout(this.reconnectTimer);
              this.reconnectTimer = null;
            }
            this.emitEvent('connect', { frame });
            
            // Subscribe vào các topic với delay
            setTimeout(() => {
              this.subscribeToTopics();
            }, 100);
            
            // Start ping timer to keep connection alive
            this.startPing();
          },
          (error: any) => {
            console.error('❌ Lỗi kết nối WebSocket:', error);
            console.error('❌ Error details:', {
              message: error.message,
              type: error.type,
              target: error.target?.url
            });
            this.isConnected = false;
            this.isConnecting = false;
            this.emitEvent('connect_error', { error: error.toString() });
            this.scheduleReconnect();
          }
        );
      }, 100);

      // Hook thêm các handler để nắm việc đóng kết nối
      this.stompClient.onStompError = (frame: any) => {
        console.error('❌ STOMP ERROR frame:', frame?.headers?.message, frame?.body);
      };

      this.stompClient.onWebSocketClose = () => {
        console.warn('⚠️ WebSocket closed');
        this.isConnected = false;
        this.isConnecting = false;
        this.stopPing();
        this.scheduleReconnect();
      };

    } catch (error) {
      console.error('❌ Không thể kết nối WebSocket:', error);
      this.emitEvent('connect_error', { error: 'Không thể khởi tạo kết nối' });
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  // Subscribe vào các topic
  // 
  // Topics to subscribe:
  // - /topic/payments: Payment confirmation messages
  // - /topic/orders/deleted: Order deletion messages
  // - /topic/orders: Order update messages
  private subscribeToTopics() {
    console.log('📡 Đang subscribe vào các topic...');
    console.log('📡 Connection status before subscription:', this.isConnected);
    console.log('📡 STOMP client connected:', this.stompClient?.connected);
    
    
    // Subscribe vào topic orders
    this.subscribe('/topic/orders', 'orders', (message) => {
      console.log('📨 Nhận message từ /topic/orders:', message.body);
      try {
        const order = JSON.parse(message.body);
        console.log('📦 Dữ liệu order:', order);
        this.emitEvent('order_update', order);
      } catch (error) {
        console.error('❌ Lỗi parse order message:', error);
      }
    });

    // Subscribe vào topic order deletions
    this.subscribe('/topic/orders/deleted', 'orders-deleted', (message) => {
      console.log('📨 Nhận message từ /topic/orders/deleted:', message.body);
      let orderId = message.body;
      
      // Xóa dấu ngoặc kép nếu có
      if (orderId.startsWith('"') && orderId.endsWith('"')) {
        orderId = orderId.slice(1, -1);
        console.log('📨 Removed quotes from orderId:', orderId);
      }
      
      console.log('🗑️ Order bị xóa:', orderId);
      console.log('🗑️ Emitting order_deleted event with orderId:', orderId);
      this.emitEvent('order_deleted', orderId);
    });

    // Subscribe vào topic payments
    this.subscribe('/topic/payments', 'payments', (message) => {
      console.log('📨 Nhận message từ /topic/payments:', message.body);
      try {
        const payment = JSON.parse(message.body);
        console.log('💳 Dữ liệu payment:', payment);
        this.emitEvent('payment_update', payment);
      } catch (error) {
        console.error('❌ Lỗi parse payment message:', error);
      }
    });

    // Subscribe vào topic order-item-marks
    this.subscribe('/topic/order-item-marks', 'order-item-marks', (message) => {
      console.log('📨 Nhận message từ /topic/order-item-marks:', message.body);
      try {
        const evt = JSON.parse(message.body);
        // { orderId, itemId, marked }
        console.log('✅ Dữ liệu item mark:', evt);
        this.emitEvent('order_item_marked', evt);
      } catch (error) {
        console.error('❌ Lỗi parse order-item-marks message:', error);
      }
    });

    // Subscribe vào topic pong (echo từ ping)
    this.subscribe('/topic/pong', 'pong', (message) => {
      try {
        const pong = JSON.parse(message.body);
        console.log('🏓 Received pong:', pong.ts, 'latency:', Date.now() - pong.ts, 'ms');
      } catch (error) {
        console.error('❌ Lỗi parse pong message:', error);
      }
    });
  }

  // Subscribe vào một topic cụ thể
  private subscribe(destination: string, id: string, callback: (message: any) => void) {
    console.log(`🔍 Attempting to subscribe to ${destination}`);
    console.log(`🔍 isConnected: ${this.isConnected}`);
    console.log(`🔍 stompClient.connected: ${this.stompClient?.connected}`);
    console.log(`🔍 stompClient exists: ${!!this.stompClient}`);
    
    if (!this.stompClient) {
      console.error(`❌ STOMP client not initialized for ${destination}`);
      return;
    }
    
    if (!this.isConnected) {
      console.warn(`⚠️ Not connected, cannot subscribe to ${destination}`);
      return;
    }
    
    if (!this.stompClient.connected) {
      console.warn(`⚠️ STOMP client not connected, cannot subscribe to ${destination}`);
      return;
    }
    
    try {
      console.log(`🔍 Subscribing to ${destination}...`);
      const subscription = this.stompClient.subscribe(destination, callback);
      console.log(`✅ Đã subscribe vào ${destination} với id: ${id}`);
      console.log(`✅ Subscription object:`, subscription);
      return subscription;
    } catch (error) {
      console.error(`❌ Không thể subscribe vào ${destination}:`, error);
      console.error(`❌ STOMP client state:`, {
        connected: this.stompClient.connected,
        isConnected: this.isConnected
      });
    }
  }

  // Ngắt kết nối
  disconnect() {
    if (this.stompClient) {
      console.log('🔌 Ngắt kết nối WebSocket');
      try {
        this.stompClient.disconnect(() => {
          console.log('🔌 Đã ngắt kết nối STOMP');
        });
      } catch {}
      this.isConnected = false;
      this.isConnecting = false;
      this.stopPing();
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
    }
  }

  // Start ping timer to keep connection alive
  private startPing() {
    if (this.pingTimer) return;
    this.pingTimer = setInterval(() => {
      if (this.isConnected) {
        try {
          this.send('/app/ping', { ts: Date.now() });
        } catch (error) {
          console.warn('⚠️ Failed to send ping:', error);
        }
      }
    }, 25000); // Send ping every 25 seconds
    console.log('🏓 Started ping timer');
  }

  // Stop ping timer
  private stopPing() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
      console.log('🏓 Stopped ping timer');
    }
  }

  // Gửi message đến server
  send(destination: string, message: any) {
    if (this.stompClient && this.isConnected) {
      try {
        this.stompClient.send(destination, {}, JSON.stringify(message));
        console.log(`📤 Đã gửi message đến ${destination}:`, message);
      } catch (error) {
        console.error(`❌ Không thể gửi message đến ${destination}:`, error);
      }
    } else {
      console.warn('⚠️ WebSocket chưa kết nối. Không thể gửi message đến:', destination);
    }
  }

  // Lắng nghe events từ server
  on(event: string, callback: (data: any) => void) {
    console.log(`📡 Đăng ký listener cho event: ${event}`);
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(callback);
  }

  // Xóa event listener
  off(event: string) {
    if (this.eventListeners.has(event)) {
      console.log(`🧹 Xóa listeners cho event: ${event}`);
      this.eventListeners.delete(event);
    }
  }

  // Emit internal events
  private emitEvent(event: string, data: any) {
    console.log(`📡 Emit event: ${event}`, data);
    const listeners = this.eventListeners.get(event);
    if (listeners && listeners.length > 0) {
      listeners.forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.error(`❌ Lỗi trong event listener cho ${event}:`, error);
        }
      });
    }
  }

  // Kiểm tra trạng thái kết nối
  getConnected() {
    return this.isConnected;
  }

     // Lấy STOMP client instance
   getStompClient() {
     return this.stompClient;
   }

   // Lên lịch reconnect với backoff
   private scheduleReconnect() {
     if (this.reconnectTimer) {
       clearTimeout(this.reconnectTimer);
     }
     
     const delay = Math.min(5000 * Math.pow(2, this.reconnectAttempts), 20000); // max 20s thay vì 30s
     this.reconnectAttempts++;
     
     console.log(`🔄 Lên lịch reconnect sau ${delay}ms (attempt ${this.reconnectAttempts})`);
     
     this.reconnectTimer = setTimeout(() => {
       if (!this.isConnected && !this.isConnecting) {
         console.log('🔄 Thực hiện reconnect...');
         this.connect();
       }
     }, delay);
   }
 }

// Tạo singleton instance
const webSocketService = new WebSocketService();

export default webSocketService; 