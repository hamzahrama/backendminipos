"use client";

import { useEffect, useState } from "react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

export default function PwaRegister() {
  const [installPrompt, setInstallPrompt] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    const beforeInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallEvent); };
    const installedEvent = () => { setInstalled(true); setInstallPrompt(null); };
    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", installedEvent);
    return () => { window.removeEventListener("beforeinstallprompt", beforeInstall); window.removeEventListener("appinstalled", installedEvent); };
  }, []);
  if (!installPrompt || installed) return null;
  return <button className="fixed bottom-4 right-4 z-50 rounded-full bg-emerald-800 px-4 py-3 text-sm font-semibold text-white shadow-lg" onClick={async () => { await installPrompt.prompt(); await installPrompt.userChoice; setInstallPrompt(null); }}>Pasang aplikasi</button>;
}
