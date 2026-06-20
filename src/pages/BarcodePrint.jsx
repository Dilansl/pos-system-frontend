import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { useReactToPrint } from 'react-to-print';
import { FaBarcode, FaPrint, FaSearch } from 'react-icons/fa';
import JsBarcode from 'jsbarcode';
import productService from '../services/product.service';

// Single barcode label (name + barcode + price) — used for PREVIEW
function BarcodeLabel({ shopName, productName, code, price }) {
  const svgRef = useRef(null);

  useEffect(() => {
    if (svgRef.current && code) {
      try {
        JsBarcode(svgRef.current, code, {
          format: 'CODE128',
          width: 1.6,
          height: 40,
          fontSize: 12,
          margin: 4,
          displayValue: true,
        });
      } catch (e) {
        // invalid code — ignore
      }
    }
  }, [code]);

  return (
    <div className="border border-gray-300 rounded p-2 text-center bg-white" style={{ width: '200px' }}>
      <p className="text-[11px] font-bold text-gray-800 leading-tight">{shopName}</p>
      <p className="text-[11px] text-gray-700 leading-tight truncate">{productName}</p>
      <svg ref={svgRef}></svg>
      <p className="text-sm font-bold text-gray-900">Rs. {Number(price).toLocaleString()}</p>
    </div>
  );
}

// Print-optimised label (sized via CSS for the chosen mm dimensions)
function PrintLabel({ shopName, productName, code, price }) {
  const svgRef = useRef(null);

  useEffect(() => {
    if (svgRef.current && code) {
      try {
        JsBarcode(svgRef.current, code, {
          format: 'CODE128',
          width: 1.4,
          height: 30,
          fontSize: 10,
          margin: 2,
          displayValue: true,
        });
      } catch (e) {
        // invalid code — ignore
      }
    }
  }, [code]);

  return (
    <div className="print-label">
      <p className="shop">{shopName}</p>
      <p className="product">{productName}</p>
      <svg ref={svgRef}></svg>
      <p className="price">Rs. {Number(price).toLocaleString()}</p>
    </div>
  );
}

function BarcodePrint() {
  const SHOP_NAME = 'ROPYCO Fashion';

  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [variants, setVariants] = useState([]);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [labelWidth, setLabelWidth] = useState(50);
  const [labelHeight, setLabelHeight] = useState(30);

  const printRef = useRef();

  const loadProducts = async () => {
    try {
      const res = await productService.getAll();
      setProducts(res.data);
    } catch (err) {
      toast.error('Failed to load products.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const selectProduct = async (product) => {
    setSelectedProduct(product);
    setSelectedVariant(null);
    try {
      const res = await productService.getById(product.id);
      setVariants(res.data.variants || []);
    } catch (err) {
      toast.error('Failed to load batches.');
    }
  };

  const handlePrint = useReactToPrint({
    contentRef: printRef,
  });

  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  // The price to show: variant price override, else product base price
  const labelPrice = selectedVariant
    ? Number(selectedVariant.price_override || selectedProduct.base_price)
    : 0;

  const labelCode = selectedVariant?.barcode || '';

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center gap-2">
        <FaBarcode /> Barcode Printing
      </h2>

      <div className="grid grid-cols-3 gap-4">
        {/* LEFT — product + batch selection */}
        <div className="col-span-1 bg-white rounded-lg shadow-sm p-4">
          <h3 className="font-medium text-gray-700 mb-2">1. Select Product</h3>
          <div className="relative mb-3">
            <FaSearch className="absolute left-3 top-3 text-gray-400 text-sm" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products..."
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded text-sm"
            />
          </div>

          {loading ? (
            <p className="text-gray-500 text-sm">Loading...</p>
          ) : (
            <div className="max-h-60 overflow-y-auto space-y-1 mb-4">
              {filtered.map((p) => (
                <button
                  key={p.id}
                  onClick={() => selectProduct(p)}
                  className={`w-full text-left px-3 py-2 rounded text-sm ${selectedProduct?.id === p.id ? 'bg-blue-600 text-white' : 'hover:bg-gray-100 text-gray-700'}`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}

          {/* Batch selection */}
          {selectedProduct && (
            <>
              <h3 className="font-medium text-gray-700 mb-2">2. Select Batch</h3>
              <div className="space-y-1 mb-4">
                {variants.length === 0 ? (
                  <p className="text-gray-400 text-sm">No batches.</p>
                ) : (
                  variants.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => setSelectedVariant(v)}
                      disabled={!v.barcode}
                      className={`w-full text-left px-3 py-2 rounded text-sm ${selectedVariant?.id === v.id ? 'bg-blue-600 text-white' : 'hover:bg-gray-100 text-gray-700'} ${!v.barcode ? 'opacity-40 cursor-not-allowed' : ''}`}
                    >
                      {v.barcode || '(no code)'} · {v.size || '—'}/{v.color || '—'} · Rs. {Number(v.price_override || selectedProduct.base_price).toLocaleString()}
                    </button>
                  ))
                )}
              </div>
            </>
          )}

          {/* Label size */}
          {selectedVariant && (
            <>
              <h3 className="font-medium text-gray-700 mb-2">3. Label Size (mm)</h3>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Width</label>
                  <input
                    type="number"
                    min="10"
                    value={labelWidth}
                    onChange={(e) => setLabelWidth(Math.max(10, Number(e.target.value)))}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Height</label>
                  <input
                    type="number"
                    min="10"
                    value={labelHeight}
                    onChange={(e) => setLabelHeight(Math.max(10, Number(e.target.value)))}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                  />
                </div>
              </div>
              <div className="flex gap-1 mb-4">
                <button onClick={() => { setLabelWidth(50); setLabelHeight(30); }} className="text-xs px-2 py-1 bg-gray-100 rounded hover:bg-gray-200">50×30</button>
                <button onClick={() => { setLabelWidth(40); setLabelHeight(30); }} className="text-xs px-2 py-1 bg-gray-100 rounded hover:bg-gray-200">40×30</button>
                <button onClick={() => { setLabelWidth(38); setLabelHeight(25); }} className="text-xs px-2 py-1 bg-gray-100 rounded hover:bg-gray-200">38×25</button>
                <button onClick={() => { setLabelWidth(70); setLabelHeight(40); }} className="text-xs px-2 py-1 bg-gray-100 rounded hover:bg-gray-200">70×40</button>
              </div>

              <h3 className="font-medium text-gray-700 mb-2">4. Quantity</h3>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm mb-4"
              />
              <button
                onClick={handlePrint}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700"
              >
                <FaPrint /> Print {quantity} Label{quantity > 1 ? 's' : ''}
              </button>
            </>
          )}
        </div>

        {/* RIGHT — live preview */}
        <div className="col-span-2 bg-white rounded-lg shadow-sm p-4">
          <h3 className="font-medium text-gray-700 mb-3">Preview ({labelWidth}×{labelHeight}mm)</h3>
          {selectedVariant ? (
            <div className="flex flex-wrap gap-3">
              <BarcodeLabel
                shopName={SHOP_NAME}
                productName={selectedProduct.name}
                code={labelCode}
                price={labelPrice}
              />
              {quantity > 1 && (
                <p className="text-sm text-gray-500 self-center">
                  …and {quantity - 1} more identical label{quantity - 1 > 1 ? 's' : ''} will print.
                </p>
              )}
            </div>
          ) : (
            <p className="text-gray-400 text-sm">Select a product and batch to preview the label.</p>
          )}
        </div>
      </div>

      {/* Hidden printable area — the actual labels that print */}
      <div style={{ display: 'none' }}>
        <div ref={printRef}>
          <style>{`
            @media print {
              @page {
                size: ${labelWidth}mm ${labelHeight}mm;
                margin: 0;
              }
              .label-sheet { margin: 0; padding: 0; }
              .print-label {
                width: ${labelWidth}mm;
                height: ${labelHeight}mm;
                page-break-after: always;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                box-sizing: border-box;
                padding: 1mm;
                overflow: hidden;
              }
              .print-label:last-child { page-break-after: auto; }
              .print-label .shop { font-size: 8pt; font-weight: bold; margin: 0; }
              .print-label .product { font-size: 7pt; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: ${labelWidth - 2}mm; }
              .print-label .price { font-size: 10pt; font-weight: bold; margin: 0; }
              .print-label svg { max-width: ${labelWidth - 4}mm; height: auto; }
            }
          `}</style>
          <div className="label-sheet">
            {selectedVariant &&
              Array.from({ length: quantity }).map((_, i) => (
                <PrintLabel
                  key={i}
                  shopName={SHOP_NAME}
                  productName={selectedProduct.name}
                  code={labelCode}
                  price={labelPrice}
                />
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default BarcodePrint;