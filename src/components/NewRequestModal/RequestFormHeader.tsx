import React from 'react';

export const RequestFormHeader: React.FC<{ title: string }> = ({ title }) => (
  <div className="text-lg font-extrabold text-slate-900 mb-5">{title}</div>
);
