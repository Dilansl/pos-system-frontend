import { forwardRef } from 'react';

const Receipt = forwardRef(({ sale }, ref) => {
  if (!sale) return null;

  return (
    <div ref={ref} className="p-6 text-sm" style={{ width: '300px', fontFamily: 'monospace' }}>
      {/* Header */}
      <div className="text-center mb-4">
        <h2 className="text-lg font-bold">ROPYCO Fashion</h2>
        <p className="text-xs">Clothing Shop</p>
        <p className="text-xs">Nittambuwwa, Sri Lanka</p>
        <p className="text-xs">Tel: 0706201176</p>
      </div>

      <div className="border-t border-b border-dashed border-gray-400 py-2 mb-2 text-xs">
        <div className="flex justify-between">
          <span>Receipt:</span>
          <span>{sale.receipt_seq ? `RF-${String(sale.receipt_seq).padStart(4, '0')}` : `#${sale.id?.slice(0, 8)}`}</span>
        </div>
        <div className="flex justify-between">
          <span>Cashier:</span>
          <span>{sale.cashier_name || '—'}</span>
        </div>
        <div className="flex justify-between">
          <span>Date:</span>
          <span>{new Date(sale.created_at).toLocaleString()}</span>
        </div>
      </div>

      {/* Items */}
      <table className="w-full text-xs mb-2">
        <thead>
          <tr className="border-b border-dashed border-gray-400">
            <th className="text-left py-1">Item</th>
            <th className="text-center py-1">Qty</th>
            <th className="text-right py-1">Total</th>
          </tr>
        </thead>
        <tbody>
          {sale.items?.map((item) => (
            <tr key={item.id}>
              <td className="py-1">
                {item.product_name}
                <br />
                <span className="text-gray-500">{item.size}·{item.color}</span>
              </td>
              <td className="text-center py-1">{item.quantity}</td>
              <td className="text-right py-1">{Number(item.line_total).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="border-t border-dashed border-gray-400 pt-2 text-xs">
        <div className="flex justify-between">
          <span>Subtotal:</span>
          <span>Rs. {Number(sale.subtotal).toLocaleString()}</span>
        </div>
        {Number(sale.discount_amount) > 0 && (
          <div className="flex justify-between">
            <span>Discount:</span>
            <span>- Rs. {Number(sale.discount_amount).toLocaleString()}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-sm mt-1">
          <span>TOTAL:</span>
          <span>Rs. {Number(sale.total).toLocaleString()}</span>
        </div>
      </div>

      {/* Payment */}
      <div className="border-t border-dashed border-gray-400 pt-2 mt-2 text-xs">
        {sale.payments?.map((p) => (
          <div key={p.id} className="flex justify-between">
            <span className="capitalize">{p.method?.replace('_', ' ')}:</span>
            <span>Rs. {Number(p.amount).toLocaleString()}</span>
          </div>
        ))}

        {sale.cashReceived != null && (
          <>
            <div className="flex justify-between mt-1">
              <span>Cash Received:</span>
              <span>Rs. {Number(sale.cashReceived).toLocaleString()}</span>
            </div>
            <div className="flex justify-between font-bold">
              <span>Change:</span>
              <span>Rs. {Number(sale.change).toLocaleString()}</span>
            </div>
          </>
        )}
      </div>

      <div className="text-center mt-4 text-xs">
        <p>Thank you for shopping!</p>
        <p className="text-gray-500">Please keep this receipt</p>
      </div>
    </div>
  );
});

Receipt.displayName = 'Receipt';

export default Receipt;