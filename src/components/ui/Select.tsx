import React from 'react';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: string[];
}

export const Select: React.FC<SelectProps> = ({ options, ...props }) => (
  <select 
    {...props} 
    className={`w-full rounded-lg border border-slate-300 bg-slate-50 p-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 ${props.className || ''}`}
  >
    {options.map(o => <option key={o} value={o}>{o}</option>)}
  </select>
);
