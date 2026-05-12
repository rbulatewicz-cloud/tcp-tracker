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

      // Find the scroll container by walking up the DOM and checking for overflow-y
      let scrollContainer: HTMLElement | null = container.parentElement;
      while (scrollContainer) {
        const overflow = window.getComputedStyle(scrollContainer).getPropertyValue('overflow-y');
        if (overflow === 'auto' || overflow === 'scroll') {
          break;
        }
        scrollContainer = scrollContainer.parentElement;
      }

      if (!scrollContainer) {
        // Fallback: use window viewport
        const leftEdge = 0;
        const rightEdge = window.innerWidth;
        const tooltipCenterX = containerRect.left + containerRect.width / 2;
        const tooltipLeftPos = tooltipCenterX - tooltipWidth / 2;
        const tooltipRightPos = tooltipLeftPos + tooltipWidth;

        if (tooltipLeftPos < leftEdge) {
          setLeft('0');
          setTransform('translateX(0)');
        } else if (tooltipRightPos > rightEdge) {
          setLeft('auto');
          setTransform('translateX(-100%)');
        } else {
          setLeft('50%');
          setTransform('translateX(-50%)');
        }
        return;
      }

      const scrollContainerRect = scrollContainer.getBoundingClientRect();
      const scrollContainerPadding = parseInt(window.getComputedStyle(scrollContainer).paddingLeft, 10);
      const rightPadding = parseInt(window.getComputedStyle(scrollContainer).paddingRight, 10);

      // Calculate tooltip position in viewport coordinates
      const tooltipCenterX = containerRect.left + containerRect.width / 2;
      const tooltipLeftPos = tooltipCenterX - tooltipWidth / 2;
      const tooltipRightPos = tooltipLeftPos + tooltipWidth;

      // Calculate scroll container bounds in viewport coordinates
      const scrollContainerLeft = scrollContainerRect.left + scrollContainerPadding;
      const scrollContainerRight = scrollContainerRect.right - rightPadding;

      if (tooltipLeftPos < scrollContainerLeft) {
        // Overflowing left - shift right to align with container's left edge
        const pixelsFromLeft = scrollContainerLeft - containerRect.left;
        setLeft(pixelsFromLeft + 'px');
        setTransform('translateX(0)');
      } else if (tooltipRightPos > scrollContainerRight) {
        // Overflowing right - shift left to align with container's right edge
        const pixelsFromRight = containerRect.right - scrollContainerRight;
        setLeft('auto');
        setTransform(`translateX(-${pixelsFromRight}px)`);
      } else {
        // Fits within bounds - center normally
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
            right: 'auto',
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
