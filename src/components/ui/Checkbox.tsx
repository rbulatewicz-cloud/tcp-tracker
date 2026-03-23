import React from 'react';

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export const Checkbox: React.FC<CheckboxProps> = ({ label, ...props }) => (
  <label className="flex cursor-pointer items-center gap-2">
    <input 
      {...props} 
      type="checkbox" 
      className={`h-4 w-4 cursor-pointer rounded border-slate-300 text-blue-600 focus:ring-blue-500 ${props.className || ''}`}
    />
    <span className="text-xs font-semibold text-slate-700">{label}</span>
  </label>
);
