import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { App } from './main.jsx';

export default function StoreApp() {
  return (
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );
}