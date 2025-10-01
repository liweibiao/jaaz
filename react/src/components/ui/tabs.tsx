import React, { useState, useEffect } from 'react'
import type { ReactNode } from 'react'

export type TabsProps = {
  children: ReactNode
  defaultValue?: string
  value?: string
  onValueChange?: (value: string) => void
}

export type TabsListProps = {
  children: ReactNode
  className?: string
}

export type TabsTriggerProps = {
  children: ReactNode
  value: string
  className?: string
}

export type TabsContentProps = {
  children: ReactNode
  value: string
  className?: string
}

// 创建上下文
type TabsContextType = {
  value: string
  onValueChange: (value: string) => void
}

const TabsContext = React.createContext<TabsContextType | null>(null)

// 使用上下文钩子
const useTabs = () => {
  const context = React.useContext(TabsContext)
  if (!context) {
    throw new Error('useTabs must be used within a Tabs component')
  }
  return context
}

// Tabs 组件
export const Tabs: React.FC<TabsProps> = ({ children, defaultValue, value, onValueChange }) => {
  const [localValue, setLocalValue] = useState<string>(defaultValue || '')
  const isControlled = value !== undefined
  const currentValue = isControlled ? value : localValue

  useEffect(() => {
    // 当没有默认值和受控值时，尝试从子组件中获取第一个触发器的值
    if (!defaultValue && !value && !localValue) {
      const triggerElements = React.Children.toArray(children).filter(
        (child) => React.isValidElement(child) && (child.type as any).displayName === 'TabsTrigger'
      ) as React.ReactElement<TabsTriggerProps>[]
      
      if (triggerElements.length > 0) {
        setLocalValue(triggerElements[0].props.value)
      }
    }
  }, [children, defaultValue, value, localValue])

  const handleValueChange = (newValue: string) => {
    if (!isControlled) {
      setLocalValue(newValue)
    }
    onValueChange?.(newValue)
  }

  return (
    <TabsContext.Provider value={{ value: currentValue, onValueChange: handleValueChange }}>
      {children}
    </TabsContext.Provider>
  )
}

// TabsList 组件
export const TabsList: React.FC<TabsListProps> = ({ children, className = '' }) => {
  return (
    <div 
      className={`flex bg-muted rounded-lg p-1 ${className}`}
      role="tablist"
      aria-orientation="horizontal"
    >
      {children}
    </div>
  )
}

// TabsTrigger 组件
export const TabsTrigger: React.FC<TabsTriggerProps> = ({ children, value, className = '' }) => {
  const { value: currentValue, onValueChange } = useTabs()
  const isActive = currentValue === value

  const handleClick = () => {
    onValueChange(value)
  }

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      onClick={handleClick}
      className={`px-3 py-1 rounded-md text-sm font-medium transition-colors cursor-pointer ${isActive
        ? 'bg-background text-foreground shadow-sm'
        : 'text-muted-foreground hover:text-foreground'
      } ${className}`}
    >
      {children}
    </button>
  )
}

// 设置显示名称，用于在 Tabs 组件中识别
type ReactComponentWithDisplayName<P> = React.FC<P> & {
  displayName: string
}

(TabsTrigger as ReactComponentWithDisplayName<TabsTriggerProps>).displayName = 'TabsTrigger'

// TabsContent 组件
export const TabsContent: React.FC<TabsContentProps> = ({ children, value, className = '' }) => {
  const { value: currentValue } = useTabs()
  const isActive = currentValue === value

  return (
    <div
      role="tabpanel"
      className={`${isActive ? 'block' : 'hidden'} ${className}`}
    >
      {children}
    </div>
  )
}

(TabsContent as ReactComponentWithDisplayName<TabsContentProps>).displayName = 'TabsContent'