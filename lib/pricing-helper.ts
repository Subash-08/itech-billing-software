import {calculateGst, GstInput} from './gst';

export function costWithoutRecoverableGst(totalPaise: number, taxBasisPoints: number): number {
  if (!Number.isSafeInteger(totalPaise) || totalPaise < 0 ||
      !Number.isSafeInteger(taxBasisPoints) || taxBasisPoints < 0 || taxBasisPoints > 10000) {
    throw new Error('Enter a valid purchase amount and GST rate.');
  }
  const divisor = BigInt(10000 + taxBasisPoints);
  return Number((BigInt(totalPaise) * 10000n + divisor / 2n) / divisor);
}

/** A pricing suggestion only; never an accounting entry or an ITC claim. */
export function suggestExclusiveRate(costPaise: number, profitPaise: number): number {
  if (!Number.isSafeInteger(costPaise) || costPaise < 0 ||
      !Number.isSafeInteger(profitPaise) || profitPaise < 0 ||
      !Number.isSafeInteger(costPaise + profitPaise)) {
    throw new Error('Enter valid non-negative cost and desired profit amounts.');
  }
  return (costPaise + profitPaise) / 100;
}

export function pricingEstimate(line: GstInput, inclusive: boolean, unitCostPaise: number) {
  if (!Number.isSafeInteger(unitCostPaise) || unitCostPaise < 0 ||
      !Number.isSafeInteger(line.qty) || line.qty < 1 ||
      !Number.isSafeInteger(unitCostPaise * line.qty)) {
    throw new Error('Enter a valid cost and whole quantity.');
  }
  const totals = calculateGst(line, inclusive);
  const costPaise = unitCostPaise * line.qty;
  return {...totals, costPaise, profitPaise: Math.round(totals.base * 100) - costPaise};
}

/**
 * Allocates an exact slice of a lot's total cost without losing paise to per-unit
 * rounding. Successive slices always add back to the original lot total.
 */
export function cumulativeCostSlice(
  totalCostPaise: number,
  totalQuantity: number,
  consumedBefore: number,
  quantity: number
): number {
  if (!Number.isSafeInteger(totalCostPaise) || totalCostPaise < 0 ||
      !Number.isSafeInteger(totalQuantity) || totalQuantity < 1 ||
      !Number.isSafeInteger(consumedBefore) || consumedBefore < 0 ||
      !Number.isSafeInteger(quantity) || quantity < 0 ||
      consumedBefore + quantity > totalQuantity) {
    throw new Error('Invalid stock-lot cost allocation.');
  }
  const before = Number(BigInt(totalCostPaise) * BigInt(consumedBefore) / BigInt(totalQuantity));
  const afterQuantity = consumedBefore + quantity;
  const after = afterQuantity === totalQuantity
    ? totalCostPaise
    : Number(BigInt(totalCostPaise) * BigInt(afterQuantity) / BigInt(totalQuantity));
  return after - before;
}
