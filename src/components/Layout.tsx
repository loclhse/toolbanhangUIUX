import React from 'react';
import { Outlet } from 'react-router-dom';

function Layout() {
  console.log('🏗️ Layout component rendering');
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
      
      <Outlet />
    </div>
  );
}

export default Layout; 