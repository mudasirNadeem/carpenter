import { useEffect } from "react";
import type { Sale, SaleItem } from "./types";

interface Props {
  sale: Sale;
  items: SaleItem[];
  shopName: string;
  currency: string;
  customerName: string | null;
  onClose: () => void;
  autoPrint?: boolean;
}

function fmt(currency: string, n: number) {
  return `${currency} ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function Receipt({ sale, items, shopName, currency, customerName, onClose, autoPrint }: Props) {
  useEffect(() => {
    if (autoPrint) setTimeout(() => window.print(), 150);
  }, [autoPrint]);

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .receipt-print, .receipt-print * { visibility: visible !important; }
          .receipt-print { position: absolute; left: 0; top: 0; width: 100%; padding: 0; margin: 0; background: white; color: black; }
          .receipt-no-print { display: none !important; }
          @page { size: 80mm auto; margin: 4mm; }
        }
      `}</style>

      <div className="modal modal-open">
        <div className="modal-box max-w-md">
          <div className="receipt-print font-mono text-sm">
            <div className="text-center mb-3">
              <div className="font-bold text-lg">{shopName}</div>
              <div className="text-xs opacity-70">Sale Receipt</div>
            </div>
            <div className="border-t border-b border-dashed py-2 mb-2 text-xs">
              <div className="flex justify-between"><span>Receipt #</span><span>{sale.id}</span></div>
              <div className="flex justify-between"><span>Date</span><span>{new Date(sale.created_at).toLocaleString()}</span></div>
              <div className="flex justify-between"><span>Customer</span><span>{customerName ?? "Walk-in"}</span></div>
            </div>

            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-dashed">
                  <th className="text-left py-1">Item</th>
                  <th className="text-right py-1">Qty</th>
                  <th className="text-right py-1">Price</th>
                  <th className="text-right py-1">Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id}>
                    <td className="py-0.5">{(i as any).product_name ?? `#${i.product_id}`}</td>
                    <td className="text-right">{i.quantity}</td>
                    <td className="text-right">{fmt(currency, i.unit_price)}</td>
                    <td className="text-right">{fmt(currency, i.unit_price * i.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="border-t border-dashed mt-2 pt-2">
              <div className="flex justify-between font-bold">
                <span>TOTAL</span>
                <span>{fmt(currency, sale.total)}</span>
              </div>
              <div className="flex justify-between">
                <span>Paid</span>
                <span>{fmt(currency, sale.paid)}</span>
              </div>
              {sale.total - sale.paid > 0 && (
                <div className="flex justify-between font-bold">
                  <span>BALANCE DUE</span>
                  <span>{fmt(currency, sale.total - sale.paid)}</span>
                </div>
              )}
            </div>

            <div className="text-center text-xs mt-4 opacity-70">
              Thank you for your business!
            </div>
          </div>

          <div className="modal-action receipt-no-print">
            <button type="button" className="btn btn-sm" onClick={onClose}>Close</button>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => window.print()}>Print</button>
          </div>
        </div>
      </div>
    </>
  );
}
