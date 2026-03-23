import React from 'react';

interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {}

export const Label: React.FC<LabelProps> = (props) => (
  <label 
    {...props} 
    className={`mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-500 ${props.className || ''}`}
  />
);
