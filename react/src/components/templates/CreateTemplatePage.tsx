import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useRouter } from '@tanstack/react-router'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import { createTemplate } from '@/api/templates'
import TopMenu from '../TopMenu'

const CreateTemplatePage: React.FC = () => {
  const { t } = useTranslation()
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [thumbnail, setThumbnail] = useState<File | null>(null)
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null)
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [prompt, setPrompt] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // 处理缩略图上传
  const handleThumbnailUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setThumbnail(file)
      // 创建预览URL
      const previewUrl = URL.createObjectURL(file)
      setThumbnailPreview(previewUrl)
      
      // 组件卸载时清理预览URL
      return () => URL.revokeObjectURL(previewUrl)
    }
  }

  // 添加标签
  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()])
      setTagInput('')
    }
  }

  // 移除标签
  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove))
  }

  // 处理标签输入框的键盘事件
  const handleTagKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddTag()
    }
  }

  // 处理表单提交
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // 表单验证
    if (!title.trim()) {
      toast.error('请输入模板名称')
      return
    }
    if (!prompt.trim()) {
      toast.error('请输入提示词内容')
      return
    }

    setIsSubmitting(true)
    try {
      // 使用API函数创建模板
      await createTemplate({
        title: title,
        description: description,
        prompt: prompt,
        tags: tags,
        image: thumbnail || undefined
      })
      
      // 显示成功消息
      toast.success('模板创建成功')
      
      // 跳转到我的模板页面
      router.navigate({ to: '/template/manage' })
    } catch (error) {
      console.error('创建模板时出错:', error)
      toast.error('创建模板失败，请重试')
    } finally {
      setIsSubmitting(false)
    }
  }

  // 返回我的模板页面
  const handleGoBack = () => {
    router.navigate({ to: '/template/manage' })
  }

  return (
    <div className="flex flex-col h-screen">
      <TopMenu />

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto">
          {/* 页面标题 */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-8"
          >
            <h1 className="text-3xl font-bold mb-2">创建模板</h1>
            <p className="text-muted-foreground">填写模板信息，创建您的专属AI创作模板</p>
          </motion.div>

          {/* 创建模板表单 */}
          <Card>
            <form onSubmit={handleSubmit}>
              <CardHeader>
                <CardTitle>模板信息</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* 模板名称 */}
                <div className="space-y-2">
                  <label htmlFor="title" className="block text-sm font-medium">
                    模板名称 *
                  </label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="请输入模板名称"
                    className="w-full"
                  />
                </div>

                {/* 模板描述 */}
                <div className="space-y-2">
                  <label htmlFor="description" className="block text-sm font-medium">
                    模板描述
                  </label>
                  <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="请输入模板描述（选填）"
                    className="w-full min-h-[80px]"
                  />
                </div>

                {/* 缩略图上传 */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium">
                    缩略图
                  </label>
                  <div className="border border-dashed rounded-lg p-8 text-center">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleThumbnailUpload}
                      className="hidden"
                      id="thumbnail-upload"
                    />
                    <label
                      htmlFor="thumbnail-upload"
                      className="cursor-pointer inline-block"
                    >
                      {thumbnailPreview ? (
                        <div className="relative">
                          <img
                            src={thumbnailPreview}
                            alt="缩略图预览"
                            className="max-w-full max-h-48 object-cover rounded-md mb-2"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setThumbnail(null)
                              setThumbnailPreview(null)
                            }}
                            className="absolute top-2 right-2 bg-black/50 text-white hover:bg-black/70"
                          >
                            移除
                          </Button>
                        </div>
                      ) : (
                        <div className="py-8">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-12 w-12 text-gray-400 mx-auto mb-2"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                            />
                          </svg>
                          <p className="text-muted-foreground">
                            点击或拖拽图片到此处上传
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            支持 JPG、PNG 格式，建议尺寸 400×300px
                          </p>
                        </div>
                      )}
                    </label>
                  </div>
                </div>

                {/* 分类标签 */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium">
                    分类标签
                  </label>
                  <div className="flex space-x-2">
                    <Input
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyPress={handleTagKeyPress}
                      placeholder="输入标签，按回车添加"
                      className="flex-1"
                    />
                    <Button type="button" onClick={handleAddTag}>
                      添加标签
                    </Button>
                  </div>
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {tags.map((tag, index) => (
                        <Badge key={index} variant="secondary" className="flex items-center gap-1">
                          {tag}
                          <button
                            type="button"
                            onClick={() => handleRemoveTag(tag)}
                            className="ml-1 text-xs hover:text-red-500 transition-colors"
                          >
                            ×
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {/* 提示词内容 */}
                <div className="space-y-2">
                  <label htmlFor="prompt" className="block text-sm font-medium">
                    提示词内容 *
                  </label>
                  <Textarea
                    id="prompt"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="请输入提示词内容，这将用于生成AI创作内容"
                    className="w-full min-h-[200px] font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    提示词越详细，生成的内容质量越高。您可以使用[用户上传的图片]等变量。
                  </p>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between border-t p-6">
                <Button type="button" variant="outline" onClick={handleGoBack}>
                  返回模板列表
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {isSubmitting ? '创建中...' : '创建模板'}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default CreateTemplatePage