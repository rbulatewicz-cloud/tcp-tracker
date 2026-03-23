import React, { useState } from 'react';
import { Info } from 'lucide-react';

interface InfoTooltipProps {
  formula: string;
}

export const InfoTooltip: React.FC<InfoTooltipProps> = ({ formula }) => {
  const [show, setShow] = useState(false);

  return (
    <div 
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', marginLeft: 4 }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <Info 
        size={14} 
        style={{ color: '#94A3B8', cursor: 'pointer' }}
      />
      {show && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginTop: 8,
            background: '#1E293B',
            color: '#F8FAFC',
            padding: '8px 12px',
            borderRadius: 6,
            fontSize: 11,
            zIndex: 1000,
            whiteSpace: 'normal',
            width: '200px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
            textAlign: 'left'
          }}
        >
          {formula}
        </div>
      )}
    </div>
  );
};
