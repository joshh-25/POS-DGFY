import React, { useEffect, useState } from 'react';

export const CheckoutSuccessAnimation = () => {
  const [showText, setShowText] = useState(false);

  useEffect(() => {
    // Reveal text shortly after checkmark starts drawing
    const timer = setTimeout(() => setShowText(true), 400);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '60px 20px',
      background: '#fff',
      borderRadius: 24,
      boxShadow: '0 10px 40px rgba(26, 78, 141, 0.08)',
      minHeight: 400,
      textAlign: 'center',
      animation: 'fadeIn 0.3s ease-out forwards'
    }}>
      <style>
        {`
          @keyframes fadeIn {
            from { opacity: 0; transform: scale(0.95); }
            to { opacity: 1; transform: scale(1); }
          }
          @keyframes drawCircle {
            from { stroke-dashoffset: 157; }
            to { stroke-dashoffset: 0; }
          }
          @keyframes drawCheck {
            from { stroke-dashoffset: 36; }
            to { stroke-dashoffset: 0; }
          }
          @keyframes slideUpFade {
            from { opacity: 0; transform: translateY(15px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes pulseText {
            0% { opacity: 0.6; }
            50% { opacity: 1; }
            100% { opacity: 0.6; }
          }
        `}
      </style>

      {/* Animated SVG Checkmark */}
      <svg width="100" height="100" viewBox="0 0 52 52" style={{ overflow: 'visible' }}>
        {/* Circle */}
        <circle
          cx="26" cy="26" r="25"
          fill="none"
          stroke="#1a4e8d"
          strokeWidth="3"
          strokeDasharray="157"
          strokeDashoffset="157"
          style={{ animation: 'drawCircle 0.6s cubic-bezier(0.65, 0, 0.45, 1) forwards' }}
        />
        {/* Checkmark Path */}
        <path
          fill="none"
          stroke="#1a4e8d"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M14.1 27.2l7.1 7.2 16.7-16.8"
          strokeDasharray="36"
          strokeDashoffset="36"
          style={{ animation: 'drawCheck 0.4s cubic-bezier(0.65, 0, 0.45, 1) 0.3s forwards' }}
        />
      </svg>

      {/* Animated Text Reveal */}
      <div style={{
        marginTop: 32,
        opacity: 0,
        animation: showText ? 'slideUpFade 0.5s ease-out forwards' : 'none'
      }}>
        <h2 style={{
          margin: 0,
          fontSize: 28,
          fontWeight: 900,
          color: '#0f172a',
          letterSpacing: '-0.02em'
        }}>
          Order Placed Successfully!
        </h2>
        <p style={{
          marginTop: 12,
          fontSize: 15,
          color: '#1a4e8d',
          fontWeight: 600,
          animation: showText ? 'pulseText 2s infinite ease-in-out' : 'none',
          animationDelay: '1s'
        }}>
          Setting up your tracking dashboard...
        </p>
      </div>
    </div>
  );
};
