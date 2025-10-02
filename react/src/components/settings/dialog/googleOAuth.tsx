import React, { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Save, RefreshCw, Info } from 'lucide-react'
import { getSettings, updateSettings } from '@/api/settings'
import { LLMConfig } from '@/types/types'

const GoogleOAuthSettings: React.FC = () => {
  const { t } = useTranslation()
  const [config, setConfig] = useState({
    clientId: '',
    clientSecret: '',
    jwtSecret: '',
    enabled: false
  })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // 加载配置
  useEffect(() => {
    const loadConfig = async () => {
      try {
        setIsLoading(true)
        // 从settings.json加载配置，而不是从config.toml
        const settings = await getSettings()
        
        // 尝试从设置中获取Google OAuth配置
        const googleOAuthConfig = settings.googleOAuth || {};
        
        setConfig({
          clientId: (googleOAuthConfig as any).clientId || '',
          clientSecret: (googleOAuthConfig as any).clientSecret || '',
          jwtSecret: (googleOAuthConfig as any).jwtSecret || '',
          enabled: (googleOAuthConfig as any).enabled || false
        })
        setError(null)
      } catch (err) {
        console.error('Failed to load Google OAuth settings:', err)
        setError(t('settings:googleOAuth:loadError'))
      } finally {
        setIsLoading(false)
      }
    }

    loadConfig()
  }, [t])

  // 处理配置变更
  const handleChange = (field: string, value: string | boolean) => {
    setConfig(prev => ({
      ...prev,
      [field]: value
    }))
  }

  // 保存配置
  const handleSave = async () => {
    try {
      setIsSaving(true)
      setError(null)
      
      // 检查必要字段
      if (config.enabled && (!config.clientId || !config.clientSecret || !config.jwtSecret)) {
        throw new Error(t('settings:googleOAuth:missingFields'))
      }
      
      // 将Google OAuth设置直接保存到settings.json中的googleOAuth字段
      const result = await updateSettings({
        googleOAuth: config
      })
      
      if (result.status === 'success') {
        toast.success(t('settings:messages:settingsSaved'))
      } else {
        throw new Error(result.message || t('settings:messages:failedToSave'))
      }
    } catch (err) {
      console.error('Failed to save Google OAuth settings:', err)
      setError(err instanceof Error ? err.message : t('settings:messages:failedToSave'))
    } finally {
      setIsSaving(false)
    }
  }

  // 自动生成JWT密钥
  const handleGenerateJwtSecret = () => {
    const newSecret = generateJwtSecret()
    handleChange('jwtSecret', newSecret)
    toast.success(t('settings:googleOAuth:jwtSecretGenerated'))
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-32">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-zinc-500"></div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-bold">{t('settings:googleOAuth:title')}</CardTitle>
          <CardDescription>
            {t('settings:googleOAuth:description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* 启用开关 */}
          <div className="flex items-center justify-between mb-6">
            <div className="space-y-1.5">
              <Label htmlFor="enabled">{t('settings:googleOAuth:enable')}</Label>
              <p className="text-sm text-muted-foreground">
                {t('settings:googleOAuth:enableDescription')}
              </p>
            </div>
            <Switch
              id="enabled"
              checked={config.enabled}
              onCheckedChange={(checked) => handleChange('enabled', checked)}
            />
          </div>

          {config.enabled && (
            <div className="space-y-6">
              {/* API URL提示 */}
              <div className="bg-blue-50 text-blue-800 border border-blue-200 rounded-md p-4 flex items-start gap-3">
                <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-medium mb-1">{t('settings:googleOAuth:apiUrlInfo')}</h4>
                  <p className="text-sm">
                    {t('settings:googleOAuth:apiUrlExample')}
                  </p>
                </div>
              </div>

              {/* 客户端ID */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="clientId">{t('settings:googleOAuth:clientId')}</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t('settings:googleOAuth:clientIdTooltip')}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Input
                  id="clientId"
                  value={config.clientId}
                  onChange={(e) => handleChange('clientId', e.target.value)}
                  placeholder={t('settings:googleOAuth:clientIdPlaceholder')}
                />
              </div>

              {/* 客户端密钥 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="clientSecret">{t('settings:googleOAuth:clientSecret')}</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t('settings:googleOAuth:clientSecretTooltip')}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Input
                  id="clientSecret"
                  type="password"
                  value={config.clientSecret}
                  onChange={(e) => handleChange('clientSecret', e.target.value)}
                  placeholder={t('settings:googleOAuth:clientSecretPlaceholder')}
                />
              </div>

              {/* JWT密钥 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="jwtSecret">{t('settings:googleOAuth:jwtSecret')}</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t('settings:googleOAuth:jwtSecretTooltip')}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div className="flex gap-2">
                  <Input
                    id="jwtSecret"
                    type="password"
                    value={config.jwtSecret}
                    onChange={(e) => handleChange('jwtSecret', e.target.value)}
                    placeholder={t('settings:googleOAuth:jwtSecretPlaceholder')}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    onClick={handleGenerateJwtSecret}
                    title={t('settings:googleOAuth:generateJwtSecret')}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* 错误提示 */}
          {error && (
            <div className="mt-4 text-red-500 text-sm">
              {error}
            </div>
          )}
        </CardContent>
        <CardFooter className="border-t p-6">
          <Button
            onClick={handleSave}
            disabled={isSaving || (!config.enabled && (!config.clientId && !config.clientSecret && !config.jwtSecret))}
            className="w-full sm:w-auto"
          >
            <Save className="mr-2 h-4 w-4" />
            {t('settings:saveSettings')}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}

function generateJwtSecret() {
  // 生成一个随机的JWT密钥
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-='
  let secret = ''
  for (let i = 0; i < 32; i++) {
    secret += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return secret
}

export default GoogleOAuthSettings