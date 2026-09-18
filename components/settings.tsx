'use client';
import {useState, useEffect, useCallback} from 'react';
import {
  Save,
  Download,
  LockKeyhole,
  Users,
  History,
  HardDrive,
  Monitor,
  Upload,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Plus,
  Trash2,
  Loader2,
  Receipt,
  Truck,
  Package,
} from 'lucide-react';
import {seed} from '@/lib/seed';
import {useStore} from './store';
import {PageHead, Card, Btn, Field, Modal, Badge, download} from './ui';
import {money} from '@/lib/domain';

type DraftReceivableRow = {
  customerId: string;
  reference: string;
  date: string;
  amountRupees: number | '';
  notes?: string;
};

type DraftPayableRow = {
  supplierId: string;
  reference: string;
  date: string;
  amountRupees: number | '';
  notes?: string;
};

type DraftStockRow = {
  productId: string;
  batchNumber?: string;
  receivedDate: string;
  quantity: number | '';
  unitCostRupees: number | '';
  serialsText?: string;
};

export default function Settings() {
  const {
    state,
    setState,
    notify,
    role,
    isLive,
    businessDataMode,
    companySession,
    openingStatus,
    saveSettingsApi,
    fetchOpeningDraftApi,
    saveOpeningDraftApi,
    finalizeOpeningApi,
    importDemoMasterDataApi,
    refreshMasterData,
    fetchCustomersPage,
    fetchSuppliersPage,
    fetchProductsPage,
  } = useStore();

  const [tab, setTab] = useState('Shop details');
  const [f, setF] = useState({...state.settings});
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [reset, setReset] = useState(false);
  const [finalizeConfirm, setFinalizeConfirm] = useState(false);
  const [auditList, setAuditList] = useState<any[]>([]);

  // Opening setup draft state
  const today = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Kolkata'}).format(new Date());
  const [todayYear, todayMonth, todayDay] = today.split('-').map(Number);
  const previousDate = new Date(Date.UTC(todayYear, todayMonth - 1, todayDay - 1)).toISOString().slice(0, 10);
  const [cutoffDate, setCutoffDate] = useState(openingStatus?.cutoffDate || previousDate);
  const [cashRupees, setCashRupees] = useState<number | ''>((openingStatus?.openingCashPaise || 0) / 100);
  const [bankRupees, setBankRupees] = useState<number | ''>((openingStatus?.openingBankPaise || 0) / 100);
  const [draftReceivables, setDraftReceivables] = useState<DraftReceivableRow[]>([]);
  const [draftPayables, setDraftPayables] = useState<DraftPayableRow[]>([]);
  const [draftStockLots, setDraftStockLots] = useState<DraftStockRow[]>([]);
  const [draftVersion, setDraftVersion] = useState<number>(openingStatus?.draftVersion || 0);
  const [savingDraft, setSavingDraft] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [correctingCutoff, setCorrectingCutoff] = useState(false);
  const [correctCutoffConfirm, setCorrectCutoffConfirm] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [openingCustomers, setOpeningCustomers] = useState(state.customers);
  const [openingSuppliers, setOpeningSuppliers] = useState(state.suppliers);
  const [openingProducts, setOpeningProducts] = useState(state.products);
  const [storageInfo, setStorageInfo] = useState<any>(null);
  const [customCloudName, setCustomCloudName] = useState('');
  const [customApiKey, setCustomApiKey] = useState('');
  const [customApiSecret, setCustomApiSecret] = useState('');
  const [storageAccountPassword, setStorageAccountPassword] = useState('');
  const [testingStorage, setTestingStorage] = useState(false);
  const [savingStorage, setSavingStorage] = useState(false);
  const [resettingStorage, setResettingStorage] = useState(false);
  const [storageStatusMsg, setStorageStatusMsg] = useState<{type: 'success' | 'error'; text: string} | null>(null);
  const [showCustomForm, setShowCustomForm] = useState(false);

  const refreshStorageStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/company/storage');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to load storage settings.');
      setStorageInfo(data);
    } catch {
      setStorageInfo(null);
      setStorageStatusMsg({type: 'error', text: 'Unable to refresh storage settings. Reopen this tab before changing storage.'});
    }
  }, []);

  useEffect(() => {
    if (tab === 'Data & retention' && isLive) {
      refreshStorageStatus();
    }
  }, [tab, isLive, refreshStorageStatus]);

  async function handleTestStorage() {
    if (!customCloudName.trim() || !customApiKey.trim() || !customApiSecret.trim()) {
      setStorageStatusMsg({type: 'error', text: 'Enter Cloud Name, API Key, and API Secret.'});
      return;
    }
    if (!storageAccountPassword) {
      setStorageStatusMsg({type: 'error', text: 'Enter your account login password to authorize verification.'});
      return;
    }
    setTestingStorage(true);
    setStorageStatusMsg(null);
    try {
      const res = await fetch('/api/company/storage/test', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          cloudName: customCloudName.trim(),
          apiKey: customApiKey.trim(),
          apiSecret: customApiSecret.trim(),
          accountPassword: storageAccountPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Verification failed.');
      setStorageStatusMsg({type: 'success', text: '✓ Cloudinary connection verified successfully!'});
    } catch (err: any) {
      setStorageStatusMsg({type: 'error', text: err.message || 'Verification failed.'});
    } finally {
      setTestingStorage(false);
    }
  }

  async function handleSaveCustomStorage() {
    if (savingStorage || resettingStorage || testingStorage) return;
    if (!Number.isSafeInteger(storageInfo?.storageSettingsVersion)) {
      await refreshStorageStatus();
      setStorageStatusMsg({type: 'error', text: 'Storage settings refreshed. Review the current connection, then submit again.'});
      return;
    }
    if (!customCloudName.trim() || !customApiKey.trim() || !customApiSecret.trim()) {
      setStorageStatusMsg({type: 'error', text: 'Enter Cloud Name, API Key, and API Secret.'});
      return;
    }
    if (!storageAccountPassword) {
      setStorageStatusMsg({type: 'error', text: 'Enter your account login password to authorize storage change.'});
      return;
    }
    setSavingStorage(true);
    setStorageStatusMsg(null);
    try {
      const res = await fetch('/api/company/storage', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          cloudName: customCloudName.trim(),
          apiKey: customApiKey.trim(),
          apiSecret: customApiSecret.trim(),
          accountPassword: storageAccountPassword,
          expectedVersion: storageInfo.storageSettingsVersion,
        }),
      });
      const data = await res.json();
      if (res.status === 409) {
        await refreshStorageStatus();
        throw new Error('Storage configuration changed. Review the refreshed connection and submit again. Your entries have been preserved.');
      }
      if (!res.ok) throw new Error(data.error || 'Failed to save storage settings.');
      notify('Custom Cloudinary storage activated for future uploads.');
      setStorageStatusMsg({type: 'success', text: '✓ Custom storage activated successfully!'});
      setCustomApiSecret('');
      setStorageAccountPassword('');
      setShowCustomForm(false);
      await refreshStorageStatus();
    } catch (err: any) {
      setStorageStatusMsg({type: 'error', text: err.message || 'Failed to save storage settings.'});
    } finally {
      setSavingStorage(false);
    }
  }

  async function handleResetToPlatform() {
    if (savingStorage || resettingStorage || testingStorage) return;
    if (!Number.isSafeInteger(storageInfo?.storageSettingsVersion)) {
      await refreshStorageStatus();
      setStorageStatusMsg({type: 'error', text: 'Storage settings refreshed. Review the current connection, then submit again.'});
      return;
    }
    if (!storageAccountPassword) {
      setStorageStatusMsg({type: 'error', text: 'Enter your account login password to authorize resetting storage.'});
      return;
    }
    setResettingStorage(true);
    setStorageStatusMsg(null);
    try {
      const res = await fetch('/api/company/storage', {
        method: 'DELETE',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({accountPassword: storageAccountPassword, expectedVersion: storageInfo.storageSettingsVersion}),
      });
      const data = await res.json();
      if (res.status === 409) {
        await refreshStorageStatus();
        throw new Error('Storage configuration changed. Review the refreshed connection and submit again. Your entries have been preserved.');
      }
      if (!res.ok) throw new Error(data.error || 'Failed to reset storage.');
      notify('Switched to platform storage for future uploads.');
      setStorageStatusMsg({type: 'success', text: '✓ Switched to platform storage for future uploads.'});
      setStorageAccountPassword('');
      await refreshStorageStatus();
    } catch (err: any) {
      setStorageStatusMsg({type: 'error', text: err.message || 'Failed to reset storage.'});
    } finally {
      setResettingStorage(false);
    }
  }

  useEffect(() => {
    setF({...state.settings});
  }, [state.settings]);

  useEffect(() => {
    if (openingStatus) {
      if (openingStatus.cutoffDate) setCutoffDate(openingStatus.cutoffDate);
      setDraftVersion(openingStatus.draftVersion || 0);
      setCashRupees((openingStatus.openingCashPaise || 0) / 100);
      setBankRupees((openingStatus.openingBankPaise || 0) / 100);
    }
  }, [openingStatus]);

  useEffect(() => {
    if (tab === 'Opening setup' && isLive) {
      Promise.all([
        fetchCustomersPage({limit: 100}),
        fetchSuppliersPage({limit: 100}),
        fetchProductsPage({limit: 100}),
      ]).then(([customers, suppliers, products]) => {
        setOpeningCustomers(customers.records);
        setOpeningSuppliers(suppliers.records);
        setOpeningProducts(products.records);
      }).catch(() => {});
      fetchOpeningDraftApi().then((draft) => {
        if (draft) {
          if (draft.cutoffDate) setCutoffDate(draft.cutoffDate);
          setCashRupees((draft.openingCashPaise || 0) / 100);
          setBankRupees((draft.openingBankPaise || 0) / 100);
          if (draft.draftVersion !== undefined) setDraftVersion(draft.draftVersion);
          if (Array.isArray(draft.draftReceivables)) {
            setDraftReceivables(
              draft.draftReceivables.map((r: any) => ({
                customerId: r.customerId || '',
                reference: r.reference || '',
                date: r.date || draft.cutoffDate || previousDate,
                amountRupees: (r.amountPaise || 0) / 100,
                notes: r.notes || '',
              }))
            );
          }
          if (Array.isArray(draft.draftPayables)) {
            setDraftPayables(
              draft.draftPayables.map((p: any) => ({
                supplierId: p.supplierId || '',
                reference: p.reference || '',
                date: p.date || draft.cutoffDate || previousDate,
                amountRupees: (p.amountPaise || 0) / 100,
                notes: p.notes || '',
              }))
            );
          }
          if (Array.isArray(draft.draftStockLots)) {
            setDraftStockLots(
              draft.draftStockLots.map((l: any) => ({
                productId: l.productId || '',
                batchNumber: l.batchNumber || '',
                receivedDate: l.receivedDate || draft.cutoffDate || previousDate,
                quantity: l.quantity !== undefined ? l.quantity : 1,
                unitCostRupees: (l.unitCostPaise || l.costPaise || 0) / 100,
                serialsText: Array.isArray(l.serials) ? l.serials.join(', ') : '',
              }))
            );
          }
        }
      });
    }
  }, [tab, isLive, fetchOpeningDraftApi, fetchCustomersPage, fetchSuppliersPage, fetchProductsPage, previousDate]);

  useEffect(() => {
    if (tab === 'Activity history' && isLive) {
      fetch('/api/master/audit')
        .then((r) => r.json())
        .then((data) => {
          if (data.records) setAuditList(data.records);
        })
        .catch(() => {});
    }
  }, [tab, isLive]);

  const set = (k: string, v: string) => setF((x) => ({...x, [k]: v}));

  async function handleSettingsSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (savingSettings) return;
    setSavingSettings(true);
    try {
      const saved = await saveSettingsApi(f, logoFile || undefined);
      if (saved) setLogoFile(null);
    } finally {
      setSavingSettings(false);
    }
  }

  // Reconciliation computations
  const totalCash = Number(cashRupees) || 0;
  const totalBank = Number(bankRupees) || 0;
  const totalReceivables = draftReceivables.reduce((acc, r) => acc + (Number(r.amountRupees) || 0), 0);
  const totalPayables = draftPayables.reduce((acc, p) => acc + (Number(p.amountRupees) || 0), 0);
  const totalStockValue = draftStockLots.reduce(
    (acc, l) => acc + (Number(l.quantity) || 0) * (Number(l.unitCostRupees) || 0),
    0
  );
  const netOpeningAssets = totalCash + totalBank + totalReceivables + totalStockValue - totalPayables;

  function buildDraftPayload() {
    return {
      cutoffDate,
      openingCashPaise: Math.round(totalCash * 100),
      openingBankPaise: Math.round(totalBank * 100),
      draftReceivables: draftReceivables
        .filter((r) => r.customerId && (Number(r.amountRupees) || 0) > 0)
        .map((r) => ({
          customerId: r.customerId,
          reference: r.reference || 'OPENING-REF',
          date: r.date || cutoffDate,
          amountPaise: Math.round((Number(r.amountRupees) || 0) * 100),
          notes: r.notes || '',
        })),
      draftPayables: draftPayables
        .filter((p) => p.supplierId && (Number(p.amountRupees) || 0) > 0)
        .map((p) => ({
          supplierId: p.supplierId,
          reference: p.reference || 'OPENING-BILL',
          date: p.date || cutoffDate,
          amountPaise: Math.round((Number(p.amountRupees) || 0) * 100),
          notes: p.notes || '',
        })),
      draftStockLots: draftStockLots
        .filter((l) => l.productId && (Number(l.quantity) || 0) > 0)
        .map((l) => {
          const serials = l.serialsText
            ? l.serialsText
                .split(/[\n,]+/)
                .map((s) => s.trim())
                .filter(Boolean)
            : [];
          return {
            productId: l.productId,
            batchNumber: l.batchNumber || undefined,
            receivedDate: l.receivedDate || cutoffDate,
            quantity: Number(l.quantity) || 1,
            unitCostPaise: Math.round((Number(l.unitCostRupees) || 0) * 100),
            serials,
          };
        }),
    };
  }

  async function handleSaveDraft() {
    setSavingDraft(true);
    try {
      const payload = buildDraftPayload();
      const result = await saveOpeningDraftApi(payload);
      if (result.success && result.draftVersion !== undefined) setDraftVersion(result.draftVersion);
    } finally {
      setSavingDraft(false);
    }
  }

  async function handleFinalize() {
    setFinalizing(true);
    try {
      // Always save draft first to guarantee backend has latest edited state
      const payload = buildDraftPayload();
      const draftSaved = await saveOpeningDraftApi(payload);
      if (!draftSaved.success) return;

      const success = await finalizeOpeningApi({expectedDraftVersion: draftSaved.draftVersion});
      if (success) {
        setFinalizeConfirm(false);
      }
    } finally {
      setFinalizing(false);
    }
  }

  const isFinalized = !!openingStatus?.isFinalized;
  const needsCutoffCorrection = isFinalized && cutoffDate >= today;

  async function handleCorrectCutoff() {
    setCorrectingCutoff(true);
    try {
      const response = await fetch('/api/master/opening/correct-cutoff', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          expectedCutoffDate: cutoffDate,
          newCutoffDate: previousDate,
          confirmation: true,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to correct the opening cutoff.');
      setCutoffDate(data.cutoffDate || previousDate);
      setCorrectCutoffConfirm(false);
      await refreshMasterData();
      notify(data.message || 'Opening cutoff corrected.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to correct the opening cutoff.');
    } finally {
      setCorrectingCutoff(false);
    }
  }

  return (
    <>
      <PageHead
        title="Settings"
        description={
          isLive
            ? `Live Company: ${companySession?.company?.name || state.settings.name} · Master data persisted to Atlas.`
            : 'Store details, document preferences and the rules for this demo workspace.'
        }
      />

      {isLive && (
        <div className="notice spaced" style={{backgroundColor: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534'}}>
          <strong>Live Company Account Active:</strong> You are logged into <b>{companySession?.company?.name}</b>.
          Master data, customers, suppliers, products, invoice templates and opening balances are saved directly to MongoDB Atlas.
          {businessDataMode === 'demo-imported' && <span> (Sample master data imported for evaluation).</span>}
        </div>
      )}

      <div className="tabs">
        {['Shop details', 'Opening setup', 'Users & access', 'Data & retention', 'Activity history'].map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Shop details' ? (
        <form onSubmit={handleSettingsSubmit}>
          <Card
            title="Shop and invoice details"
            actions={
              <Btn type="submit" disabled={savingSettings}>
                {savingSettings ? <Loader2 className="button-spinner" size={16} /> : <Save size={16} />}
                {savingSettings ? 'Saving changes…' : 'Save changes'}
              </Btn>
            }
          >
            <div className="form-body form-grid">
              {Object.entries({
                name: 'Shop name',
                phone: 'Contact phone',
                email: 'Email',
                address: 'Shop address',
                gst: 'GSTIN',
                state: 'State name',
                stateCode: 'GST state code',
                postalCode: 'Postal code',
                bank: 'Bank name / branch',
                account: 'Bank account number',
                ifsc: 'IFSC',
              }).map(([k, label]) => (
                <Field label={label} key={k}>
                  <input
                    required={k === 'name' || k === 'phone'}
                    value={f[k as keyof typeof f]}
                    onChange={(e) => set(k, e.target.value)}
                  />
                </Field>
              ))}
              <div className="full">
                <Field label="Invoice declaration">
                  <textarea value={f.declaration} onChange={(e) => set('declaration', e.target.value)} />
                </Field>
              </div>
              <Field label="Shop logo" hint={isLive ? 'Stored securely in private storage.' : 'Browser preview only.'}>
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      if (file.size > 5 * 1024 * 1024) {
                        notify('Use a logo smaller than 5 MB.');
                        return;
                      }
                      setLogoFile(file);
                      set('logo', URL.createObjectURL(file));
                    }
                  }}
                />
              </Field>
              {f.logo && (
                <img
                  src={f.logo}
                  alt="Store logo preview"
                  width={80}
                  height={80}
                  style={{objectFit: 'contain', border: '1px solid #e5e7eb', borderRadius: 4, padding: 4}}
                />
              )}
            </div>
          </Card>
          <div className="notice spaced">
            Invoice previews and PDF exports use these settings.
            {isLive ? ' Changes persist across sessions.' : ' Keep real credentials out of this mock workspace.'}
          </div>
        </form>
      ) : tab === 'Opening setup' ? (
        <div className="stack">
          <Card
            title="Onboarding & opening balance setup"
            actions={
              isFinalized ? (
                <Badge>Finalized & Locked</Badge>
              ) : (
                <Badge>Draft (Version {draftVersion})</Badge>
              )
            }
          >
            <div className="body-pad stack">
              {isFinalized ? (
                <>
                  <div className="notice" style={{backgroundColor: '#eff6ff', borderColor: '#bfdbfe', color: '#1e40af'}}>
                    <CheckCircle2 size={18} style={{display: 'inline', marginRight: 6, verticalAlign: 'text-bottom'}} />
                    <strong>Opening balances are finalized and locked.</strong> Cutoff date: <b>{cutoffDate}</b>. Opening
                    stock lots, serial units, receivables, payables, and cash/bank ledger entries are posted to your company ledger.
                  </div>
                  {needsCutoffCorrection && (
                    <div className="notice" style={{backgroundColor: '#fff7ed', borderColor: '#fdba74', color: '#9a3412'}}>
                      <AlertCircle size={18} style={{display: 'inline', marginRight: 6, verticalAlign: 'text-bottom'}} />
                      This cutoff prevents posting documents today. If no sales, purchases, receipts, payments, returns, service jobs,
                      stock holds or daily closings were recorded, correct it to <b>{previousDate}</b>.
                      <div style={{marginTop: 10}}>
                        <Btn secondary onClick={() => setCorrectCutoffConfirm(true)}>Correct cutoff to {previousDate}</Btn>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="notice">
                  <AlertCircle size={18} style={{display: 'inline', marginRight: 6, verticalAlign: 'text-bottom'}} />
                  Opening setup is currently in <b>Draft</b> status (v{draftVersion}). You can save drafts repeatedly without
                  affecting your live ledger or inventory. When finalized, the saved draft is atomically posted and locked permanently.
                </div>
              )}

              {/* 1. Base Cash, Bank & Cutoff */}
              <div className="form-grid spaced">
                <Field label="Opening Cutoff Date" hint={`Choose the last day before live operations. Posting begins the next day; latest allowed is ${previousDate}.`}>
                  <input
                    type="date"
                    disabled={isFinalized}
                    max={previousDate}
                    value={cutoffDate}
                    onChange={(e) => setCutoffDate(e.target.value)}
                  />
                </Field>
                <Field label="Opening Physical Cash (₹)" hint="Cash on hand at cutoff">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    disabled={isFinalized}
                    value={cashRupees}
                    onChange={(e) => setCashRupees(e.target.value === '' ? '' : +e.target.value)}
                  />
                </Field>
                <Field label="Opening Bank Balance (₹)" hint="Reconciled bank balance at cutoff">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    disabled={isFinalized}
                    value={bankRupees}
                    onChange={(e) => setBankRupees(e.target.value === '' ? '' : +e.target.value)}
                  />
                </Field>
              </div>

              {/* 2. Customer Receivables */}
              <div style={{marginTop: 20}}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8}}>
                  <strong>
                    <Receipt size={16} style={{display: 'inline', marginRight: 6, verticalAlign: 'text-bottom'}} />
                    Customer Opening Receivables ({draftReceivables.length})
                  </strong>
                  {!isFinalized && (
                    <Btn
                      secondary
                      onClick={() =>
                        setDraftReceivables([
                          ...draftReceivables,
                          {
                            customerId: openingCustomers[0]?.id || '',
                            reference: '',
                            date: cutoffDate,
                            amountRupees: '',
                            notes: '',
                          },
                        ])
                      }
                    >
                      <Plus size={14} /> Add receivable
                    </Btn>
                  )}
                </div>
                {draftReceivables.length > 0 ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Customer</th>
                          <th>Invoice / Ref No</th>
                          <th>Date</th>
                          <th>Amount (₹)</th>
                          <th>Notes</th>
                          {!isFinalized && <th style={{width: 40}} />}
                        </tr>
                      </thead>
                      <tbody>
                        {draftReceivables.map((r, i) => (
                          <tr key={i}>
                            <td>
                              {isFinalized ? (
                                openingCustomers.find((c) => c.id === r.customerId)?.name || r.customerId
                              ) : (
                                <select
                                  value={r.customerId}
                                  onChange={(e) => {
                                    const next = [...draftReceivables];
                                    next[i].customerId = e.target.value;
                                    setDraftReceivables(next);
                                  }}
                                >
                                  {openingCustomers.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.name} ({c.phone || c.id})
                                    </option>
                                  ))}
                                </select>
                              )}
                            </td>
                            <td>
                              {isFinalized ? (
                                r.reference
                              ) : (
                                <input
                                  placeholder="INV-001"
                                  value={r.reference}
                                  onChange={(e) => {
                                    const next = [...draftReceivables];
                                    next[i].reference = e.target.value;
                                    setDraftReceivables(next);
                                  }}
                                />
                              )}
                            </td>
                            <td>
                              {isFinalized ? (
                                r.date
                              ) : (
                                <input
                                  type="date"
                                  max={cutoffDate}
                                  value={r.date}
                                  onChange={(e) => {
                                    const next = [...draftReceivables];
                                    next[i].date = e.target.value;
                                    setDraftReceivables(next);
                                  }}
                                />
                              )}
                            </td>
                            <td>
                              {isFinalized ? (
                                money(Number(r.amountRupees) || 0)
                              ) : (
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  placeholder="0.00"
                                  value={r.amountRupees}
                                  onChange={(e) => {
                                    const next = [...draftReceivables];
                                    next[i].amountRupees = e.target.value === '' ? '' : +e.target.value;
                                    setDraftReceivables(next);
                                  }}
                                />
                              )}
                            </td>
                            <td>
                              {isFinalized ? (
                                r.notes
                              ) : (
                                <input
                                  placeholder="Optional note"
                                  value={r.notes || ''}
                                  onChange={(e) => {
                                    const next = [...draftReceivables];
                                    next[i].notes = e.target.value;
                                    setDraftReceivables(next);
                                  }}
                                />
                              )}
                            </td>
                            {!isFinalized && (
                              <td>
                                <button
                                  type="button"
                                  className="icon-btn"
                                  aria-label="Remove receivable"
                                  onClick={() => setDraftReceivables(draftReceivables.filter((_, idx) => idx !== i))}
                                >
                                  <Trash2 size={15} color="#ef4444" />
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="muted" style={{fontSize: '0.9rem'}}>
                    No opening customer dues entered. All customers will start with zero balance.
                  </p>
                )}
              </div>

              {/* 3. Supplier Payables */}
              <div style={{marginTop: 20}}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8}}>
                  <strong>
                    <Truck size={16} style={{display: 'inline', marginRight: 6, verticalAlign: 'text-bottom'}} />
                    Supplier Opening Payables ({draftPayables.length})
                  </strong>
                  {!isFinalized && (
                    <Btn
                      secondary
                      onClick={() =>
                        setDraftPayables([
                          ...draftPayables,
                          {
                            supplierId: openingSuppliers[0]?.id || '',
                            reference: '',
                            date: cutoffDate,
                            amountRupees: '',
                            notes: '',
                          },
                        ])
                      }
                    >
                      <Plus size={14} /> Add payable
                    </Btn>
                  )}
                </div>
                {draftPayables.length > 0 ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Supplier</th>
                          <th>Bill / Ref No</th>
                          <th>Date</th>
                          <th>Amount (₹)</th>
                          <th>Notes</th>
                          {!isFinalized && <th style={{width: 40}} />}
                        </tr>
                      </thead>
                      <tbody>
                        {draftPayables.map((p, i) => (
                          <tr key={i}>
                            <td>
                              {isFinalized ? (
                                openingSuppliers.find((s) => s.id === p.supplierId)?.name || p.supplierId
                              ) : (
                                <select
                                  value={p.supplierId}
                                  onChange={(e) => {
                                    const next = [...draftPayables];
                                    next[i].supplierId = e.target.value;
                                    setDraftPayables(next);
                                  }}
                                >
                                  {openingSuppliers.map((s) => (
                                    <option key={s.id} value={s.id}>
                                      {s.name} ({s.phone || s.id})
                                    </option>
                                  ))}
                                </select>
                              )}
                            </td>
                            <td>
                              {isFinalized ? (
                                p.reference
                              ) : (
                                <input
                                  placeholder="SUP-BILL-101"
                                  value={p.reference}
                                  onChange={(e) => {
                                    const next = [...draftPayables];
                                    next[i].reference = e.target.value;
                                    setDraftPayables(next);
                                  }}
                                />
                              )}
                            </td>
                            <td>
                              {isFinalized ? (
                                p.date
                              ) : (
                                <input
                                  type="date"
                                  max={cutoffDate}
                                  value={p.date}
                                  onChange={(e) => {
                                    const next = [...draftPayables];
                                    next[i].date = e.target.value;
                                    setDraftPayables(next);
                                  }}
                                />
                              )}
                            </td>
                            <td>
                              {isFinalized ? (
                                money(Number(p.amountRupees) || 0)
                              ) : (
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  placeholder="0.00"
                                  value={p.amountRupees}
                                  onChange={(e) => {
                                    const next = [...draftPayables];
                                    next[i].amountRupees = e.target.value === '' ? '' : +e.target.value;
                                    setDraftPayables(next);
                                  }}
                                />
                              )}
                            </td>
                            <td>
                              {isFinalized ? (
                                p.notes
                              ) : (
                                <input
                                  placeholder="Optional note"
                                  value={p.notes || ''}
                                  onChange={(e) => {
                                    const next = [...draftPayables];
                                    next[i].notes = e.target.value;
                                    setDraftPayables(next);
                                  }}
                                />
                              )}
                            </td>
                            {!isFinalized && (
                              <td>
                                <button
                                  type="button"
                                  className="icon-btn"
                                  aria-label="Remove payable"
                                  onClick={() => setDraftPayables(draftPayables.filter((_, idx) => idx !== i))}
                                >
                                  <Trash2 size={15} color="#ef4444" />
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="muted" style={{fontSize: '0.9rem'}}>
                    No opening supplier dues entered. All suppliers will start with zero balance.
                  </p>
                )}
              </div>

              {/* 4. Opening Stock & Serials */}
              <div style={{marginTop: 20}}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8}}>
                  <strong>
                    <Package size={16} style={{display: 'inline', marginRight: 6, verticalAlign: 'text-bottom'}} />
                    Opening Inventory Lots & Serials ({draftStockLots.length})
                  </strong>
                  {!isFinalized && (
                    <Btn
                      secondary
                      onClick={() =>
                        setDraftStockLots([
                          ...draftStockLots,
                          {
                            productId: openingProducts[0]?.id || '',
                            batchNumber: 'OPEN-01',
                            receivedDate: cutoffDate,
                            quantity: 1,
                            unitCostRupees: openingProducts[0]?.cost || '',
                            serialsText: '',
                          },
                        ])
                      }
                    >
                      <Plus size={14} /> Add stock lot
                    </Btn>
                  )}
                </div>
                {draftStockLots.length > 0 ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>Batch / Lot</th>
                          <th>Qty</th>
                          <th>Unit Cost (₹)</th>
                          <th>Total Value</th>
                          <th>Serial Numbers (if tracked)</th>
                          {!isFinalized && <th style={{width: 40}} />}
                        </tr>
                      </thead>
                      <tbody>
                        {draftStockLots.map((l, i) => {
                          const prod = openingProducts.find((p) => p.id === l.productId);
                          const isSerialTracked = !!prod?.isSerialTracked;
                          const lineVal = (Number(l.quantity) || 0) * (Number(l.unitCostRupees) || 0);

                          return (
                            <tr key={i}>
                              <td>
                                {isFinalized ? (
                                  prod?.name || l.productId
                                ) : (
                                  <select
                                    value={l.productId}
                                    onChange={(e) => {
                                      const next = [...draftStockLots];
                                      const selectedP = openingProducts.find((p) => p.id === e.target.value);
                                      next[i].productId = e.target.value;
                                      if (selectedP && next[i].unitCostRupees === '') {
                                        next[i].unitCostRupees = selectedP.cost || 0;
                                      }
                                      setDraftStockLots(next);
                                    }}
                                  >
                                    {openingProducts.map((p) => (
                                      <option key={p.id} value={p.id}>
                                        {p.name} {p.isSerialTracked ? ' [Serial Tracked]' : ''}
                                      </option>
                                    ))}
                                  </select>
                                )}
                              </td>
                              <td>
                                {isFinalized ? (
                                  l.batchNumber || '—'
                                ) : (
                                  <input
                                    placeholder="LOT-01"
                                    value={l.batchNumber || ''}
                                    onChange={(e) => {
                                      const next = [...draftStockLots];
                                      next[i].batchNumber = e.target.value;
                                      setDraftStockLots(next);
                                    }}
                                  />
                                )}
                              </td>
                              <td>
                                {isFinalized ? (
                                  l.quantity
                                ) : (
                                  <input
                                    type="number"
                                    min="1"
                                    style={{width: 70}}
                                    value={l.quantity}
                                    onChange={(e) => {
                                      const next = [...draftStockLots];
                                      next[i].quantity = e.target.value === '' ? '' : +e.target.value;
                                      setDraftStockLots(next);
                                    }}
                                  />
                                )}
                              </td>
                              <td>
                                {isFinalized ? (
                                  money(Number(l.unitCostRupees) || 0)
                                ) : (
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    style={{width: 100}}
                                    placeholder="0.00"
                                    value={l.unitCostRupees}
                                    onChange={(e) => {
                                      const next = [...draftStockLots];
                                      next[i].unitCostRupees = e.target.value === '' ? '' : +e.target.value;
                                      setDraftStockLots(next);
                                    }}
                                  />
                                )}
                              </td>
                              <td>
                                <b>{money(lineVal)}</b>
                              </td>
                              <td>
                                {isSerialTracked ? (
                                  isFinalized ? (
                                    l.serialsText || '—'
                                  ) : (
                                    <input
                                      placeholder={`Enter ${l.quantity || 1} serials (comma-separated)`}
                                      value={l.serialsText || ''}
                                      onChange={(e) => {
                                        const next = [...draftStockLots];
                                        next[i].serialsText = e.target.value;
                                        setDraftStockLots(next);
                                      }}
                                    />
                                  )
                                ) : (
                                  <small className="muted">Not serial tracked</small>
                                )}
                              </td>
                              {!isFinalized && (
                                <td>
                                  <button
                                    type="button"
                                    className="icon-btn"
                                    aria-label="Remove stock lot"
                                    onClick={() => setDraftStockLots(draftStockLots.filter((_, idx) => idx !== i))}
                                  >
                                    <Trash2 size={15} color="#ef4444" />
                                  </button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="muted" style={{fontSize: '0.9rem'}}>
                    No opening inventory entered. Stock will begin at 0 for all items.
                  </p>
                )}
              </div>

              {/* 5. Financial Reconciliation Summary Card */}
              <div
                style={{
                  marginTop: 24,
                  padding: 16,
                  borderRadius: 8,
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                }}
              >
                <h4 style={{margin: '0 0 12px 0'}}>Opening Balance Reconciliation</h4>
                <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12}}>
                  <div>
                    <small className="muted">Physical Cash</small>
                    <div style={{fontWeight: 600, fontSize: '1.1rem'}}>{money(totalCash)}</div>
                  </div>
                  <div>
                    <small className="muted">Bank Balance</small>
                    <div style={{fontWeight: 600, fontSize: '1.1rem'}}>{money(totalBank)}</div>
                  </div>
                  <div>
                    <small className="muted">Customer Receivables</small>
                    <div style={{fontWeight: 600, fontSize: '1.1rem', color: '#16a34a'}}>{money(totalReceivables)}</div>
                  </div>
                  <div>
                    <small className="muted">Opening Stock Value</small>
                    <div style={{fontWeight: 600, fontSize: '1.1rem'}}>{money(totalStockValue)}</div>
                  </div>
                  <div>
                    <small className="muted">Supplier Payables</small>
                    <div style={{fontWeight: 600, fontSize: '1.1rem', color: '#dc2626'}}>{money(totalPayables)}</div>
                  </div>
                  <div>
                    <small className="muted">Net Opening Working Capital</small>
                    <div style={{fontWeight: 700, fontSize: '1.2rem', color: '#4f46e5'}}>
                      {money(netOpeningAssets)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions: Save Draft & Finalize */}
              {!isFinalized && isLive && (
                <div className="form-actions" style={{marginTop: 20}}>
                  <Btn secondary disabled={savingDraft} onClick={handleSaveDraft}>
                    <Save size={16} /> {savingDraft ? 'Saving draft…' : 'Save draft'}
                  </Btn>
                  <Btn onClick={() => setFinalizeConfirm(true)}>
                    <LockKeyhole size={16} /> Finalize opening setup
                  </Btn>
                </div>
              )}

              {!isFinalized && isLive && openingCustomers.length === 0 && openingProducts.length === 0 && (
                <div style={{marginTop: 24, paddingTop: 16, borderTop: '1px solid #e5e7eb'}}>
                  <h4>Quick Onboarding Option</h4>
                  <p className="muted" style={{marginBottom: 12}}>
                    Want to test the full system with realistic computer store data? You can import sample master data
                    (customers, suppliers, products with serials, services, templates, and opening draft balances).
                  </p>
                  <Btn secondary onClick={importDemoMasterDataApi}>
                    <FileSpreadsheet size={16} /> Import sample master data & draft
                  </Btn>
                </div>
              )}
            </div>
          </Card>

          <Card title="Opening balance policy (D-003)">
            <ul className="plain-list body-pad">
              <li>
                <strong>Draft:</strong> Editable at any time. Creates zero stock or ledger records until reviewed.
              </li>
              <li>
                <strong>Finalization:</strong> Runs once in a single atomic transaction, locking opening balances to the selected cutoff date.
              </li>
              <li>
                <strong>Receivables & Payables:</strong> Stored as individual allocatable records for future settlement, not mutable balance counters.
              </li>
              <li>
                <strong>Serials:</strong> Each opening serial is tracked in <code>serialUnits</code> linked to an opening lot.
              </li>
              <li>
                <strong>Cash & Bank:</strong> Cash and bank balances create opening ledger events in <code>accountMovements</code>.
              </li>
              <li>
                <strong>Post-Closing:</strong> After finalization, all adjustments require current-day audited adjustment records.
              </li>
            </ul>
          </Card>
        </div>
      ) : tab === 'Users & access' ? (
        <div className="detail-grid">
          <Card title="Company users">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Access</th>
                  </tr>
                </thead>
                <tbody>
                  {isLive && companySession?.user ? (
                    <tr>
                      <td>{companySession.user.name || 'Company User'}</td>
                      <td>{companySession.user.email}</td>
                      <td>
                        <Badge>Operator</Badge>
                      </td>
                      <td>All company screens & master records</td>
                    </tr>
                  ) : (
                    <>
                      <tr>
                        <td>Ramesh Kumar</td>
                        <td>ramesh@itech.local</td>
                        <td>
                          <Badge>Owner</Badge>
                        </td>
                        <td>All screens and profit totals</td>
                      </tr>
                      <tr>
                        <td>Nithish</td>
                        <td>nithish@itech.local</td>
                        <td>
                          <Badge>Staff</Badge>
                        </td>
                        <td>Operations and individual profit entry</td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
          <Card title="Security & permissions">
            <div className="body-pad">
              <div className="notice">
                {isLive
                  ? 'Authenticated session bound to your verified company tenant.'
                  : 'Demo role switch simulation. Sign in to your company account to access live data.'}
              </div>
              <ul className="plain-list">
                <li>Operator-approved account required before login.</li>
                <li>Tenant identity derived exclusively from the verified server session.</li>
                <li>Aggregate profit totals protected by a separate profit password.</li>
              </ul>
            </div>
          </Card>
        </div>
      ) : tab === 'Data & retention' ? (
        <div className="detail-grid">
          <Card title="Records & export">
            <div className="body-pad stack">
              <div className="notice">All records are retained. There is no automatic deletion rule.</div>
              <Btn
                secondary
                onClick={async () => {
                  if (isLive) {
                    const res = await fetch('/api/master/export');
                    const data = await res.json();
                    download(
                      'itech-master-export.json',
                      new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'})
                    );
                  } else {
                    const exported = {
                      ...state,
                      attachments: state.attachments.map((a) => ({...a, url: ''})),
                      jobs: state.jobs.map((j) => ({...j, photos: []})),
                      settings: {...state.settings, logo: ''},
                    };
                    download(
                      'itech-demo-snapshot.json',
                      new Blob([JSON.stringify(exported, null, 2)], {type: 'application/json'})
                    );
                  }
                }}
              >
                <Download size={16} />
                {isLive ? 'Export company master data (JSON)' : 'Export demo snapshot'}
              </Btn>
              <Btn
                secondary
                onClick={() => {
                  const a = document.createElement('a');
                  a.href = URL.createObjectURL(
                    new Blob(['[InternetShortcut]\nURL=' + location.origin], {type: 'text/plain'})
                  );
                  a.download = 'iTech Store.url';
                  a.click();
                  notify('Desktop shortcut downloaded. Keep the local server running.');
                }}
              >
                <Monitor size={16} />
                Download desktop shortcut
              </Btn>
              {!isLive && (
                <Btn danger onClick={() => setReset(true)}>
                  Reset mock data
                </Btn>
              )}
            </div>
          </Card>
          <Card title="Cloud & private storage configuration">
            <div className="body-pad stack">
              <div className="notice">
                Company logos, service repair photos, invoice PDFs, and warranty evidence are stored in secure private storage with authenticated access.
              </div>

              <div style={{display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.875rem'}}>
                <div style={{display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e5e7eb', paddingBottom: '4px'}}>
                  <span style={{fontWeight: 600}}>Active Storage Provider</span>
                  <span>{storageInfo?.provider || (isLive ? 'Platform Managed Cloud Storage' : 'Browser Memory / Demo')}</span>
                </div>
                <div style={{display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e5e7eb', paddingBottom: '4px'}}>
                  <span style={{fontWeight: 600}}>Storage Destination</span>
                  <span>{storageInfo?.safeLabel || 'Platform Default Storage'}</span>
                </div>
                <div style={{display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e5e7eb', paddingBottom: '4px'}}>
                  <span style={{fontWeight: 600}}>Configuration Status</span>
                  <Badge>{storageInfo?.configured || storageInfo?.isConfigured ? 'Configured & Active' : (isLive ? 'Configured & Active' : 'Demo Mode')}</Badge>
                </div>
                <div style={{display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e5e7eb', paddingBottom: '4px'}}>
                  <span style={{fontWeight: 600}}>Delivery & Access Gate</span>
                  <span style={{color: '#166534', fontWeight: 600}}>✓ Authenticated & Session-Gated</span>
                </div>
                <div style={{display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e5e7eb', paddingBottom: '4px'}}>
                  <span style={{fontWeight: 600}}>Max File Size</span>
                  <span>5 MB (Direct signed upload)</span>
                </div>
                <div style={{display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e5e7eb', paddingBottom: '4px'}}>
                  <span style={{fontWeight: 600}}>Allowed Formats</span>
                  <span>PNG, JPEG, WebP, PDF</span>
                </div>
                {storageInfo?.lastVerifiedAt && (
                  <div style={{display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e5e7eb', paddingBottom: '4px'}}>
                    <span style={{fontWeight: 600}}>Last Verified At</span>
                    <span>{new Date(storageInfo.lastVerifiedAt).toLocaleString('en-IN')}</span>
                  </div>
                )}
              </div>

              {isLive && (
                <div style={{marginTop: 16, paddingTop: 16, borderTop: '1px solid #e5e7eb'}}>
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12}}>
                    <div>
                      <h4 style={{margin: 0}}>Custom Cloudinary Storage (Optional)</h4>
                      <small className="muted">Use your own Cloudinary account for complete data ownership and private storage.</small>
                    </div>
                    <Btn secondary onClick={() => setShowCustomForm(!showCustomForm)}>
                      {showCustomForm ? 'Close form' : storageInfo?.isCustom ? 'Modify custom storage' : 'Connect custom account'}
                    </Btn>
                  </div>

                  {storageStatusMsg && (
                    <div
                      className="notice"
                      style={{
                        marginBottom: 12,
                        backgroundColor: storageStatusMsg.type === 'success' ? '#f0fdf4' : '#fef2f2',
                        borderColor: storageStatusMsg.type === 'success' ? '#bbf7d0' : '#fecaca',
                        color: storageStatusMsg.type === 'success' ? '#166534' : '#991b1b',
                      }}
                    >
                      {storageStatusMsg.text}
                    </div>
                  )}

                  {storageInfo?.isCustom && !showCustomForm && (
                    <div style={{padding: 12, backgroundColor: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0', marginBottom: 12}}>
                      <div style={{marginBottom: 8, fontSize: '0.875rem'}}>
                        Currently uploading to custom Cloudinary account: <b>{storageInfo.cloudName}</b>.
                      </div>
                      <p className="muted" style={{fontSize: '0.8rem', margin: '0 0 12px 0'}}>
                        <b>Notice:</b> Resetting to platform storage only changes the destination for future uploads. Previously uploaded files remain safely accessible in their original Cloudinary account.
                      </p>
                      <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
                        <input
                          type="password"
                          placeholder="Account login password"
                          value={storageAccountPassword}
                          onChange={(e) => setStorageAccountPassword(e.target.value)}
                          style={{maxWidth: 240}}
                        />
                        <Btn secondary disabled={resettingStorage} onClick={handleResetToPlatform}>
                          {resettingStorage ? 'Resetting…' : 'Use platform storage for future uploads'}
                        </Btn>
                      </div>
                    </div>
                  )}

                  {showCustomForm && (
                    <div style={{background: '#f8fafc', padding: 16, borderRadius: 8, border: '1px solid #e2e8f0'}}>
                      <p className="muted" style={{fontSize: '0.85rem', margin: '0 0 12px 0'}}>
                        Enter your Cloudinary developer API credentials. The API secret is encrypted server-side with AES-256-GCM and never exposed.
                      </p>
                      <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 12}}>
                        <div>
                          <label style={{display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4}}>Cloud Name</label>
                          <input
                            placeholder="e.g. my-store-cloud"
                            value={customCloudName}
                            onChange={(e) => setCustomCloudName(e.target.value)}
                          />
                        </div>
                        <div>
                          <label style={{display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4}}>API Key</label>
                          <input
                            placeholder="e.g. 123456789012345"
                            value={customApiKey}
                            onChange={(e) => setCustomApiKey(e.target.value)}
                          />
                        </div>
                        <div>
                          <label style={{display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4}}>API Secret (Write-only)</label>
                          <input
                            type="password"
                            placeholder="••••••••••••••••"
                            value={customApiSecret}
                            onChange={(e) => setCustomApiSecret(e.target.value)}
                          />
                        </div>
                        <div>
                          <label style={{display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4}}>Account Login Password (Reauthentication)</label>
                          <input
                            type="password"
                            placeholder="Your account password"
                            value={storageAccountPassword}
                            onChange={(e) => setStorageAccountPassword(e.target.value)}
                          />
                        </div>
                      </div>

                      <div style={{display: 'flex', gap: 8}}>
                        <Btn secondary disabled={testingStorage || savingStorage} onClick={handleTestStorage}>
                          {testingStorage ? 'Verifying connection…' : 'Test connection'}
                        </Btn>
                        <Btn disabled={testingStorage || savingStorage} onClick={handleSaveCustomStorage}>
                          {savingStorage ? 'Saving…' : 'Save & activate custom storage'}
                        </Btn>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>
          <Card title="Scope & architecture">
            <ul className="plain-list body-pad">
              <li>Phase 2: Master data, settings, serial tracking, templates and opening setup.</li>
              <li>Multi-tenant architecture with MongoDB Atlas database isolation.</li>
              <li>Strict tenant scoping: cross-company references return 404.</li>
              <li>Money stored as integer paise (minor units) to prevent rounding errors.</li>
              <li>Soft archival preserves financial history.</li>
            </ul>
          </Card>
        </div>
      ) : (
        <Card title="Activity & audit history">
          <div className="timeline">
            {(isLive && auditList.length > 0 ? auditList : state.audit).map((a: any) => (
              <div key={a._id || a.id}>
                <strong>{a.action}</strong>
                <p>{a.detail}</p>
                {a.timestamp && (
                  <small style={{color: '#6b7280'}}>{new Date(a.timestamp).toLocaleString('en-IN')}</small>
                )}
              </div>
            ))}
            {!(isLive && auditList.length > 0 ? auditList : state.audit).length && (
              <p>No recorded changes yet. Update company details or add master records to see activity here.</p>
            )}
          </div>
        </Card>
      )}

      {finalizeConfirm && (
        <Modal title="Finalize opening balances?" onClose={() => setFinalizeConfirm(false)}>
          <div className="form-body stack">
            <p>
              Finalizing will post the following opening records to your company ledger as of <b>{cutoffDate}</b>:
            </p>
            <ul className="plain-list" style={{background: '#f8fafc', padding: 12, borderRadius: 6}}>
              <li>Physical Cash: <b>{money(totalCash)}</b></li>
              <li>Bank Balance: <b>{money(totalBank)}</b></li>
              <li>Customer Receivables: <b>{money(totalReceivables)}</b> ({draftReceivables.filter((r) => r.customerId).length} records)</li>
              <li>Supplier Payables: <b>{money(totalPayables)}</b> ({draftPayables.filter((p) => p.supplierId).length} records)</li>
              <li>Inventory Lots: <b>{money(totalStockValue)}</b> ({draftStockLots.filter((l) => l.productId).length} lots)</li>
              <li style={{marginTop: 6, paddingTop: 6, borderTop: '1px solid #e2e8f0'}}>
                Net Opening Working Capital: <b>{money(netOpeningAssets)}</b>
              </li>
            </ul>
            <p style={{color: '#b91c1c', fontSize: '0.9rem'}}>
              <strong>Important:</strong> Once finalized, opening balances become permanently read-only and locked.
              Any future stock or cash movements must be recorded through audited business adjustments.
            </p>
          </div>
          <div className="form-actions">
            <Btn secondary disabled={finalizing} onClick={() => setFinalizeConfirm(false)}>
              Cancel
            </Btn>
            <Btn disabled={finalizing} onClick={handleFinalize}>
              <LockKeyhole size={16} /> {finalizing ? 'Finalizing…' : 'Confirm & finalize'}
            </Btn>
          </div>
        </Modal>
      )}

      {correctCutoffConfirm && (
        <Modal title="Correct opening cutoff?" onClose={() => !correctingCutoff && setCorrectCutoffConfirm(false)}>
          <div className="form-body stack">
            <p>
              This will move the opening cutoff from <b>{cutoffDate}</b> to <b>{previousDate}</b> and re-date only opening
              balance records that are later than the corrected cutoff.
            </p>
            <div className="notice" style={{backgroundColor: '#fff7ed', borderColor: '#fdba74', color: '#9a3412'}}>
              The server will refuse this correction if any operational sale, purchase bill, receipt, payment, return,
              service job, stock hold, stock movement or daily closing exists.
            </div>
          </div>
          <div className="form-actions">
            <Btn secondary disabled={correctingCutoff} onClick={() => setCorrectCutoffConfirm(false)}>Cancel</Btn>
            <Btn disabled={correctingCutoff} onClick={handleCorrectCutoff}>
              {correctingCutoff ? 'Correcting…' : 'Confirm correction'}
            </Btn>
          </div>
        </Modal>
      )}

      {reset && (
        <Modal title="Reset this demo workspace?" onClose={() => setReset(false)}>
          <div className="form-body">
            <p>This removes your current mock changes and restores the sample records. No real records are affected.</p>
          </div>
          <div className="form-actions">
            <Btn secondary onClick={() => setReset(false)}>
              Keep my changes
            </Btn>
            <Btn
              danger
              onClick={() => {
                setState(structuredClone(seed));
                setF({...seed.settings});
                notify('Original mock data restored.');
                setReset(false);
              }}
            >
              Reset demo
            </Btn>
          </div>
        </Modal>
      )}
    </>
  );
}
