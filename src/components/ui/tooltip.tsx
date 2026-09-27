"use client"

import * as React from "react"
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"
import { cn } from "cn"

/** Accepts the Radix-style `delayDuration` name (used by callers ported from
 *  Radix) as an alias for base-ui's `delay`. */
function TooltipProvider({
  delayDuration,
  delay,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider> & { delayDuration?: number }) {
  return <TooltipPrimitive.Provider delay={delay ?? delayDuration} {...props} />
}

function Tooltip({
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root {...props}>{children}</TooltipPrimitive.Root>
}

/** `asChild` merges the tooltip trigger's behavior onto the child element
 *  (base-ui's equivalent of Radix's Slot pattern is the `render` prop). */
function TooltipTrigger({
  asChild,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger> & { asChild?: boolean }) {
  if (asChild && React.isValidElement(children)) {
    return <TooltipPrimitive.Trigger render={children} {...props} />
  }
  return <TooltipPrimitive.Trigger {...props}>{children}</TooltipPrimitive.Trigger>
}

function TooltipContent({
  className,
  side = "top",
  sideOffset = 6,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Popup> & {
  side?: "top" | "right" | "bottom" | "left"
  sideOffset?: number
}) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner side={side} sideOffset={sideOffset}>
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            "z-50 rounded-md bg-stone-900 px-2.5 py-1.5 text-xs font-medium text-stone-50 shadow-md",
            className
          )}
          {...props}
        >
          {children}
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
