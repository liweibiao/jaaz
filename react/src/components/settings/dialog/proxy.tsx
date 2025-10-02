import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Network, Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { getProxySettings, updateProxySettings, getSettings, updateSettings } from '@/api/settings'
import { getConfig } from '@/api/config'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

// 代理模式类型定义
type ProxyMode = 'no_proxy' | 'system' | 'custom'

// 代理配置接口
interface ProxyConfig {
  mode: ProxyMode
  url: string
}

// 提供商代理配置接口
interface ProviderProxyConfig {
  [providerKey: string]: boolean
}

const SettingProxy = () => {
  const { t } = useTranslation()
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [proxyConfig, setProxyConfig] = useState<ProxyConfig>({
    mode: 'system',
    url: ''
  })
  // 所有可用提供商
  const [providers, setProviders] = useState<Array<{key: string, label: string}>>([])
  // 提供商代理设置
  const [providerProxies, setProviderProxies] = useState<ProviderProxyConfig>({})

  // 加载配置
  useEffect(() => {
    const loadConfig = async () => {
      try {
        setIsLoading(true)
        
        // 并行加载所有需要的配置
        const [proxySettings, allSettings, configSettings] = await Promise.all([
          getProxySettings(),
          getSettings(),
          getConfig()
        ])

        // 加载全局代理配置
        const proxyValue = (proxySettings.proxy as string) || 'system'
        let mode: ProxyMode = 'system'
        let url = ''

        if (proxyValue === 'no_proxy') {
          mode = 'no_proxy'
        } else if (proxyValue === 'system') {
          mode = 'system'
        } else {
          mode = 'custom'
          url = proxyValue
        }

        setProxyConfig({ mode, url })

        // 加载局部代理设置
        const providerProxySettings = allSettings.providerProxies || {}
        setProviderProxies(providerProxySettings)

        // 构建提供商列表
        const providerList: Array<{key: string, label: string}> = []
        
        // 添加内置提供商
        const builtInProviders = [
          {key: 'anthropic', label: 'Claude'},
          {key: 'OpenRouter', label: 'OpenRouter'},
          {key: 'wavespeed', label: 'Wavespeed'},
          {key: 'replicate', label: 'Replicate'},
          {key: '深度求索', label: '深度求索 (DeepSeek)'},
          {key: 'volces', label: '火山引擎 (Volces)'},
          {key: 'GoogleVertex', label: 'GoogleVertex'},
          {key: '硅基流动', label: '硅基流动 (SiliconFlow)'},
          {key: '智谱 AI', label: '智谱 AI (GLM)'},
          {key: '月之暗面', label: '月之暗面 (Kimi)'}
        ]
        providerList.push(...builtInProviders)

        // 添加配置文件中的自定义提供商
        for (const [key, config] of Object.entries(configSettings)) {
          // 避免重复添加
          if (!providerList.some(p => p.key.toLowerCase() === key.toLowerCase())) {
            providerList.push({ key, label: key })
          }
        }

        setProviders(providerList)
      } catch (error) {
        console.error('Error loading proxy settings:', error)
        const errorMessage = error instanceof Error ? error.message : 'Failed to load proxy settings'
        setErrorMessage(errorMessage)
      } finally {
        setIsLoading(false)
      }
    }

    loadConfig()
  }, [t])

  // 处理全局代理模式变更
  const handleModeChange = (mode: ProxyMode) => {
    setProxyConfig(prev => ({ ...prev, mode }))
  }

  // 处理全局代理URL变更
  const handleUrlChange = (url: string) => {
    setProxyConfig(prev => ({ ...prev, url }))
  }

  // 处理提供商代理开关变更
  const handleProviderProxyChange = (providerKey: string, checked: boolean) => {
    setProviderProxies(prev => ({
      ...prev,
      [providerKey]: checked
    }))
  }

  // 保存所有配置
  const handleSave = async () => {
    try {
      setErrorMessage('')

      // 处理全局代理设置
      let proxyValue: string
      switch (proxyConfig.mode) {
        case 'no_proxy':
          proxyValue = 'no_proxy'
          break
        case 'system':
          proxyValue = 'system'
          break
        case 'custom':
          proxyValue = proxyConfig.url.trim()
          // Validate custom proxy URL format
          if (proxyValue && !proxyValue.match(/^(https?|socks[45]):\/\/.+/)) {
            setErrorMessage('Invalid proxy URL format. Please use http://, https://, socks4://, or socks5:// protocol.')
            return
          }
          break
        default:
          proxyValue = 'system'
      }

      // 保存全局代理设置
      const proxyResult = await updateProxySettings({
        proxy: proxyValue
      })

      // 保存局部代理设置
      const settingsResult = await updateSettings({
        providerProxies: providerProxies
      })

      if (proxyResult.status === 'success' && settingsResult.status === 'success') {
        toast.success('Proxy settings saved successfully')
        // Show restart notification
        setTimeout(() => {
          toast.info(t('settings:messages.restartRequired'), {
            duration: 5000
          })
        }, 1000)
        setErrorMessage('')
      } else {
        const errorMsg = proxyResult.message || settingsResult.message || 'Failed to save proxy settings'
        console.error('Save failed with result:', proxyResult, settingsResult)
        setErrorMessage(errorMsg)
        toast.error(errorMsg)
      }
    } catch (error) {
      console.error('Error saving proxy settings:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to save proxy settings'
      setErrorMessage(errorMessage)
      toast.error(errorMessage)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center p-4 relative w-full sm:pb-0 pb-10">
      {isLoading && (
        <div className="flex justify-center items-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-zinc-500"></div>
        </div>
      )}

      {!isLoading && (
        <div className="w-full max-w-2xl">
          {/* 全局代理设置卡片 */}
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Network className="h-5 w-5" />
                <CardTitle className="text-lg font-semibold">{t('settings:proxy:title')}</CardTitle>
              </div>
              <CardDescription>全局代理设置将应用于所有未特别指定的连接</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="proxy-mode" className="text-sm font-medium">
                    {t('settings:proxy:mode')}
                  </Label>
                  <Select value={proxyConfig.mode} onValueChange={handleModeChange}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder={t('settings:proxy:selectMode')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="no_proxy">{t('settings:proxy:modes.no_proxy')}</SelectItem>
                      <SelectItem value="system">{t('settings:proxy:modes.system')}</SelectItem>
                      <SelectItem value="custom">{t('settings:proxy:modes.custom')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {proxyConfig.mode === 'custom' && (
                  <div className="space-y-2">
                    <Label htmlFor="proxy-url" className="text-sm font-medium">
                      {t('settings:proxy:url')}
                    </Label>
                    <Input
                      id="proxy-url"
                      type="text"
                      placeholder={t('settings:proxy:urlPlaceholder')}
                      value={proxyConfig.url}
                      onChange={(e) => handleUrlChange(e.target.value)}
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 局部代理设置卡片 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold">提供商代理设置</CardTitle>
              <CardDescription>为特定提供商启用或禁用代理（仅在全局代理启用时生效）</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                {providers.length > 0 ? (
                  providers.map((provider) => (
                    <div key={provider.key} className="flex items-center justify-between py-2">
                      <Label htmlFor={`proxy-${provider.key}`} className="text-sm font-medium cursor-pointer">
                        {provider.label}
                      </Label>
                      <Checkbox
                        id={`proxy-${provider.key}`}
                        checked={providerProxies[provider.key] || false}
                        onCheckedChange={(checked) => handleProviderProxyChange(provider.key, checked as boolean)}
                      />
                    </div>
                  ))
                ) : (
                  <div className="text-center text-muted-foreground py-4">
                    未找到可用的提供商
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex justify-center fixed sm:bottom-2 sm:left-[calc(var(--sidebar-width)+0.45rem)] sm:translate-x-0 -translate-x-1/2 bottom-15 left-1/2 gap-1.5">
        <Button onClick={handleSave} disabled={isLoading}>
          <Save className="mr-2 h-4 w-4" /> {t('settings:saveSettings')}
        </Button>
      </div>

      {errorMessage && (
        <div className="text-red-500 text-center mb-4">{errorMessage}</div>
      )}
    </div>
  )
}

export default SettingProxy
