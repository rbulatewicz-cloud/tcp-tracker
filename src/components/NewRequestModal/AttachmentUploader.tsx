import React from 'react';
import { formatFileSize } from '../../utils/plans';
import { Label } from '../ui/Label';

interface AttachmentUploaderProps {
  form: any;
  setForm: any;
}

export const AttachmentUploader: React.FC<AttachmentUploaderProps> = ({ form, setForm }) => {
  return (
    <div className="mt-5">
      <Label className="mb-2">PDF Attachments</Label>
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 p-3 text-xs font-semibold text-slate-500 transition-all hover:border-blue-400">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
        Upload PDF Plans (Multiple)
        <input 
          type="file" 
          accept=".pdf" 
          multiple
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            if (files.length > 0) {
              setForm((prev: any) => ({
                ...prev, 
                attachments: [...prev.attachments, ...files]
              }));
            }
          }}
          className="hidden"
        />
      </label>
      
      {form.attachments.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          {form.attachments.map((file: File, idx: number) => (
            <div key={idx} className="relative flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm transition-all">
              <button 
                onClick={() => setForm((prev: any) => ({
                  ...prev, 
                  attachments: prev.attachments.filter((_: any, i: number) => i !== idx)
                }))}
                className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-[10px] text-red-500"
              >
                ✕
              </button>
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-500">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
              </div>
              <div className="flex-1 overflow-hidden">
                <div className="truncate text-[11px] font-bold text-slate-900" title={file.name}>{file.name}</div>
                <div className="text-[9px] font-semibold text-slate-400">{formatFileSize(file.size)} • PDF</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
