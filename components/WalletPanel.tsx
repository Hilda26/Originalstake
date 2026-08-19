"use client";

import { useEffect, useRef, useState } from "react";
import {
  Wallet,
  Copy,
  Check,
  Download,
  Upload,
  LogOut,
  AlertTriangle,
  ShieldAlert,
} from "lucide-react";
import { useWallet } from "@/lib/walletContext";

function short(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function WalletPanel() {
  const wallet = useWallet();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [importValue, setImportValue] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (!wallet.hydrated) {
    return <div className="h-9 w-32 animate-pulse rounded-md bg-bg-raised" aria-hidden="true" />;
  }

  function copyAddress() {
    if (!wallet.address) return;
    navigator.clipboard.writeText(wallet.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function downloadKey() {
    if (!wallet.privateKey) return;
    const blob = new Blob([wallet.privateKey], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "originalstake-wallet-private-key.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  function submitImport() {
    const result = wallet.importWallet(importValue);
    if (!result.ok) {
      setImportError(result.error ?? "Could not import that key.");
      return;
    }
    setImportError(null);
    setImportValue("");
    setShowImport(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="flex items-center gap-2 rounded-md border border-line bg-bg-raised px-3 py-2 text-sm font-medium text-ink transition-colors hover:border-accent"
      >
        <Wallet size={16} aria-hidden="true" />
        {wallet.address ? (
          <span className="flex items-center gap-1.5">
            {short(wallet.address)}
            <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
              {wallet.mode === "injected" ? "injected" : "generated"}
            </span>
          </span>
        ) : (
          "Connect wallet"
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Wallet"
          className="absolute right-0 z-20 mt-2 w-80 rounded-lg border border-line bg-bg-raised p-4 shadow-xl shadow-black/40"
        >
          {!wallet.address && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-ink-soft">
                Connect an injected wallet if you have one, or generate a browser wallet to
                start immediately.
              </p>
              {wallet.hasInjectedWallet && (
                <button
                  type="button"
                  onClick={wallet.connectInjectedWallet}
                  className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-bg hover:opacity-90"
                >
                  Connect injected wallet
                </button>
              )}
              <button
                type="button"
                onClick={wallet.generateWallet}
                className="rounded-md border border-line px-3 py-2 text-sm font-semibold text-ink hover:border-accent"
              >
                Generate a browser wallet
              </button>
              <button
                type="button"
                onClick={() => setShowImport((v) => !v)}
                className="text-left text-xs font-medium text-accent underline underline-offset-2"
              >
                Import an existing private key
              </button>
              {showImport && (
                <div className="flex flex-col gap-2">
                  <input
                    type="password"
                    value={importValue}
                    onChange={(e) => setImportValue(e.target.value)}
                    placeholder="0x…"
                    aria-label="Private key"
                    className="rounded-md border border-line bg-bg px-2 py-1.5 text-sm text-ink"
                  />
                  {importError && <p className="text-xs text-danger">{importError}</p>}
                  <button
                    type="button"
                    onClick={submitImport}
                    className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold hover:border-accent"
                  >
                    Import
                  </button>
                </div>
              )}
              {wallet.error && <p className="text-xs text-danger">{wallet.error}</p>}
            </div>
          )}

          {wallet.address && wallet.needsAck && (
            <div className="mb-3 flex flex-col gap-2 rounded-md border border-warning bg-warning-bg p-3 text-warning">
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle size={16} aria-hidden="true" />
                Read this before using this wallet
              </div>
              <p className="text-xs leading-relaxed">
                This private key lives only in this browser&apos;s local storage. Clearing
                site data or switching browsers destroys it permanently — this is not
                custody-grade. Export it now if you want to keep access.
              </p>
              <button
                type="button"
                onClick={wallet.acknowledgeWarning}
                className="self-start rounded-md bg-warning px-3 py-1.5 text-xs font-semibold text-bg"
              >
                I understand, continue
              </button>
            </div>
          )}

          {wallet.address && !wallet.needsAck && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                  {wallet.mode === "injected" ? "Injected wallet" : "Generated wallet"}
                </span>
                <button
                  type="button"
                  onClick={wallet.disconnect}
                  className="flex items-center gap-1 text-xs text-ink-faint hover:text-danger"
                >
                  <LogOut size={12} aria-hidden="true" /> Disconnect
                </button>
              </div>
              <div className="flex items-center justify-between rounded-md border border-line bg-bg px-2.5 py-2 font-mono text-xs">
                <span className="truncate" title={wallet.address}>
                  {wallet.address}
                </span>
                <button
                  type="button"
                  onClick={copyAddress}
                  aria-label="Copy address"
                  className="ml-2 shrink-0 text-ink-faint hover:text-accent"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>

              {wallet.mode === "generated" && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-1.5 text-xs text-ink-faint">
                    <ShieldAlert size={12} aria-hidden="true" />
                    This key is not custody-grade — export it to keep access.
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={downloadKey}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-line px-2 py-1.5 text-xs font-medium hover:border-accent"
                    >
                      <Download size={13} aria-hidden="true" /> Export
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowImport((v) => !v)}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-line px-2 py-1.5 text-xs font-medium hover:border-accent"
                    >
                      <Upload size={13} aria-hidden="true" /> Import
                    </button>
                  </div>
                  {showImport && (
                    <div className="flex flex-col gap-2">
                      <input
                        type="password"
                        value={importValue}
                        onChange={(e) => setImportValue(e.target.value)}
                        placeholder="0x…"
                        aria-label="Private key"
                        className="rounded-md border border-line bg-bg px-2 py-1.5 text-sm text-ink"
                      />
                      {importError && <p className="text-xs text-danger">{importError}</p>}
                      <button
                        type="button"
                        onClick={submitImport}
                        className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold hover:border-accent"
                      >
                        Replace with imported key
                      </button>
                    </div>
                  )}
                  {wallet.hasInjectedWallet && (
                    <button
                      type="button"
                      onClick={wallet.connectInjectedWallet}
                      className="rounded-md bg-accent px-2 py-1.5 text-xs font-semibold text-bg hover:opacity-90"
                    >
                      Upgrade to injected wallet
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
