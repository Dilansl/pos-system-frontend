import { useState, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useReactToPrint } from 'react-to-print';
import { FaSearch, FaTrash, FaPlus, FaMinus, FaShoppingCart, FaPrint, FaCheckCircle, FaPause, FaLayerGroup, FaTimes } from 'react-icons/fa';
import productService from '../services/product.service';
import saleService from '../services/sale.service';
import useCartStore from '../store/cartStore';
import Receipt from '../components/sales/Receipt';
import offlineQueue from '../utils/offlineQueue';

const PAYMENT_METHODS = ['cash', 'card', 'bank_transfer'];

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
    clearCart, getSubtotal, getTotal, getTotalDiscount, getItemCount,
    heldCarts, holdCart, resumeCart, discardHeldCart,
  } = useCartStore();

  const handlePrint = useReactToPrint({
    contentRef: receiptRef,
  });

  const handleSearch = async (e) => {
    const term = e.target.value;
    setSearchTerm(term);
    if (term.trim().length < 1) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await productService.search(term.trim());
      setResults(res.data);
    } catch (err) {
      toast.error('Search failed.');
    } finally {
      setSearching(false);
    }
  };

  const handleBarcodeScan = async (e) => {
    if (e.key !== 'Enter') return;
    const code = searchTerm.trim();
    if (!code) return;

    try {
      const res = await productService.getByBarcode(code);
      handleAddToCart(res.data);
      setSearchTerm('');
      setResults([]);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Barcode not found.');
      setSearchTerm('');
    }
  };

  const handleShowAll = async () => {
    setSearchTerm('');
    setSearching(true);
    try {
      const res = await productService.search('');
      setResults(res.data);
    } catch (err) {
      toast.error('Failed to load items.');
    } finally {
      setSearching(false);
    }
  };

  const handleAddToCart = (product) => {
    if (product.stock_quantity < 1) {
      toast.error('Out of stock.');
      return;
    }
    addItem(product);
    toast.success(`${product.product_name} added.`);
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
    toast.success('Sale held. Resume it from "Held Sales".');
    setSearchTerm('');
    setResults([]);
  };

  const handleResumeHeld = (id) => {
    if (items.length > 0 && !window.confirm('Resume this held sale? Your current cart will be replaced.')) {
      return;
    }
    resumeCart(id);
    setShowHeldList(false);
    toast.success('Held sale resumed.');
  };

  // ─── Keyboard shortcuts: F2 search, F4 hold, F9 checkout ──
  useEffect(() => {
    const handleKey = (e) => {
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

  const handleCheckout = async () => {
    if (items.length === 0) {
      toast.error('Cart is empty.');
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
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Sale Completed!</h2>
        <p className="text-gray-500 mb-6">Total: Rs. {Number(completedSale.total).toLocaleString()}</p>
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
          <h2 className="text-2xl font-bold text-gray-800">Sales (POS)</h2>
          <div className="relative flex items-center gap-2">
            <button
              onClick={handleHold}
              title="Hold sale (F4)"
              className="flex items-center gap-2 bg-gray-100 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-200 text-sm"
            >
              <FaPause size={12} /> Hold
            </button>
            <button
              onClick={() => setShowHeldList((s) => !s)}
              className="flex items-center gap-2 bg-gray-100 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-200 text-sm"
            >
              <FaLayerGroup size={12} /> Held Sales {heldCarts.length > 0 && `(${heldCarts.length})`}
            </button>
            {showHeldList && (
              <div className="absolute right-0 top-full mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-20 p-2">
                {heldCarts.length === 0 ? (
                  <p className="text-sm text-gray-400 p-2">No held sales.</p>
                ) : (
                  heldCarts.map((h) => (
                    <div key={h.id} className="flex items-center justify-between gap-2 p-2 hover:bg-gray-50 rounded text-sm">
                      <button onClick={() => handleResumeHeld(h.id)} className="text-left flex-1">
                        <p className="font-medium text-gray-800">{h.label}</p>
                        <p className="text-xs text-gray-400">
                          {h.items.length} item{h.items.length > 1 ? 's' : ''} · {new Date(h.heldAt).toLocaleTimeString()}
                        </p>
                      </button>
                      <button onClick={() => discardHeldCart(h.id)} title="Discard" className="text-gray-400 hover:text-red-600">
                        <FaTimes size={12} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
        <p className="text-xs text-gray-400 mb-3">F2 search · F4 hold · F9 checkout</p>
        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <FaSearch className="absolute left-3 top-3.5 text-gray-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchTerm}
              onChange={handleSearch}
              onKeyDown={handleBarcodeScan}
              placeholder="Search by name, barcode, size, colour..."
              className="w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>
          <button
            onClick={handleShowAll}
            className="px-4 py-3 bg-gray-700 text-white rounded-lg hover:bg-gray-800 text-sm whitespace-nowrap"
          >
            All Items
          </button>
        </div>
        {searching && <p className="text-gray-500 text-sm">Searching...</p>}
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
                className="relative text-left bg-white border border-gray-200 rounded-lg p-3 hover:border-blue-500 hover:shadow transition"
              >
                {hasPromo && (
                  <span className={`absolute top-2 right-2 text-[10px] font-bold text-white px-1.5 py-0.5 rounded ${isClearance ? 'bg-amber-500' : 'bg-red-500'}`}>
                    {isClearance ? 'CLEARANCE ' : ''}{effPromoType === 'percent' ? `-${effPromoValue}%` : `-Rs.${effPromoValue}`}
                  </span>
                )}
                <p className="font-medium text-gray-800">
                  {product.product_name}
                  {product.barcode && (
                    <span className="text-xs text-gray-400 font-mono ml-1">[{product.barcode}]</span>
                  )}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {product.size || '—'}{product.color ? ` · ${product.color}` : ''}
                </p>
                <div className="flex justify-between items-center mt-2">
                  <div className="flex items-center gap-2">
                    {hasPromo ? (
                      <>
                        <span className="text-xs text-gray-400 line-through">Rs. {sellPrice.toLocaleString()}</span>
                        <span className="font-bold text-red-600">Rs. {promoPrice.toLocaleString()}</span>
                      </>
                    ) : (
                      <span className="font-bold text-blue-600">Rs. {sellPrice.toLocaleString()}</span>
                    )}
                  </div>
                  <span className={`text-xs ${product.stock_quantity < 1 ? 'text-red-500' : 'text-gray-500'}`}>
                    Stock: {product.stock_quantity}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
        {searchTerm && results.length === 0 && !searching && (
          <p className="text-gray-500 text-sm mt-4">No products found.</p>
        )}
      </div>

      {/* RIGHT — cart */}
      <div className="w-96 bg-white border-l border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200 flex items-center gap-2">
          <FaShoppingCart className="text-blue-600" />
          <h3 className="font-bold text-gray-800">Cart ({getItemCount()})</h3>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {items.length === 0 ? (
            <p className="text-gray-400 text-sm text-center mt-8">Cart is empty. Search and add products.</p>
          ) : (
            items.map((item) => {
              const itemDiscount = getItemDiscount(item);
              const lineTotal = getItemLineTotal(item);
              const promoDiscount = getItemPromoDiscount(item);
              const bargainDiscount = getItemBargainDiscount(item);
              const hasPromo = item.promoType && item.promoValue > 0;
              return (
                <div key={item.variantId} className="mb-3 pb-3 border-b border-gray-100">
                  <div className="flex justify-between">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm text-gray-800">{item.productName}</p>
                      {hasPromo && (
                        <span className="text-[10px] font-semibold bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                          PROMO {item.promoType === 'percent' ? `${item.promoValue}%` : `Rs.${item.promoValue}`}
                        </span>
                      )}
                    </div>
                    <button onClick={() => removeItem(item.variantId)} className="text-red-400 hover:text-red-600">
                      <FaTrash size={12} />
                    </button>
                  </div>
                  <p className="text-xs text-gray-500">{item.size} · {item.color}</p>

                  <div className="flex justify-between items-center mt-2">
                    <div className="flex items-center gap-2">
                      <button onClick={() => decreaseQty(item.variantId)} className="w-6 h-6 bg-gray-200 rounded flex items-center justify-center hover:bg-gray-300">
                        <FaMinus size={10} />
                      </button>
                      <span className="text-sm w-6 text-center">{item.quantity}</span>
                      <button onClick={() => increaseQty(item.variantId)} className="w-6 h-6 bg-gray-200 rounded flex items-center justify-center hover:bg-gray-300">
                        <FaPlus size={10} />
                      </button>
                    </div>
                    <div className="text-right">
                      {itemDiscount > 0 && (
                        <span className="text-xs text-gray-400 line-through block">
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
                    <span className="text-xs text-gray-500">{hasPromo ? 'Extra:' : 'Discount:'}</span>
                    <div className="flex border border-gray-300 rounded overflow-hidden">
                      <button
                        onClick={() => setItemDiscountType(item.variantId, 'percent')}
                        className={`px-2 py-0.5 text-xs ${item.discountType === 'percent' ? 'bg-yellow-500 text-black' : 'bg-gray-100 text-gray-600'}`}
                      >
                        %
                      </button>
                      <button
                        onClick={() => setItemDiscountType(item.variantId, 'fixed')}
                        className={`px-2 py-0.5 text-xs ${item.discountType === 'fixed' ? 'bg-yellow-500 text-black' : 'bg-gray-100 text-gray-600'}`}
                      >
                        Rs
                      </button>
                    </div>
                    <input
                      type="number"
                      min="0"
                      value={item.discountValue || ''}
                      onChange={(e) => setItemDiscountValue(item.variantId, e.target.value)}
                      placeholder="0"
                      className="w-16 px-2 py-0.5 border border-gray-300 rounded text-xs"
                    />
                    {bargainDiscount > 0 && (
                      <span className="text-xs text-green-600">−Rs. {bargainDiscount.toLocaleString()}</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="p-4 border-t border-gray-200">
          <div className="flex justify-between text-sm mb-1">
            <span className="text-gray-600">Subtotal</span>
            <span>Rs. {subtotal.toLocaleString()}</span>
          </div>
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
                    className={`flex-1 py-2 text-xs rounded capitalize ${payments[0].method === method ? 'bg-yellow-500 text-black' : 'bg-gray-100 text-gray-700'}`}
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
                    className="px-2 py-1.5 border border-gray-300 rounded text-xs capitalize flex-1"
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
                    className="w-24 px-2 py-1.5 border border-gray-300 rounded text-xs"
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
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
              />
              {cashReceived && change >= 0 && (
                <p className="text-sm text-green-600 mt-1">Change: Rs. {change.toLocaleString()}</p>
              )}
            </div>
          )}
          <button
            onClick={handleCheckout}
            disabled={processing || items.length === 0}
            className="w-full bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
          >
            {processing ? 'Processing...' : 'Complete Sale'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Sales;