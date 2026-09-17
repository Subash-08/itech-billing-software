# DATA-RELATIONSHIPS.md: Entity Relationships and Cross-Module Linkages

**Scope:** Canonical data relationships, collection fields, and enum values across all MongoDB collections in `d:\AI\itech`.

---

## 1. Core Financial and Account Ledger

```
openingSetups (Finalized)
       │
       ├─► accountMovements (Opening) ──► tenantAccountBalances (Cash / Bank)
       │
       └─► openingReceivables / openingPayables
```

### Collection Schemas & Key Fields

- **`accountMovements`**:
  - `_id`: String (`uid('ACM')`)
  - `tenantId`: String
  - `account`: `'Cash' | 'Bank' | 'Bank account'` (legacy compat)
  - `date`: `YYYY-MM-DD` (Asia/Kolkata)
  - `qty`: Signed integer paise (canonical)
  - `amountPaise` & `direction`: Legacy representation (`direction: 'In' | 'Out'`)
  - `reason`: String (e.g. `'Customer receipt'`, `'Supplier payment'`, `'Operating expense'`, `'Transfer'`)
  - `reference`: String (e.g. `RCP-2026-0001`, `PAY-2026-0001`)
  - `sourceType`: `'OpeningSetup' | 'CustomerReceipt' | 'CustomerRefund' | 'SupplierPayment' | 'SupplierRefund' | 'MoneyEntry' | 'Transfer'`
  - `sourceId`: String
  - `invoiceId`?: String

- **`tenantAccountBalances`**:
  - `_id`: `"BAL-${tenantId}-${account}"`
  - `tenantId`: String
  - `account`: `'Cash' | 'Bank'`
  - `balancePaise`: Non-negative integer paise ($\ge 0$)
  - `version`: Integer concurrency counter

- **`moneyEntries`**:
  - `_id`: String (`uid('MNY')`)
  - `tenantId`: String
  - `category`: `'OperatingExpense' | 'OwnerContribution' | 'OwnerWithdrawal' | 'Transfer' | 'OtherReceipt'`
  - `direction`: `1` (In) | `-1` (Out)
  - `account`: `'Cash' | 'Bank'`
  - `toAccount`?: `'Cash' | 'Bank'` (for transfers)
  - `amountPaise`: Positive integer paise
  - `date`: `YYYY-MM-DD`
  - `isReversed`: Boolean
  - `reversedById`?: String
  - `reversesId`?: String

- **`businessDayGates`**:
  - `_id`: `"DAY-${tenantId}"`
  - `tenantId`: String
  - `version`: Monotonic integer counter
  - `closedThrough`: `YYYY-MM-DD | null`

- **`dailyClosings`**:
  - `_id`: `"CLOSE-${tenantId}-${date}"`
  - `tenantId`: String
  - `date`: `YYYY-MM-DD`
  - `holiday`: Boolean
  - `note`: String
  - `cashPaise`: Reconciled physical cash count
  - `bankPaise`: Reconciled bank balance count
  - `figures`: Snapshot of figures at closing (opening, sales, expenses, collections, disbursements)
  - `closedAt`: Date
  - `closedBy`: String

- **`manualProfits`**:
  - `_id`: `"PROFIT-${tenantId}-${invoiceId}"`
  - `tenantId`: String
  - `date`: `YYYY-MM-DD`
  - `invoiceId`: String
  - `amountPaise`: Signed integer paise (blank in draft = Pending, zero/negative are valid)
  - `version`: Integer counter

- **`manualProfitAdjustments`**:
  - `_id`: `"PROFIT-ADJ-${tenantId}-${uid()}"`
  - `tenantId`: String
  - `date`: `YYYY-MM-DD` (current business day when adjustment is recorded)
  - `invoiceId`: String (original sale or service invoice)
  - `triggerType`: `'CustomerReturn' | 'InvoiceReversal' | 'Correction'`
  - `triggerId`: String (e.g. return document `_id`)
  - `amountPaise`: Signed integer paise
  - `reason`: String
  - `createdAt`: Date
  - `createdBy`: String

---

## 2. Customer Sales, Invoices, Receipts, and Returns

```
enquiries ──► quotations ──► invoices (Draft ──► Issued)
                                 │
     ┌───────────────────────────┼───────────────────────────┐
     ▼                           ▼                           ▼
stockMovements            customerReceipts            customerAdvances
(Sellable Out)                   │                    (Excess / Return)
                                 ├─► accountMovements        │
                                 │   (Cash / Bank In)        │
                                 ▼                           ▼
                         customerAllocations ◄───────────────┘
                         (Settles Invoice Due)
                         [NO duplicate cash movement]
```

### Crucial Flow Invariants
1. **Money Movement Timing:** `customerReceipts` move money into `accountMovements`.
2. **Allocation Settles Dues Only:** `customerAllocations` link a receipt or advance to an invoice (`targetType: 'Invoice'`) or opening receivable (`targetType: 'OpeningReceivable'`). Allocations settle remaining due (`duePaise`), and do **not** move money again.
3. **Customer Returns:** Settle invoice due first via `sourceType: 'ReturnCredit'`. If returned credit exceeds invoice due, the remainder creates a `customerAdvances` record (`sourceType: 'CreditNote'`).

### Collection Schemas & Enums

- **`invoices`**:
  - `_id`: String (`uid('INV')` or `uid('SVC')`)
  - `invoiceNumber`: String (`INV-2026-0001` or `SVC-2026-0001`)
  - `invoiceKind`: `'Sale' | 'Service'`
  - `businessCategory`: `'NewGoods' | 'UsedGoods' | 'Service'`
  - `status`: `'Draft' | 'Issued' | 'Cancelled'`
  - `lines`: Array of `SaleLine`:
    - `Product`: `{ lineType: 'Product', productId, stockAllocations: [{ lotId, reservationId?, quantity, serials }] }`
    - `Service`: `{ lineType: 'Service', sac, serviceId?, serviceJobId? }`
    - `ConsumedPart`: `{ lineType: 'ConsumedPart', productId, serviceJobId, partId, quantity, serials }`
    - `Charge`: `{ lineType: 'Charge', sac, description }`
  - `templateRevisionSnapshot`: Immutable copy of active invoice template settings at issue time.

- **`customerReceipts`**:
  - `_id`: String (`uid('RCP')`)
  - `components`: Array of `{ account: 'Cash' | 'Bank', method: 'Cash' | 'UPI' | 'BankTransfer' | 'Card', amountPaise, movementId }`
  - Each component links 1:1 to an `accountMovement`.

- **`customerAllocations`**:
  - `_id`: String (`uid('CAL')`)
  - `sourceType`: `'Receipt' | 'Advance' | 'ReturnCredit'`
  - `sourceId`: String
  - `targetType`: `'Invoice' | 'OpeningReceivable'`
  - `targetId`: String
  - `amountPaise`: Positive integer paise

- **`customerReturns`**:
  - `_id`: String (`uid('RET')`)
  - `invoiceId`: String
  - `lines`: Restores condition to `stockLots` (`quantitySellable` or `quantityDefective`), transitions serials back to `InStock` or `Defective`.

---

## 3. Supplier Purchases, Receipts, Settlements, and Returns

```
purchases (Draft ──► Confirmed ──► Posted)
    │
    ├─► purchaseReceipts ──► stockLots (quantityReceived) ──► serialUnits
    │                              │
    │                              ▼
    │                        stockMovements (Goods Receipt)
    │
    ├─► supplierPayments ──► accountMovements (Cash / Bank Out)
    │         │
    │         ▼
    │   supplierAllocations (Settles Purchase Line Due)
    │   [NO duplicate cash movement]
    │
    └─► supplierReturns ──► supplierCreditNotes ──► supplierAdvances
              │                       │                         │
              ▼                       └─► Offsets Line Due      └─► Settle other bill
        stockMovements                                               or Cash Refund
```

### Flow Rules
1. **Payments Move Money:** `supplierPayments` disburse cash/bank and create negative `accountMovements`.
2. **Allocations Settle Line Dues:** `supplierAllocations` reduce `remainingDuePaise` on `PurchaseProductLine`, `PurchaseChargeLine`, or `OpeningPayables`.
3. **Accepted Credit Notes vs. Refunds:**
   - Accepting a credit note reduces purchase line liability; excess creates `supplierAdvances`. Zero cash moved.
   - An actual cash refund from an advance creates an incoming `accountMovement` (`SupplierRefund`).

---

## 4. Service Jobs and Workshop Flow

```
customers ──► serviceJobs
                  │
                  ├─► partsConsumption (issued from stockLots & serialUnits)
                  │          │
                  │          ├─► stockLots.quantityConsumed += qty
                  │          ├─► serialUnits.status = 'ConsumedInService'
                  │          └─► stockMovements (sourceType: 'ServiceJob')
                  │
                  ├─► serviceInvoices (invoiceKind = 'Service')
                  │          │
                  │          ├─► lineType: 'Service' (Labor charge)
                  │          ├─► lineType: 'ConsumedPart' (references partsConsumption)
                  │          │   [Validates ownership; NO duplicate stock decrement]
                  │          │
                  │          └─► customerReceipts / accountMovements
                  │
                  └─► warranties (linked warranty coverage)
```

### Lot Conservation & Invariants
1. `stockLots` tracks:
   $$\text{quantityReceived} \equiv \text{quantitySellable} + \text{quantityReserved} + \text{quantityDefective} + \text{quantitySold} + \text{quantityReturned} + \text{quantityRemoved} + \text{quantityConsumed}$$
2. Reversing unbilled part consumption (`reverseServicePartConsumption`):
   - Restores lot (`quantityConsumed -= qty`, and `quantitySellable += qty` or `quantityDefective += qty`).
   - Reverses serial transition back to `InStock` or `Defective`.
   - Cannot delete a consumed part silently.
