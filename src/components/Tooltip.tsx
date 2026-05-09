import React, { useState } from 'react';

interface TooltipProps {
  text: string;
  children: React.ReactNode;
  position?: 'top' | 'bottom';
  maxWidth?: number;
}

export const Tooltip: React.FC<TooltipProps> = ({ text, children, position = 'top', maxWidth = 240 }) => {
  const [visible, setVisible] = useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const tooltipRef = React.useRef<HTMLDivElement>(null);
  const [tooltipLeft, setTooltipLeft] = useState<string>('50%');
  const [tooltipTransform, setTooltipTransform] = useState<string>('translateX(-50%)');

  React.useEffect(() => {
    if (!visible || !tooltipRef.current || !containerRef.current) return;

    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();

    // Check if tooltip overflows left edge
    if (tooltipRect.left < 0) {
      // Adjust to keep it within bounds with 8px padding from edge
      setTooltipLeft('8px');
      setTooltipTransform('translateX(0)');
    } else if (tooltipRect.right > window.innerWidth) {
      // Adjust if overflows right edge
      setTooltipLeft('auto');
      setTooltipTransform('translateX(-100%)');
    } else {
      // Center normally
      setTooltipLeft('50%');
      setTooltipTransform('translateX(-50%)');
    }
  }, [visible]);

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div ref={tooltipRef} style={{
          position: 'absolute',
          ...(position === 'top'
            ? { bottom: 'calc(100% + 7px)' }
            : { top: 'calc(100% + 7px)' }),
          left: tooltipLeft,
          transform: tooltipTransform,
          background: '#1E293B',
          color: '#F1F5F9',
          padding: '8px 12px',
          borderRadius: 7,
          fontSize: 11,
          fontWeight: 500,
          lineHeight: 1.5,
          maxWidth,
          width: 'auto',
          zIndex: 9999,
          pointerEvents: 'none',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          textAlign: 'center',
          whiteSpace: 'normal',
          wordWrap: 'break-word',
          overflowWrap: 'break-word',
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
