'use client';

import {useState} from 'react';
import {calculateGst, GstInput} from '@/lib/gst';
import {money} from '@/lib/domain';
import {pricingEstimate, suggestExclusiveRate} from '@/lib/pricing-helper';
import {Btn, Field} from './ui';
import {useStore} from './store';

export default function PricingHelper(props: {
  line: GstInput; inclusive: boolean;
  onApply?: (exclusiveRate: number, inclusiveRate: number) => void;
  onCostConfirm?: (costPaise: number) => void;
  initialCost?: number; purchase?: boolean; fixedCost?: number;
  showLockedHint?: boolean;
  alwaysVisible?: boolean;
  showEstimateSummary?: boolean;
  referenceNote?: string;
}) {
  const {role, isLive, companySession} = useStore();
  const unlocked = isLive ? Boolean(companySession?.profitUnlocked && role === 'Owner') : role === 'Owner';
  // Unmount local financial inputs when the profit session expires.
  if (!unlocked && !props.alwaysVisible) return props.showLockedHint
    ? <p className="muted screen-only" style={{marginTop: 8}}>Use the header’s Unlock profit control to view this estimate.</p>
    : null;
  return <Calculator {...props} />;
}

function Calculator({line, inclusive, onApply, onCostConfirm, initialCost, purchase, fixedCost, referenceNote, showEstimateSummary = true}: {
  line: GstInput; inclusive: boolean; onApply?: (exclusiveRate: number, inclusiveRate: number) => void;
  onCostConfirm?: (paise: number) => void; initialCost?: number; purchase?: boolean; fixedCost?: number;
  referenceNote?: string; showEstimateSummary?: boolean;
}) {
  const [cost, setCost] = useState(initialCost == null ? '' : String(initialCost));
  const [costMode, setCostMode] = useState<'Inclusive'|'Exclusive'>('Exclusive');
  const [profit, setProfit] = useState('');
  const [message, setMessage] = useState('');
  const parse = (text: string) => {
    if (!text.trim() || !Number.isFinite(Number(text))) return null;
    const value = Math.round(Number(text) * 100);
    return Number.isSafeInteger(value) && value >= 0 && value <= 100_000_000_000 ? value : null;
  };
  const purchaseCost = purchase && line.qty > 0 ? calculateGst(line, inclusive).base / line.qty : undefined;
  const knownCost = purchaseCost ?? fixedCost;
  const enteredCostPaise = knownCost == null ? parse(cost) : parse(String(knownCost));
  let costPaise = enteredCostPaise;
  if (knownCost == null && enteredCostPaise !== null && costMode === 'Inclusive') {
    const normalized = calculateGst({...line, qty: 1, rate: enteredCostPaise / 100, discount: 0, priceEntryMode: 'Inclusive'}, true);
    costPaise = Math.round(normalized.base * 100);
  }
  const profitPaise = parse(profit);
  let suggested: ReturnType<typeof calculateGst> | undefined;
  let suggestedExclusiveRate: number | undefined;
  let estimate: ReturnType<typeof pricingEstimate> | undefined;
  try {
    if (costPaise !== null && profitPaise !== null) {
      const targetAfterDiscount = suggestExclusiveRate(costPaise, profitPaise);
      if (line.discountType === 'Amount') {
        suggestedExclusiveRate = targetAfterDiscount + Math.max(0, line.discount) / Math.max(1, line.qty);
      } else {
        const fraction = 1 - Math.max(0, line.discount) / 100;
        if (fraction <= 0) throw new Error('A 100% discount cannot preserve a profit amount.');
        suggestedExclusiveRate = targetAfterDiscount / fraction;
      }
      suggestedExclusiveRate = Math.round(suggestedExclusiveRate * 100) / 100;
      suggested = calculateGst({
        ...line, qty: 1, rate: suggestedExclusiveRate,
        priceEntryMode: 'Exclusive', discount: 0,
      }, false);
    }
    if (!purchase && costPaise !== null) estimate = pricingEstimate(line, inclusive, costPaise);
  } catch { /* Invalid/incomplete input cannot be applied. */ }
  const applyingInclusive = line.priceEntryMode ? line.priceEntryMode === 'Inclusive' : inclusive;
  return <div className="screen-only" style={{marginTop: 8}}>
    {!purchase && showEstimateSummary && estimate && <div className="notice" aria-live="polite" style={{marginBottom: 8}}>
      Estimated profit before GST: <strong>{money(estimate.profitPaise / 100)}</strong>
      {' · '}Selling value before GST: {money(estimate.base)}
      {estimate.profitPaise < 0 && <strong style={{marginLeft: 6}}>Selling below cost.</strong>}
      {referenceNote && <small className="muted" style={{display: 'block', marginTop: 4}}>{referenceNote}</small>}
    </div>}
    <details className="notice">
    <summary style={{cursor: 'pointer'}}>Calculate selling price from profit</summary>
    <div className="form-grid" style={{marginTop: 12}}>
      {knownCost == null && <Field label="Supplier price type">
        <select value={costMode} onChange={e => {setCostMode(e.target.value as 'Inclusive'|'Exclusive'); setMessage('');}}>
          <option value="Inclusive">Includes GST</option>
          <option value="Exclusive">Before GST</option>
        </select>
      </Field>}
      <Field label={knownCost == null ? 'Supplier price per unit (₹)' : 'Cost before GST (₹)'}>
        {knownCost != null ? <strong>{costPaise == null ? 'Check purchase amounts' : money(costPaise / 100)}</strong> :
          <input aria-label="Pricing cost per unit" type="number" min="0" step="0.01" value={cost}
            onChange={e => {setCost(e.target.value); setMessage('');}} placeholder="Enter supplier price" />}
      </Field>
      <Field label="Profit you want per unit (₹)">
        <input aria-label="Desired profit per unit" type="number" min="0" step="0.01" value={profit}
          onChange={e => {setProfit(e.target.value); setMessage('');}} placeholder="e.g. 1000" />
      </Field>
    </div>
    {suggested && <div aria-live="polite" style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, margin: '12px 0'}}>
      <div className="summary-box" style={{padding: 12}}><small>Enter in Rate excl. GST</small><strong style={{display: 'block'}}>{money(suggested.base)}</strong></div>
      <div className="summary-box" style={{padding: 12}}><small>Enter in Rate incl. GST</small><strong style={{display: 'block'}}>{money(suggested.total)}</strong></div>
    </div>}
    {onApply && suggested && suggestedExclusiveRate != null && costPaise !== null && profitPaise !== null && <Btn secondary onClick={() => {
      if (costPaise === null || profitPaise === null || !suggested || suggestedExclusiveRate == null) return;
      onApply(suggestedExclusiveRate, suggested.total);
      onCostConfirm?.(costPaise);
      setMessage('Price applied to the invoice item.');
    }}>Use {money(applyingInclusive ? suggested.total : suggested.base)} in Rate {applyingInclusive ? 'incl.' : 'excl.'} GST</Btn>}
    {onCostConfirm && !onApply && <Btn secondary disabled={costPaise === null} onClick={() => {
      if (costPaise === null) return;
      onCostConfirm(costPaise); setMessage('Cost confirmed. Save the invoice draft to keep it.');
    }}>Save cost only</Btn>}
    <p className="muted">{purchase ? 'Suggestion only; the supplier price is not changed.' :
      'Profit is calculated before GST. The suggested rate includes the current invoice discount.'}</p>
    {message && <p role="status">{message}</p>}
    </details>
  </div>;
}
