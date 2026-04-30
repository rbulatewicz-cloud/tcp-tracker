import React, { useState } from 'react';
import type { Plan, TansatRequest } from '../../types';
import { updateTansatRequest, uploadTansatAttachment } from '../../services/tansatService';
import { fmtDate } from '../../utils/plans';
import { showToast } from '../../lib/toast';
import { fmtMoney } from '../PlanCardSections/tansat/tansatShared';

interface MarkPaidModalProps {
  request: TansatRequest;
  plan: Plan;
  currentUserName: string;
  onClose: () => void;
}

/**
 * T-3.3 — Mark Paid form.
 *
 * Hard-blocked: cannot advance status to `paid` without uploading the
 * Paymentus payment confirmation PDF. The PDF contains the approval
 * code + last-4 of card + date, which is why we don't ask MOT to type
 * those separately.
 *
 * Defaults paid amount to invoice amount (matches reality 99% of the
 * time per Justin's log; the rare $0 re-issue case is handled via
 * status `revised` from the request detail panel).
 */
export const MarkPaidModal: React.FC<MarkPaidModalProps> = ({
  request, plan, currentUserName, onClose,
}) => {
  const today = new Date().toISOString().slice(0, 10);

  const [paidAt, setPaidAt] = useState(today);
  const [paidAmount, setPaidAmount] = useState<string>(
    request.invoiceAmount != null ? String(request.invoiceAmount) : ''
  );
  const [confirmationFile, setConfirmationFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const canSave = !!confirmationFile && !!paidAt && !!paidAmount;

  const handleSave = async () => {
    if (!confirmationFile) {
      showToast('Receipt PDF is required', 'error');
      return;
    }
    setSaving(true);
    try {
      const att = await uploadTansatAttachment(request.id, confirmationFile, 'receipt', currentUserName);
      await updateTansatRequest(request.id, {
        paidAt,
        paidAmount: parseFloat(paidAmount.replace(/[$,]/g, '')),
        paymentConfirmation: att,
        paidBy: currentUserName,
        status: 'paid',
      });
      showToast('Payment recorded · status → paid', 'success');
      onClose();
    } catch (err) {
      console.error('Failed to mark paid:', err);
      showToast('Failed to mark paid', 'error');
    } finally {
      setSaving(false);
    }
  };

  const paymentusUrl = 'https://ipn4.paymentus.com/rotp/latw?pt=SIGN';

  return (
    <div className="fixed inset-0 z-[55] flex items-start justify-center bg-black/60 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-lg font-bold">Mark Paid</h3>
            <p className="text-xs text-slate-500">
              Plan <span className="font-mono font-bold">{plan.loc || plan.id}</span>
              {' · '}
              <span className="font-mono">LOG #{request.logNumber ?? '—'}</span>
              {request.invoiceAmount != null && (
                <> · invoice <b>{fmtMoney(request.invoiceAmount)}</b>, due <b>{fmtDate(request.paymentDueDate ?? '')}</b></>
              )}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-2xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-5">
          {/* Pay-on-Paymentus link */}
          <a
            href={paymentusUrl}
            target="_blank"
            rel="noopener"
            className="block rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 hover:bg-amber-100 transition-colors"
          >
            <div className="text-sm font-bold text-amber-900">→ Pay on Paymentus (LADOT)</div>
            <div className="text-[11px] text-amber-800 mt-0.5">
              Opens {paymentusUrl} — pay using LOG #{request.logNumber ?? '—'}, then return here to upload the
              confirmation PDF.
            </div>
          </a>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                Paid Date <span className="text-red-600 font-bold">required</span>
              </label>
              <input
                type="date"
                value={paidAt}
                onChange={e => setPaidAt(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                Paid Amount <span className="text-red-600 font-bold">required</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={paidAmount}
                  onChange={e => setPaidAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full border border-slate-300 rounded-lg pl-6 pr-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                Paid By
              </label>
              <input
                type="text"
                value={currentUserName}
                disabled
                className="w-full border border-slate-200 bg-slate-50 rounded-lg px-3 py-2 text-sm text-slate-500"
              />
            </div>
          </div>

          {/* Required: payment confirmation PDF */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">
              Payment Confirmation PDF <span className="text-red-600 font-bold">required</span>
            </label>
            <div className={`rounded-lg border-2 border-dashed p-4 text-center transition-colors ${
              confirmationFile ? 'border-emerald-300 bg-emerald-50' : 'border-red-200 bg-red-50/40'
            }`}>
              {confirmationFile ? (
                <div>
                  <div className="text-2xl">📄</div>
                  <div className="text-sm font-bold mt-1">{confirmationFile.name}</div>
                  <div className="text-[10px] text-slate-500">{(confirmationFile.size / 1024).toFixed(0)} KB · ready</div>
                  <button
                    onClick={() => setConfirmationFile(null)}
                    className="mt-1 text-[10px] text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <label className="cursor-pointer block">
                  <div className="text-3xl opacity-40">📄</div>
                  <div className="text-sm font-semibold mt-1 text-slate-700">Drop or click to upload Paymentus receipt</div>
                  <div className="text-[10px] text-slate-400 mt-1">
                    PDF — contains your approval code, last-4 of card, paid date.
                  </div>
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    hidden
                    onChange={e => setConfirmationFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              )}
            </div>
            {!confirmationFile && (
              <p className="text-[11px] text-red-600 mt-1 font-semibold">
                ⛔ Cannot mark paid without the receipt — the PDF is the audit trail.
              </p>
            )}
          </div>
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
            disabled={saving || !canSave}
            className="text-xs font-bold px-4 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : '✓ Mark Paid'}
          </button>
        </div>
      </div>
    </div>
  );
};
