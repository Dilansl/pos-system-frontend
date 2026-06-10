import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { FaPlus, FaBoxOpen, FaTag, FaEdit, FaTrash } from 'react-icons/fa';
import productService from '../services/product.service';

function Products() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editProduct, setEditProduct] = useState(null);

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
function ProductModal({ product, categories, onClose, onSuccess }) {
  const isEdit = !!product;
  const [name, setName] = useState(product?.name || '');
  const [categoryId, setCategoryId] = useState(product?.category_id || '');
  const [basePrice, setBasePrice] = useState(product?.base_price || '');
  const [description, setDescription] = useState(product?.description || '');
  const [isActive, setIsActive] = useState(product?.is_active ?? true);
  // Variants only shown when adding a new product
  const [variants, setVariants] = useState([
    { size: '', color: '', barcode: '', initialStock: 0, minQuantity: 5 },
  ]);
  const [saving, setSaving] = useState(false);

  const addVariantRow = () => {
    setVariants([...variants, { size: '', color: '', barcode: '', initialStock: 0, minQuantity: 5 }]);
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
    setSaving(true);
    try {
      if (isEdit) {
        await productService.update(product.id, {
          name,
          description,
          basePrice: Number(basePrice),
          categoryId: categoryId || null,
          isActive,
        });
        toast.success('Product updated.');
      } else {
        await productService.create({
          name,
          description,
          basePrice: Number(basePrice),
          categoryId: categoryId || null,
          variants: variants.map((v) => ({
            ...v,
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
              <div key={i} className="grid grid-cols-5 gap-2 mb-2 items-center">
                <input value={v.size} onChange={(e) => updateVariant(i, 'size', e.target.value)} placeholder="Size" className="px-2 py-1.5 border border-gray-300 rounded text-sm" />
                <input value={v.color} onChange={(e) => updateVariant(i, 'color', e.target.value)} placeholder="Colour" className="px-2 py-1.5 border border-gray-300 rounded text-sm" />
                <input value={v.barcode} onChange={(e) => updateVariant(i, 'barcode', e.target.value)} placeholder="Barcode" className="px-2 py-1.5 border border-gray-300 rounded text-sm" />
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

export default Products;