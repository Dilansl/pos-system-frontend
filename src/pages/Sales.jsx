import { useState, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useReactToPrint } from 'react-to-print';
import { FaSearch, FaTrash, FaPlus, FaMinus, FaShoppingCart, FaPrint, FaCheckCircle, FaPause, FaLayerGroup, FaTimes, FaUserShield, FaCashRegister, FaUndo, FaReceipt, FaMoneyBillWave } from 'react-icons/fa';
import productService from '../services/product.service';
import saleService from '../services/sale.service';
import settingsService from '../services/settings.service';
import shiftService from '../services/shift.service';
import returnService from '../services/return.service';
import useCartStore from '../store/cartStore';
import useAuthStore from '../store/authStore';
import Receipt from '../components/sales/Receipt';
import Modal from '../components/common/Modal';
import CashMovementModal from '../components/shift/CashMovementModal';
import offlineQueue from '../utils/offlineQueue';
import { compareVariants } from '../utils/sizeSort';
import { beep } from '../utils/beep';
import { remainingQty, paidPerUnit, refundFor } from '../utils/returnMath';

const PAYMENT_METHODS = ['cash', 'card', 'bank_transfer'];
const DISCOUNT_REASONS = ['Bargain', 'Regular customer', 'Damaged / defect', 'Staff purchase', 'Other'];
const RETURN_REASONS = ['Wrong size', 'Defect / damaged', 'Changed mind', 'Other'];
const AUTO_PRINT_KEY = 'pos.autoPrintReceipt';

// Quick-cash buttons: the next round notes at or above the amount due
// (e.g. due 2,640 → 3,000 · 5,000), so the common "customer hands over a
// note" case is one click.
const quickCashAmounts = (due) => {
  if (due <= 0) return [];
  const amounts = new Set();
  for (const step of [500, 1000, 5000]) {
    const rounded = Math.ceil(due / step) * step;
    if (rounded > due) amounts.add(rounded);
  }
  return [...amounts].sort((a, b) => a - b).slice(0, 3);
};

const readAutoPrint = () => {
  try { return localStorage.getItem(AUTO_PRINT_KEY) === '1'; } catch { return false; }
};

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
  // The sale just finished — shown as a strip above the cart (with the change
  // to give back) while the cashier already scans the next customer.
  const [lastSale, setLastSale] = useState(null);
  const [autoPrint, setAutoPrint] = useState(readAutoPrint);
  // undefined = still checking, null = no open shift
  const [shift, setShift] = useState(undefined);
  const [flashId, setFlashId] = useState(null);
  const [showHeldList, setShowHeldList] = useState(false);
  const [showHoldName, setShowHoldName] = useState(false);
  const [heldFilter, setHeldFilter] = useState('');
  const [showCashMove, setShowCashMove] = useState(false);
  // Discount control: per-role limits + who can approve (from settings), the
  // manager approval for this checkout (if any), and the cashier's reason.
  const [discountSettings, setDiscountSettings] = useState({ limits: {}, approvers: [] });
  const [approval, setApproval] = useState(null); // { token, approverName, percent }
  const [showApproval, setShowApproval] = useState(false);
  const [discountReason, setDiscountReason] = useState('');
  // Returns/exchanges: how money owed back is given, and the manager approval
  // a cashier needs for a cash refund.
  const [showReturnPicker, setShowReturnPicker] = useState(false);
  const [refundMethod, setRefundMethod] = useState('cash');
  const [refundApproval, setRefundApproval] = useState(null); // { token, approverName, amount }
  const [showRefundApproval, setShowRefundApproval] = useState(false);
  // Reprinting an earlier receipt (F7). `n` changes on every request so the
  // same receipt can be printed twice in a row.
  const [showReceipts, setShowReceipts] = useState(false);
  const [reprint, setReprint] = useState(null); // { sale, n }
  const user = useAuthStore((state) => state.user);

  const receiptRef = useRef();
  const reprintRef = useRef();
  const searchInputRef = useRef(null);
  const cashInputRef = useRef(null);
  const flashTimerRef = useRef(null);
  // Stays the same across retries of one checkout attempt (network timeout, etc.)
  // so a resubmission is recognized server-side as a replay, not a new sale.
  // Only regenerated after a sale actually completes or the cart is cleared.
  const idempotencyKeyRef = useRef(crypto.randomUUID());

  const {
    items, addItem, increaseQty, decreaseQty, removeItem, setQty,
    setItemDiscountType, setItemDiscountValue,
    getItemDiscount, getItemLineTotal,
    getItemPromoDiscount,
    billDiscountType, billDiscountValue, setBillDiscountType, setBillDiscountValue,
    getBillDiscount, getItemCashierPercent, getMaxCashierPercent,
    returnInfo, setReturnInfo, getReturnCredit,
    clearCart, getSubtotal, getTotal, getTotalDiscount, getItemCount,
    heldCarts, holdCart, resumeCart, discardHeldCart,
  } = useCartStore();

  useEffect(() => {
    shiftService.getCurrent()
      .then((res) => setShift(res.data || null))
      .catch(() => setShift(null));
  }, []);

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

  const handleReprint = useReactToPrint({
    contentRef: reprintRef,
  });

  // Print the copy once it has rendered.
  useEffect(() => {
    if (reprint) handleReprint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reprint?.n]);

  // Auto-print once the new receipt has rendered.
  useEffect(() => {
    if (lastSale && autoPrint) handlePrint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSale?.id]);

  const toggleAutoPrint = () => {
    const next = !autoPrint;
    setAutoPrint(next);
    try { localStorage.setItem(AUTO_PRINT_KEY, next ? '1' : '0'); } catch { /* per-device pref only */ }
  };

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
      if (seq === searchSeqRef.current) setResults([...res.data].sort(compareVariants));
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
    let code = searchTerm.trim();
    if (!code) return;
    cancelPendingSearch();

    // "3*RF0001" = add 3 of that barcode in one go.
    let qty = 1;
    const multi = code.match(/^(\d{1,3})\s*[*xX]\s*(.+)$/);
    if (multi) {
      qty = Number(multi[1]) || 1;
      code = multi[2].trim();
    }

    try {
      const res = await productService.getByBarcode(code);
      handleAddToCart(res.data, qty);
      setSearchTerm('');
      setResults([]);
      return;
    } catch (err) {
      if (err.response?.status !== 404) {
        beep(false);
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
        handleAddToCart(res.data[0], qty);
        setSearchTerm('');
        setResults([]);
      } else if (res.data.length > 1) {
        setResults([...res.data].sort(compareVariants));
        toast('Several matches — click the right one.', { icon: '👆' });
      } else {
        beep(false);
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

  // Beep + briefly highlight the cart row instead of a toast per scan.
  const flashRow = (variantId) => {
    setFlashId(variantId);
    clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setFlashId(null), 700);
    requestAnimationFrame(() => {
      document.getElementById(`cart-row-${variantId}`)?.scrollIntoView({ block: 'nearest' });
    });
  };

  useEffect(() => () => clearTimeout(flashTimerRef.current), []);

  const handleAddToCart = (product, qty = 1) => {
    if (product.stock_quantity < 1) {
      beep(false);
      toast.error(`${product.product_name} is out of stock.`);
      focusSearch();
      return;
    }
    const added = addItem(product, qty);
    if (added === 0) {
      beep(false);
      toast.error(`Only ${product.stock_quantity} of ${product.product_name} in stock.`);
    } else {
      beep(true);
      flashRow(product.id);
      if (added < qty) toast(`Only ${added} more in stock — added ${added}.`, { icon: '⚠️' });
    }
    focusSearch();
  };

  // ─── Exchange / return amounts ────────────────────
  // New items' total minus the credit for items coming back. Positive: the
  // customer pays the difference. Negative: the shop pays it back.
  const total = getTotal();
  const returnCredit = getReturnCredit();
  const net = Math.round((total - returnCredit) * 100) / 100;
  const due = Math.max(net, 0);
  const refundOut = Math.max(-net, 0);
  const needsRefundPin = refundOut > 0 && refundMethod === 'cash' && user?.role === 'cashier';
  const cartBusy = items.length > 0 || !!returnInfo;

  // ─── Split-tender payment helpers ─────────────────
  const isSplit = payments.length > 1;
  const paymentsTotal = isSplit
    ? payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
    : due;
  const remaining = Math.round((due - paymentsTotal) * 100) / 100;
  const cashLine = due > 0 ? payments.find((p) => p.method === 'cash') : null;
  const cashDue = isSplit ? (Number(cashLine?.amount) || 0) : due;
  // Empty "cash received" = exact money; no typing needed.
  const cashGiven = cashReceived === '' ? cashDue : Number(cashReceived);
  const change = cashGiven - cashDue;

  const setSinglePaymentMethod = (method) => setPayments([{ method, amount: '' }]);

  const startSplit = () => {
    const first = payments[0].method;
    const second = PAYMENT_METHODS.find((m) => m !== first) || 'card';
    setPayments([
      { method: first, amount: due.toFixed(2) },
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

  // Hold asks for a name first (customer name or phone) so the cart is easy
  // to find when they come back; blank keeps the "Hold N" default.
  const handleHold = () => {
    if (items.length === 0 && !returnInfo) {
      toast.error('Cart is empty — nothing to hold.');
      return;
    }
    setShowHoldName(true);
  };

  const confirmHold = (label) => {
    setShowHoldName(false);
    holdCart(label);
    setApproval(null);
    setRefundApproval(null);
    setDiscountReason('');
    toast.success('Sale held. Resume it from "Held Sales".');
    setSearchTerm('');
    setResults([]);
    focusSearch();
  };

  const handleResumeHeld = (id) => {
    if (items.length > 0 && !window.confirm('Resume this held sale? Your current cart will be replaced.')) {
      return;
    }
    resumeCart(id);
    setApproval(null);
    setRefundApproval(null);
    setShowHeldList(false);
    setHeldFilter('');
    toast.success('Held sale resumed.');
  };

  const resetAfterCheckout = () => {
    clearCart();
    setApproval(null);
    setRefundApproval(null);
    setRefundMethod('cash');
    setDiscountReason('');
    idempotencyKeyRef.current = crypto.randomUUID();
    setPayments([{ method: 'cash', amount: '' }]);
    setCashReceived('');
    setSearchTerm('');
    setResults([]);
    focusSearch();
  };

  const returnItemsPayload = () => returnInfo.items.map((i) => ({
    saleItemId: i.saleItemId,
    quantity: i.quantity,
  }));

  // Only items coming back, nothing new — a plain refund.
  const handleReturnOnly = async (activeRefundApproval) => {
    setProcessing(true);
    try {
      const res = await returnService.create({
        originalSaleId: returnInfo.originalSaleId,
        refundMethod,
        reason: returnInfo.reason || null,
        items: returnItemsPayload(),
        refundApprovalToken: activeRefundApproval?.token || null,
      });
      const refunded = Number(res.data.refund_amount);
      // Receipt-shaped "return slip" for the strip and printing.
      setLastSale({
        id: res.data.id,
        isReturnOnly: true,
        created_at: res.data.created_at,
        cashier_name: user?.name,
        items: [],
        payments: [],
        subtotal: 0,
        discount_amount: 0,
        total: 0,
        refundOut: refunded,
        refundMethod,
        exchange: {
          refund_amount: refunded,
          exchange_amount: 0,
          refund_method: refundMethod,
          original_receipt_seq: returnInfo.receiptSeq,
          items: returnInfo.items.map((i) => ({
            product_name: i.productName, size: i.size, color: i.color,
            quantity: i.quantity, refund_amount: i.refund,
          })),
        },
      });
      beep(true);
      resetAfterCheckout();
    } catch (err) {
      if (err.response?.data?.code === 'REFUND_APPROVAL_REQUIRED') {
        setRefundApproval(null);
        toast.error(err.response.data.message);
        setShowRefundApproval(true);
      } else {
        toast.error(err.response?.data?.message || 'Refund failed.');
      }
    } finally {
      setProcessing(false);
    }
  };

  // approvalOverride / refundApprovalOverride: an approval just granted in a
  // PIN dialog (state hasn't updated yet when checkout continues after it).
  const handleCheckout = async (approvalOverride, refundApprovalOverride) => {
    const activeApproval = approvalOverride || approval;
    const activeRefundApproval = refundApprovalOverride || refundApproval;
    if (items.length === 0 && !returnInfo) {
      toast.error('Cart is empty.');
      return;
    }
    if (items.length > 0 && overLimit && !(activeApproval && activeApproval.percent + 0.01 >= maxCashierPercent)) {
      setShowApproval(true);
      return;
    }
    if (shift === null) {
      toast.error('Open a shift first (banner at the top).');
      return;
    }
    if (needsRefundPin && !(activeRefundApproval && activeRefundApproval.amount + 0.01 >= refundOut)) {
      setShowRefundApproval(true);
      return;
    }
    if (due > 0 && isSplit && Math.abs(remaining) > 0.01) {
      toast.error(`Payments must add up to the total. Remaining: Rs. ${remaining.toLocaleString()}`);
      return;
    }
    if (cashLine && cashGiven < cashDue) {
      toast.error('Cash received is less than the cash amount due.');
      return;
    }
    if (items.length === 0) {
      handleReturnOnly(activeRefundApproval);
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
      exchange: returnInfo ? {
        originalSaleId: returnInfo.originalSaleId,
        reason: returnInfo.reason || null,
        items: returnItemsPayload(),
        refundMethod: refundOut > 0 ? refundMethod : null,
        refundApprovalToken: activeRefundApproval?.token || null,
      } : null,
      payments: due > 0 ? payments.map((p) => ({
        method: p.method,
        amount: isSplit ? (Number(p.amount) || 0) : due,
        reference: null,
      })) : [],
    };

    try {
      const res = await saleService.create(saleData);
      const fullSale = await saleService.getById(res.data.id);
      const saleForReceipt = {
        ...fullSale.data,
        cashReceived: cashLine ? cashGiven : null,
        change: cashLine ? change : null,
        refundOut: refundOut > 0 ? refundOut : null,
        refundMethod,
      };
      setLastSale(saleForReceipt);
      beep(true);
      resetAfterCheckout();
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
      } else if (err.response?.data?.code === 'REFUND_APPROVAL_REQUIRED') {
        setRefundApproval(null);
        toast.error(err.response.data.message);
        setShowRefundApproval(true);
      } else {
        if (/no open shift/i.test(err.response?.data?.message || '')) setShift(null);
        toast.error(err.response?.data?.message || 'Sale failed.');
      }
    } finally {
      setProcessing(false);
    }
  };

  const reprintReceipt = async (saleId) => {
    try {
      const res = await saleService.getById(saleId);
      const sale = res.data;
      // An exchange that paid money back shows the refund again on the copy.
      const ex = sale.exchange;
      const refundOut = ex?.refund_method ? Number(ex.refund_amount) - Number(ex.exchange_amount || 0) : 0;
      setReprint({
        sale: { ...sale, isCopy: true, refundOut: refundOut > 0 ? refundOut : null, refundMethod: ex?.refund_method },
        n: Date.now(),
      });
      setShowReceipts(false);
      focusSearch();
    } catch {
      toast.error('Could not load that receipt.');
    }
  };

  // ─── Keyboard shortcuts: F2 search, F4 hold, F6 return, F7 receipts, F9 checkout ──
  useEffect(() => {
    const handleKey = (e) => {
      // A dialog is open — don't checkout/hold underneath it.
      if (showApproval || showRefundApproval || showReturnPicker || showReceipts || showHoldName || showCashMove) return;
      if (e.key === 'F6') {
        e.preventDefault();
        setShowReturnPicker(true);
        return;
      }
      if (e.key === 'F7') {
        e.preventDefault();
        setShowReceipts(true);
        return;
      }
      if (e.key === 'F2') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'F8') {
        e.preventDefault();
        cashInputRef.current?.focus();
        cashInputRef.current?.select();
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

  const subtotal = getSubtotal();
  const totalDiscount = getTotalDiscount();

  // Held Sales search: by name, or by phone ignoring spaces/dashes
  // ("0771234567" finds "077 123 4567").
  const heldQuery = heldFilter.trim().toLowerCase();
  const heldDigits = heldQuery.replace(/\D/g, '');
  const visibleHeld = !heldQuery ? heldCarts : heldCarts.filter((h) =>
    h.label.toLowerCase().includes(heldQuery)
    || (heldDigits.length >= 3 && h.label.replace(/\D/g, '').includes(heldDigits)));

  // ─── POS VIEW ─────────────────────────────────────
  return (
    <div className="flex h-screen">
      {/* Receipt of the last sale, rendered off-screen for printing */}
      <div style={{ display: 'none' }}>
        <Receipt ref={receiptRef} sale={lastSale} />
        <Receipt ref={reprintRef} sale={reprint?.sale} />
      </div>

      {/* LEFT — product search */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <h2 className="text-2xl font-bold text-slate-800">Sales (POS)</h2>
          <div className="relative flex items-center gap-2">
            <button
              onClick={() => setShowReturnPicker(true)}
              title="Return or exchange items from an earlier bill (F6)"
              className="flex items-center gap-2 bg-red-50 text-red-700 border border-red-200 px-3 py-2 rounded-lg hover:bg-red-100 text-sm"
            >
              <FaUndo size={12} /> Return / Exchange
            </button>
            <button
              onClick={() => setShowReceipts(true)}
              title="Find and reprint an earlier receipt (F7)"
              className="flex items-center gap-2 bg-slate-50 text-slate-700 border border-slate-200 px-3 py-2 rounded-lg hover:bg-slate-200 text-sm"
            >
              <FaReceipt size={12} /> Receipts
            </button>
            {shift && (
              <button
                onClick={() => setShowCashMove(true)}
                title="Record petty cash taken out of / put into the drawer"
                className="flex items-center gap-2 bg-slate-50 text-slate-700 border border-slate-200 px-3 py-2 rounded-lg hover:bg-slate-200 text-sm"
              >
                <FaMoneyBillWave size={12} /> Cash In/Out
              </button>
            )}
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
                {heldCarts.length > 2 && (
                  <input
                    value={heldFilter}
                    onChange={(e) => setHeldFilter(e.target.value)}
                    placeholder="Find by name or phone"
                    aria-label="Find held sale"
                    autoFocus
                    className="w-full px-2 py-1.5 mb-1 border border-slate-300 rounded text-sm"
                  />
                )}
                {heldCarts.length === 0 ? (
                  <p className="text-sm text-slate-400 p-2">No held sales.</p>
                ) : visibleHeld.length === 0 ? (
                  <p className="text-sm text-slate-400 p-2">No match.</p>
                ) : (
                  visibleHeld.map((h) => (
                    <div key={h.id} className="flex items-center justify-between gap-2 p-2 hover:bg-slate-50 rounded text-sm">
                      <button onClick={() => handleResumeHeld(h.id)} className="text-left flex-1 min-w-0">
                        <p className="font-medium text-slate-800 truncate">{h.label}</p>
                        <p className="text-xs text-slate-400">
                          {h.items.length} item{h.items.length > 1 ? 's' : ''}
                          {h.total != null && <> · Rs. {Number(h.total).toLocaleString()}</>}
                          {' · '}{new Date(h.heldAt).toLocaleTimeString()}
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
        <p className="text-xs text-slate-400 mb-3">
          F2 search · F8 cash · F4 hold · F6 return · F7 receipts · F9 checkout · scan <span className="font-mono">3*code</span> for qty 3
        </p>

        {shift === null && (
          <OpenShiftBanner
            onOpened={(opened) => { setShift(opened); focusSearch(); }}
          />
        )}

        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <FaSearch className="absolute left-3 top-3.5 text-slate-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchTerm}
              onChange={handleSearch}
              onKeyDown={handleBarcodeScan}
              placeholder="Scan barcode or search by name, size, colour..."
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
      <div className="w-96 bg-white border-l border-slate-200 flex flex-col h-screen">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2 shrink-0">
          <FaShoppingCart className="text-blue-600" />
          <h3 className="font-bold text-slate-800">Cart ({getItemCount()})</h3>
        </div>

        {/* Last sale — stays visible (with the change to hand back) while the
            next customer is already being scanned. */}
        {/* Once the next customer's items are going in, shrink to one line. */}
        {lastSale && cartBusy && (
          <div className="mx-3 mt-2 rounded border border-green-200 bg-green-50 px-3 py-1.5 shrink-0 flex items-center gap-2 text-xs text-green-800">
            <FaCheckCircle className="text-green-600 shrink-0" />
            <span className="flex-1 truncate">
              Last: {lastSale.isReturnOnly ? 'refund' : lastSale.receipt_seq ? `RF-${String(lastSale.receipt_seq).padStart(4, '0')}` : 'sale'}
              {lastSale.change != null && <> · change <strong>Rs. {Number(lastSale.change).toLocaleString()}</strong></>}
              {lastSale.refundOut > 0 && <> · refund <strong>Rs. {Number(lastSale.refundOut).toLocaleString()}</strong></>}
            </span>
            <button onClick={() => { handlePrint(); focusSearch(); }} title="Print last receipt" className="hover:text-green-950">
              <FaPrint />
            </button>
            <button onClick={() => setLastSale(null)} title="Dismiss" className="text-green-700/60 hover:text-green-800">
              <FaTimes size={11} />
            </button>
          </div>
        )}
        {lastSale && !cartBusy && (
          <div className="mx-3 mt-3 rounded-lg border border-green-200 bg-green-50 p-3 shrink-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 text-sm text-green-800">
                <FaCheckCircle className="text-green-600" />
                <span className="font-medium">
                  {lastSale.isReturnOnly ? (
                    <>Refund done (RF-{String(lastSale.exchange.original_receipt_seq).padStart(4, '0')})</>
                  ) : (
                    <>
                      {lastSale.receipt_seq ? `RF-${String(lastSale.receipt_seq).padStart(4, '0')}` : 'Sale'} done ·
                      Rs. {Number(lastSale.total).toLocaleString()}
                      {lastSale.exchange && ' (exchange)'}
                    </>
                  )}
                </span>
              </div>
              <button onClick={() => setLastSale(null)} title="Dismiss" className="text-green-700/60 hover:text-green-800">
                <FaTimes size={12} />
              </button>
            </div>
            {lastSale.change != null && (
              <p className="text-2xl font-bold text-green-700 mt-1">
                Change: Rs. {Number(lastSale.change).toLocaleString()}
              </p>
            )}
            {lastSale.refundOut > 0 && (
              <p className="text-2xl font-bold text-red-600 mt-1">
                Give back: Rs. {Number(lastSale.refundOut).toLocaleString()}
                <span className="text-sm font-medium ml-1">({lastSale.refundMethod})</span>
              </p>
            )}
            <div className="flex items-center justify-between gap-2 mt-2">
              <button
                onClick={() => { handlePrint(); focusSearch(); }}
                className="flex items-center gap-1.5 bg-yellow-500 text-black px-3 py-1.5 rounded text-sm hover:bg-yellow-600"
              >
                <FaPrint size={12} /> Print receipt
              </button>
              <label className="flex items-center gap-1.5 text-xs text-green-800 cursor-pointer">
                <input type="checkbox" checked={autoPrint} onChange={toggleAutoPrint} />
                Auto-print every sale
              </label>
            </div>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-1">
          {/* Items coming back (exchange / refund) */}
          {returnInfo && (
            <div className="my-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="text-xs font-semibold text-red-700 flex items-center gap-1.5">
                  <FaUndo size={10} /> Return from RF-{String(returnInfo.receiptSeq).padStart(4, '0')}
                  {returnInfo.reason && <span className="font-normal">· {returnInfo.reason}</span>}
                </p>
                <button
                  onClick={() => { setReturnInfo(null); setRefundApproval(null); focusSearch(); }}
                  title="Cancel the return"
                  className="text-red-400 hover:text-red-700"
                >
                  <FaTimes size={11} />
                </button>
              </div>
              {returnInfo.items.map((r) => (
                <div key={r.saleItemId} className="flex justify-between text-xs text-red-800 py-0.5">
                  <span className="truncate">{r.productName} ({r.size}/{r.color}) × {r.quantity}</span>
                  <span className="shrink-0 font-medium">−Rs. {r.refund.toLocaleString()}</span>
                </div>
              ))}
              {items.length === 0 && (
                <p className="text-[11px] text-red-600/80 mt-1">Scan the new items for an exchange, or complete as a refund.</p>
              )}
            </div>
          )}
          {items.length === 0 && !returnInfo ? (
            <p className="text-slate-400 text-sm text-center mt-8">Cart is empty. Scan or search to add products.</p>
          ) : (
            items.map((item) => {
              const itemDiscount = getItemDiscount(item);
              const lineTotal = getItemLineTotal(item);
              const promoDiscount = getItemPromoDiscount(item);
              const hasPromo = item.promoType && item.promoValue > 0;
              const linePercent = getItemCashierPercent(item);
              const lineOverLimit = linePercent > myLimit + 0.01;
              return (
                <div
                  key={item.variantId}
                  id={`cart-row-${item.variantId}`}
                  className={`py-2 px-1 border-b border-slate-100 rounded transition-colors duration-500 ${flashId === item.variantId ? 'bg-yellow-100' : ''}`}
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 truncate">
                        {item.productName}
                        {hasPromo && (
                          <span className="ml-1 text-[10px] font-semibold bg-green-50 text-green-700 border border-green-200 px-1 rounded">
                            {item.promoType === 'percent' ? `-${item.promoValue}%` : `-Rs.${item.promoValue}`}
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {item.size} · {item.color} · Rs. {item.sellPrice.toLocaleString()}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      {itemDiscount > 0 && (
                        <span className="text-[11px] text-slate-400 line-through block leading-tight">
                          Rs. {(item.sellPrice * item.quantity).toLocaleString()}
                        </span>
                      )}
                      <span className="font-semibold text-sm">Rs. {lineTotal.toLocaleString()}</span>
                    </div>
                    <button
                      onClick={() => { removeItem(item.variantId); focusSearch(); }}
                      title="Remove"
                      className="text-red-400 hover:text-red-600 pt-0.5"
                    >
                      <FaTrash size={11} />
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5 mt-1.5">
                    <button
                      onClick={() => { decreaseQty(item.variantId); focusSearch(); }}
                      className="w-6 h-6 bg-slate-200 rounded flex items-center justify-center hover:bg-slate-300"
                      aria-label="Decrease quantity"
                    >
                      <FaMinus size={9} />
                    </button>
                    <input
                      type="number"
                      min="1"
                      max={item.stockQuantity}
                      value={item.quantity}
                      onChange={(e) => setQty(item.variantId, e.target.value)}
                      onFocus={(e) => e.target.select()}
                      onKeyDown={(e) => { if (e.key === 'Enter') focusSearch(); }}
                      aria-label={`Quantity of ${item.productName}`}
                      className="w-11 h-6 text-center text-sm border border-slate-300 rounded [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <button
                      onClick={() => { increaseQty(item.variantId); focusSearch(); }}
                      className="w-6 h-6 bg-slate-200 rounded flex items-center justify-center hover:bg-slate-300"
                      aria-label="Increase quantity"
                    >
                      <FaPlus size={9} />
                    </button>
                    <span className="flex-1" />
                    {promoDiscount > 0 && (
                      <span className="text-[11px] text-green-600" title="Shop promotion">
                        promo −{promoDiscount.toLocaleString()}
                      </span>
                    )}
                    <DiscountTypeToggle
                      value={item.discountType}
                      onChange={(type) => setItemDiscountType(item.variantId, type)}
                    />
                    <input
                      type="number"
                      min="0"
                      value={item.discountValue || ''}
                      onChange={(e) => setItemDiscountValue(item.variantId, e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') focusSearch(); }}
                      placeholder="disc."
                      aria-label={`Discount for ${item.productName}`}
                      className={`w-16 h-7 px-2 border rounded text-sm ${lineOverLimit ? 'border-red-400 bg-red-50' : 'border-slate-300'}`}
                    />
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

        <div className="px-4 py-3 border-t border-slate-200 shrink-0 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-slate-600">Subtotal</span>
            <span>Rs. {subtotal.toLocaleString()}</span>
          </div>
          {items.length > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-600 flex-1">Bill discount</span>
              {getBillDiscount() > 0 && (
                <span className="text-xs text-green-600">−Rs. {getBillDiscount().toLocaleString()}</span>
              )}
              <DiscountTypeToggle value={billDiscountType} onChange={setBillDiscountType} />
              <input
                type="number"
                min="0"
                value={billDiscountValue || ''}
                onChange={(e) => setBillDiscountValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') focusSearch(); }}
                placeholder="0"
                aria-label="Bill discount"
                className="w-16 h-7 px-2 border border-slate-300 rounded text-sm"
              />
            </div>
          )}
          {maxCashierPercent > 0 && (
            <div>
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
                  <><FaUserShield /> {maxCashierPercent.toFixed(1)}% off — over your {myLimit}% limit. Manager PIN needed.</>
                ) : (
                  <>Discount {maxCashierPercent.toFixed(1)}% · within your {myLimit}% limit</>
                )}
              </p>
            </div>
          )}
          {returnInfo ? (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">New items</span>
                <span>Rs. {total.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm text-red-600">
                <span>Returned items credit</span>
                <span>−Rs. {returnCredit.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="font-bold text-lg">{refundOut > 0 ? 'Refund to customer' : 'Customer pays'}</span>
                <span className={`font-bold text-2xl ${refundOut > 0 ? 'text-red-600' : 'text-blue-600'}`}>
                  Rs. {(refundOut > 0 ? refundOut : due).toLocaleString()}
                </span>
              </div>
            </>
          ) : (
            <div className="flex justify-between items-baseline">
              <span className="font-bold text-lg">Total</span>
              <span className="text-right">
                {totalDiscount > 0 && (
                  <span className="text-xs text-green-600 mr-2">saved Rs. {totalDiscount.toLocaleString()}</span>
                )}
                <span className="font-bold text-2xl text-blue-600">Rs. {total.toLocaleString()}</span>
              </span>
            </div>
          )}

          {refundOut > 0 && (
            <div>
              <div className="flex gap-1.5 items-center">
                <span className="text-xs text-slate-600 mr-1">Give back by</span>
                {['cash', 'card'].map((m) => (
                  <button
                    key={m}
                    onClick={() => { setRefundMethod(m); focusSearch(); }}
                    className={`flex-1 py-1.5 text-xs rounded capitalize ${refundMethod === m ? 'bg-red-600 text-white' : 'bg-slate-50 text-slate-700 border border-slate-200'}`}
                  >
                    {m}
                  </button>
                ))}
              </div>
              {needsRefundPin && (
                <p className={`text-[11px] mt-1 flex items-center gap-1 ${refundApproval && refundApproval.amount + 0.01 >= refundOut ? 'text-slate-500' : 'text-red-600'}`}>
                  <FaUserShield />
                  {refundApproval && refundApproval.amount + 0.01 >= refundOut
                    ? `Cash refund approved by ${refundApproval.approverName}`
                    : 'Cash refund — manager PIN needed at checkout.'}
                </p>
              )}
            </div>
          )}

          {due === 0 ? null : !isSplit ? (
            <div className="flex gap-1.5 items-center">
              {PAYMENT_METHODS.map((method) => (
                <button
                  key={method}
                  onClick={() => setSinglePaymentMethod(method)}
                  className={`flex-1 py-1.5 text-xs rounded capitalize ${payments[0].method === method ? 'bg-yellow-500 text-black' : 'bg-slate-50 text-slate-700 border border-slate-200'}`}
                >
                  {method.replace('_', ' ')}
                </button>
              ))}
              <button onClick={startSplit} title="Split payment" className="text-xs text-blue-600 hover:underline px-1">
                Split
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              {payments.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    value={p.method}
                    onChange={(e) => updatePaymentLine(i, 'method', e.target.value)}
                    className="px-2 py-1 border border-slate-300 rounded text-xs capitalize flex-1"
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
                    className="w-24 px-2 py-1 border border-slate-300 rounded text-xs"
                  />
                  <button onClick={() => removePaymentLine(i)} className="text-red-400 hover:text-red-600">
                    <FaTimes size={12} />
                  </button>
                </div>
              ))}
              <div className="flex justify-between items-center">
                <button onClick={addPaymentLine} className="text-xs text-blue-600 hover:underline">
                  + Add another payment
                </button>
                <p className={`text-xs font-medium ${Math.abs(remaining) < 0.01 ? 'text-green-600' : 'text-red-600'}`}>
                  {Math.abs(remaining) < 0.01 ? 'Fully covered' : `Remaining: Rs. ${remaining.toLocaleString()}`}
                </p>
              </div>
            </div>
          )}

          {cashLine && items.length > 0 && (
            <div>
              <div className="flex items-center gap-2">
                <input
                  ref={cashInputRef}
                  type="number"
                  value={cashReceived}
                  onChange={(e) => setCashReceived(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCheckout(); }}
                  placeholder={isSplit ? `Cash (Rs. ${cashDue.toLocaleString()} due)` : 'Cash received (blank = exact)'}
                  aria-label="Cash received"
                  className="flex-1 min-w-0 px-3 py-1.5 border border-slate-300 rounded text-sm"
                />
                <span className={`text-sm font-semibold whitespace-nowrap ${change < 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {change < 0 ? `Short Rs. ${(-change).toLocaleString()}` : `Change Rs. ${change.toLocaleString()}`}
                </span>
              </div>
              <div className="flex gap-1.5 mt-1.5">
                <button
                  onClick={() => setCashReceived('')}
                  className={`flex-1 py-1 text-xs rounded border ${cashReceived === '' ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                >
                  Exact
                </button>
                {quickCashAmounts(cashDue).map((amt) => (
                  <button
                    key={amt}
                    onClick={() => setCashReceived(String(amt))}
                    className={`flex-1 py-1 text-xs rounded border ${Number(cashReceived) === amt ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                  >
                    {amt.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => handleCheckout()}
            disabled={processing || !cartBusy}
            className={`w-full text-white py-3 rounded-lg font-medium disabled:opacity-50 ${refundOut > 0 ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}
          >
            {processing ? 'Processing...'
              : (overLimit && !approvalCovers) || (needsRefundPin && !(refundApproval && refundApproval.amount + 0.01 >= refundOut))
                ? 'Get Approval & Complete (F9)'
                : !returnInfo ? 'Complete Sale (F9)'
                : items.length === 0 ? `Refund Rs. ${refundOut.toLocaleString()} (F9)`
                : 'Complete Exchange (F9)'}
          </button>
        </div>
      </div>

      {showApproval && (() => {
        // Rounded up so the server's own calculation is always covered.
        const percent = Math.ceil(maxCashierPercent * 10) / 10;
        return (
          <ApprovalModal
            approvers={discountSettings.approvers}
            message={<>This sale has a <strong>{percent}%</strong> discount, over the cashier limit.</>}
            request={async (approverId, pin) => {
              const res = await saleService.approveDiscount({
                approverId, pin, percent, idempotencyKey: idempotencyKeyRef.current,
              });
              return { ...res.data, percent };
            }}
            onClose={() => { setShowApproval(false); focusSearch(); }}
            onApproved={(granted) => {
              setApproval(granted);
              setShowApproval(false);
              handleCheckout(granted);
            }}
          />
        );
      })()}

      {showRefundApproval && returnInfo && (
        <ApprovalModal
          approvers={discountSettings.approvers}
          message={<>Cash refund of <strong>Rs. {refundOut.toLocaleString()}</strong> to the customer needs a manager.</>}
          request={async (approverId, pin) => {
            const res = await returnService.approveRefund({
              approverId, pin, originalSaleId: returnInfo.originalSaleId, amount: refundOut,
            });
            return { ...res.data, amount: refundOut };
          }}
          onClose={() => { setShowRefundApproval(false); focusSearch(); }}
          onApproved={(granted) => {
            setRefundApproval(granted);
            setShowRefundApproval(false);
            handleCheckout(null, granted);
          }}
        />
      )}

      {showCashMove && (
        <CashMovementModal onClose={() => { setShowCashMove(false); focusSearch(); }} />
      )}

      {showHoldName && (
        <HoldNameModal
          onClose={() => { setShowHoldName(false); focusSearch(); }}
          onHold={confirmHold}
        />
      )}

      {showReceipts && (
        <ReceiptsModal
          onClose={() => { setShowReceipts(false); focusSearch(); }}
          onPrint={reprintReceipt}
          showCashier={user?.role !== 'cashier'}
        />
      )}

      {showReturnPicker && (
        <ReturnPickerModal
          onClose={() => { setShowReturnPicker(false); focusSearch(); }}
          onAdd={(info) => {
            setReturnInfo(info);
            setRefundApproval(null);
            setShowReturnPicker(false);
            setLastSale(null);
            focusSearch();
          }}
        />
      )}
    </div>
  );
}

// ─── No open shift: open one right here instead of leaving the POS ──
function OpenShiftBanner({ onOpened }) {
  const [openingCash, setOpeningCash] = useState('');
  const [opening, setOpening] = useState(false);

  const handleOpen = async (e) => {
    e.preventDefault();
    if (openingCash === '' || Number(openingCash) < 0) {
      toast.error('Enter the cash in the drawer (0 if empty).');
      return;
    }
    setOpening(true);
    try {
      const res = await shiftService.open({ openingCash: Number(openingCash) });
      toast.success('Shift opened.');
      onOpened(res.data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not open shift.');
    } finally {
      setOpening(false);
    }
  };

  return (
    <form
      onSubmit={handleOpen}
      className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3"
    >
      <FaCashRegister className="text-amber-600" />
      <p className="text-sm text-amber-900 flex-1 min-w-[180px]">
        <strong>No open shift.</strong> Open one to start selling.
      </p>
      <input
        type="number"
        min="0"
        value={openingCash}
        onChange={(e) => setOpeningCash(e.target.value)}
        placeholder="Cash in drawer"
        aria-label="Opening cash"
        className="w-36 px-3 py-1.5 border border-amber-300 rounded text-sm bg-white"
      />
      <button
        type="submit"
        disabled={opening}
        className="px-4 py-1.5 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-50"
      >
        {opening ? 'Opening...' : 'Open Shift'}
      </button>
    </form>
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

// ─── Manager PIN approval (over-limit discount, cashier cash refund) ──
// request(approverId, pin) asks the server and resolves to { token, approverName }.
function ApprovalModal({ approvers, message, request, onClose, onApproved }) {
  const [approverId, setApproverId] = useState(approvers[0]?.id || '');
  const [pin, setPin] = useState('');
  const [checking, setChecking] = useState(false);

  const handleApprove = async (e) => {
    e.preventDefault();
    if (!approverId || pin.length < 4) return;
    setChecking(true);
    try {
      const granted = await request(approverId, pin);
      toast.success(`Approved by ${granted.approverName}.`);
      onApproved(granted);
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
      <p className="text-sm text-slate-500 mb-4">{message}</p>
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

// ─── Name a sale before holding it ─────────────────
function HoldNameModal({ onClose, onHold }) {
  const [label, setLabel] = useState('');

  return (
    <Modal onClose={onClose} titleId="hold-modal-title">
      <h3 id="hold-modal-title" className="text-lg font-bold text-slate-800 mb-1 flex items-center gap-2">
        <FaPause /> Hold sale
      </h3>
      <p className="text-sm text-slate-500 mb-4">
        Customer name or phone, so you can find this cart when they come back. Leave blank to skip.
      </p>
      <form onSubmit={(e) => { e.preventDefault(); onHold(label); }}>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Nimali / 077 123 4567"
          aria-label="Name or phone for the held sale"
          maxLength={40}
          autoFocus
          className="w-full px-3 py-2 border border-slate-300 rounded mb-4"
        />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 border border-slate-300 rounded hover:bg-slate-50">
            Cancel
          </button>
          <button type="submit" className="px-4 py-2 bg-slate-700 text-white rounded hover:bg-slate-800">
            Hold
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Find and reprint an earlier receipt ───────────
function ReceiptsModal({ onClose, onPrint, showCashier }) {
  const [recent, setRecent] = useState(null); // null = loading
  const [receipt, setReceipt] = useState('');
  const [found, setFound] = useState(null);
  const [loading, setLoading] = useState(false);
  const [printingId, setPrintingId] = useState(null);

  useEffect(() => {
    saleService.getRecent()
      .then((res) => setRecent(res.data))
      .catch(() => { setRecent([]); toast.error('Could not load recent receipts.'); });
  }, []);

  const lookup = async (e) => {
    e.preventDefault();
    const seq = receipt.replace(/[^0-9]/g, '');
    if (!seq) return;
    setLoading(true);
    setFound(null);
    try {
      const res = await saleService.getByReceiptSeq(seq);
      if (res.data.status === 'held') {
        toast.error('That bill was never completed.');
        return;
      }
      setFound(res.data);
    } catch (err) {
      toast.error(err.response?.status === 404 ? 'Receipt not found. Check the number.' : 'Lookup failed.');
    } finally {
      setLoading(false);
    }
  };

  const print = async (id) => {
    setPrintingId(id);
    await onPrint(id);
    setPrintingId(null);
  };

  const row = (s) => (
    <div key={s.id} className="flex items-center gap-3 px-3 py-2 text-sm">
      <div className="flex-1 min-w-0">
        <p className="font-medium text-slate-800">
          RF-{String(s.receipt_seq).padStart(4, '0')} · Rs. {Number(s.total).toLocaleString()}
        </p>
        <p className="text-xs text-slate-500 truncate">
          {new Date(s.created_at).toLocaleString()}
          {showCashier && ` · ${s.cashier_name}`}
        </p>
      </div>
      <button
        onClick={() => print(s.id)}
        disabled={printingId !== null}
        className="flex items-center gap-1.5 bg-yellow-500 text-black px-3 py-1.5 rounded text-sm hover:bg-yellow-600 disabled:opacity-50"
      >
        <FaPrint size={12} /> {printingId === s.id ? 'Loading...' : 'Print'}
      </button>
    </div>
  );

  return (
    <Modal onClose={onClose} titleId="receipts-modal-title" maxWidth="max-w-lg" scrollable>
      <h3 id="receipts-modal-title" className="text-lg font-bold text-slate-800 mb-1 flex items-center gap-2">
        <FaReceipt /> Reprint a receipt
      </h3>
      <p className="text-sm text-slate-500 mb-4">
        Type the receipt number, or pick a recent one. Reprints are marked COPY.
      </p>

      <form onSubmit={lookup} className="flex gap-2 mb-3">
        <input
          value={receipt}
          onChange={(e) => setReceipt(e.target.value)}
          placeholder="Receipt no. e.g. RF-0012"
          aria-label="Receipt number"
          autoFocus
          className="flex-1 px-3 py-2 border border-slate-300 rounded"
        />
        <button type="submit" disabled={loading} className="px-4 py-2 bg-slate-700 text-white rounded hover:bg-slate-800 disabled:opacity-50">
          {loading ? 'Finding...' : 'Find'}
        </button>
      </form>

      {found && (
        <div className="border border-blue-200 bg-blue-50/50 rounded-lg mb-4">{row(found)}</div>
      )}

      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
        {showCashier ? 'Recent sales' : 'Your recent sales'}
      </p>
      {recent === null ? (
        <p className="text-sm text-slate-400 py-2">Loading...</p>
      ) : recent.length === 0 ? (
        <p className="text-sm text-slate-400 py-2">No sales yet.</p>
      ) : (
        <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
          {recent.map(row)}
        </div>
      )}
    </Modal>
  );
}

// ─── Pick items to return from an earlier bill ─────
function ReturnPickerModal({ onClose, onAdd }) {
  const [receipt, setReceipt] = useState('');
  const [sale, setSale] = useState(null);
  const [qty, setQty] = useState({}); // saleItemId → qty to return
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const lookup = async (e) => {
    e.preventDefault();
    const seq = receipt.replace(/[^0-9]/g, '');
    if (!seq) return;
    setLoading(true);
    setSale(null);
    setQty({});
    try {
      const res = await saleService.getByReceiptSeq(seq);
      if (res.data.status === 'held') {
        toast.error('That bill was never completed.');
        return;
      }
      setSale(res.data);
      if (res.data.items.every((i) => remainingQty(i) <= 0)) {
        toast('Everything on this bill was already returned.', { icon: 'ℹ️' });
      }
    } catch (err) {
      toast.error(err.response?.status === 404 ? 'Receipt not found. Check the number.' : 'Lookup failed.');
    } finally {
      setLoading(false);
    }
  };

  const setItemQty = (item, value) => {
    const q = Math.max(0, Math.min(Math.floor(Number(value)) || 0, remainingQty(item)));
    setQty({ ...qty, [item.id]: q });
  };

  const picked = sale ? sale.items.filter((i) => (qty[i.id] || 0) > 0) : [];
  const credit = picked.reduce((sum, i) => sum + refundFor(i, qty[i.id]), 0);

  const handleAdd = () => {
    if (picked.length === 0) {
      toast.error('Pick at least one item to return.');
      return;
    }
    onAdd({
      originalSaleId: sale.id,
      receiptSeq: sale.receipt_seq,
      reason,
      items: picked.map((i) => ({
        saleItemId: i.id,
        productName: i.product_name,
        size: i.size,
        color: i.color,
        quantity: qty[i.id],
        refund: refundFor(i, qty[i.id]),
      })),
    });
  };

  return (
    <Modal onClose={onClose} titleId="return-modal-title" maxWidth="max-w-lg" scrollable>
      <h3 id="return-modal-title" className="text-lg font-bold text-slate-800 mb-1 flex items-center gap-2">
        <FaUndo /> Return / Exchange
      </h3>
      <p className="text-sm text-slate-500 mb-4">
        Enter the receipt number from the customer's bill, then pick what's coming back.
      </p>

      <form onSubmit={lookup} className="flex gap-2 mb-4">
        <input
          value={receipt}
          onChange={(e) => setReceipt(e.target.value)}
          placeholder="Receipt no. e.g. RF-0012"
          aria-label="Receipt number"
          autoFocus
          className="flex-1 px-3 py-2 border border-slate-300 rounded"
        />
        <button type="submit" disabled={loading} className="px-4 py-2 bg-slate-700 text-white rounded hover:bg-slate-800 disabled:opacity-50">
          {loading ? 'Finding...' : 'Find bill'}
        </button>
      </form>

      {sale && (
        <>
          <p className="text-xs text-slate-500 mb-2">
            RF-{String(sale.receipt_seq).padStart(4, '0')} · {new Date(sale.created_at).toLocaleString()} ·
            Rs. {Number(sale.total).toLocaleString()} · {sale.cashier_name}
          </p>
          <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 mb-3">
            {sale.items.map((item) => {
              const left = remainingQty(item);
              return (
                <div key={item.id} className={`flex items-center gap-3 px-3 py-2 text-sm ${left <= 0 ? 'opacity-50' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 truncate">{item.product_name}</p>
                    <p className="text-xs text-slate-500">
                      {item.size} · {item.color} · paid Rs. {paidPerUnit(item).toLocaleString(undefined, { maximumFractionDigits: 2 })} each
                      {item.already_returned > 0 && <span className="text-amber-600"> · {item.already_returned} already returned</span>}
                    </p>
                  </div>
                  {left <= 0 ? (
                    <span className="text-xs text-slate-400">returned</span>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min="0"
                        max={left}
                        value={qty[item.id] || 0}
                        onChange={(e) => setItemQty(item, e.target.value)}
                        onFocus={(e) => e.target.select()}
                        aria-label={`Return quantity for ${item.product_name}`}
                        className="w-14 px-2 py-1 border border-slate-300 rounded text-center"
                      />
                      <span className="text-xs text-slate-400">/ {left}</span>
                      <button
                        type="button"
                        onClick={() => setItemQty(item, left)}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        all
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-1 mb-4">
            {RETURN_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(reason === r ? '' : r)}
                className={`px-2 py-0.5 rounded-full text-xs border ${reason === r ? 'bg-yellow-500 border-yellow-500 text-black' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
              >
                {r}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-slate-600">
              Credit: <strong className="text-red-600">Rs. {credit.toLocaleString()}</strong>
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded">Cancel</button>
              <button
                type="button"
                onClick={handleAdd}
                disabled={picked.length === 0}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
              >
                Add to cart
              </button>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}

export default Sales;