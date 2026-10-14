export type SupplierBillTarget = {
  id: string;
  type: 'Purchase' | 'OpeningPayable';
  number: string;
  date: string;
  dueDate: string;
  duePaise: number;
  lines: Array<{lineId: string; duePaise: number}>;
};

export function planSupplierPayment(bills: SupplierBillTarget[], amountPaise: number, selectedIds?: string[]) {
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) throw new Error('Enter a valid payment amount.');
  const selected = selectedIds ? new Set(selectedIds) : null;
  if (new Set(bills.map(b => b.id)).size !== bills.length) throw new Error('Duplicate bills in payment plan.');
  const ordered = bills.filter(b => !selected || selected.has(b.id)).sort((a, b) =>
    a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  let remaining = amountPaise;
  const allocations: Array<{targetType: 'PurchaseLine' | 'OpeningPayable'; targetId: string; purchaseLineId?: string; amountPaise: number}> = [];
  for (const bill of ordered) {
    if (!Number.isSafeInteger(bill.duePaise) || bill.duePaise < 0) throw new Error('Invalid bill balance.');
    const lines = bill.type === 'OpeningPayable' ? [{lineId: '', duePaise: bill.duePaise}] : bill.lines;
    if (new Set(lines.map(l => l.lineId)).size !== lines.length) throw new Error('Duplicate lines in payment plan.');
    if (lines.reduce((s, l) => s + l.duePaise, 0) !== bill.duePaise) throw new Error('Bill and line balances do not match. Reconcile before paying.');
    for (const line of lines) {
      if (!Number.isSafeInteger(line.duePaise) || line.duePaise < 0) throw new Error('Invalid bill line balance.');
      const amount = Math.min(remaining, line.duePaise);
      if (amount > 0) allocations.push({targetType: bill.type === 'Purchase' ? 'PurchaseLine' : 'OpeningPayable', targetId: bill.id,
        ...(bill.type === 'Purchase' ? {purchaseLineId: line.lineId} : {}), amountPaise: amount});
      remaining -= amount;
    }
  }
  return {allocations, excessPaise: remaining};
}

export function planSupplierSettlement(bills: SupplierBillTarget[], cashPaise: number, availablePaise: number, selectedIds?: string[]) {
  if (![cashPaise, availablePaise].every(n => Number.isSafeInteger(n) && n >= 0)) throw new Error('Enter a valid amount.');
  const eligible = bills.filter(b => !selectedIds || selectedIds.includes(b.id));
  const duePaise = eligible.reduce((s, b) => s + b.duePaise, 0);
  if (!Number.isSafeInteger(duePaise) || !Number.isSafeInteger(cashPaise + availablePaise)) throw new Error('Amount is too large.');
  const creditUsedPaise = Math.min(availablePaise, duePaise);
  const credit = creditUsedPaise ? planSupplierPayment(eligible, creditUsedPaise).allocations : [];
  const remainingBills = eligible.map(b => {
    const applied = credit.filter(a => a.targetId === b.id);
    return {...b, duePaise: b.duePaise - applied.reduce((s, a) => s + a.amountPaise, 0),
      lines: b.lines.map(l => ({...l, duePaise: l.duePaise - applied.filter(a => a.purchaseLineId === l.lineId).reduce((s, a) => s + a.amountPaise, 0)}))};
  });
  const payment = cashPaise ? planSupplierPayment(remainingBills, cashPaise) : {allocations: [], excessPaise: 0};
  return {credit, creditUsedPaise, payment: payment.allocations, excessPaise: payment.excessPaise};
}
