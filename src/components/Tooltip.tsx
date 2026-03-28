import React, { useState } from 'react';

interface TooltipProps {
  text: string;
  children: React.ReactNode;
  position?: 'top' | 'bottom';
  maxWidth?: number;
}

export const Tooltip: React.FC<TooltipProps> = ({ text, children, position = 'top', maxWidth = 240 }) => {
  const [visible, setVisible] = useState(false);

  return (
    <div
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div style={{
          position: 'absolute',
          ...(position === 'top'
            ? { bottom: 'calc(100% + 7px)' }
            : { top: 'calc(100% + 7px)' }),
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#1E293B',
          color: '#F1F5F9',
          padding: '7px 11px',
          borderRadius: 7,
          fontSize: 11,
          fontWeight: 500,
          lineHeight: 1.5,
          maxWidth,
          width: 'max-content',
          zIndex: 9999,
          pointerEvents: 'none',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          textAlign: 'center',
        }}>
          {text}
          {/* Arrow */}
          <div style={{
            position: 'absolute',
            ...(position === 'top'
              ? { top: '100%', borderTop: '5px solid #1E293B', borderBottom: 'none' }
              : { bottom: '100%', borderBottom: '5px solid #1E293B', borderTop: 'none' }),
            left: '50%',
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderLeft: '5px solid transparent',
            borderRight: '5px solid transparent',
          }} />
        </div>
      )}
    </div>
  );
};
