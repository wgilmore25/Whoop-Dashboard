"use client";

import { Info, X } from "lucide-react";
import { useState } from "react";

interface Props { title: string; children: React.ReactNode; }

export function MetricInfo({ title, children }: Props) {
  const [open, setOpen] = useState(false);
  return <span className="relative inline-flex align-middle">
    <button type="button" aria-label={`How ${title} is calculated`} aria-expanded={open} onClick={() => setOpen(!open)} className="ml-1 inline-flex rounded-full text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"><Info className="h-3.5 w-3.5" /></button>
    {open && <span role="dialog" className="absolute z-30 left-0 top-6 w-72 rounded-lg border bg-card p-3 text-left normal-case tracking-normal text-xs font-normal leading-relaxed text-foreground shadow-lg"><span className="mb-1 flex items-center justify-between font-semibold"><span>{title}</span><button type="button" onClick={() => setOpen(false)} aria-label="Close"><X className="h-3.5 w-3.5" /></button></span><span className="block text-muted-foreground">{children}</span></span>}
  </span>;
}
