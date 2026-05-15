// ABOUTME: Shared app header — fixed 56px bar with ArmadaLogo, slotted nav and chrome, mobile sheet.
// ABOUTME: Composes @armada/ui primitives (ArmadaLogo, Tag) so the committer, observer, admin (and future armada-interface) share one visual chrome.

import { type ReactNode } from 'react'
import { Menu } from 'lucide-react'
import { ArmadaLogo, Tag } from '@armada/ui'
import { Button } from './ui/button.js'
import { Separator } from './ui/separator.js'
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from './ui/sheet.js'
import { cn } from '../lib/utils.js'

/** Network identifiers the header recognises for the badge. Other strings render as a plain Tag with the upper-cased label. */
export type AppHeaderNetwork = 'local' | 'sepolia' | (string & {})

export interface AppHeaderProps {
  /** Short label displayed in the mobile sheet header (e.g. "Observer", "Committer"). */
  appName: string
  /** Network label used for the badge text. */
  network: AppHeaderNetwork
  /**
   * Desktop-only primary navigation (≥sm), rendered centered between the
   * logo and the right-side chrome. Mobile navigation should be composed
   * into `mobileMenu`.
   */
  headerNav?: ReactNode
  /**
   * Desktop-only inline status indicator (≥sm), rendered between the
   * centered primary nav and the right-side chrome. Use for compact,
   * contextual info like a campaign-lifecycle stepper.
   */
  headerStatus?: ReactNode
  /**
   * Desktop-only header actions (≥sm). Wallet button, secondary controls,
   * etc. Hidden below the sm breakpoint — compose anything the user still
   * needs on mobile into `mobileMenu` instead.
   */
  headerRight?: ReactNode
  /**
   * Mobile Sheet contents, rendered when the hamburger is tapped. Omit to
   * suppress the hamburger trigger entirely.
   */
  mobileMenu?: ReactNode
  className?: string
}

export function AppHeader({
  appName,
  network,
  headerNav,
  headerStatus,
  headerRight,
  mobileMenu,
  className,
}: AppHeaderProps) {
  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-40 flex h-14 items-center',
        'bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/72',
        className,
      )}
    >
      <div className="container mx-auto flex h-full items-center gap-3 px-4">
        {/* Left: hamburger (mobile) + Armada wordmark */}
        <div className="flex h-full min-w-0 items-center gap-2">
          {mobileMenu !== undefined && (
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="sm:hidden"
                  aria-label="Open menu"
                >
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-80 sm:max-w-sm">
                <SheetHeader>
                  <SheetTitle>ARMADA</SheetTitle>
                  <SheetDescription>{appName}</SheetDescription>
                </SheetHeader>
                <div className="flex flex-col gap-3 px-4 pb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Network</span>
                    <Tag label={network} />
                  </div>
                  <Separator />
                  {mobileMenu}
                </div>
              </SheetContent>
            </Sheet>
          )}
          <ArmadaLogo className="shrink-0" />
        </div>

        {/* Centered desktop nav — absolute so it stays centered regardless of left/right slot widths */}
        {headerNav && (
          <nav
            aria-label="Primary"
            className="absolute left-1/2 hidden -translate-x-1/2 items-center sm:flex"
          >
            {headerNav}
          </nav>
        )}

        {/* Inline status slot (desktop) — sits between centered nav and right chrome */}
        {headerStatus && (
          <div className="hidden h-full items-center sm:flex">{headerStatus}</div>
        )}

        {/* Right: network badge + app-specific actions (desktop only) */}
        <div className="ml-auto hidden items-center gap-3 sm:flex">
          <Tag label={network} />
          {headerRight}
        </div>
      </div>
    </header>
  )
}
