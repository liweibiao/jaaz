import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { useConfigs, useRefreshModels } from '@/contexts/configs'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { checkGoogleAuthCallback, saveAuthData } from '@/api/auth'
import { updateJaazApiKey } from '@/api/config'

export const Route = createFileRoute('/login')({
  component: LoginCallbackHandler,
})

function LoginCallbackHandler() {
  const location = useLocation()
  const navigate = useNavigate()
  const configsStore = useConfigs()
  const { setShowLoginDialog } = configsStore
  const refreshModels = useRefreshModels()
  const { t } = useTranslation()
  const [isProcessing, setIsProcessing] = useState(false)

  useEffect(() => {
    // 检查URL中的查询参数
    const searchParams = new URLSearchParams(location.search)
    const error = searchParams.get('error')
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const success = searchParams.get('success')

    // 处理不同的登录回调情况
    if (error) {
      // 显示错误信息
      if (error === 'callback_failed') {
        toast.error(t('common:auth.authErrorMessage'), {
          description: t('common:auth.loginRequestFailed'),
        })
      } else {
        toast.error(t('common:auth.authErrorMessage'), {
          description: error,
        })
      }
      
      // 重定向到首页并打开登录对话框
      setTimeout(() => {
        navigate({ to: '/' })
        setShowLoginDialog(true)
      }, 1000)
    } else if (state && (code || success)) {
      // 当有state参数时，启动轮询获取认证结果
      handleGoogleAuthCallback(state)
    } else if (code) {
      // 这里可以添加处理授权码的逻辑
      console.log('Google login callback received with code:', code)
      toast.success(t('common:auth.loginSuccessMessage'))
      
      // 重定向到首页并打开登录对话框
      setTimeout(() => {
        navigate({ to: '/' })
        setShowLoginDialog(true)
      }, 1000)
    } else {
      // 没有任何参数时，直接重定向到首页
      setTimeout(() => {
        navigate({ to: '/' })
      }, 1000)
    }
  }, [location.search, navigate, setShowLoginDialog, t, refreshModels])

  // 处理Google认证回调，获取认证结果
  const handleGoogleAuthCallback = async (state: string) => {
    if (isProcessing) return
    
    setIsProcessing(true)
    try {
      // 立即检查一次认证状态
      const result = await checkGoogleAuthCallback(state)
      console.log('Google auth callback result:', result)
      
      if (result.status === 'success' && result.token && result.user_info) {
        // Google登录成功 - 保存认证数据到本地存储
        saveAuthData(result.token, result.user_info)
        
        // 更新jaaz provider api_key与访问令牌
        await updateJaazApiKey(result.token)
        
        toast.success(t('common:auth.loginSuccessMessage'))
        
        // 刷新模型列表
        if (refreshModels) {
          refreshModels()
        }
        
        // 重定向到首页
        setTimeout(() => {
          navigate({ to: '/' })
        }, 1000)
      } else {
        // 认证未完成或失败，重定向到首页并打开登录对话框
        setTimeout(() => {
          navigate({ to: '/' })
          setShowLoginDialog(true)
        }, 1000)
      }
    } catch (error) {
      console.error('Failed to check Google auth status:', error)
      toast.error(t('common:auth.authErrorMessage'))
      
      // 重定向到首页并打开登录对话框
      setTimeout(() => {
        navigate({ to: '/' })
        setShowLoginDialog(true)
      }, 1000)
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center h-screen">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">{t('common:auth.login')}</h1>
        {isProcessing ? (
          <p className="text-gray-500">{t('common:auth.processingAuth')}</p>
        ) : (
          <p className="text-gray-500">{t('common:auth.browserLoginMessage')}</p>
        )}
        <p className="mt-4 text-sm text-gray-400">{t('common:auth.redirectingToApp')}</p>
      </div>
    </div>
  )
}