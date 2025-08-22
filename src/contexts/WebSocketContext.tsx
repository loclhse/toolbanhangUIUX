import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import webSocketService from '../services/websocket';

interface WebSocketContextType {
  isConnected: boolean;
  connect: () => void;
  disconnect: () => void;
  on: (event: string, callback: (data: any) => void) => void;
  off: (event: string) => void;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (context === undefined) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
};

interface WebSocketProviderProps {
  children: ReactNode;
}

export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({ children }) => {
  console.log('🔌 WebSocketProvider component rendered');
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    console.log('🔌 Khởi tạo WebSocket provider...');
    
    // Kết nối WebSocket
    webSocketService.connect();

    // Lắng nghe sự kiện kết nối
    const handleConnect = () => {
      console.log('✅ WebSocket đã kết nối');
      setIsConnected(true);
    };

    const handleDisconnect = () => {
      console.log('❌ WebSocket đã ngắt kết nối');
      setIsConnected(false);
    };

    const handleConnectError = (error: any) => {
      console.log('❌ Lỗi kết nối WebSocket:', error);
      setIsConnected(false);
    };

    // Đăng ký listeners
    webSocketService.on('connect', handleConnect);
    webSocketService.on('disconnect', handleDisconnect);
    webSocketService.on('connect_error', handleConnectError);

    // Kiểm tra trạng thái kết nối ban đầu
    setIsConnected(webSocketService.getConnected());

    // Cleanup
    return () => {
      webSocketService.off('connect');
      webSocketService.off('disconnect');
      webSocketService.off('connect_error');
    };
  }, []);

  const connect = useCallback(() => {
    webSocketService.connect();
  }, []);

  const disconnect = useCallback(() => {
    webSocketService.disconnect();
  }, []);

  const on = useCallback((event: string, callback: (data: any) => void) => {
    webSocketService.on(event, callback);
  }, []);

  const off = useCallback((event: string) => {
    webSocketService.off(event);
  }, []);

  const value: WebSocketContextType = {
    isConnected,
    connect,
    disconnect,
    on,
    off,
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}; 