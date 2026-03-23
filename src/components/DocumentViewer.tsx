import React from 'react';

interface DocumentViewerProps {
  url: string;
  name: string;
  onClose: () => void;
}

export const DocumentViewer: React.FC<DocumentViewerProps> = ({ url, name, onClose }) => {
  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[150] p-5" onClick={onClose}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-4xl h-[80vh] shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-slate-900">{name}</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-800 font-bold">Close</button>
        </div>
        <div className="flex-grow overflow-hidden border border-slate-200 rounded-lg">
          <iframe src={url} className="w-full h-full" title={name} />
        </div>
      </div>
    </div>
  );
};
