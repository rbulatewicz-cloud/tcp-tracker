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
  const [left, setLeft] = useState('50%');
  const [transform, setTransform] = useState('translateX(-50%)');

  const handleMouseEnter = () => {
    setVisible(true);
  };

  const handleMouseLeave = () => {
    setVisible(false);
  };

  React.useEffect(() => {
    if (!visible || !tooltipRef.current || !containerRef.current) return;

    const tooltip = tooltipRef.current;
    const container = containerRef.current;

    setTimeout(() => {
      const tooltipWidth = tooltip.offsetWidth;
      const containerRect = container.getBoundingClientRect();

      // Find the scroll container (plan card's overflow-y-auto parent)
      let scrollContainer = container.parentElement;
      while (scrollContainer && window.getComputedStyle(scrollContainer).overflowY !== 'auto') {
        scrollContainer = scrollContainer.parentElement;
      }

      if (!scrollContainer) {
        // Fallback: use window viewport
        const leftEdge = 0;
        const rightEdge = window.innerWidth;
        const tooltipLeft = containerRect.left + containerRect.width / 2 - tooltipWidth / 2;
        const tooltipRight = tooltipLeft + tooltipWidth;

        if (tooltipLeft < leftEdge) {
          setLeft('0');
          setTransform('translateX(0)');
        } else if (tooltipRight > rightEdge) {
          setLeft('auto');
          setTransform('translateX(-100%)');
        } else {
          setLeft('50%');
          setTransform('translateX(-50%)');
        }
        return;
      }

      const scrollContainerRect = scrollContainer.getBoundingClientRect();
      const centerX = containerRect.left - scrollContainerRect.left + containerRect.width / 2;
      const containerWidth = scrollContainer.clientWidth;

      if (centerX - tooltipWidth / 2 < 0) {
        // Shift right if overflowing left
        setLeft('0');
        setTransform('translateX(0)');
      } else if (centerX + tooltipWidth / 2 > containerWidth) {
        // Shift left if overflowing right
        setLeft('auto');
        setTransform('translateX(-100%)');
      } else {
        // Center normally
        setLeft('50%');
        setTransform('translateX(-50%)');
      }
    }, 0);
  }, [visible]);

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {visible && (
        <div
          ref={tooltipRef}
          style={{
            position: 'absolute',
            ...(position === 'top'
              ? { bottom: 'calc(100% + 7px)' }
              : { top: 'calc(100% + 7px)' }),
            left,
            right: transform === 'translateX(-100%)' ? '0' : 'auto',
            transform,
            background: '#1E293B',
            color: '#F1F5F9',
            padding: '8px 12px',
            borderRadius: 7,
            fontSize: 11,
            fontWeight: 500,
            lineHeight: 1.5,
            maxWidth: `${maxWidth}px`,
            width: `${maxWidth}px`,
            zIndex: 50,
            pointerEvents: 'none',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            textAlign: 'center',
            whiteSpace: 'normal',
            wordWrap: 'break-word',
            overflowWrap: 'break-word',
          }}
        >
          {text}
          {/* Arrow */}
          <div
            style={{
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
            }}
          />
        </div>
      )}
    </div>
  );
};
