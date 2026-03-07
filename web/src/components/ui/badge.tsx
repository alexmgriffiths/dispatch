import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive text-destructive-foreground",
        outline: "text-foreground",
        ios: "border-blue-200 bg-blue-50 text-blue-700",
        android: "border-green-200 bg-green-50 text-green-700",
        production: "border-emerald-200 bg-emerald-50 text-emerald-700",
        staging: "border-amber-200 bg-amber-50 text-amber-700",
        canary: "border-purple-200 bg-purple-50 text-purple-700",
        critical: "border-red-200 bg-red-50 text-red-700",
        rollback: "border-orange-200 bg-orange-50 text-orange-700",
        disabled: "border-gray-200 bg-gray-50 text-gray-500",
        active: "border-emerald-200 bg-emerald-50 text-emerald-700",
        group: "border-violet-200 bg-violet-50 text-violet-700",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
