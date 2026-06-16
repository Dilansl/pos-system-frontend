import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { FaPlus, FaBoxOpen, FaTag, FaEdit, FaTrash, FaLayerGroup } from 'react-icons/fa';
import productService from '../services/product.service';

function Products() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [batchProduct, setBatchProduct] = useState(null);

  const loadData = async () => {
    try {
      const productsRes = await productService.getAll();
      setProducts(productsRes.data);
      const categoriesRes = await productService.getCategories();
      setCategories(categoriesRes.data);
    } catch (err) {
      toast.error('Failed to load products.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleDelete = async (product) => {
    if (!window.confirm(`Delete "${product.name}"? If it has sales history, it will be deactivated instead.`)) {
      return;
    }
    try {
      const res = await productService.delete(product.id);
      toast.success(res.message);
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete product.');
    }
  };

  const openEdit = (product) => {
    setEditProduct(product);
    setShowProductModal(true);
  };

  const openAdd = () => {
    setEditProduct(null);
    setShowProductModal(true);
  };

  const openAddBatch = (product) => {
    setBatchProduct(product);
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Products</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCategoryModal(true)}
            className="flex items-center gap-2 bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 text-sm"
          >
            <FaTag /> Add Category
          </button>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm"
          >
            <FaPlus /> Add Product
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : products.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-12 text-center">
          <FaBoxOpen className="text-gray-300 text-5xl mx-auto mb-3" />
          <p className="text-gray-500">No products yet. Add your first product.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Product</th>
                <th className="text-left px-4 py-3 font-medium">Category</th>
                <th className="text-left px-4 py-3 font-medium">Base Price</th>
                <th className="text-left px-4 py-3 font-medium">Variants</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{p.name}</td>
                  <td className="px-4 py-3 text-gray-600">{p.category_name || '—'}</td>
                  <td className="px-4 py-3 text-gray-800">Rs. {Number(p.base_price).toLocaleString()}</td>
                  <td className="px-4 py-3 text-gray-600">{p.variant_count}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs ${p.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {p.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3 text-gray-500">
                      <button onClick={() => openEdit(p)} title="Edit" className="hover:text-blue-600">
                        <FaEdit />
                      </button>
                      <button onClick={() => openAddBatch(p)} title="Manage Batches" className="hover:text-green-600">
                        <FaLayerGroup />
                      </button>
                      <button onClick={() => handleDelete(p)} title="Delete" className="hover:text-red-600">
                        <FaTrash />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCategoryModal && (
        <CategoryModal
          onClose={() => setShowCategoryModal(false)}
          onSuccess={() => { setShowCategoryModal(false); loadData(); }}
        />
      )}

      {showProductModal && (
        <ProductModal
          product={editProduct}
          categories={categories}
          onClose={() => setShowProductModal(false)}
          onSuccess={() => { setShowProductModal(false); loadData(); }}
        />
      )}

      {batchProduct && (
        <ManageBatchesModal
          product={batchProduct}
          onClose={() => setBatchProduct(null)}
          onSuccess={loadData}
        />
      )}

    </div>
  );
}

// ─── Category Modal ───────────────────────────────
function CategoryModal({ onClose, onSuccess }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Category name is required.');
      return;
    }
    setSaving(true);
    try {
      await productService.createCategory({ name, description });
      toast.success('Category added.');
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add category.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-bold text-gray-800 mb-4">Add Category</h3>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Category name"
          className="w-full px-3 py-2 border border-gray-300 rounded mb-3"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          className="w-full px-3 py-2 border border-gray-300 rounded mb-4"
          rows={2}
        />
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add / Edit Product Modal ─────────────────────
// ─── Add / Edit Product Modal ─────────────────────
function ProductModal({ product, categories, onClose, onSuccess }) {
  const isEdit = !!product;
  const [name, setName] = useState(product?.name || '');
  const [categoryId, setCategoryId] = useState(product?.category_id || '');
  const [basePrice, setBasePrice] = useState(product?.base_price || '');
  const [description, setDescription] = useState(product?.description || '');
  const [isActive, setIsActive] = useState(product?.is_active ?? true);
  // Promotion (standing auto-discount on the product)
  const [promoType, setPromoType] = useState(product?.promo_type || '');
  const [promoValue, setPromoValue] = useState(product?.promo_value || '');
  // Variants only shown when adding a new product
  const [variants, setVariants] = useState([
    { size: '', color: '', barcode: '', costPrice: '', priceOverride: '', initialStock: 0, minQuantity: 5 },
  ]);
  const [saving, setSaving] = useState(false);

  const addVariantRow = () => {
    setVariants([...variants, { size: '', color: '', barcode: '', costPrice: '', priceOverride: '', initialStock: 0, minQuantity: 5 }]);
  };
  const updateVariant = (index, field, value) => {
    const updated = [...variants];
    updated[index][field] = value;
    setVariants(updated);
  };
  const removeVariant = (index) => {
    setVariants(variants.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!name.trim() || !basePrice) {
      toast.error('Product name and base price are required.');
      return;
    }
    // If a promo type is chosen, a value is required
    if (promoType && (!promoValue || Number(promoValue) <= 0)) {
      toast.error('Enter a promotion value, or set Promotion to None.');
      return;
    }
    setSaving(true);
    try {
      // Normalise promo: if no type, clear both
      const promoPayload = promoType
        ? { promoType, promoValue: Number(promoValue) }
        : { promoType: null, promoValue: 0 };

      if (isEdit) {
        await productService.update(product.id, {
          name,
          description,
          basePrice: Number(basePrice),
          categoryId: categoryId || null,
          isActive,
          ...promoPayload,
        });
        toast.success('Product updated.');
      } else {
        await productService.create({
          name,
          description,
          basePrice: Number(basePrice),
          categoryId: categoryId || null,
          ...promoPayload,
          variants: variants.map((v) => ({
            ...v,
            costPrice: Number(v.costPrice) || 0,
            priceOverride: Number(v.priceOverride) || null,
            initialStock: Number(v.initialStock),
            minQuantity: Number(v.minQuantity),
          })),
        });
        toast.success('Product created.');
      }
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save product.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold text-gray-800 mb-4">{isEdit ? 'Edit Product' : 'Add Product'}</h3>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Product name" className="px-3 py-2 border border-gray-300 rounded" />
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="px-3 py-2 border border-gray-300 rounded">
            <option value="">Select category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <input type="number" value={basePrice} onChange={(e) => setBasePrice(e.target.value)} placeholder="Base price" className="w-full px-3 py-2 border border-gray-300 rounded mb-3" />

        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" className="w-full px-3 py-2 border border-gray-300 rounded mb-3" rows={2} />

        {/* Promotion — standing auto-discount applied to all customers */}
        <div className="mb-4 border border-gray-200 rounded-lg p-3 bg-gray-50">
          <h4 className="font-medium text-gray-700 text-sm mb-2">Promotion (auto-discount for all customers)</h4>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={promoType}
              onChange={(e) => setPromoType(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded text-sm bg-white"
            >
              <option value="">No promotion</option>
              <option value="percent">Percentage (%)</option>
              <option value="fixed">Fixed amount (Rs.)</option>
            </select>
            {promoType && (
              <input
                type="number"
                value={promoValue}
                onChange={(e) => setPromoValue(e.target.value)}
                placeholder={promoType === 'percent' ? 'e.g. 10 (%)' : 'e.g. 200 (Rs.)'}
                className="px-3 py-2 border border-gray-300 rounded text-sm"
              />
            )}
          </div>
          {promoType && (
            <p className="text-xs text-gray-500 mt-2">
              This {promoType === 'percent' ? 'percentage' : 'amount'} is automatically taken off this product's price at checkout for every customer.
            </p>
          )}
        </div>

        {/* Active toggle — only when editing */}
        {isEdit && (
          <label className="flex items-center gap-2 mb-4 text-sm text-gray-700">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Active (visible in POS)
          </label>
        )}

        {/* Variants — only when adding */}
        {!isEdit && (
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <h4 className="font-medium text-gray-700 text-sm">Variants</h4>
              <button onClick={addVariantRow} className="text-blue-600 text-sm flex items-center gap-1">
                <FaPlus size={10} /> Add variant
              </button>
            </div>
            {variants.map((v, i) => (
              <div key={i} className="grid grid-cols-7 gap-2 mb-2 items-center">
                <input value={v.size} onChange={(e) => updateVariant(i, 'size', e.target.value)} placeholder="Size" className="px-2 py-1.5 border border-gray-300 rounded text-sm" />
                <input value={v.color} onChange={(e) => updateVariant(i, 'color', e.target.value)} placeholder="Colour" className="px-2 py-1.5 border border-gray-300 rounded text-sm" />
                <input value={v.barcode} onChange={(e) => updateVariant(i, 'barcode', e.target.value)} placeholder="Code (PCTS.01)" className="px-2 py-1.5 border border-gray-300 rounded text-sm" />
                <input type="number" value={v.costPrice} onChange={(e) => updateVariant(i, 'costPrice', e.target.value)} placeholder="Cost" className="px-2 py-1.5 border border-gray-300 rounded text-sm" />
                <input type="number" value={v.priceOverride} onChange={(e) => updateVariant(i, 'priceOverride', e.target.value)} placeholder="Price" className="px-2 py-1.5 border border-gray-300 rounded text-sm" />
                <input type="number" value={v.initialStock} onChange={(e) => updateVariant(i, 'initialStock', e.target.value)} placeholder="Stock" className="px-2 py-1.5 border border-gray-300 rounded text-sm" />
                <button onClick={() => removeVariant(i)} className="text-red-500 text-sm">Remove</button>
              </div>
            ))}
          </div>
        )}

        {isEdit && (
          <p className="text-xs text-gray-400 mb-4">
            To add or change variants, use the inventory screen. Editing here updates the product details only.
          </p>
        )}

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving...' : isEdit ? 'Update' : 'Create Product'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Manage Batches Modal (list + edit + add coded variants) ───
function ManageBatchesModal({ product, onClose, onSuccess }) {
  const [variants, setVariants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('list'); // 'list' | 'add' | 'edit'
  const [editing, setEditing] = useState(null);

  const loadVariants = async () => {
    setLoading(true);
    try {
      const res = await productService.getById(product.id);
      setVariants(res.data.variants || []);
    } catch (err) {
      toast.error('Failed to load batches.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVariants();
  }, []);

  const handleSaved = () => {
    setMode('list');
    setEditing(null);
    loadVariants();
    onSuccess(); // refresh the product list (variant count) behind the modal
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-bold text-gray-800">Manage Batches</h3>
            <p className="text-sm text-gray-500">{product.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        {/* LIST MODE */}
        {mode === 'list' && (
          <>
            {loading ? (
              <p className="text-gray-500 text-sm">Loading batches...</p>
            ) : variants.length === 0 ? (
              <p className="text-gray-500 text-sm">No batches yet.</p>
            ) : (
              <table className="w-full text-sm mb-4">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Code</th>
                    <th className="text-left px-3 py-2 font-medium">Size/Colour</th>
                    <th className="text-right px-3 py-2 font-medium">Cost</th>
                    <th className="text-right px-3 py-2 font-medium">Price</th>
                    <th className="text-center px-3 py-2 font-medium">Stock</th>
                    <th className="text-center px-3 py-2 font-medium">Edit</th>
                  </tr>
                </thead>
                <tbody>
                  {variants.map((v) => (
                    <tr key={v.id} className="border-t border-gray-100">
                      <td className="px-3 py-2 font-medium text-gray-800">{v.barcode || '—'}</td>
                      <td className="px-3 py-2 text-gray-600">{v.size || '—'} · {v.color || '—'}</td>
                      <td className="px-3 py-2 text-right text-gray-600">Rs. {Number(v.cost_price || 0).toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-gray-800">Rs. {Number(v.price_override || product.base_price).toLocaleString()}</td>
                      <td className="px-3 py-2 text-center text-gray-600">{v.quantity ?? '—'}</td>
                      <td className="px-3 py-2 text-center">
                        <button
                          onClick={() => { setEditing(v); setMode('edit'); }}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          <FaEdit />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div className="flex justify-between items-center">
              <button
                onClick={() => setMode('add')}
                className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm"
              >
                <FaPlus /> Add New Batch
              </button>
              <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Close</button>
            </div>
          </>
        )}

        {/* ADD MODE */}
        {mode === 'add' && (
          <BatchForm
            product={product}
            onCancel={() => setMode('list')}
            onSaved={handleSaved}
          />
        )}

        {/* EDIT MODE */}
        {mode === 'edit' && editing && (
          <BatchForm
            product={product}
            variant={editing}
            onCancel={() => { setMode('list'); setEditing(null); }}
            onSaved={handleSaved}
          />
        )}
      </div>
    </div>
  );
}

// ─── Batch Form (shared by Add + Edit) ───
// ─── Batch Form (shared by Add + Edit) ───
function BatchForm({ product, variant, onCancel, onSaved }) {
  const isEdit = !!variant;
  const [size, setSize] = useState(variant?.size || '');
  const [color, setColor] = useState(variant?.color || '');
  const [barcode, setBarcode] = useState(variant?.barcode || '');
  const [costPrice, setCostPrice] = useState(variant?.cost_price || '');
  const [priceOverride, setPriceOverride] = useState(variant?.price_override || '');
  const [promoType, setPromoType] = useState(variant?.promo_type || '');
  const [promoValue, setPromoValue] = useState(variant?.promo_value || '');
  const [initialStock, setInitialStock] = useState(0);
  const [minQuantity, setMinQuantity] = useState(5);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!barcode.trim()) {
      toast.error('A batch code is required.');
      return;
    }
    if (!priceOverride) {
      toast.error('A selling price is required.');
      return;
    }
    if (promoType && (!promoValue || Number(promoValue) <= 0)) {
      toast.error('Enter a clearance value, or set it to No clearance.');
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        await productService.updateVariant(variant.id, {
          size,
          color,
          barcode: barcode.trim(),
          costPrice: Number(costPrice) || 0,
          priceOverride: Number(priceOverride) || null,
          promoType: promoType || null,
          promoValue: promoType ? Number(promoValue) || 0 : 0,
        });
        toast.success('Batch updated.');
      } else {
        await productService.addVariant(product.id, {
          size,
          color,
          barcode: barcode.trim(),
          costPrice: Number(costPrice) || 0,
          priceOverride: Number(priceOverride) || null,
          promoType: promoType || null,
          promoValue: promoType ? Number(promoValue) || 0 : 0,
          initialStock: Number(initialStock) || 0,
          minQuantity: Number(minQuantity) || 5,
        });
        toast.success('Batch added.');
      }
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save batch.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h4 className="font-medium text-gray-700 mb-3">{isEdit ? `Edit Batch — ${variant.barcode}` : 'Add New Batch'}</h4>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Size</label>
          <input value={size} onChange={(e) => setSize(e.target.value)} placeholder="e.g. M" className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Colour</label>
          <input value={color} onChange={(e) => setColor(e.target.value)} placeholder="e.g. black" className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
        </div>
      </div>

      <div className="mb-3">
        <label className="block text-xs text-gray-500 mb-1">Batch Code (barcode)</label>
        <input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="e.g. PCTS-MB.02" className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Cost Price</label>
          <input type="number" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} placeholder="e.g. 900" className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Selling Price</label>
          <input type="number" value={priceOverride} onChange={(e) => setPriceOverride(e.target.value)} placeholder="e.g. 1700" className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
        </div>
      </div>

      {/* Clearance promo — auto-discount this batch only */}
      <div className="mb-4 border border-amber-200 rounded-lg p-3 bg-amber-50">
        <h5 className="font-medium text-gray-700 text-sm mb-2">Clearance Promo (this batch only)</h5>
        <div className="grid grid-cols-2 gap-2">
          <select
            value={promoType}
            onChange={(e) => setPromoType(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded text-sm bg-white"
          >
            <option value="">No clearance</option>
            <option value="percent">Percentage (%)</option>
            <option value="fixed">Fixed amount (Rs.)</option>
          </select>
          {promoType && (
            <input
              type="number"
              value={promoValue}
              onChange={(e) => setPromoValue(e.target.value)}
              placeholder={promoType === 'percent' ? 'e.g. 20 (%)' : 'e.g. 300 (Rs.)'}
              className="px-3 py-2 border border-gray-300 rounded text-sm"
            />
          )}
        </div>
        {promoType && (
          <p className="text-xs text-gray-500 mt-2">
            This clearance discount applies only to this batch, automatically at checkout.
          </p>
        )}
      </div>

      {/* Stock fields only when adding (editing stock is done on Inventory screen) */}
      {!isEdit && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Initial Stock</label>
            <input type="number" value={initialStock} onChange={(e) => setInitialStock(e.target.value)} placeholder="0" className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Min Quantity (low-stock alert)</label>
            <input type="number" value={minQuantity} onChange={(e) => setMinQuantity(e.target.value)} placeholder="5" className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
          </div>
        </div>
      )}

      {isEdit && (
        <p className="text-xs text-gray-400 mb-4">
          To change stock, use the Inventory screen. Changing price/cost here only affects future sales — past sales keep their original figures.
        </p>
      )}

      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Cancel</button>
        <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'Saving...' : isEdit ? 'Update Batch' : 'Add Batch'}
        </button>
      </div>
    </div>
  );
}

export default Products;