import type { Payment, Sale, SaleItem } from "./types";

interface Props {
  customer: { customer: string; phone: string | null; customer_id: number | null };
  unpaidSales: Sale[];
  saleItems: Record<number, SaleItem[]>;
  payments: (Payment & { sale_total: number })[];
  shopName: string;
  currency: string;
  onClose: () => void;
}

function fmt(currency: string, n: number) {
  return `${currency} ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function CustomerStatement({ customer, unpaidSales, saleItems, payments, shopName, currency, onClose }: Props) {
  const balance = unpaidSales.reduce((s, x) => s + (x.total - x.paid), 0);

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .statement-print, .statement-print * { visibility: visible !important; }
          .statement-print { position: absolute; left: 0; top: 0; width: 100%; padding: 20px; margin: 0; background: white; color: black; }
          .statement-no-print { display: none !important; }
          @page { size: A4; margin: 15mm; }
        }
        .statement-print table { border-collapse: collapse; width: 100%; }
        .statement-print th, .statement-print td { padding: 6px 8px; text-align: left; border-bottom: 1px solid #ccc; }
        .statement-print th { background: #f3f4f6; font-size: 12px; }
        .statement-print .right { text-align: right; }
      `}</style>

      <div className="modal modal-open">
        <div className="modal-box max-w-3xl">
          <div className="statement-print text-sm">
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="text-2xl font-bold">{shopName}</div>
                <div className="text-xs opacity-70">Customer Statement</div>
              </div>
              <div className="text-right text-xs">
                <div>Statement date: {new Date().toLocaleDateString()}</div>
              </div>
            </div>

            <div className="border-t border-b py-3 mb-4 grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs opacity-70">Bill to</div>
                <div className="font-bold text-base">{customer.customer}</div>
                {customer.phone && <div>📞 {customer.phone}</div>}
              </div>
              <div className="text-right">
                <div className="text-xs opacity-70">Amount due</div>
                <div className="font-bold text-2xl text-red-600">{fmt(currency, balance)}</div>
              </div>
            </div>

            <h3 className="font-bold mb-2">Outstanding Invoices</h3>
            <table className="mb-4">
              <thead>
                <tr>
                  <th>Sale #</th>
                  <th>Date</th>
                  <th>Items</th>
                  <th className="right">Total</th>
                  <th className="right">Paid</th>
                  <th className="right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {unpaidSales.map((s) => {
                  const items = saleItems[s.id] ?? [];
                  const itemsText = items.map((i: any) => `${i.product_name ?? "#" + i.product_id} ×${i.quantity}`).join(", ");
                  return (
                    <tr key={s.id}>
                      <td>#{s.id}</td>
                      <td>{s.created_at.slice(0, 10)}</td>
                      <td className="text-xs">{itemsText}</td>
                      <td className="right">{fmt(currency, s.total)}</td>
                      <td className="right">{fmt(currency, s.paid)}</td>
                      <td className="right font-bold">{fmt(currency, s.total - s.paid)}</td>
                    </tr>
                  );
                })}
                <tr>
                  <td colSpan={5} className="right font-bold">TOTAL DUE</td>
                  <td className="right font-bold">{fmt(currency, balance)}</td>
                </tr>
              </tbody>
            </table>

            {payments.length > 0 && (
              <>
                <h3 className="font-bold mb-2">Recent Payments</h3>
                <table>
                  <thead>
                    <tr><th>Date</th><th>Sale</th><th className="right">Amount</th><th>Note</th></tr>
                  </thead>
                  <tbody>
                    {payments.slice(0, 15).map((p) => (
                      <tr key={p.id}>
                        <td>{p.created_at.slice(0, 16).replace("T", " ")}</td>
                        <td>#{p.sale_id}</td>
                        <td className="right">{fmt(currency, p.amount)}</td>
                        <td>{p.note ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            <div className="mt-6 text-xs opacity-70 text-center">
              Please settle the outstanding balance at your earliest convenience. Thank you for your business.
            </div>
          </div>

          <div className="modal-action statement-no-print">
            <button type="button" className="btn btn-sm" onClick={onClose}>Close</button>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => window.print()}>Print Statement</button>
          </div>
        </div>
      </div>
    </>
  );
}
