'use client';
import {isLocked} from '@/lib/closing';
import {useRouter} from 'next/navigation';
import {purchaseLineBalances} from '@/lib/settlement';
import {lineTotal} from '@/lib/domain';
import {ReactNode, useState, useEffect} from 'react';
import Link from 'next/link';
import {Plus, Pencil, ArrowUpRight, ArrowLeft, Package, Download} from 'lucide-react';
import {Product, TODAY, available, reserved, uid, money, activeReservation, dateLabel} from '@/lib/domain';
import {useStore} from './store';
import {PageHead, Card, Btn, Modal, Field, SearchBox, Badge, Empty, csvDownload} from './ui';
import {mapProductFromApi} from '@/lib/mappers';

export const categories = [
  'Laptops',
  'Monitors',
  'Mouse',
  'Keyboards',
  'PC parts',
  'Storage',
  'Prebuilt PCs',
  'Printers',
  'Accessories',
];

function ProductFrame({
  children,
  title,
  onClose,
  page,
}: {
  children: ReactNode;
  title: string;
  onClose: () => void;
  page?: boolean;
}) {
  return page ? (
    <>
      <PageHead title={title} description="Create the product once, then receive stock through Purchases." />
      <Card>{children}</Card>
    </>
  ) : (
    <Modal title={title} onClose={onClose} wide>
      {children}
    </Modal>
  );
}

export function ProductForm({product, onClose, page = false}: {product?: Product; onClose: () => void; page?: boolean}) {
  const {state, setState, notify, isLive, saveProductApi, fetchSuppliersPage} = useStore();
  const [supplierChoices, setSupplierChoices] = useState(state.suppliers);
  const [f, setF] = useState<Product>(
    product || {
      id: uid('PRD'),
      name: '',
      category: 'Laptops',
      brand: '',
      condition: 'New',
      model: '',
      hsn: '84713010',
      cost: 0,
      price: 0,
      tax: 18,
      stock: 0,
      low: 2,
      serials: [],
      warranty: 12,
      supplier: state.suppliers[0]?.id || '',
    }
  );
  const [priceInclusive, setPriceInclusive] = useState(true);
  const [costInclusive, setCostInclusive] = useState(true);
  const priceCalc = lineTotal({qty: 1, rate: f.price, tax: f.tax, discount: 0}, priceInclusive);
  const costCalc = lineTotal({qty: 1, rate: f.cost, tax: f.tax, discount: 0}, costInclusive);
  const [serialText, setSerialText] = useState(product?.serials.join('\n') || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isLive) return;
    fetchSuppliersPage({limit: 100}).then((result) => setSupplierChoices(result.records)).catch(() => {});
  }, [isLive, fetchSuppliersPage]);

  function set(k: string, v: unknown) {
    setF((x) => ({...x, [k]: v}));
  }

  return (
    <ProductFrame page={page} title={product ? 'Edit product' : 'New product'} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const serials = serialText
            .split(/[\n,]+/)
            .map((s) => s.trim())
            .filter(Boolean);
          if (!product && ['Laptops', 'Monitors', 'Prebuilt PCs', 'Printers'].includes(f.category) && f.stock !== serials.length) {
            setError('Enter one serial number per opening unit, or start with zero stock.');
            return;
          }
          if (
            new Set(serials).size !== serials.length ||
            serials.some((n) => state.products.some((p) => p.id !== f.id && p.serials.includes(n)))
          ) {
            setError('Serial numbers must be unique.');
            return;
          }
          if (!product && f.stock && isLocked(state, TODAY)) {
            setError('Today is closed. Opening stock cannot be changed.');
            return;
          }
          setSaving(true);
          if (isLive) {
            const ok = await saveProductApi(
              {
                name: f.name,
                category: f.category,
                brand: f.brand,
                model: f.model,
                condition: f.condition,
                hsn: f.hsn,
                cost: costCalc.total,
                price: priceCalc.total,
                priceEntryMode: priceInclusive ? 'Inclusive' : 'Exclusive',
                tax: f.tax,
                warranty: f.warranty,
                low: f.low,
                supplier: f.supplier || undefined,
                isSerialTracked: ['Laptops', 'Monitors', 'Prebuilt PCs', 'Printers'].includes(f.category),
              },
              product?.id
            );
            setSaving(false);
            if (ok) onClose();
            return;
          }
          const valued = {...f, price: priceCalc.total, cost: costCalc.total};
          const value = product ? {...valued, stock: product.stock, serials: product.serials} : {...valued, serials};
          setState((s) => ({
            ...s,
            products: product ? s.products.map((p) => (p.id === product.id ? value : p)) : [...s.products, value],
            movements:
              !product && f.stock
                ? [{id: uid('MOV'), date: TODAY, productId: f.id, qty: f.stock, reason: 'Opening stock', reference: f.id}, ...s.movements]
                : s.movements,
          }));
          notify('Product saved.');
          setSaving(false);
          onClose();
        }}
      >
        <div className="form-body">
          <div className="form-grid">
            <Field label="Product name">
              <input required value={f.name} onChange={(e) => set('name', e.target.value)} />
            </Field>
            <Field label="Category">
              <select value={f.category} onChange={(e) => set('category', e.target.value)}>
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Brand">
              <input required value={f.brand} onChange={(e) => set('brand', e.target.value)} />
            </Field>
            <Field label="Model / specifications">
              <input required value={f.model} onChange={(e) => set('model', e.target.value)} />
            </Field>
            <Field label="Condition">
              <select value={f.condition} onChange={(e) => set('condition', e.target.value)}>
                <option>New</option>
                <option>Used</option>
              </select>
            </Field>
            <Field label="HSN">
              <input required value={f.hsn} onChange={(e) => set('hsn', e.target.value)} />
            </Field>
            <Field label="Purchase cost entry">
              <select value={costInclusive ? 'incl' : 'excl'} onChange={(e) => setCostInclusive(e.target.value === 'incl')}>
                <option value="incl">Inclusive of GST</option>
                <option value="excl">Exclusive of GST</option>
              </select>
            </Field>
            <Field label="Purchase cost (reference)">
              <input type="number" min="0" step="0.01" required value={f.cost} onChange={(e) => set('cost', +e.target.value)} />
            </Field>
            <Field label="Selling price entry">
              <select value={priceInclusive ? 'incl' : 'excl'} onChange={(e) => setPriceInclusive(e.target.value === 'incl')}>
                <option value="incl">Inclusive of GST</option>
                <option value="excl">Exclusive of GST</option>
              </select>
            </Field>
            <Field label="Selling price entered">
              <input type="number" min="0" step="0.01" required value={f.price} onChange={(e) => set('price', +e.target.value)} />
            </Field>
            <Field label="GST rate %">
              <input type="number" min="0" max="100" required value={f.tax} onChange={(e) => set('tax', +e.target.value)} />
            </Field>
            <div className="full grid-3">
              <div className="summary-box">
                <p>Price without GST</p>
                <h2>{money(priceCalc.base)}</h2>
              </div>
              <div className="summary-box">
                <p>GST ({f.tax}%)</p>
                <h2>{money(priceCalc.tax)}</h2>
              </div>
              <div className="summary-box">
                <p>Customer pays</p>
                <h2>{money(priceCalc.total)}</h2>
              </div>
            </div>
            <div className="full notice">
              Purchase reference: {money(costCalc.base)} + GST {money(costCalc.tax)} = {money(costCalc.total)}. Changing
              inclusive/exclusive reinterprets the amount entered. New purchases use these defaults; issued documents keep their
              saved prices.
            </div>
            <Field label="Warranty in months">
              <input type="number" min="0" max="120" required value={f.warranty} onChange={(e) => set('warranty', +e.target.value)} />
            </Field>
            <Field label="Reorder level">
              <input type="number" min="0" required value={f.low} onChange={(e) => set('low', +e.target.value)} />
            </Field>
            <Field label="Supplier">
              <select value={f.supplier} onChange={(e) => set('supplier', e.target.value)}>
                <option value="">No preferred supplier</option>
                {supplierChoices.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            {!product && !isLive && (
              <>
                <Field label="Opening stock quantity">
                  <input type="number" min="0" required value={f.stock} onChange={(e) => set('stock', +e.target.value)} />
                </Field>
                <Field label="Opening serials" hint="One per line for laptops, monitors, printers and prebuilt PCs.">
                  <textarea value={serialText} onChange={(e) => setSerialText(e.target.value)} />
                </Field>
              </>
            )}
            {!product && isLive && (
              <p className="notice full">
                New live products start at 0 units in catalogue. Bring units into stock via Opening Balances or a Purchase bill.
              </p>
            )}
          </div>
          {product && (
            <p className="notice spaced">
              Use a purchase, return or stock adjustment to change quantities. Editing product details keeps stock history intact.
            </p>
          )}
          {error && <p className="error">{error}</p>}
        </div>
        <div className="form-actions">
          <Btn secondary onClick={onClose}>
            Cancel
          </Btn>
          <Btn disabled={saving} type="submit">
            {saving ? 'Saving…' : 'Save product'}
          </Btn>
        </div>
      </form>
    </ProductFrame>
  );
}

export default function Inventory({id}: {id?: string}) {
  const router = useRouter();
  const {
    state,
    setState,
    notify,
    isLive,
    adjustProductStockApi,
    archiveProductApi,
    restoreProductApi,
    fetchProductsPage,
    quarantineStockApi,
    restoreStockApi,
    fetchInventoryLotsApi,
    fetchInventorySerialsApi,
    fetchInventoryMovementsApi,
    fetchPurchasesPage,
    fetchAuditHistoryApi,
  } = useStore();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('All');
  const [stock, setStock] = useState('All stock');
  const [edit, setEdit] = useState(false);
  const [adjust, setAdjust] = useState(false);
  const [page, setPage] = useState(1);
  const [serverData, setServerData] = useState<{records: any[]; total: number; totalPages: number} | null>(null);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Phase 3.5 Product Detail Tabs State
  const [detailTab, setDetailTab] = useState<'Overview' | 'Stock lots' | 'Serial units' | 'Stock movements' | 'Purchase sources' | 'Audit history'>('Overview');

  // Lots state
  const [lots, setLots] = useState<any[]>([]);
  const [lotPage, setLotPage] = useState(1);
  const [lotTotalPages, setLotTotalPages] = useState(1);
  const [lotTotal, setLotTotal] = useState(0);
  const [lotLoading, setLotLoading] = useState(false);
  const [lotError, setLotError] = useState('');

  // Serials state
  const [liveSerials, setLiveSerials] = useState<any[]>([]);
  const [serialPage, setSerialPage] = useState(1);
  const [serialTotalPages, setSerialTotalPages] = useState(1);
  const [serialTotal, setSerialTotal] = useState(0);
  const [serialLoading, setSerialLoading] = useState(false);
  const [serialError, setSerialError] = useState('');

  // Movements state
  const [liveMovements, setLiveMovements] = useState<any[]>([]);
  const [movPage, setMovPage] = useState(1);
  const [movTotalPages, setMovTotalPages] = useState(1);
  const [movTotal, setMovTotal] = useState(0);
  const [movLoading, setMovLoading] = useState(false);
  const [movError, setMovError] = useState('');

  // Purchase sources state
  const [sources, setSources] = useState<any[]>([]);
  const [sourcePage, setSourcePage] = useState(1);
  const [sourceTotalPages, setSourceTotalPages] = useState(1);
  const [sourceTotal, setSourceTotal] = useState(0);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceError, setSourceError] = useState('');

  // Audit history state
  const [audits, setAudits] = useState<any[]>([]);
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotalPages, setAuditTotalPages] = useState(1);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState('');

  // Condition modals state
  const [quarantineModal, setQuarantineModal] = useState<{open: boolean; lot: any | null}>({open: false, lot: null});
  const [restoreModal, setRestoreModal] = useState<{open: boolean; lot: any | null}>({open: false, lot: null});
  const [conditionQty, setConditionQty] = useState(1);
  const [conditionReason, setConditionReason] = useState('');
  const [conditionSerials, setConditionSerials] = useState('');
  const [conditionBusy, setConditionBusy] = useState(false);

  const p = detailProduct || state.products.find((p) => p.id === id);
  const [delta, setDelta] = useState(1);
  const [reason, setReason] = useState('');
  const [serialText, setSerialText] = useState('');
  const [adjusting, setAdjusting] = useState(false);

  const loadLots = () => {
    if (!isLive || !id || id === 'new') return;
    setLotLoading(true);
    setLotError('');
    fetchInventoryLotsApi({productId: id, page: lotPage, limit: 10})
      .then((res: any) => {
        setLots(res.lots || res.records || []);
        setLotTotalPages(res.totalPages || 1);
        setLotTotal(res.total || 0);
      })
      .catch((err: any) => setLotError(err.message || 'Failed to load stock lots.'))
      .finally(() => setLotLoading(false));
  };

  const loadSerials = () => {
    if (!isLive || !id || id === 'new') return;
    setSerialLoading(true);
    setSerialError('');
    fetchInventorySerialsApi({productId: id, page: serialPage, limit: 15})
      .then((res: any) => {
        setLiveSerials(res.serials || res.records || []);
        setSerialTotalPages(res.totalPages || 1);
        setSerialTotal(res.total || 0);
      })
      .catch((err: any) => setSerialError(err.message || 'Failed to load serial units.'))
      .finally(() => setSerialLoading(false));
  };

  const loadMovements = () => {
    if (!isLive || !id || id === 'new') return;
    setMovLoading(true);
    setMovError('');
    fetchInventoryMovementsApi({productId: id, page: movPage, limit: 10})
      .then((res: any) => {
        setLiveMovements(res.movements || res.records || []);
        setMovTotalPages(res.totalPages || 1);
        setMovTotal(res.total || 0);
      })
      .catch((err: any) => setMovError(err.message || 'Failed to load stock movements.'))
      .finally(() => setMovLoading(false));
  };

  const loadSources = () => {
    if (!isLive || !id || id === 'new') return;
    setSourceLoading(true);
    setSourceError('');
    fetchPurchasesPage({productId: id, page: sourcePage, limit: 10})
      .then((res: any) => {
        setSources(res.records || []);
        setSourceTotalPages(res.totalPages || 1);
        setSourceTotal(res.total || 0);
      })
      .catch((err: any) => setSourceError(err.message || 'Failed to load purchase sources.'))
      .finally(() => setSourceLoading(false));
  };

  const loadAudits = () => {
    if (!isLive || !id || id === 'new') return;
    setAuditLoading(true);
    setAuditError('');
    fetchAuditHistoryApi({entityType: 'Product', entityId: id, page: auditPage, limit: 10})
      .then((res: any) => {
        setAudits(res.records || res.history || res.items || []);
        setAuditTotalPages(res.totalPages || 1);
        setAuditTotal(res.total || 0);
      })
      .catch((err: any) => setAuditError(err.message || 'Failed to load audit history.'))
      .finally(() => setAuditLoading(false));
  };

  useEffect(() => {
    if (isLive && id && id !== 'new') {
      loadLots();
    }
  }, [isLive, id, lotPage]);

  useEffect(() => {
    if (isLive && id && id !== 'new') {
      loadSerials();
    }
  }, [isLive, id, serialPage]);

  useEffect(() => {
    if (isLive && id && id !== 'new') {
      loadMovements();
    }
  }, [isLive, id, movPage]);

  useEffect(() => {
    if (isLive && id && id !== 'new' && detailTab === 'Purchase sources') {
      loadSources();
    }
  }, [isLive, id, detailTab, sourcePage]);

  useEffect(() => {
    if (isLive && id && id !== 'new' && detailTab === 'Audit history') {
      loadAudits();
    }
  }, [isLive, id, detailTab, auditPage]);

  useEffect(() => {
    setPage(1);
  }, [q, category, stock]);

  useEffect(() => {
    if (isLive && !id) {
      fetchProductsPage({
        page,
        limit: 10,
        q: q.trim() || undefined,
        category: category === 'All' ? undefined : category,
      })
        .then((res) => setServerData(res))
        .catch(() => {});
    }
  }, [isLive, page, q, category, id, fetchProductsPage]);

  useEffect(() => {
    if (!isLive || !id || id === 'new') return;
    setDetailLoading(true);
    fetch(`/api/master/products/${encodeURIComponent(id)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Product not found');
        setDetailProduct(mapProductFromApi(await res.json()));
      })
      .catch(() => setDetailProduct(null))
      .finally(() => setDetailLoading(false));
  }, [isLive, id]);

  const list =
    isLive && serverData
      ? serverData.records
      : state.products.filter(
          (p) =>
            (p.name + p.model + p.brand).toLowerCase().includes(q.toLowerCase()) &&
            (category === 'All' || p.category === category) &&
            (stock === 'All stock' || (stock === 'Low stock' ? available(state, p) <= p.low : p.condition === 'Used'))
        );

  if (id === 'new') return <ProductForm page onClose={() => router.push('/inventory')} />;
  if (id && isLive && detailLoading) return <Empty title="Loading product…" />;
  if (id && !p) return <Empty title="Product not found" />;

  return (
    <>
      {p && (
        <Link href="/inventory" className="back-link">
          <ArrowLeft size={14} />
          All inventory
        </Link>
      )}
      <PageHead
        title={p?.name || 'Inventory'}
        description={p ? `${p.id} · ${p.model}` : 'Know what’s in stock, what’s reserved and what needs reordering.'}
        actions={
          <>
            <Btn
              secondary
              onClick={() =>
                csvDownload('inventory.csv', [
                  ['Product', 'Model', 'Condition', 'On hand', 'Reserved', 'Available', 'Price'],
                  ...list.map((p) => [p.name, p.model, p.condition, p.stock, reserved(state, p.id), available(state, p), p.price]),
                ])
              }
            >
              <Download size={16} />
              Export
            </Btn>
            {p && (
              isLive && (p as any).status === 'Archived' ? (
                <Btn
                  secondary
                  onClick={async () => {
                    if (confirm(`Restore product "${p.name}" to active?`)) {
                      await restoreProductApi(p.id);
                    }
                  }}
                >
                  Restore to active
                </Btn>
              ) : (
                <Btn
                  secondary
                  onClick={async () => {
                    if (confirm(`Archive product "${p.name}"?`)) {
                      const ok = await archiveProductApi(p.id);
                      if (ok) router.push('/inventory');
                    }
                  }}
                >
                  Archive
                </Btn>
              )
            )}
            <Btn onClick={() => (p ? setEdit(true) : router.push('/inventory/new'))}>
              {p ? <Pencil size={16} /> : <Plus size={16} />} {p ? 'Edit product' : 'Add product'}
            </Btn>
          </>
        }
      />
      {!p && (
        <div className="notice">
          Add product creates its catalogue details. New purchase records the supplier bill and brings units into stock when received.
          Start new products at zero stock, then receive a purchase.{' '}
          <Link className="text-link" href="/purchases/new">
            New purchase
          </Link>
        </div>
      )}
      {p ? (
        <div className="stack spaced">
          <div className="tabs">
            {(['Overview', 'Stock lots', 'Serial units', 'Stock movements', 'Purchase sources', 'Audit history'] as const).map((t) => (
              <button
                key={t}
                type="button"
                className={detailTab === t ? 'active' : ''}
                onClick={() => setDetailTab(t)}
              >
                {t}
              </button>
            ))}
          </div>

          {detailTab === 'Overview' && (
            <div className="detail-grid">
              <div className="stack">
                <Card title="Stock position">
                  <div className="stock-position">
                    <div>
                      <small>On hand</small>
                      <strong>{p.stock}</strong>
                    </div>
                    <div>
                      <small>Reserved</small>
                      <strong>{reserved(state, p.id)}</strong>
                    </div>
                    <div>
                      <small>Available to sell</small>
                      <strong className="positive">{available(state, p)}</strong>
                    </div>
                    {isLive && (
                      <div>
                        <small>Defective</small>
                        <strong className={lots.reduce((acc, l) => acc + (l.quantityDefective || 0), 0) > 0 ? 'error' : ''}>
                          {lots.reduce((acc, l) => acc + (l.quantityDefective || 0), 0)}
                        </strong>
                      </div>
                    )}
                  </div>
                  <div className="body-pad actions">
                    <Link className="btn" href="/purchases/new">
                      Receive through purchase
                    </Link>
                    <Btn secondary onClick={() => setAdjust(true)}>
                      Adjust stock
                    </Btn>
                    <Link className="btn secondary" href="/reservations">
                      Reserve stock
                    </Link>
                  </div>
                </Card>
                <Card title="Warranty coverage">
                  <p className="body-pad">
                    {p.condition === 'Used' ? 'Shop' : 'Manufacturer'} warranty is recorded automatically when this product is sold.
                  </p>
                  <Link className="card-bottom-link" href="/warranty">
                    View warranty records <ArrowUpRight size={16} />
                  </Link>
                </Card>
              </div>
              <div className="stack">
                <Card title="Product details">
                  <dl className="detail-list">
                    {Object.entries({
                      Category: p.category,
                      Brand: p.brand,
                      Condition: p.condition,
                      HSN: p.hsn,
                      'Selling price': money(p.price),
                      GST: p.tax + '%',
                      Warranty: p.warranty + ' months',
                      'Reorder level': p.low,
                      Supplier: state.suppliers.find((s) => s.id === p.supplier)?.name || 'None',
                    }).map(([k, v]) => (
                      <div key={k}>
                        <dt>{k}</dt>
                        <dd>{v}</dd>
                      </div>
                    ))}
                  </dl>
                </Card>
              </div>
            </div>
          )}

          {detailTab === 'Stock lots' && (
            <Card title="Stock lots & condition isolation">
              {lotError ? (
                <div className="body-pad stack">
                  <p className="error">{lotError}</p>
                  <Btn secondary onClick={loadLots}>Retry</Btn>
                </div>
              ) : (
                <>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Lot Number</th>
                          <th>Sellable</th>
                          <th>Defective</th>
                          <th>Reserved</th>
                          <th>On Hand</th>
                          <th>Unit Cost</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lots.map((lot) => (
                          <tr key={lot._id || lot.id || lot.lotNumber}>
                            <td>
                              <strong>{lot.lotNumber || lot._id}</strong>
                              <small>{lot.sourceReference || '—'}</small>
                            </td>
                            <td className="positive">{lot.quantitySellable ?? lot.quantityRemaining ?? 0}</td>
                            <td style={{color: (lot.quantityDefective || 0) > 0 ? 'var(--error, #e53935)' : undefined}}>
                              {lot.quantityDefective || 0}
                            </td>
                            <td>{lot.quantityReserved || 0}</td>
                            <td>{(lot.quantitySellable ?? lot.quantityRemaining ?? 0) + (lot.quantityReserved || 0) + (lot.quantityDefective || 0)}</td>
                            <td>{money((lot.costPaise || 0) / 100)}</td>
                            <td>
                              <div style={{display: 'flex', gap: '0.5rem'}}>
                                {(lot.quantitySellable ?? lot.quantityRemaining ?? 0) > 0 && (
                                  <button
                                    type="button"
                                    className="link-button"
                                    onClick={() => {
                                      setConditionQty(1);
                                      setConditionReason('');
                                      setConditionSerials('');
                                      setQuarantineModal({open: true, lot});
                                    }}
                                  >
                                    Quarantine
                                  </button>
                                )}
                                {(lot.quantityDefective || 0) > 0 && (
                                  <button
                                    type="button"
                                    className="link-button"
                                    onClick={() => {
                                      setConditionQty(1);
                                      setConditionReason('');
                                      setConditionSerials('');
                                      setRestoreModal({open: true, lot});
                                    }}
                                  >
                                    Restore
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                        {!lots.length && (
                          <tr>
                            <td colSpan={7} className="muted body-pad">
                              {lotLoading ? 'Loading stock lots…' : 'No specific stock lots recorded for this product yet.'}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  {isLive && lotTotalPages > 1 && (
                    <div className="table-footer" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                      <span>Page {lotPage} of {lotTotalPages} ({lotTotal} lots)</span>
                      <div style={{display: 'flex', gap: '0.5rem'}}>
                        <Btn secondary disabled={lotPage <= 1 || lotLoading} onClick={() => setLotPage((p) => p - 1)}>Previous</Btn>
                        <Btn secondary disabled={lotPage >= lotTotalPages || lotLoading} onClick={() => setLotPage((p) => p + 1)}>Next</Btn>
                      </div>
                    </div>
                  )}
                </>
              )}
            </Card>
          )}

          {detailTab === 'Serial units' && (
            <Card title="Serial numbers">
              {serialError ? (
                <div className="body-pad stack">
                  <p className="error">{serialError}</p>
                  <Btn secondary onClick={loadSerials}>Retry</Btn>
                </div>
              ) : (
                <>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Serial number</th>
                          <th>Lot / Reference</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(isLive ? liveSerials : (p.serials || [])).map((entry: any) => {
                          const serial = typeof entry === 'string' ? entry : entry.serialOriginal;
                          const ref = typeof entry === 'string' ? '' : (entry.lot?.sourceReference || entry.sourceReference || '—');
                          const st = typeof entry === 'string'
                            ? (state.reservations.some((r) => activeReservation(r) && r.serials.includes(serial)) ? 'Reserved' : 'Available')
                            : entry.status;
                          return (
                            <tr key={entry._id || serial}>
                              <td><strong>{serial}</strong></td>
                              <td><small>{ref}</small></td>
                              <td><Badge>{st}</Badge></td>
                            </tr>
                          );
                        })}
                        {!(isLive ? liveSerials.length : p.serials?.length) && (
                          <tr>
                            <td colSpan={3} className="muted body-pad">
                              {serialLoading ? 'Loading serials…' : 'No serial units recorded for this product.'}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  {isLive && serialTotalPages > 1 && (
                    <div className="table-footer" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                      <span>Page {serialPage} of {serialTotalPages} ({serialTotal} serials)</span>
                      <div style={{display: 'flex', gap: '0.5rem'}}>
                        <Btn secondary disabled={serialPage <= 1 || serialLoading} onClick={() => setSerialPage((p) => p - 1)}>Previous</Btn>
                        <Btn secondary disabled={serialPage >= serialTotalPages || serialLoading} onClick={() => setSerialPage((p) => p + 1)}>Next</Btn>
                      </div>
                    </div>
                  )}
                </>
              )}
            </Card>
          )}

          {detailTab === 'Stock movements' && (
            <Card title="Stock movements">
              {movError ? (
                <div className="body-pad stack">
                  <p className="error">{movError}</p>
                  <Btn secondary onClick={loadMovements}>Retry</Btn>
                </div>
              ) : (
                <>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Reason</th>
                          <th>On Hand Δ</th>
                          <th>Sellable Δ</th>
                          <th>Defective Δ</th>
                          <th>Reference</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(isLive ? liveMovements : state.movements.filter((m) => m.productId === p.id)).map((m: any) => {
                          const onHand = m.onHandDelta !== undefined ? m.onHandDelta : m.qty;
                          const sellable = m.sellableDelta !== undefined ? m.sellableDelta : (m.qty > 0 ? m.qty : 0);
                          const defective = m.defectiveDelta !== undefined ? m.defectiveDelta : 0;
                          return (
                            <tr key={m.id || m._id}>
                              <td>{dateLabel(m.date || m.createdAt)}</td>
                              <td>{m.reason}</td>
                              <td className={onHand > 0 ? 'positive' : onHand < 0 ? 'error' : ''}>
                                {onHand > 0 ? `+${onHand}` : onHand}
                              </td>
                              <td className={sellable > 0 ? 'positive' : sellable < 0 ? 'error' : ''}>
                                {sellable > 0 ? `+${sellable}` : sellable}
                              </td>
                              <td className={defective > 0 ? 'error' : ''}>
                                {defective > 0 ? `+${defective}` : defective}
                              </td>
                              <td>{m.reference || '—'}</td>
                            </tr>
                          );
                        })}
                        {!(isLive ? liveMovements.length : state.movements.filter((m) => m.productId === p.id).length) && (
                          <tr>
                            <td colSpan={6} className="muted body-pad">
                              {movLoading ? 'Loading stock movements…' : 'No stock movements recorded for this product.'}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  {isLive && movTotalPages > 1 && (
                    <div className="table-footer" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                      <span>Page {movPage} of {movTotalPages} ({movTotal} movements)</span>
                      <div style={{display: 'flex', gap: '0.5rem'}}>
                        <Btn secondary disabled={movPage <= 1 || movLoading} onClick={() => setMovPage((p) => p - 1)}>Previous</Btn>
                        <Btn secondary disabled={movPage >= movTotalPages || movLoading} onClick={() => setMovPage((p) => p + 1)}>Next</Btn>
                      </div>
                    </div>
                  )}
                </>
              )}
            </Card>
          )}

          {detailTab === 'Purchase sources' && (
            <Card title="Purchase sources & settlement status">
              {sourceError ? (
                <div className="body-pad stack">
                  <p className="error">{sourceError}</p>
                  <Btn secondary onClick={loadSources}>Retry</Btn>
                </div>
              ) : (
                <>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Purchase</th>
                          <th>Supplier</th>
                          <th>Ordered</th>
                          <th>Received</th>
                          <th>Rate</th>
                          <th>Line Paid</th>
                          <th>Line Due</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(isLive ? sources : state.purchases.filter((b) => b.lines.some((l) => l.productId === p.id))).map((b: any) => {
                          const matchingLines = (b.lines || []).filter((l: any) => l.productId === p.id);
                          const supplierName = b.supplierSnapshot?.name || state.suppliers.find((s) => s.id === b.supplierId)?.name || 'Supplier';
                          return matchingLines.map((l: any, lidx: number) => (
                            <tr key={(b._id || b.id) + '-' + (l.clientLineKey || lidx)}>
                              <td>
                                <Link className="text-link" href={'/purchases/' + (b._id || b.id)}>
                                  {b.purchaseNumber || b.id}
                                </Link>
                                <small>{b.billStatus || b.status} · {dateLabel(b.orderDate || b.date)}</small>
                              </td>
                              <td>
                                <Link href={'/suppliers/' + b.supplierId}>
                                  {supplierName}
                                </Link>
                              </td>
                              <td>{l.quantityOrdered ?? l.qty}</td>
                              <td>{l.quantityReceived ?? (b.status === 'Received' ? l.qty : 0)}</td>
                              <td>{money(l.unitCostPaise ? l.unitCostPaise / 100 : l.rate)}</td>
                              <td>{money((l.paidPaise || 0) / 100)}</td>
                              <td>
                                {(l.duePaise || 0) > 0 ? (
                                  <strong className="error">{money(l.duePaise / 100)}</strong>
                                ) : (
                                  <Badge>Paid</Badge>
                                )}
                              </td>
                            </tr>
                          ));
                        })}
                        {!(isLive ? sources.length : state.purchases.filter((b) => b.lines.some((l) => l.productId === p.id)).length) && (
                          <tr>
                            <td colSpan={7} className="muted body-pad">
                              {sourceLoading ? 'Loading purchase sources…' : 'No purchase sources linked to this product.'}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  {isLive && sourceTotalPages > 1 && (
                    <div className="table-footer" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                      <span>Page {sourcePage} of {sourceTotalPages} ({sourceTotal} purchases)</span>
                      <div style={{display: 'flex', gap: '0.5rem'}}>
                        <Btn secondary disabled={sourcePage <= 1 || sourceLoading} onClick={() => setSourcePage((p) => p - 1)}>Previous</Btn>
                        <Btn secondary disabled={sourcePage >= sourceTotalPages || sourceLoading} onClick={() => setSourcePage((p) => p + 1)}>Next</Btn>
                      </div>
                    </div>
                  )}
                </>
              )}
            </Card>
          )}

          {detailTab === 'Audit history' && (
            <Card title="Product audit history">
              {auditError ? (
                <div className="body-pad stack">
                  <p className="error">{auditError}</p>
                  <Btn secondary onClick={loadAudits}>Retry</Btn>
                </div>
              ) : (
                <>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Date & Time</th>
                          <th>Action</th>
                          <th>User</th>
                          <th>Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {audits.map((a: any) => (
                          <tr key={a._id || a.id || a.timestamp}>
                            <td>{dateLabel(a.timestamp || a.createdAt)}</td>
                            <td><Badge>{a.action || a.eventType}</Badge></td>
                            <td>{a.actorEmail || a.userId || 'System'}</td>
                            <td>{a.description || a.details || '—'}</td>
                          </tr>
                        ))}
                        {!audits.length && (
                          <tr>
                            <td colSpan={4} className="muted body-pad">
                              {auditLoading ? 'Loading audit history…' : 'No audit entries found for this product.'}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  {isLive && auditTotalPages > 1 && (
                    <div className="table-footer" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                      <span>Page {auditPage} of {auditTotalPages} ({auditTotal} audit events)</span>
                      <div style={{display: 'flex', gap: '0.5rem'}}>
                        <Btn secondary disabled={auditPage <= 1 || auditLoading} onClick={() => setAuditPage((p) => p - 1)}>Previous</Btn>
                        <Btn secondary disabled={auditPage >= auditTotalPages || auditLoading} onClick={() => setAuditPage((p) => p + 1)}>Next</Btn>
                      </div>
                    </div>
                  )}
                </>
              )}
            </Card>
          )}
        </div>
      ) : (
        <>
          <div className="inventory-summary">
            <span>
              <b>{state.products.length}</b> products
            </span>
            <span>
              <b>{state.products.reduce((a, p) => a + p.stock, 0)}</b> units on hand
            </span>
            <span>
              <b>{state.reservations.filter(activeReservation).reduce((a, r) => a + r.qty, 0)}</b> reserved
            </span>
            <span>
              <b>{state.products.filter((p) => available(state, p) <= p.low).length}</b> low stock
            </span>
          </div>
          <Card>
            <div className="toolbar">
              <SearchBox value={q} onChange={setQ} placeholder="Search product, brand or model…" />
              <select aria-label="Product category" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option>All</option>
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <select aria-label="Stock filter" value={stock} onChange={(e) => setStock(e.target.value)}>
                <option>All stock</option>
                <option>Low stock</option>
                <option>Used products</option>
              </select>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Category</th>
                    <th>Condition</th>
                    <th>Price incl. GST</th>
                    <th>On hand</th>
                    <th>Reserved</th>
                    <th>Available</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {list.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <Link className="customer-cell" href={'/inventory/' + p.id}>
                          <div className="product-icon">
                            <Package size={19} />
                          </div>
                          <div>
                            <strong>{p.name}</strong>
                            <small>{p.model}</small>
                          </div>
                        </Link>
                      </td>
                      <td>{p.category}</td>
                      <td>
                        <Badge>{p.condition}</Badge>
                      </td>
                      <td className="amount">{money(p.price)}</td>
                      <td>{p.stock}</td>
                      <td>{reserved(state, p.id)}</td>
                      <td>
                        <Badge>{available(state, p) <= p.low ? `${available(state, p)} · Low` : String(available(state, p))}</Badge>
                      </td>
                      <td>
                        <Link href={'/inventory/' + p.id} aria-label={'View ' + p.name}>
                          <ArrowUpRight size={16} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!list.length && <Empty />}
            <div className="table-footer">
              <span>
                {isLive && serverData
                  ? `Showing ${list.length} of ${serverData.total} products`
                  : `${list.length} products · All matching records shown`}
              </span>
              {isLive && serverData && serverData.totalPages > 1 && (
                <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
                  <span className="muted" style={{marginRight: 8}}>
                    Page {page} of {serverData.totalPages}
                  </span>
                  <Btn secondary disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                    Previous
                  </Btn>
                  <Btn secondary disabled={page >= serverData.totalPages} onClick={() => setPage((p) => p + 1)}>
                    Next
                  </Btn>
                </div>
              )}
            </div>
          </Card>
        </>
      )}
      {edit && <ProductForm product={p} onClose={() => setEdit(false)} />}
      {adjust && p && (
        <Modal title="Stock adjustment" onClose={() => setAdjust(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (isLocked(state, TODAY)) {
                notify('Today is closed. Stock changes are read-only.');
                return;
              }
              if (!Number.isInteger(delta) || delta === 0 || p.stock + delta < reserved(state, p.id)) {
                notify('Adjustment must keep reserved stock available.');
                return;
              }
              const serials = serialText
                .split(/[\n,]+/)
                .map((s) => s.trim())
                .filter(Boolean);
              const tracked = (p.serials || []).length > 0 || ['Laptops', 'Monitors', 'Printers', 'Prebuilt PCs'].includes(p.category);
              if (tracked && (serials.length !== Math.abs(delta) || new Set(serials).size !== serials.length)) {
                notify('Enter one unique serial number for each unit adjusted.');
                return;
              }
              setAdjusting(true);
              if (isLive) {
                const ok = await adjustProductStockApi(p.id, delta, serials, reason);
                setAdjusting(false);
                if (ok) setAdjust(false);
                return;
              }
              const held = state.reservations.filter(activeReservation).flatMap((r) => r.serials);
              if (
                tracked &&
                (delta < 0
                  ? serials.some((n) => !p.serials.includes(n) || held.includes(n))
                  : serials.some((n) => state.products.some((x) => x.serials.includes(n))))
              ) {
                notify('Check serial availability. Reserved serials cannot be removed.');
                setAdjusting(false);
                return;
              }
              setState((s) => ({
                ...s,
                products: s.products.map((x) =>
                  x.id === p.id
                    ? {
                        ...x,
                        stock: x.stock + delta,
                        serials: tracked
                          ? delta > 0
                            ? [...x.serials, ...serials]
                            : x.serials.filter((n) => !serials.includes(n))
                          : x.serials,
                      }
                    : x
                ),
                movements: [
                  {id: uid('MOV'), date: TODAY, productId: p.id, qty: delta, reason, reference: 'Manual adjustment'},
                  ...s.movements,
                ],
              }));
              notify('Stock adjustment recorded.');
              setAdjusting(false);
              setAdjust(false);
            }}
          >
            <div className="form-body stack">
              <Field label="Quantity change" hint="Positive to add, negative to remove.">
                <input required type="number" value={delta} onChange={(e) => setDelta(+e.target.value)} />
              </Field>
              <Field label="Affected serial numbers">
                <textarea
                  value={serialText}
                  onChange={(e) => setSerialText(e.target.value)}
                  placeholder="One per line; leave blank for quantity-tracked items"
                />
              </Field>
              <Field label="Reason">
                <input required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Physical stock count correction…" />
              </Field>
            </div>
            <div className="form-actions">
              <Btn secondary onClick={() => setAdjust(false)}>
                Cancel
              </Btn>
              <Btn disabled={adjusting} type="submit">
                {adjusting ? 'Recording…' : 'Record adjustment'}
              </Btn>
            </div>
          </form>
        </Modal>
      )}

      {quarantineModal.open && quarantineModal.lot && (
        <Modal
          title={`Quarantine stock · Lot ${quarantineModal.lot.lotNumber || quarantineModal.lot._id}`}
          onClose={() => setQuarantineModal({open: false, lot: null})}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!conditionReason.trim()) return notify('Reason for quarantine is required.');
              setConditionBusy(true);
              try {
                const res = await quarantineStockApi({
                  lotId: quarantineModal.lot._id || quarantineModal.lot.id,
                  quantity: conditionQty,
                  serials: conditionSerials
                    ? conditionSerials
                        .split(/[\n,]+/)
                        .map((s) => s.trim())
                        .filter(Boolean)
                    : undefined,
                  reason: conditionReason.trim(),
                });
                if (res.success) {
                  notify('Stock quarantined into defective condition.');
                  setQuarantineModal({open: false, lot: null});
                  loadLots();
                  loadMovements();
                } else {
                  notify(res.error || 'Failed to quarantine stock.');
                }
              } finally {
                setConditionBusy(false);
              }
            }}
          >
            <div className="form-body stack">
              <p className="notice">
                Quarantining isolates stock into defective condition. Sellable quantity decreases while overall on-hand remains unchanged until returned.
              </p>
              <Field
                label="Quantity to quarantine *"
                hint={`Max sellable available: ${quarantineModal.lot.quantitySellable ?? quarantineModal.lot.quantityRemaining ?? 0}`}
              >
                <input
                  required
                  type="number"
                  min="1"
                  max={quarantineModal.lot.quantitySellable ?? quarantineModal.lot.quantityRemaining ?? 0}
                  value={conditionQty}
                  onChange={(e) => setConditionQty(+e.target.value)}
                />
              </Field>
              <Field label="Serial numbers (optional, one per line)">
                <textarea
                  value={conditionSerials}
                  onChange={(e) => setConditionSerials(e.target.value)}
                  placeholder="Enter specific serials to isolate if serialized..."
                />
              </Field>
              <Field label="Reason for quarantine *">
                <input
                  required
                  placeholder="Damaged in transit, failed QA, factory defect..."
                  value={conditionReason}
                  onChange={(e) => setConditionReason(e.target.value)}
                />
              </Field>
            </div>
            <div className="form-actions">
              <Btn secondary onClick={() => setQuarantineModal({open: false, lot: null})}>
                Cancel
              </Btn>
              <Btn danger type="submit" disabled={conditionBusy}>
                {conditionBusy ? 'Quarantining…' : 'Confirm quarantine'}
              </Btn>
            </div>
          </form>
        </Modal>
      )}

      {restoreModal.open && restoreModal.lot && (
        <Modal
          title={`Restore defective stock · Lot ${restoreModal.lot.lotNumber || restoreModal.lot._id}`}
          onClose={() => setRestoreModal({open: false, lot: null})}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!conditionReason.trim()) return notify('Reason for restoration is required.');
              setConditionBusy(true);
              try {
                const res = await restoreStockApi({
                  lotId: restoreModal.lot._id || restoreModal.lot.id,
                  quantity: conditionQty,
                  serials: conditionSerials
                    ? conditionSerials
                        .split(/[\n,]+/)
                        .map((s) => s.trim())
                        .filter(Boolean)
                    : undefined,
                  reason: conditionReason.trim(),
                });
                if (res.success) {
                  notify('Stock restored from defective back to sellable condition.');
                  setRestoreModal({open: false, lot: null});
                  loadLots();
                  loadMovements();
                } else {
                  notify(res.error || 'Failed to restore stock.');
                }
              } finally {
                setConditionBusy(false);
              }
            }}
          >
            <div className="form-body stack">
              <p className="notice">
                Restoring moves stock from defective condition back into active sellable inventory.
              </p>
              <Field
                label="Quantity to restore *"
                hint={`Max defective available: ${restoreModal.lot.quantityDefective || 0}`}
              >
                <input
                  required
                  type="number"
                  min="1"
                  max={restoreModal.lot.quantityDefective || 0}
                  value={conditionQty}
                  onChange={(e) => setConditionQty(+e.target.value)}
                />
              </Field>
              <Field label="Serial numbers (optional, one per line)">
                <textarea
                  value={conditionSerials}
                  onChange={(e) => setConditionSerials(e.target.value)}
                  placeholder="Enter specific serials to restore if serialized..."
                />
              </Field>
              <Field label="Reason for restoration *">
                <input
                  required
                  placeholder="Repaired, false alarm, supplier replacement verified..."
                  value={conditionReason}
                  onChange={(e) => setConditionReason(e.target.value)}
                />
              </Field>
            </div>
            <div className="form-actions">
              <Btn secondary onClick={() => setRestoreModal({open: false, lot: null})}>
                Cancel
              </Btn>
              <Btn type="submit" disabled={conditionBusy}>
                {conditionBusy ? 'Restoring…' : 'Restore to sellable'}
              </Btn>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
