import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useRouter } from '@tanstack/react-router'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { getTemplate } from '@/api/templates'
import { Template } from '@/api/templates'
import { eventBus } from '@/lib/event'
import { toast } from 'sonner'

const TemplateUsePage: React.FC = () => {
  const { t } = useTranslation()
  const router = useRouter()
  const { templateId } = useParams({ from: '/template-use/$templateId' })
  
  const [template, setTemplate] = useState<Template | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [prompt, setPrompt] = useState('')
  const [uploadedImages, setUploadedImages] = useState<File[]>([])
  const [previewUrls, setPreviewUrls] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // 获取模板详情
  const fetchTemplate = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await getTemplate(Number(templateId))
      setTemplate(result)
      setPrompt(result.prompt || '')
    } catch (err) {
      setError(t('templates:notFound', '模板未找到'))
      console.error('Failed to fetch template:', err)
    } finally {
      setLoading(false)
    }
  }
  
  // 初始化时获取模板详情
  useEffect(() => {
    fetchTemplate()
  }, [templateId])
  
  // 处理图片上传
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files)
      const newPreviewUrls = newFiles.map(file => URL.createObjectURL(file))
      
      setUploadedImages([...uploadedImages, ...newFiles])
      setPreviewUrls([...previewUrls, ...newPreviewUrls])
      
      // 清除input值，允许重复上传相同文件
      e.target.value = ''
    }
  }
  
  // 移除上传的图片
  const removeImage = (index: number) => {
    try {
      // 先复制数组，再尝试释放URL对象
      const newImages = [...uploadedImages]
      const newPreviewUrls = [...previewUrls]
      
      // 确保index有效再释放URL
      if (index >= 0 && index < previewUrls.length) {
        try {
          URL.revokeObjectURL(previewUrls[index])
        } catch (error) {
          console.warn('Failed to revoke object URL:', error)
        }
      }
      
      // 从数组中移除图片
      newImages.splice(index, 1)
      newPreviewUrls.splice(index, 1)
      
      // 使用函数式更新确保使用最新状态
      setUploadedImages(() => newImages)
      setPreviewUrls(() => newPreviewUrls)
    } catch (error) {
      console.error('Failed to remove image:', error)
    }
  }
  
  // 清理URL对象
  useEffect(() => {
    return () => {
      previewUrls.forEach(url => URL.revokeObjectURL(url))
    }
  }, [previewUrls])
  
  // 处理发送到聊天窗口
  const handleSendToChat = async () => {
    if (!prompt.trim()) {
      setError(t('templates:promptRequired', '请输入提示词'))
      return
    }
    
    setIsSubmitting(true)
    try {
      // 将图片转换为Base64
      const imagePromises = uploadedImages.map(file => {
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = (event) => {
            if (event.target?.result) {
              resolve(event.target.result as string)
            } else {
              reject(new Error('Failed to read file'))
            }
          }
          reader.onerror = reject
          reader.readAsDataURL(file)
        })
      })
      
      const imageBase64s = await Promise.all(imagePromises)
      
      // 构建要发送到聊天窗口的数据
      const chatData = {
        prompt: prompt,
        images: imageBase64s.map((base64, index) => ({
          fileName: uploadedImages[index].name,
          base64: base64,
          // 确保使用正确的API格式
          apiUrl: base64.includes('localhost:57988/api/file/') ? 
            base64 : 
            `/api/serve_file?file_path=${encodeURIComponent(uploadedImages[index].name)}`
        }))
      }
      
      // 存储到localStorage，确保页面加载后能获取到数据
      localStorage.setItem('templateData', JSON.stringify(chatData))
      
      // 导航到首页
      router.navigate({ to: '/' })
      
      // 使用setTimeout确保页面加载后再发送事件
      setTimeout(() => {
        // 从localStorage读取数据并发送事件
        const storedData = localStorage.getItem('templateData')
        if (storedData) {
          const data = JSON.parse(storedData)
          eventBus.emit('Template::SendToChat', data)
          // 清理localStorage
          localStorage.removeItem('templateData')
        }
      }, 500)
    } catch (err) {
      setError(t('templates:createError', '创建项目失败'))
      console.error('Failed to send to chat:', err)
    } finally {
      setIsSubmitting(false)
    }
  }
  
  // 渲染加载状态
  const renderLoading = () => (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-1/2 mt-2" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-64 w-full rounded" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-24 w-full" />
          </div>
        </CardContent>
      </Card>
    </div>
  )
  
  // 渲染错误状态
  const renderError = () => (
    <div className="bg-red-50 border border-red-200 rounded-md p-4 text-red-800 dark:bg-red-950/50 dark:border-red-900 dark:text-red-200">
      <p>{error}</p>
      <Button variant="ghost" className="mt-2" onClick={() => router.navigate({ to: '/templates' })}>
        {t('templates:back', '返回模板库')}
      </Button>
    </div>
  )
  
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.navigate({ to: '/templates' })}
              className="md:hidden"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </Button>
            <h1 className="text-2xl font-bold tracking-tight">{t('templates:title', '模板')}</h1>
          </div>
          <Button variant="ghost" onClick={() => router.navigate({ to: '/templates' })} className="hidden md:flex">
            {t('templates:back', '返回模板库')}
          </Button>
        </div>
      </header>
      
      {/* Main Content */}
      <main className="container py-6">
        {loading ? (
          renderLoading()
        ) : error ? (
          renderError()
        ) : template ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Template Preview */}
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle>{template.title}</CardTitle>
                <CardDescription>{template.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="relative aspect-video rounded-md overflow-hidden bg-muted">
                  <img
                    src={
                      // 首先检查是否是完整URL（http://或https://开头）
                      template.image.startsWith('http://') || template.image.startsWith('https://') ?
                        template.image :
                        // 然后检查是否包含localhost:57988/api/file/
                        template.image.includes('localhost:57988/api/file/') ?
                          template.image :
                          `/api/serve_file?file_path=${encodeURIComponent(template.image)}`
                    }
                    alt={template.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                
                {/* Template Tags */}
                <div className="flex flex-wrap gap-1 mt-4">
                  {template.tags.map((tag, idx) => (
                    <Badge key={idx} variant="secondary">{tag}</Badge>
                  ))}
                </div>
                
                {/* Template Stats */}
                <div className="flex items-center gap-4 mt-4 text-sm text-muted-foreground">
                  <span>{t('templates:downloads', '{{count}} 次下载', { count: template.downloads })}</span>
                  <div className="flex items-center">
                    <svg className="h-4 w-4 mr-1 fill-yellow-400 text-yellow-400" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                    </svg>
                    {template.rating}
                  </div>
                </div>
              </CardContent>
            </Card>
            
            {/* Template Usage */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>{t('templates:useTemplate', '使用模板')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Image Upload */}
                <div>
                  <h3 className="text-lg font-medium mb-3">{t('templates:uploadImage', '上传图片')}</h3>
                  <div className="border-2 border-dashed rounded-lg p-6 text-center hover:bg-muted transition-colors cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleImageUpload}
                      className="hidden"
                      id="image-upload"
                    />
                    <label htmlFor="image-upload" className="cursor-pointer">
                      <svg className="w-12 h-12 mx-auto text-muted-foreground mb-2" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21.2 15.8a2 2 0 0 0-1.4-1.4L16 13l-1.4-1.4a2 2 0 0 0-2.8 0L8 15l-2.8-2.8a2 2 0 0 0-2.8 2.8l4.2 4.2a7 7 0 0 0 9.9 0l4.2-4.2a2 2 0 0 0-.1-2.8z" />
                        <path d="m12 7-4 12h8l-4-12z" />
                      </svg>
                      <p className="text-sm text-muted-foreground">
                        {t('templates:uploadPlaceholder', '点击或拖拽图片到此处上传')}
                      </p>
                    </label>
                  </div>
                  
                  {/* Uploaded Images Preview */}
                  {uploadedImages.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mt-4">
                      {previewUrls.map((url, index) => (
                        <div key={index} className="relative aspect-square rounded-md overflow-hidden bg-muted">
                          <img src={url} alt={`Uploaded ${index + 1}`} className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => removeImage(index)}
                            className="absolute top-1 right-1 bg-black/50 text-white rounded-full p-1 hover:bg-black/70 transition-colors"
                          >
                            <svg className="w-3 h-3" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                {/* Prompt Editor */}
                <div>
                  <h3 className="text-lg font-medium mb-3">{t('templates:prompt', '提示词')}</h3>
                  <Textarea
                    placeholder={t('templates:promptPlaceholder', '编辑用于生成图片的提示词')}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    className="min-h-[120px] resize-y"
                  />
                </div>
              </CardContent>
              <CardFooter className="flex justify-end gap-3">
                <Button variant="ghost" onClick={() => router.navigate({ to: '/templates' })}>
                  {t('templates:cancel', '取消')}
                </Button>
                <Button
                  onClick={handleSendToChat}
                  disabled={isSubmitting || !prompt.trim()}
                >
                  {isSubmitting ? t('templates:submitting', '创建项目中...') : t('templates:createProject', '创建项目')}
                </Button>
              </CardFooter>
            </Card>
          </div>
        ) : null}
      </main>
    </div>
  )
}

export default TemplateUsePage