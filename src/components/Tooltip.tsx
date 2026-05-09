import React, { useState } from 'react';
import { createPortal } from 'react-dom';

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
  const [tooltipRect, setTooltipRect] = useState<DOMRect | null>(null);
  const [tooltipLeft, setTooltipLeft] = useState<string | number>('50%');
  const [tooltipTransform, setTooltipTransform] = useState<string>('translateX(-50%)');

  const handleMouseEnter = () => {
    if (containerRef.current) {
      setTooltipRect(containerRef.current.getBoundingClientRect());
    }
    setVisible(true);
  };

  const handleMouseLeave = () => {
    setVisible(false);
  };

  React.useEffect(() => {
    if (!visible || !tooltipRef.current) return;

    // After tooltip renders, check if it overflows viewport and adjust
    setTimeout(() => {
      const rect = tooltipRef.current?.getBoundingClientRect();
      if (!rect || !tooltipRect) return;

      const centerLeft = tooltipRect.left + tooltipRect.width / 2;
      const tooltipWidth = rect.width;

      // If tooltip overflows left edge
      if (centerLeft - tooltipWidth / 2 < 8) {
        setTooltipLeft(8);
        setTooltipTransform('translateX(0)');
      }
      // If tooltip overflows right edge
      else if (centerLeft + tooltipWidth / 2 > window.innerWidth - 8) {
        setTooltipLeft('auto');
        setTooltipTransform('none');
      }
      // Center normally
      else {
        setTooltipLeft('50%');
        setTooltipTransform('translateX(-50%)');
      }
    }, 0);
  }, [visible, tooltipRect]);

  return (
    <>
      <div
        ref={containerRef}
        style={{ position: 'relative', display: 'inline-block' }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {children}
      </div>
      {visible && tooltipRect && createPortal(
        <div ref={tooltipRef} style={{
          position: 'fixed',
          top: position === 'top'
            ? tooltipRect.top - 7
            : tooltipRect.bottom + 7,
          left: tooltipLeft,
          right: tooltipTransform === 'none' ? 8 : 'auto',
          transform: tooltipTransform,
          background: '#1E293B',
          color: '#F1F5F9',
          padding: '8px 12px',
          borderRadius: 7,
          fontSize: 11,
          fontWeight: 500,
          lineHeight: 1.5,
          maxWidth: `${maxWidth}px`,
          width: `${maxWidth}px`,
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
        </div>,
        document.body
      )}
    </>
  );
};
