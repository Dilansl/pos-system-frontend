import { useState, useRef } from 'react';
import toast from 'react-hot-toast';
import { useReactToPrint } from 'react-to-print';
import { FaSearch, FaTrash, FaPlus, FaMinus, FaShoppingCart, FaPrint, FaCheckCircle } from 'react-icons/fa';
import productService from '../services/product.service';
import saleService from '../services/sale.service';
import useCartStore from '../store/cartStore';
import Receipt from '../components/sales/Receipt';

function Sales() {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [cashReceived, setCashReceived] = useState('');
  const [processing, setProcessing] = useState(false);
  const [completedSale, setCompletedSale] = useState(null);

  const receiptRef = useRef();

  const {
    items, addItem, increaseQty, decreaseQty, removeItem,
    setItemDiscountType, setItemDiscountValue,
    getItemDiscount, getItemLineTotal,
    getItemPromoDiscount, getItemBargainDiscount,
    clearCart, getSubtotal, getTotal, getTotalDiscount, getItemCount,
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

  const handleCheckout = async () => {
    if (items.length === 0) {
      toast.error('Cart is empty.');
      return;
    }
    const total = getTotal();
    if (paymentMethod === 'cash' && Number(cashReceived) < total) {
      toast.error('Cash received is less than total.');
      return;
    }
    setProcessing(true);

    const saleData = {
      subtotal: getSubtotal(),
      discountAmount: getTotalDiscount(),
      taxAmount: 0,
      total: total,
      items: items.map((i) => ({
        variantId: i.variantId,
        quantity: i.quantity,
        unitPrice: i.sellPrice,
        discountAmount: getItemDiscount(i),
        lineTotal: getItemLineTotal(i),
      })),
      payments: [{ method: paymentMethod, amount: total, reference: null }],
    };

    try {
      const res = await saleService.create(saleData);
      const fullSale = await saleService.getById(res.data.id);
      const saleForReceipt = {
        ...fullSale.data,
        cashReceived: paymentMethod === 'cash' ? Number(cashReceived) : null,
        change: paymentMethod === 'cash' ? Number(cashReceived) - total : null,
      };
      setCompletedSale(saleForReceipt);
      toast.success('Sale completed!');
      clearCart();
      setCashReceived('');
      setSearchTerm('');
      setResults([]);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Sale failed.');
    } finally {
      setProcessing(false);
    }
  };

  const startNewSale = () => setCompletedSale(null);

  const subtotal = getSubtotal();
  const totalDiscount = getTotalDiscount();
  const total = getTotal();
  const change = Number(cashReceived) - total;

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
          <button onClick={handlePrint} className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700">
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
        <h2 className="text-2xl font-bold text-gray-800 mb-4">Sales (POS)</h2>
        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <FaSearch className="absolute left-3 top-3.5 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={handleSearch}
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
                        className={`px-2 py-0.5 text-xs ${item.discountType === 'percent' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}
                      >
                        %
                      </button>
                      <button
                        onClick={() => setItemDiscountType(item.variantId, 'fixed')}
                        className={`px-2 py-0.5 text-xs ${item.discountType === 'fixed' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}
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
          <div className="flex gap-2 mb-3">
            {['cash', 'card', 'bank_transfer'].map((method) => (
              <button
                key={method}
                onClick={() => setPaymentMethod(method)}
                className={`flex-1 py-2 text-xs rounded capitalize ${paymentMethod === method ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
              >
                {method.replace('_', ' ')}
              </button>
            ))}
          </div>
          {paymentMethod === 'cash' && (
            <div className="mb-3">
              <input
                type="number"
                value={cashReceived}
                onChange={(e) => setCashReceived(e.target.value)}
                placeholder="Cash received"
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