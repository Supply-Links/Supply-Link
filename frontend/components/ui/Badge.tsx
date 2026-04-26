import { cva, type VariantProps } from "class-variance-authority";
import { ReactNode } from "react";
import { clsx } from "clsx";

const badgeVariants = cva(
  "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
  {
    variants: {
      variant: {
        harvest: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
        processing: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
        shipping: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
        retail: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
        default: "bg-[var(--muted-bg)] text-[var(--foreground)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

interface BadgeProps extends VariantProps<typeof badgeVariants> {
  children: ReactNode;
  className?: string;
}

export function Badge({ variant, className, children }: BadgeProps) {
  return (
    <span className={clsx(badgeVariants({ variant }), className)}>
      {children}
    </span>
  );
}
