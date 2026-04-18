import { createContext, ReactNode, useCallback, useContext, useRef, useState } from "react";

type ConfirmOptions = {
  title?: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within <ConfirmProvider>");
  return ctx;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((next) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setOpts(next);
    });
  }, []);

  function close(ok: boolean) {
    resolverRef.current?.(ok);
    resolverRef.current = null;
    setOpts(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {opts && (
        <div className="modal modal-open">
          <div className="modal-box max-w-md">
            <h3 className="font-bold text-lg mb-2">{opts.title ?? "Please confirm"}</h3>
            <div className="text-sm opacity-80 whitespace-pre-line">{opts.message}</div>
            <div className="modal-action">
              <button type="button" className="btn btn-sm" onClick={() => close(false)} autoFocus>
                {opts.cancelLabel ?? "Cancel"}
              </button>
              <button
                type="button"
                className={`btn btn-sm ${opts.danger ? "btn-error" : "btn-primary"}`}
                onClick={() => close(true)}
              >
                {opts.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
