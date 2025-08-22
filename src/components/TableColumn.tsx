import React from 'react';
import type { TableFromApi } from '../types';

interface TableColumnProps {
  tables: TableFromApi[];
  onTableClick?: (tableId: string) => void;
  selectedTableIds?: string[];
}

const TableColumn: React.FC<TableColumnProps> = ({ tables, onTableClick, selectedTableIds = [] }) => (
  <div className="table-columns" style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
    {tables.map((table) => {
      const selected = selectedTableIds.includes(table.id);
      return (
        <div key={table.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', height: 140 }}>
          <div style={{ position: 'relative', width: 160, height: 120 }}>
            {/* Top Left Chair */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 16,
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: '#e0e0e0',
              border: '2px solid #bdbdbd',
              zIndex: 1,
            }} />
            {/* Top Right Chair */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 96,
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: '#e0e0e0',
              border: '2px solid #bdbdbd',
              zIndex: 1,
            }} />
            {/* Bottom Left Chair */}
            <div style={{
              position: 'absolute',
              top: 72,
              left: 16,
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: '#e0e0e0',
              border: '2px solid #bdbdbd',
              zIndex: 1,
            }} />
            {/* Bottom Right Chair */}
            <div style={{
              position: 'absolute',
              top: 72,
              left: 96,
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: '#e0e0e0',
              border: '2px solid #bdbdbd',
              zIndex: 1,
            }} />
            {/* Rectangle Table */}
            <div
              className="table-rectangle"
              style={{
                width: 96,
                height: 64,
                borderRadius: 16,
                background: '#f5f5f5',
                border: selected ? '3px solid rgb(25, 210, 59)' : '3px solid #888',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold',
                fontSize: '2rem',
                cursor: onTableClick ? 'pointer' : 'default',
                position: 'absolute',
                top: 24,
                left: 32,
                zIndex: 2,
                boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
                transition: 'border 0.2s, background 0.2s',
              }}
              onClick={() => onTableClick && onTableClick(table.id)}
            >
              {table.number}
              {selected && (
                <span style={{
                  position: 'absolute',
                  top: 6,
                  right: 8,
                  fontSize: 22,
                  color: '#1976d2',
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
);

export default TableColumn; 