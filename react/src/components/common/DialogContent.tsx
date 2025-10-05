import { cn } from '@/lib/utils'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import React from 'react'

/**
 * 通用对话框内容组件
 * 基于 Radix UI Dialog 组件，使用 CSS 类进行动画效果
 */

type CommonDialogProps = {
  open: boolean
  children: React.ReactNode
  className?: string
  transformPerspective?: number
  ariaLabelledby?: string
}

const CommonDialogContent: React.FC<CommonDialogProps> = ({
  open,
  children,
  className,
  ariaLabelledby,
}) => {
  // 使用 forceMount 确保组件始终挂载，避免动画闪烁
  if (!open) return null

  return (
    <DialogPrimitive.Portal forceMount>
      <DialogPrimitive.Overlay
        className="fixed inset-0 z-45 bg-black/50 backdrop-blur-lg animate-in fade-in duration-300"
      />
      <div className="fixed inset-0 flex items-center justify-center z-50">
        <DialogPrimitive.Content
          className={cn(
            'grid rounded-lg p-4 min-w-[300px] w-full max-w-lg gap-4 border bg-background shadow-lg sm:rounded-lg',
            'animate-in zoom-in-95 duration-300',
            className
          )}
          aria-labelledby={ariaLabelledby}
        >
          {children}
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-md p-1 opacity-70 ring-offset-background transition-all hover:opacity-100 hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none cursor-pointer">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
            </svg>
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </div>
    </DialogPrimitive.Portal>
  )
}

export default CommonDialogContent
