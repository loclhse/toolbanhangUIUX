import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
}

function Layout({ children }: LayoutProps) {
  const isMobile = window.innerWidth <= 768;
  
  return (
    <div style={{ 
      padding: isMobile ? '12px 8px' : '24px',
      width: '100%',
      maxWidth: '100vw',
      boxSizing: 'border-box',
      margin: 0
    }}>
      {/* Add header/footer here if needed */}
      {children}
    </div>
  );
}

export default Layout; 