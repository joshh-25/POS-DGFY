// Temporary debugging component to check packaging data
// Add this to your Items.jsx temporarily to see what data you're getting

import React from 'react';

export default function DebugPackagingData({ items }) {
  const packagingItems = items.filter(item => item.category === 'packaging');

  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      background: 'white',
      border: '2px solid red',
      padding: '20px',
      maxWidth: '500px',
      maxHeight: '400px',
      overflow: 'auto',
      zIndex: 9999,
      fontSize: '12px'
    }}>
      <h3 style={{ margin: '0 0 10px 0', color: 'red' }}>DEBUG: Packaging Items</h3>
      <p><strong>Total Items:</strong> {items.length}</p>
      <p><strong>Packaging Items:</strong> {packagingItems.length}</p>

      {packagingItems.length === 0 ? (
        <div style={{ background: '#fff3cd', padding: '10px', marginTop: '10px' }}>
          <strong>No packaging items found!</strong>
          <p>Categories in system:</p>
          <pre>{JSON.stringify([...new Set(items.map(i => i.category))], null, 2)}</pre>
        </div>
      ) : (
        <div>
          {packagingItems.map(item => (
            <div key={item.item_id} style={{
              border: '1px solid #ddd',
              padding: '10px',
              marginTop: '10px',
              background: '#f8f9fa'
            }}>
              <p><strong>SKU:</strong> {item.sku_code}</p>
              <p><strong>Name:</strong> {item.name}</p>
              <p><strong>Category:</strong> {item.category}</p>
              <p><strong>Has packaging_specs:</strong> {item.packaging_specs ? 'YES' : 'NO'}</p>
              {item.packaging_specs && (
                <pre style={{
                  background: '#e9ecef',
                  padding: '5px',
                  fontSize: '10px',
                  overflow: 'auto'
                }}>
                  {JSON.stringify(item.packaging_specs, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Usage: Add this to Items.jsx temporarily
// import DebugPackagingData from './debug-packaging-data';
//
// Then in your JSX, add:
// <DebugPackagingData items={items} />
