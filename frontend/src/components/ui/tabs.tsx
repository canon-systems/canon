"use client"

import * as React from "react"
import { cn } from "@/components/ui/utils"

interface TabsContextType {
  value: string
  onValueChange: (value: string) => void
}

const TabsContext = React.createContext<TabsContextType | undefined>(undefined)

interface TabsProps {
  value: string
  onValueChange: (value: string) => void
  children: React.ReactNode
  className?: string
}

const Tabs = ({ value, onValueChange, children, className }: TabsProps) => {
  return (
    <TabsContext.Provider value={{ value, onValueChange }}>
      <div className={className}>
        {children}
      </div>
    </TabsContext.Provider>
  )
}

interface TabsListProps {
  children: React.ReactNode
  className?: string
}

const TabsList = ({ children, className }: TabsListProps) => {
  return (
    <div
      className={cn(
        "inline-flex h-10 items-center justify-center gap-1 rounded-2xl border border-white/10 bg-white/5 p-1 text-white/70",
        className
      )}
    >
      {children}
    </div>
  )
}

interface TabsTriggerProps {
  value: string
  children: React.ReactNode
  className?: string
  disabled?: boolean
}

const TabsTrigger = ({ value, children, className, disabled = false }: TabsTriggerProps) => {
  const context = React.useContext(TabsContext)
  if (!context) {
    throw new Error("TabsTrigger must be used within Tabs")
  }

  const { value: activeValue, onValueChange } = context
  const isActive = activeValue === value

  return (
    <button
      onClick={() => !disabled && onValueChange(value)}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-xl px-3.5 py-1.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:pointer-events-none disabled:opacity-50",
        isActive
          ? "border border-white/20 !bg-white !text-black shadow-[0_12px_40px_rgba(255,255,255,0.08)]"
          : "border border-transparent text-white/70 hover:text-white hover:bg-white/10 hover:border-white/10",
        className
      )}
      data-state={isActive ? "active" : "inactive"}
    >
      {children}
    </button>
  )
}

interface TabsContentProps {
  value: string
  children: React.ReactNode
  className?: string
}

const TabsContent = ({ value, children, className }: TabsContentProps) => {
  const context = React.useContext(TabsContext)
  if (!context) {
    throw new Error("TabsContent must be used within Tabs")
  }

  const { value: activeValue } = context

  if (activeValue !== value) {
    return null
  }

  return (
    <div
      className={cn(
        "mt-4 ring-offset-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2",
        className
      )}
    >
      {children}
    </div>
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
