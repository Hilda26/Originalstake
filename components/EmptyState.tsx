import type { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-line bg-bg-raised px-8 py-16 text-center">
      {icon && <div className="text-ink-faint">{icon}</div>}
      <h3 className="font-display text-xl text-ink">{title}</h3>
      <p className="max-w-md text-sm leading-relaxed text-ink-soft">{description}</p>
      {action}
    </div>
  );
}

export function ErrorState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-danger bg-danger-bg px-6 py-5 text-danger">
      <h3 className="font-semibold">{title}</h3>
      <p className="text-sm leading-relaxed">{description}</p>
      {action}
    </div>
  );
}
