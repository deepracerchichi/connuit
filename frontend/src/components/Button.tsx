import type { ButtonHTMLAttributes } from "react";
import { cn } from "../lib/cn";

type Variant = "primary" | "secondary";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

// Exported so links (<a>, <Link>) can look exactly like buttons:
// a <button> can't navigate, so nav items need real links with the same styles.
export function buttonClass(variant: Variant = "primary", className?: string) {
  const base = "inline-block rounded-md px-6 py-3 text-md font-normal font-mono transition-colors disabled:opacity-50";
  const variants = {
    primary: "bg-ink text-white hover:bg-slate-50 hover:text-ink",
    secondary: " text-ink hover:bg-slate-50",
  };
  return cn(base, variants[variant], className);
}

export function Button({ variant = "primary", className, ...props }: ButtonProps) {
  return <button className={buttonClass(variant, className)} {...props} />;
}
