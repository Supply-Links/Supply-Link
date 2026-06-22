'use client';

import { useEffect, useRef, useState } from 'react';

interface MobileCameraScannerProps {
  onScan: (result: string) => void;
  onError?: (err: string) => void;
}

export function MobileCameraScanner({ onScan, onError }: MobileCameraScannerProps) {
  const scannerRef = useRef<{ clear: () => Promise<void> } | null>(null);
  const [status, setStatus] = useState<
    'requesting' | 'scanning' | 'no-support' | 'denied' | 'error'
  >('requesting');

  useEffect(() => {
    if (!navigator?.mediaDevices?.getUserMedia) {
      setStatus('no-support');
      return;
    }

    let cancelled = false;

    async function init() {
      try {
        await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (cancelled) return;

        const { Html5QrcodeScanner, Html5QrcodeScanType } = await import('html5-qrcode');
        if (cancelled) return;

        const scanner = new Html5QrcodeScanner(
          'qr-reader',
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            rememberLastUsedCamera: true,
            supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
          },
          false,
        );

        scannerRef.current = scanner;
        setStatus('scanning');

        scanner.render(
          (decoded) => {
            if (!cancelled) onScan(decoded);
          },
          (err) => {
            if (!cancelled) onError?.(err);
          },
        );
      } catch (err: unknown) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        if (
          msg.toLowerCase().includes('permission') ||
          msg.toLowerCase().includes('denied') ||
          msg.toLowerCase().includes('notallowed')
        ) {
          setStatus('denied');
          onError?.('Camera permission denied');
        } else {
          setStatus('error');
          onError?.(msg);
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      scannerRef.current?.clear().catch(() => {});
    };
  }, [onScan, onError]);

  if (status === 'no-support') {
    return (
      <div className="text-center py-6 text-sm text-[var(--muted)]">
        Camera access is not supported in this browser.
      </div>
    );
  }

  if (status === 'denied') {
    return (
      <div className="text-center py-6">
        <p className="text-sm font-medium text-[var(--foreground)] mb-1">
          Camera permission denied
        </p>
        <p className="text-xs text-[var(--muted)]">
          Allow camera access in browser settings to scan QR codes.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      {status === 'requesting' && (
        <p className="text-xs text-[var(--muted)]">Requesting camera access…</p>
      )}
      {status === 'error' && <p className="text-xs text-red-500">Could not start camera.</p>}
      <div id="qr-reader" className="w-full" />
      {status === 'scanning' && (
        <p className="text-xs text-[var(--muted)]">Point camera at a QR code</p>
      )}
    </div>
  );
}
