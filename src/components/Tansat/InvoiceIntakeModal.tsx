import React, { useEffect, useMemo, useState } from 'react';
import type { Plan, TansatRequest, TansatSettings } from '../../types';
import {
  updateTansatRequest, uploadTansatAttachment, scanTansatInvoiceWithGemini,
  TansatInvoiceExtraction, subscribeToTansatRequests,
} from '../../services/tansatService';
import { showToast } from '../../lib/toast';
import { fmtDate } from '../../utils/plans';

interface InvoiceIntakeModalProps {
  request: TansatRequest;
  plan: Plan;
  appConfig?: { tansatSettings?: TansatSettings };
  currentUserName: string;
  onClose: () => void;
}

/**
 * T-3.1 — Invoice Intake form. Triggered from a request in `emailed` status
 * once Reggie returns the invoice. Captures Log #, Amount, Due Date, Customer
 * Name, and the invoice PDF.
 *
 * T-3.2 — Optional `✨ Auto-fill from invoice PDF` button runs Gemini on the
 * uploaded PDF and pre-fills all four fields. MOT confirms or types over.
 *
 * On save: status → `invoice_received`. Log # duplicate warning is soft —
 * MOT can still proceed (LADOT doesn't guarantee uniqueness, just rare).
 */
export const InvoiceIntakeModal: React.FC<InvoiceIntakeModalProps> = ({
  request, plan, appConfig, currentUserName, onClose,
}) => {
  const [logNumber, setLogNumber] = useState(request.logNumber ?? '');
  const [invoiceAmount, setInvoiceAmount] = useState<string>(
    request.invoiceAmount != null ? String(request.invoiceAmount) : ''
  );
  const [paymentDueDate, setPaymentDueDate] = useState(request.paymentDueDate ?? '');
  const [customerName, setCustomerName] = useState(
    request.customerName ?? appConfig?.tansatSettings?.defaultCustomerName ?? ''
  );
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [aiExtracting, setAiExtracting] = useState(false);
  const [aiResult, setAiResult] = useState<TansatInvoiceExtraction | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Subscribe to other requests (for the duplicate Log # warning).
  // Cheap — same hook used by Library and MOT Hub.
  const [allRequests, setAllRequests] = useState<TansatRequest[]>([]);
  useEffect(() => {
    const unsub = subscribeToTansatRequests(setAllRequests);
    return () => unsub();
  }, []);

  const duplicateLogNumber = useMemo(() => {
    if (!logNumber.trim()) return null;
    const dupes = allRequests.filter(r => r.id !== request.id && r.logNumber === logNumber.trim());
    return dupes.length > 0 ? dupes[0] : null;
  }, [logNumber, allRequests, request.id]);

  const aiEnabled = appConfig?.tansatSettings?.aiExtractionEnabled !== false;
  const existingPdf = request.invoiceAttachment;
  const hasPdf = !!invoiceFile || !!existingPdf;

  // ── AI auto-fill ─────────────────────────────────────────────────────────
  const runAiExtract = async () => {
    if (!invoiceFile) {
      showToast('Upload the invoice PDF first', 'error');
      return;
    }
    setAiExtracting(true);
    setAiError(null);
    try {
      // Upload first so the request has invoiceAttachment populated, then scan.
      const att = await uploadTansatAttachment(request.id, invoiceFile, 'invoice', currentUserName);
      await updateTansatRequest(request.id, { invoiceAttachment: att });
      const result = await scanTansatInvoiceWithGemini(request.id, invoiceFile, appConfig);
      setAiResult(result);
      // Auto-apply suggestions to empty fields (don't overwrite manual entries)
      if (!logNumber && result.logNumber)        setLogNumber(result.logNumber);
      if (!invoiceAmount && result.invoiceAmount != null) setInvoiceAmount(String(result.invoiceAmount));
      if (!paymentDueDate && result.paymentDueDate) setPaymentDueDate(result.paymentDueDate);
      if (!customerName && result.customerName)  setCustomerName(result.customerName);
      setInvoiceFile(null);  // mark as uploaded
      showToast('AI extraction complete — review and save', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAiError(msg);
      showToast('AI extraction failed: ' + msg.slice(0, 80), 'error');
    } finally {
      setAiExtracting(false);
    }
  };

  // ── Save ─────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!hasPdf) {
      showToast('Upload the invoice PDF before saving', 'error');
      return;
    }
    if (!logNumber.trim()) {
      showToast('Log # is required', 'error');
      return;
    }
    setSaving(true);
    try {
      // Upload PDF if not already uploaded via the AI path
      if (invoiceFile) {
        const att = await uploadTansatAttachment(request.id, invoiceFile, 'invoice', currentUserName);
        await updateTansatRequest(request.id, { invoiceAttachment: att });
      }
      await updateTansatRequest(request.id, {
        logNumber: logNumber.trim(),
        invoiceAmount: invoiceAmount ? parseFloat(invoiceAmount.replace(/[$,]/g, '')) : undefined,
        paymentDueDate: paymentDueDate || undefined,
        customerName: customerName || undefined,
        status: 'invoice_received',
      });
      showToast('Invoice logged. Status → invoice_received', 'success');
      onClose();
    } catch (err) {
      console.error('Failed to save invoice:', err);
      showToast('Failed to save invoice', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[55] flex items-start justify-center bg-black/60 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-lg font-bold">Log Invoice</h3>
            <p className="text-xs text-slate-500">
              Plan <span className="font-mono font-bold">{plan.loc || plan.id}</span>
              {' · '}
              <span className="text-slate-400">Reggie's response with invoice + LOG #</span>
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-2xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-5">
          {/* PDF upload + AI button */}
          <div className="rounded-lg border-2 border-dashed border-violet-300 bg-violet-50 p-4">
            <div className="flex items-center gap-3">
              <div className="text-3xl">📄</div>
              <div className="flex-1 min-w-0">
                {invoiceFile ? (
                  <div>
                    <div className="text-sm font-bold">{invoiceFile.name}</div>
                    <div className="text-[10px] text-slate-500">{(invoiceFile.size / 1024).toFixed(0)} KB · ready</div>
                  </div>
                ) : existingPdf ? (
                  <div>
                    <a href={existingPdf.url} target="_blank" rel="noopener" className="text-sm font-bold text-blue-700 hover:underline">
                      {existingPdf.name}
                    </a>
                    <div className="text-[10px] text-slate-500">already uploaded</div>
                  </div>
                ) : (
                  <div className="text-sm text-slate-500">No invoice PDF uploaded yet.</div>
                )}
                <label className="inline-block mt-1 text-[11px] text-blue-700 hover:underline cursor-pointer">
                  {existingPdf || invoiceFile ? 'Replace…' : 'Upload PDF…'}
                  <input
                    type="file"
                    accept=".pdf,.docx,application/pdf"
                    hidden
                    onChange={e => {
                      setInvoiceFile(e.target.files?.[0] ?? null);
                      setAiResult(null);
                      setAiError(null);
                    }}
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={runAiExtract}
                disabled={!invoiceFile || aiExtracting || !aiEnabled}
                title={!aiEnabled ? 'AI extraction is disabled in Settings → TANSAT' : ''}
                className="text-xs font-bold px-4 py-2 rounded bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                {aiExtracting ? '⏳ Extracting…' : '✨ Auto-fill from invoice PDF'}
              </button>
            </div>
            {!aiEnabled && (
              <p className="text-[10px] text-slate-500 italic mt-2">
                AI extraction disabled. Enable in Settings → TANSAT.
              </p>
            )}
            {aiError && (
              <p className="text-[11px] text-red-600 mt-2">⚠ {aiError}</p>
            )}
            {aiResult && (
              <p className="text-[11px] text-violet-700 mt-2">✨ AI suggestions applied below — review and edit any field</p>
            )}
          </div>

          {/* Form fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ExtractedField
              label="Log #"
              required
              suggestion={aiResult?.logNumber}
              onAccept={v => setLogNumber(v)}
            >
              <input
                type="text"
                value={logNumber}
                onChange={e => setLogNumber(e.target.value)}
                placeholder="e.g. 454469"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              {duplicateLogNumber && (
                <p className="text-[11px] text-amber-700 mt-1">
                  ⚠ Log #{logNumber} is already used on another request (plan {duplicateLogNumber.planId ?? '—'}). LADOT rarely
                  re-uses these — double-check before saving. Save anyway is allowed.
                </p>
              )}
            </ExtractedField>

            <ExtractedField
              label="Invoice Amount"
              suggestion={aiResult?.invoiceAmount != null ? `$${aiResult.invoiceAmount.toFixed(2)}` : undefined}
              onAccept={v => setInvoiceAmount(v.replace(/[$,]/g, ''))}
            >
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={invoiceAmount}
                  onChange={e => setInvoiceAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full border border-slate-300 rounded-lg pl-6 pr-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
            </ExtractedField>

            <ExtractedField
              label="Payment Due Date"
              suggestion={aiResult?.paymentDueDate}
              suggestionDisplay={aiResult?.paymentDueDate ? fmtDate(aiResult.paymentDueDate) : undefined}
              onAccept={v => setPaymentDueDate(v)}
            >
              <input
                type="date"
                value={paymentDueDate}
                onChange={e => setPaymentDueDate(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </ExtractedField>

            <ExtractedField
              label="Customer Name"
              suggestion={aiResult?.customerName}
              onAccept={v => setCustomerName(v)}
            >
              <input
                type="text"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                placeholder="SFT CONSTRUCTORS / DALE GATICA Jr"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </ExtractedField>
          </div>

          <p className="text-[11px] text-slate-500 italic">
            Saving advances the request to <b>invoice_received</b>. Mark Paid (with receipt) is the next step in the
            request row dropdown.
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-bold px-4 py-2 rounded border border-slate-300 bg-white hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !hasPdf || !logNumber.trim()}
            className="text-xs font-bold px-4 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save · Mark Invoice Received'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Field with optional ✨ AI suggestion badge ─────────────────────────────
const ExtractedField: React.FC<{
  label: string;
  required?: boolean;
  suggestion?: string | number;
  suggestionDisplay?: string;       // optional human-readable rendering
  onAccept: (value: string) => void;
  children: React.ReactNode;
}> = ({ label, required, suggestion, suggestionDisplay, onAccept, children }) => (
  <div>
    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">
      {label} {required && <span className="text-red-600 font-bold">required</span>}
    </label>
    {children}
    {suggestion !== undefined && suggestion !== '' && (
      <button
        type="button"
        onClick={() => onAccept(String(suggestion))}
        className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded px-1.5 py-0.5"
      >
        ✨ AI suggested: {suggestionDisplay ?? String(suggestion)} — accept
      </button>
    )}
  </div>
);
