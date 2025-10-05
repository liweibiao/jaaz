import React, { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { startDeviceAuth, pollDeviceAuth, startGoogleAuth, checkGoogleAuthCallback, saveAuthData } from '@/api/auth'
import { updateJaazApiKey } from '@/api/config'
import { useAuth } from '@/contexts/AuthContext'
import { useConfigs, useRefreshModels } from '@/contexts/configs'


export function LoginDialog() {
  const [authMessage, setAuthMessage] = useState('')
  const [googleAuthState, setGoogleAuthState] = useState<string | null>(null)
  const [googleAuthPollingInterval, setGoogleAuthPollingInterval] = useState<NodeJS.Timeout | null>(null)
  const { refreshAuth } = useAuth()
  const { showLoginDialog: open, setShowLoginDialog } = useConfigs()
  const refreshModels = useRefreshModels()
  const { t } = useTranslation()
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Clean up polling when dialog closes
  useEffect(() => {
    setAuthMessage('')

    if (!open) {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
      }
      if (googleAuthPollingInterval) {
        clearInterval(googleAuthPollingInterval)
        setGoogleAuthPollingInterval(null)
      }
      setGoogleAuthState(null)
    }
  }, [open, googleAuthPollingInterval])

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
      }
      if (googleAuthPollingInterval) {
        clearInterval(googleAuthPollingInterval)
        setGoogleAuthPollingInterval(null)
      }
    }
  }, [googleAuthPollingInterval])

  const startPolling = (code: string) => {
    console.log('Starting polling for device code:', code)

    const poll = async () => {
      try {
        const result = await pollDeviceAuth(code)
        console.log('Poll result:', result)

        if (result.status === 'authorized') {
          // Login successful - save auth data to local storage
          if (result.token && result.user_info) {
            saveAuthData(result.token, result.user_info)

            // Update jaaz provider api_key with the access token
            await updateJaazApiKey(result.token)
          }

          setAuthMessage(t('common:auth.loginSuccessMessage'))
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current)
            pollingIntervalRef.current = null
          }

          try {
            console.log('Auth status will be refreshed automatically via event')
            // Refresh models list after successful login and config update
            refreshModels()
          } catch (error) {
            console.error('Failed to refresh models:', error)
          }

          setTimeout(() => setShowLoginDialog(false), 1500)

        } else if (result.status === 'expired') {
          // Authorization expired
          setAuthMessage(t('common:auth.authExpiredMessage'))
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current)
            pollingIntervalRef.current = null
          }

        } else if (result.status === 'error') {
          // Error occurred
          setAuthMessage(result.message || t('common:auth.authErrorMessage'))
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current)
            pollingIntervalRef.current = null
          }

        } else {
          // Still pending, continue polling
          setAuthMessage(t('common:auth.waitingForBrowser'))
        }
      } catch (error) {
        console.error('Polling error:', error)
        setAuthMessage(t('common:auth.pollErrorMessage'))
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current)
          pollingIntervalRef.current = null
        }
      }
    }

    // Start polling immediately, then every 1 seconds
    poll()
    pollingIntervalRef.current = setInterval(poll, 1000)
  }

  const handleLogin = async () => {
    try {
      setAuthMessage(t('common:auth.preparingLoginMessage'))

      const result = await startDeviceAuth()
      setAuthMessage(result.message)

      // Start polling for authorization status
      startPolling(result.code)

    } catch (error) {
      console.error('登录请求失败:', error)
      setAuthMessage(t('common:auth.loginRequestFailed'))
    }
  }

  // 处理Google登录
  const handleGoogleLogin = async () => {
    try {
      setAuthMessage(t('common:auth.preparingLoginMessage'))

      const result = await startGoogleAuth()
      setAuthMessage(t('common:auth.browserLoginMessage'))
      setGoogleAuthState(result.state)

      // 开始轮询Google认证状态
      startGoogleAuthPolling(result.state)

    } catch (error) {
      console.error('Google登录请求失败:', error)
      setAuthMessage(t('common:auth.loginRequestFailed'))
    }
  }

  // 开始轮询Google认证状态
  const startGoogleAuthPolling = (state: string) => {
    console.log('Starting polling for Google auth:', state)

    const poll = async () => {
      if (!state || !googleAuthState) {
        return
      }

      try {
        const result = await checkGoogleAuthCallback(state)
        console.log('Google auth poll result:', result)

        if (result.status === 'success' && result.token && result.user_info) {
          // Google登录成功 - 保存认证数据到本地存储
          saveAuthData(result.token, result.user_info)

          // 更新jaaz provider api_key与访问令牌
          await updateJaazApiKey(result.token)

          setAuthMessage(t('common:auth.loginSuccessMessage'))
          
          // 清除轮询
          if (googleAuthPollingInterval) {
            clearInterval(googleAuthPollingInterval)
            setGoogleAuthPollingInterval(null)
          }

          try {
            console.log('Auth status will be refreshed automatically via event')
            // 登录和配置更新成功后刷新模型列表
            refreshModels()
          } catch (error) {
            console.error('Failed to refresh models:', error)
          }

          setTimeout(() => setShowLoginDialog(false), 1500)

        } else if (result.status === 'error') {
          // 发生错误
          setAuthMessage(result.message || t('common:auth.authErrorMessage'))
          if (googleAuthPollingInterval) {
            clearInterval(googleAuthPollingInterval)
            setGoogleAuthPollingInterval(null)
          }
          setGoogleAuthState(null)

        } else if (result.status === 'expired') {
          // 授权过期
          setAuthMessage(t('common:auth.authExpiredMessage'))
          if (googleAuthPollingInterval) {
            clearInterval(googleAuthPollingInterval)
            setGoogleAuthPollingInterval(null)
          }
          setGoogleAuthState(null)
        }
        // 如果状态为pending，继续轮询
      } catch (error) {
        console.error('Google auth polling error:', error)
        setAuthMessage(t('common:auth.pollErrorMessage'))
        if (googleAuthPollingInterval) {
          clearInterval(googleAuthPollingInterval)
          setGoogleAuthPollingInterval(null)
        }
        setGoogleAuthState(null)
      }
    }

    // 立即开始轮询，然后每秒轮询一次
    poll()
    const interval = setInterval(poll, 1000)
    setGoogleAuthPollingInterval(interval)
  }

  const handleCancel = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
      pollingIntervalRef.current = null
    }
    if (googleAuthPollingInterval) {
      clearInterval(googleAuthPollingInterval)
      setGoogleAuthPollingInterval(null)
    }
    setAuthMessage('')
    setGoogleAuthState(null)
    setShowLoginDialog(false)
  }

  return (
    <Dialog open={open} onOpenChange={setShowLoginDialog}>
      <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('common:auth.loginDialogTitle')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="text-sm text-muted-foreground">
              {authMessage || t('common:auth.loginDialogDesc')}
            </div>
            <div className="grid gap-3">
              <Button onClick={handleLogin} className="w-full">
                {t('common:auth.officialLoginButton')}
              </Button>
              <Button 
                onClick={handleGoogleLogin} 
                className="w-full bg-white text-gray-800 border border-gray-300 hover:bg-gray-50"
              >
                <span className="mr-2 font-bold text-lg">G</span>
                {t('common:auth.googleLoginButton')}
              </Button>
              <Button variant="secondary" onClick={handleCancel} className="w-full">
                {t('common:auth.cancelButton')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }
