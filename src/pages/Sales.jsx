import { useState, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useReactToPrint } from 'react-to-print';
import { FaSearch, FaTrash, FaPlus, FaMinus, FaShoppingCart, FaPrint, FaCheckCircle, FaPause, FaLayerGroup, FaTimes, FaUserShield } from 'react-icons/fa';
import productService from '../services/product.service';
import saleService from '../services/sale.service';
import settingsService from '../services/settings.service';
import useCartStore from '../store/cartStore';
import useAuthStore from '../store/authStore';
import Receipt from '../components/sales/Receipt';
import Modal from '../components/common/Modal';
import offlineQueue from '../utils/offlineQueue';

const PAYMENT_METHODS = ['cash', 'card', 'bank_transfer'];
const DISCOUNT_REASONS = ['Bargain', 'Regular customer', 'Damaged / defect', 'Staff purchase', 'Other'];

function Sales() {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  // Single line ([{method, amount}]) covers the common case (amount is
  // implicitly the full total). Split-tender adds more lines with editable
  // amounts — see startSplit/addPaymentLine below.
  const [payments, setPayments] = useState([{ method: 'cash', amount: '' }]);
  const [cashReceived, setCashReceived] = useState('');
  const [processing, setProcessing] = useState(false);
  const [completedSale, setCompletedSale] = useState(null);
  const [showHeldList, setShowHeldList] = useState(false);
  // Discount control: per-role limits + who can approve (from settings), the
  // manager approval for this checkout (if any), and the cashier's reason.
  const [discountSettings, setDiscountSettings] = useState({ limits: {}, approvers: [] });
  const [approval, setApproval] = useState(null); // { token, approverName, percent }
  const [showApproval, setShowApproval] = useState(false);
  const [discountReason, setDiscountReason] = useState('');
  const user = useAuthStore((state) => state.user);

  const receiptRef = useRef();
  const searchInputRef = useRef(null);
  // Stays the same across retries of one checkout attempt (network timeout, etc.)
  // so a resubmission is recognized server-side as a replay, not a new sale.
  // Only regenerated after a sale actually completes or the cart is cleared.
  const idempotencyKeyRef = useRef(crypto.randomUUID());

  const {
    items, addItem, increaseQty, decreaseQty, removeItem,
    setItemDiscountType, setItemDiscountValue,
    getItemDiscount, getItemLineTotal,
    getItemPromoDiscount, getItemBargainDiscount,
    billDiscountType, billDiscountValue, setBillDiscountType, setBillDiscountValue,
    getBillDiscount, getItemCashierPercent, getMaxCashierPercent,
    clearCart, getSubtotal, getTotal, getTotalDiscount, getItemCount,
    heldCarts, holdCart, resumeCart, discardHeldCart,
  } = useCartStore();

  useEffect(() => {
    settingsService.getDiscount()
      .then((res) => setDiscountSettings(res.data))
      .catch(() => toast.error('Could not load discount limits.'));
  }, []);

  // Cashier discount (bargain + bill) vs. this user's limit. Above it the
  // sale needs a manager PIN; an approval only covers up to its own %.
  const myLimit = Number(discountSettings.limits[user?.role] ?? 0);
  const maxCashierPercent = getMaxCashierPercent();
  const overLimit = maxCashierPercent > myLimit + 0.01;
  const approvalCovers = !!approval && approval.percent + 0.01 >= maxCashierPercent;

  const handlePrint = useReactToPrint({
    contentRef: receiptRef,
  });

  // Keeps the cursor in the search box so the next barcode scan lands there —
  // otherwise the scanner's Enter "clicks" whatever button was last clicked.
  // The old text is selected (not cleared) so the results stay clickable but
  // a scan replaces it instead of being appended to it.
  const focusSearch = () => {
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
  };

  // Every search gets a sequence number; only the latest one may update the
  // results, so a slow response can't overwrite a newer search or a scan.
  const searchSeqRef = useRef(0);
  const searchTimerRef = useRef(null);

  const runSearch = async (term) => {
    const seq = ++searchSeqRef.current;
    setSearching(true);
    try {
      const res = await productService.search(term);
      if (seq === searchSeqRef.current) setResults(res.data);
    } catch {
      if (seq === searchSeqRef.current) toast.error('Search failed.');
    } finally {
      if (seq === searchSeqRef.current) setSearching(false);
    }
  };

  const cancelPendingSearch = () => {
    clearTimeout(searchTimerRef.current);
    searchSeqRef.current++;
    setSearching(false);
  };

  useEffect(() => () => clearTimeout(searchTimerRef.current), []);

  const handleSearch = (e) => {
    const term = e.target.value;
    setSearchTerm(term);
    clearTimeout(searchTimerRef.current);
    if (term.trim().length < 1) {
      cancelPendingSearch();
      setResults([]);
      return;
    }
    // Debounced — a scanner types a whole barcode in a few ms.
    searchTimerRef.current = setTimeout(() => runSearch(term.trim()), 250);
  };

  const handleBarcodeScan = async (e) => {
    if (e.key !== 'Enter') return;
    const code = searchTerm.trim();
    if (!code) return;
    cancelPendingSearch();

    try {
      const res = await productService.getByBarcode(code);
      handleAddToCart(res.data);
      setSearchTerm('');
      setResults([]);
      return;
    } catch (err) {
      if (err.response?.status !== 404) {
        toast.error(err.response?.data?.message || 'Lookup failed.');
        return;
      }
    }

    // Not a barcode — treat Enter as "search by name" instead of wiping
    // what the cashier typed.
    const seq = ++searchSeqRef.current;
    try {
      const res = await productService.search(code);
      if (seq !== searchSeqRef.current) return;
      if (res.data.length === 1) {
        handleAddToCart(res.data[0]);
        setSearchTerm('');
        setResults([]);
      } else if (res.data.length > 1) {
        setResults(res.data);
        toast('Several matches — click the right one.', { icon: '👆' });
      } else {
        toast.error('No product or barcode matches that.');
        setSearchTerm('');
        setResults([]);
      }
    } catch {
      toast.error('Search failed.');
    }
  };

  const handleShowAll = () => {
    clearTimeout(searchTimerRef.current);
    setSearchTerm('');
    runSearch('');
    focusSearch();
  };

  const handleAddToCart = (product) => {
    if (product.stock_quantity < 1) {
      toast.error('Out of stock.');
      return;
    }
    addItem(product);
    toast.success(`${product.product_name} added.`);
    focusSearch();
  };

  // ─── Split-tender payment helpers ─────────────────
  const isSplit = payments.length > 1;
  const total = getTotal();
  const paymentsTotal = isSplit
    ? payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
    : total;
  const remaining = Math.round((total - paymentsTotal) * 100) / 100;
  const cashLine = payments.find((p) => p.method === 'cash');
  const cashDue = isSplit ? (Number(cashLine?.amount) || 0) : total;
  const change = Number(cashReceived) - cashDue;

  const setSinglePaymentMethod = (method) => setPayments([{ method, amount: '' }]);

  const startSplit = () => {
    const first = payments[0].method;
    const second = PAYMENT_METHODS.find((m) => m !== first) || 'card';
    setPayments([
      { method: first, amount: total.toFixed(2) },
      { method: second, amount: '0' },
    ]);
  };

  const addPaymentLine = () => {
    const used = new Set(payments.map((p) => p.method));
    const nextMethod = PAYMENT_METHODS.find((m) => !used.has(m)) || PAYMENT_METHODS[0];
    setPayments([...payments, { method: nextMethod, amount: remaining > 0 ? remaining.toFixed(2) : '0' }]);
  };

  const updatePaymentLine = (index, field, value) => {
    setPayments(payments.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
  };

  const removePaymentLine = (index) => {
    if (payments.length <= 2) {
      // Dropping back to one line — return to simple (non-split) mode.
      const kept = payments.filter((_, i) => i !== index)[0];
      setPayments([{ method: kept.method, amount: '' }]);
      return;
    }
    setPayments(payments.filter((_, i) => i !== index));
  };

  const handleHold = () => {
    if (items.length === 0) {
      toast.error('Cart is empty — nothing to hold.');
      return;
    }
    holdCart();
    setApproval(null);
    setDiscountReason('');
    toast.success('Sale held. Resume it from "Held Sales".');
    setSearchTerm('');
    setResults([]);
  };

  const handleResumeHeld = (id) => {
    if (items.length > 0 && !window.confirm('Resume this held sale? Your current cart will be replaced.')) {
      return;
    }
    resumeCart(id);
    setApproval(null);
    setShowHeldList(false);
    toast.success('Held sale resumed.');
  };

  // ─── Keyboard shortcuts: F2 search, F4 hold, F9 checkout ──
  useEffect(() => {
    const handleKey = (e) => {
      if (showApproval) return; // PIN dialog open — don't checkout/hold underneath it
      if (e.key === 'F2') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'F4') {
        e.preventDefault();
        handleHold();
      } else if (e.key === 'F9') {
        e.preventDefault();
        handleCheckout();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  });

  // approvalOverride: the approval just granted in the PIN dialog (state
  // hasn't updated yet when checkout continues straight after it).
  const handleCheckout = async (approvalOverride) => {
    const activeApproval = approvalOverride || approval;
    if (items.length === 0) {
      toast.error('Cart is empty.');
      return;
    }
    if (overLimit && !(activeApproval && activeApproval.percent + 0.01 >= maxCashierPercent)) {
      setShowApproval(true);
      return;
    }
    if (isSplit && Math.abs(remaining) > 0.01) {
      toast.error(`Payments must add up to the total. Remaining: Rs. ${remaining.toLocaleString()}`);
      return;
    }
    if (cashLine && Number(cashReceived) < cashDue) {
      toast.error('Cash received is less than the cash amount due.');
      return;
    }
    setProcessing(true);

    const saleData = {
      idempotencyKey: idempotencyKeyRef.current,
      subtotal: getSubtotal(),
      discountAmount: getTotalDiscount(),
      taxAmount: 0,
      total: total,
      items: items.map((i) => ({
        variantId: i.variantId,
        quantity: i.quantity,
        // unitPrice/promo/lineTotal are recomputed server-side from the product's
        // own price and promo config — only the cashier's own bargain discount is
        // actually client input, so that's all we send.
        discountType: i.discountValue ? i.discountType : null,
        discountValue: i.discountValue || 0,
      })),
      billDiscountType: billDiscountValue ? billDiscountType : null,
      billDiscountValue: billDiscountValue || 0,
      discountReason: discountReason || null,
      approvalToken: activeApproval?.token || null,
      payments: payments.map((p) => ({
        method: p.method,
        amount: isSplit ? (Number(p.amount) || 0) : total,
        reference: null,
      })),
    };

    try {
      const res = await saleService.create(saleData);
      const fullSale = await saleService.getById(res.data.id);
      const saleForReceipt = {
        ...fullSale.data,
        cashReceived: cashLine ? Number(cashReceived) : null,
        change: cashLine ? change : null,
      };
      setCompletedSale(saleForReceipt);
      toast.success('Sale completed!');
      clearCart();
      setApproval(null);
      setDiscountReason('');
      idempotencyKeyRef.current = crypto.randomUUID();
      setPayments([{ method: 'cash', amount: '' }]);
      setCashReceived('');
      setSearchTerm('');
      setResults([]);
    } catch (err) {
      if (!err.response) {
        // The request never reached the server at all (offline/unreachable) —
        // distinct from a 4xx/5xx business rejection, which the server DID see
        // and should be surfaced normally instead of silently retried.
        offlineQueue.enqueue(saleData);
        toast.error('No connection — sale saved and will sync automatically once you\'re back online.');
      } else if (err.response?.data?.code === 'DISCOUNT_APPROVAL_REQUIRED') {
        // Server says the approval is missing/insufficient (e.g. limits changed).
        setApproval(null);
        toast.error(err.response.data.message);
        setShowApproval(true);
      } else {
        toast.error(err.response?.data?.message || 'Sale failed.');
      }
    } finally {
      setProcessing(false);
    }
  };

  const startNewSale = () => setCompletedSale(null);

  const subtotal = getSubtotal();
  const totalDiscount = getTotalDiscount();

  // ─── SUCCESS / RECEIPT VIEW ───────────────────────
  if (completedSale) {
    return (
      <div className="flex flex-col items-center justify-center h-screen p-6">
        <FaCheckCircle className="text-green-500 text-6xl mb-4" />
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Sale Completed!</h2>
        <p className="text-slate-500 mb-6">Total: Rs. {Number(completedSale.total).toLocaleString()}</p>
        <div style={{ display: 'none' }}>
          <Receipt ref={receiptRef} sale={completedSale} />
        </div>
        <div className="flex gap-3">
          <button onClick={handlePrint} className="flex items-center gap-2 bg-yellow-500 text-black px-6 py-3 rounded-lg hover:bg-yellow-600">
            <FaPrint /> Print Receipt
          </button>
          <button onClick={startNewSale} className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700">
            New Sale
          </button>
        </div>
      </div>
    );
  }

  // ─── MAIN POS VIEW ────────────────────────────────
  return (
    <div className="flex h-screen">
      {/* LEFT — product search */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <h2 className="text-2xl font-bold text-slate-800">Sales (POS)</h2>
          <div className="relative flex items-center gap-2">
            <button
              onClick={handleHold}
              title="Hold sale (F4)"
              className="flex items-center gap-2 bg-slate-50 text-slate-700 border border-slate-200 px-3 py-2 rounded-lg hover:bg-slate-200 text-sm"
            >
              <FaPause size={12} /> Hold
            </button>
            <button
              onClick={() => setShowHeldList((s) => !s)}
              className="flex items-center gap-2 bg-slate-50 text-slate-700 border border-slate-200 px-3 py-2 rounded-lg hover:bg-slate-200 text-sm"
            >
              <FaLayerGroup size={12} /> Held Sales {heldCarts.length > 0 && `(${heldCarts.length})`}
            </button>
            {showHeldList && (
              <div className="absolute right-0 top-full mt-1 w-72 bg-white border border-slate-200 rounded-lg shadow-lg z-20 p-2">
                {heldCarts.length === 0 ? (
                  <p className="text-sm text-slate-400 p-2">No held sales.</p>
                ) : (
                  heldCarts.map((h) => (
                    <div key={h.id} className="flex items-center justify-between gap-2 p-2 hover:bg-slate-50 rounded text-sm">
                      <button onClick={() => handleResumeHeld(h.id)} className="text-left flex-1">
                        <p className="font-medium text-slate-800">{h.label}</p>
                        <p className="text-xs text-slate-400">
                          {h.items.length} item{h.items.length > 1 ? 's' : ''} · {new Date(h.heldAt).toLocaleTimeString()}
                        </p>
                      </button>
                      <button onClick={() => discardHeldCart(h.id)} title="Discard" className="text-slate-400 hover:text-red-600">
                        <FaTimes size={12} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
        <p className="text-xs text-slate-400 mb-3">F2 search · F4 hold · F9 checkout</p>
        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <FaSearch className="absolute left-3 top-3.5 text-slate-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchTerm}
              onChange={handleSearch}
              onKeyDown={handleBarcodeScan}
              placeholder="Search by name, barcode, size, colour..."
              className="w-full pl-10 pr-3 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500/60 focus:border-yellow-500"
              autoFocus
            />
          </div>
          <button
            onClick={handleShowAll}
            className="px-4 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-800 text-sm whitespace-nowrap"
          >
            All Items
          </button>
        </div>
        {searching && <p className="text-slate-500 text-sm">Searching...</p>}
        <div className="grid grid-cols-2 gap-3">
          {results.map((product) => {
            // Variant (batch clearance) promo wins; else product promo
            const effPromoType = product.variant_promo_type || product.product_promo_type || null;
            const effPromoValue = Number(
              product.variant_promo_type ? product.variant_promo_value : product.product_promo_value
            ) || 0;
            const isClearance = !!product.variant_promo_type;
            const hasPromo = effPromoType && effPromoValue > 0;
            const sellPrice = Number(product.sell_price);
            let promoPrice = sellPrice;
            if (hasPromo) {
              promoPrice = effPromoType === 'percent'
                ? sellPrice - (sellPrice * effPromoValue / 100)
                : sellPrice - effPromoValue;
              if (promoPrice < 0) promoPrice = 0;
            }
            return (
              <button
                key={product.id}
                onClick={() => handleAddToCart(product)}
                className="relative text-left bg-white border border-slate-200 rounded-lg p-3 hover:border-blue-500 hover:shadow transition"
              >
                {hasPromo && (
                  <span className={`absolute top-2 right-2 text-[10px] font-bold text-white px-1.5 py-0.5 rounded ${isClearance ? 'bg-amber-500' : 'bg-red-500'}`}>
                    {isClearance ? 'CLEARANCE ' : ''}{effPromoType === 'percent' ? `-${effPromoValue}%` : `-Rs.${effPromoValue}`}
                  </span>
                )}
                <p className="font-medium text-slate-800">
                  {product.product_name}
                  {product.barcode && (
                    <span className="text-xs text-slate-400 font-mono ml-1">[{product.barcode}]</span>
                  )}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {product.size || '—'}{product.color ? ` · ${product.color}` : ''}
                </p>
                <div className="flex justify-between items-center mt-2">
                  <div className="flex items-center gap-2">
                    {hasPromo ? (
                      <>
                        <span className="text-xs text-slate-400 line-through">Rs. {sellPrice.toLocaleString()}</span>
                        <span className="font-bold text-red-600">Rs. {promoPrice.toLocaleString()}</span>
                      </>
                    ) : (
                      <span className="font-bold text-blue-600">Rs. {sellPrice.toLocaleString()}</span>
                    )}
                  </div>
                  <span className={`text-xs ${product.stock_quantity < 1 ? 'text-red-500' : 'text-slate-500'}`}>
                    Stock: {product.stock_quantity}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
        {searchTerm && results.length === 0 && !searching && (
          <p className="text-slate-500 text-sm mt-4">No products found.</p>
        )}
      </div>

      {/* RIGHT — cart */}
      <div className="w-96 bg-white border-l border-slate-200 flex flex-col">
        <div className="p-4 border-b border-slate-200 flex items-center gap-2">
          <FaShoppingCart className="text-blue-600" />
          <h3 className="font-bold text-slate-800">Cart ({getItemCount()})</h3>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {items.length === 0 ? (
            <p className="text-slate-400 text-sm text-center mt-8">Cart is empty. Search and add products.</p>
          ) : (
            items.map((item) => {
              const itemDiscount = getItemDiscount(item);
              const lineTotal = getItemLineTotal(item);
              const promoDiscount = getItemPromoDiscount(item);
              const bargainDiscount = getItemBargainDiscount(item);
              const hasPromo = item.promoType && item.promoValue > 0;
              const linePercent = getItemCashierPercent(item);
              const lineOverLimit = linePercent > myLimit + 0.01;
              return (
                <div key={item.variantId} className="mb-3 pb-3 border-b border-slate-100">
                  <div className="flex justify-between">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm text-slate-800">{item.productName}</p>
                      {hasPromo && (
                        <span className="text-[10px] font-semibold bg-green-50 text-green-700 border border-green-200 px-1.5 py-0.5 rounded">
                          PROMO {item.promoType === 'percent' ? `${item.promoValue}%` : `Rs.${item.promoValue}`}
                        </span>
                      )}
                    </div>
                    <button onClick={() => { removeItem(item.variantId); focusSearch(); }} className="text-red-400 hover:text-red-600">
                      <FaTrash size={12} />
                    </button>
                  </div>
                  <p className="text-xs text-slate-500">{item.size} · {item.color}</p>

                  <div className="flex justify-between items-center mt-2">
                    <div className="flex items-center gap-2">
                      <button onClick={() => { decreaseQty(item.variantId); focusSearch(); }} className="w-6 h-6 bg-slate-200 rounded flex items-center justify-center hover:bg-slate-300">
                        <FaMinus size={10} />
                      </button>
                      <span className="text-sm w-6 text-center">{item.quantity}</span>
                      <button onClick={() => { increaseQty(item.variantId); focusSearch(); }} className="w-6 h-6 bg-slate-200 rounded flex items-center justify-center hover:bg-slate-300">
                        <FaPlus size={10} />
                      </button>
                    </div>
                    <div className="text-right">
                      {itemDiscount > 0 && (
                        <span className="text-xs text-slate-400 line-through block">
                          Rs. {(item.sellPrice * item.quantity).toLocaleString()}
                        </span>
                      )}
                      <span className="font-medium text-sm">Rs. {lineTotal.toLocaleString()}</span>
                    </div>
                  </div>

                  {/* Promo line (auto-applied, read-only) */}
                  {promoDiscount > 0 && (
                    <div className="flex justify-between items-center mt-1.5 text-xs">
                      <span className="text-green-600">
                        Promo ({item.promoType === 'percent' ? `${item.promoValue}%` : `Rs.${item.promoValue}/unit`})
                      </span>
                      <span className="text-green-600">−Rs. {promoDiscount.toLocaleString()}</span>
                    </div>
                  )}

                  {/* Discount control — bargain (on top of promo) */}
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-slate-500 w-14">{hasPromo ? 'Extra' : 'Discount'}</span>
                    <DiscountTypeToggle
                      value={item.discountType}
                      onChange={(type) => setItemDiscountType(item.variantId, type)}
                    />
                    <input
                      type="number"
                      min="0"
                      value={item.discountValue || ''}
                      onChange={(e) => setItemDiscountValue(item.variantId, e.target.value)}
                      placeholder="0"
                      aria-label={`Discount for ${item.productName}`}
                      className={`w-20 px-2 py-1 border rounded text-sm ${lineOverLimit ? 'border-red-400 bg-red-50' : 'border-slate-300'}`}
                    />
                    {bargainDiscount > 0 && (
                      <span className="text-xs text-green-600">−Rs. {bargainDiscount.toLocaleString()}</span>
                    )}
                  </div>
                  {lineOverLimit && (
                    <p className="text-[11px] text-red-600 mt-1">
                      {linePercent.toFixed(1)}% off — over your {myLimit}% limit, needs manager PIN
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="p-4 border-t border-slate-200">
          <div className="flex justify-between text-sm mb-1">
            <span className="text-slate-600">Subtotal</span>
            <span>Rs. {subtotal.toLocaleString()}</span>
          </div>
          {items.length > 0 && (
            <div className="flex items-center gap-2 text-sm mb-1">
              <span className="text-slate-600 flex-1">Bill discount</span>
              <DiscountTypeToggle value={billDiscountType} onChange={setBillDiscountType} />
              <input
                type="number"
                min="0"
                value={billDiscountValue || ''}
                onChange={(e) => setBillDiscountValue(e.target.value)}
                placeholder="0"
                aria-label="Bill discount"
                className="w-20 px-2 py-1 border border-slate-300 rounded text-sm"
              />
            </div>
          )}
          {getBillDiscount() > 0 && (
            <div className="flex justify-between text-xs mb-1 text-green-600">
              <span>Bill discount</span>
              <span>−Rs. {getBillDiscount().toLocaleString()}</span>
            </div>
          )}
          {maxCashierPercent > 0 && (
            <div className="mb-2">
              <div className="flex flex-wrap gap-1 mb-1">
                {DISCOUNT_REASONS.map((r) => (
                  <button
                    key={r}
                    onClick={() => setDiscountReason(discountReason === r ? '' : r)}
                    className={`px-2 py-0.5 rounded-full text-[11px] border ${discountReason === r ? 'bg-yellow-500 border-yellow-500 text-black' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <p className={`text-[11px] flex items-center gap-1 ${overLimit && !approvalCovers ? 'text-red-600' : 'text-slate-500'}`}>
                {overLimit && approvalCovers ? (
                  <><FaUserShield /> Approved by {approval.approverName} (up to {approval.percent}%)</>
                ) : overLimit ? (
                  <><FaUserShield /> {maxCashierPercent.toFixed(1)}% off — over your {myLimit}% limit. Manager PIN needed at checkout.</>
                ) : (
                  <>Discount {maxCashierPercent.toFixed(1)}% · within your {myLimit}% limit</>
                )}
              </p>
            </div>
          )}
          {totalDiscount > 0 && (
            <div className="flex justify-between text-sm mb-1 text-green-600">
              <span>Total Discount</span>
              <span>−Rs. {totalDiscount.toLocaleString()}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-lg mb-3">
            <span>Total</span>
            <span className="text-blue-600">Rs. {total.toLocaleString()}</span>
          </div>
          {!isSplit ? (
            <>
              <div className="flex gap-2 mb-2">
                {PAYMENT_METHODS.map((method) => (
                  <button
                    key={method}
                    onClick={() => setSinglePaymentMethod(method)}
                    className={`flex-1 py-2 text-xs rounded capitalize ${payments[0].method === method ? 'bg-yellow-500 text-black' : 'bg-slate-50 text-slate-700 border border-slate-200'}`}
                  >
                    {method.replace('_', ' ')}
                  </button>
                ))}
              </div>
              <button onClick={startSplit} className="text-xs text-blue-600 hover:underline mb-3">
                + Split payment
              </button>
            </>
          ) : (
            <div className="mb-3 space-y-2">
              {payments.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    value={p.method}
                    onChange={(e) => updatePaymentLine(i, 'method', e.target.value)}
                    className="px-2 py-1.5 border border-slate-300 rounded text-xs capitalize flex-1"
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>{m.replace('_', ' ')}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={p.amount}
                    onChange={(e) => updatePaymentLine(i, 'amount', e.target.value)}
                    placeholder="Amount"
                    className="w-24 px-2 py-1.5 border border-slate-300 rounded text-xs"
                  />
                  <button onClick={() => removePaymentLine(i)} className="text-red-400 hover:text-red-600">
                    <FaTimes size={12} />
                  </button>
                </div>
              ))}
              <button onClick={addPaymentLine} className="text-xs text-blue-600 hover:underline">
                + Add another payment
              </button>
              <p className={`text-xs font-medium ${Math.abs(remaining) < 0.01 ? 'text-green-600' : 'text-red-600'}`}>
                {Math.abs(remaining) < 0.01 ? 'Fully covered' : `Remaining: Rs. ${remaining.toLocaleString()}`}
              </p>
            </div>
          )}
          {cashLine && (
            <div className="mb-3">
              <input
                type="number"
                value={cashReceived}
                onChange={(e) => setCashReceived(e.target.value)}
                placeholder={`Cash received${isSplit ? ` (Rs. ${cashDue.toLocaleString()} due)` : ''}`}
                className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
              />
              {cashReceived && change >= 0 && (
                <p className="text-sm text-green-600 mt-1">Change: Rs. {change.toLocaleString()}</p>
              )}
            </div>
          )}
          <button
            onClick={() => handleCheckout()}
            disabled={processing || items.length === 0}
            className="w-full bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
          >
            {processing ? 'Processing...' : overLimit && !approvalCovers ? 'Get Approval & Complete' : 'Complete Sale'}
          </button>
        </div>
      </div>

      {showApproval && (
        <ApprovalModal
          approvers={discountSettings.approvers}
          // Rounded up so the server's own calculation is always covered.
          percent={Math.ceil(maxCashierPercent * 10) / 10}
          getIdempotencyKey={() => idempotencyKeyRef.current}
          onClose={() => { setShowApproval(false); focusSearch(); }}
          onApproved={(granted) => {
            setApproval(granted);
            setShowApproval(false);
            handleCheckout(granted);
          }}
        />
      )}
    </div>
  );
}

function DiscountTypeToggle({ value, onChange }) {
  return (
    <div className="flex border border-slate-300 rounded overflow-hidden shrink-0">
      {[['percent', '%'], ['fixed', 'Rs']].map(([type, label]) => (
        <button
          key={type}
          onClick={() => onChange(type)}
          className={`px-2.5 py-1 text-xs font-medium ${value === type ? 'bg-yellow-500 text-black' : 'bg-slate-100 text-slate-600'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ─── Manager PIN approval for an over-limit discount ──
function ApprovalModal({ approvers, percent, getIdempotencyKey, onClose, onApproved }) {
  const [approverId, setApproverId] = useState(approvers[0]?.id || '');
  const [pin, setPin] = useState('');
  const [checking, setChecking] = useState(false);

  const handleApprove = async (e) => {
    e.preventDefault();
    if (!approverId || pin.length < 4) return;
    setChecking(true);
    try {
      const res = await saleService.approveDiscount({
        approverId, pin, percent, idempotencyKey: getIdempotencyKey(),
      });
      toast.success(`Approved by ${res.data.approverName}.`);
      onApproved({ token: res.data.token, approverName: res.data.approverName, percent });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Approval failed.');
      setPin('');
    } finally {
      setChecking(false);
    }
  };

  return (
    <Modal onClose={onClose} titleId="approval-modal-title" maxWidth="max-w-sm">
      <h3 id="approval-modal-title" className="text-lg font-bold text-slate-800 mb-1 flex items-center gap-2">
        <FaUserShield /> Manager approval
      </h3>
      <p className="text-sm text-slate-500 mb-4">
        This sale has a <strong>{percent}%</strong> discount, over the cashier limit.
      </p>
      {approvers.length === 0 ? (
        <p className="text-sm text-red-600 mb-4">
          No manager has an approval PIN yet. An admin can set one in Staff → PIN.
        </p>
      ) : (
        <form onSubmit={handleApprove}>
          <select
            value={approverId}
            onChange={(e) => setApproverId(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded mb-3"
          >
            {approvers.map((a) => (
              <option key={a.id} value={a.id}>{a.name} ({a.role})</option>
            ))}
          </select>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder="Manager PIN"
            aria-label="Manager PIN"
            autoFocus
            className="w-full px-3 py-2 border border-slate-300 rounded mb-4 text-center text-lg tracking-[0.5em]"
          />
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded">Cancel</button>
            <button
              type="submit"
              disabled={checking || pin.length < 4}
              className="px-4 py-2 bg-yellow-500 text-black rounded hover:bg-yellow-600 disabled:opacity-50"
            >
              {checking ? 'Checking...' : 'Approve'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export default Sales;