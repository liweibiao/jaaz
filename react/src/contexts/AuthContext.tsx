import React, { createContext, useState, useEffect, useContext } from 'react'
import { toast } from 'sonner'
import { AuthStatus, getAuthStatus } from '../api/auth'

interface AuthContextType {
  authStatus: AuthStatus
  isLoading: boolean
  refreshAuth: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authStatus, setAuthStatus] = useState<AuthStatus>({
    status: 'logged_out',
    is_logged_in: false,
  })
  const [isLoading, setIsLoading] = useState(true)

  const refreshAuth = async () => {
    try {
      setIsLoading(true)
      const status = await getAuthStatus()

      // Check if token expired based on the status returned by getAuthStatus
      if (status.tokenExpired) {
        toast.error('登录状态已过期，请重新登录', {
          duration: 5000,
        })
      }

      setAuthStatus(status)
    } catch (error) {
      console.error('获取认证状态失败:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // 初始化时获取认证状态
  useEffect(() => {
    refreshAuth()
  }, [])

  // 监听认证状态变化事件，确保UI能立即更新
  useEffect(() => {
    const handleAuthStatusUpdated = (event: Event) => {
      const customEvent = event as CustomEvent
      const source = customEvent.detail?.source || 'unknown'
      const authStatus = customEvent.detail?.authStatus
      
      console.log(`🔄 AuthContext: 检测到认证状态更新事件 (来源: ${source})`)
      
      // 如果事件中已经包含认证状态信息，直接使用，避免额外的API调用
      if (authStatus) {
        console.log('🔄 使用事件中提供的认证状态直接更新UI')
        setAuthStatus(authStatus)
        setIsLoading(false)
      } else {
        // 否则，调用refreshAuth刷新认证状态
        console.log('🔄 调用refreshAuth刷新认证状态')
        refreshAuth()
      }
    }

    const handleAuthLogoutDetected = (event: Event) => {
      const customEvent = event as CustomEvent
      const source = customEvent.detail?.source || 'unknown'
      console.log(`🚪 AuthContext: 检测到登出事件 (来源: ${source})，刷新认证状态...`)
      refreshAuth()
    }

    // 添加事件监听器
    window.addEventListener('auth-status-updated', handleAuthStatusUpdated)
    window.addEventListener('auth-logout-detected', handleAuthLogoutDetected)

    // 清理事件监听器
    return () => {
      window.removeEventListener('auth-status-updated', handleAuthStatusUpdated)
      window.removeEventListener('auth-logout-detected', handleAuthLogoutDetected)
    }
  }, [refreshAuth])

  return (
    <AuthContext.Provider value={{ authStatus, isLoading, refreshAuth }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }

  return context
}
