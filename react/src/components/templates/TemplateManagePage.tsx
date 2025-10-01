import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { useRouter } from '@tanstack/react-router'
import { motion } from 'motion/react'
import TopMenu from '../TopMenu'
import { getMyTemplates, Template, deleteTemplate, updateTemplate, UpdateTemplateData } from '@/api/templates'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { uploadImage } from '@/api/upload'
import { toast } from 'sonner'

const TemplateManagePage: React.FC = () => {
  const { t } = useTranslation()
  const router = useRouter()
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [templateToDelete, setTemplateToDelete] = useState<number | null>(null)
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    tags: '',
    image: '',
    category: 'my-templates',
    prompt: ''
  })
  const [uploadedImage, setUploadedImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string>('')
  const [isUploading, setIsUploading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  // 获取我的模板列表
  const fetchMyTemplates = async () => {
    setLoading(true)
    try {
      const result = await getMyTemplates({
        page: currentPage,
        limit: 8
      })
      setTemplates(result.templates || [])
      // 计算总页数
      const totalPagesCount = result.total ? Math.ceil(result.total / 8) : 1
      setTotalPages(totalPagesCount)
    } catch (error) {
      console.error('Failed to fetch my templates:', error)
      setTemplates([])
    } finally {
      setLoading(false)
    }
  }

  // 初始化获取模板
  useEffect(() => {
    fetchMyTemplates()
  }, [currentPage])

  // 打开编辑对话框
  const handleEditTemplate = (template: Template) => {
    setEditingTemplate(template)
    setEditForm({
      title: template.title,
      description: template.description,
      tags: template.tags?.join(', ') || '',
      image: template.image || '',
      category: template.category || 'my-templates',
      prompt: template.prompt || ''
    })
    setUploadedImage(null)
    setImagePreview('')
    setIsEditDialogOpen(true)
  }

  // 处理表单输入变化
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setEditForm(prev => ({
      ...prev,
      [name]: value
    }))
  }

  // 处理图片上传
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // 检查文件类型
    if (!file.type.startsWith('image/')) {
      toast.error('请上传图片文件')
      return
    }

    setUploadedImage(file)
    setImagePreview(URL.createObjectURL(file))
    
    // 清理input值，允许重复上传相同文件
    e.target.value = ''
  }

  // 上传图片到服务器
  const uploadImageToServer = async () => {
    if (!uploadedImage) return editForm.image

    try {
      setIsUploading(true)
      const result = await uploadImage(uploadedImage)
      // 使用上传后的文件URL
      return result.url
    } catch (error) {
      console.error('Failed to upload image:', error)
      toast.error('上传图片失败')
      return editForm.image
    } finally {
      setIsUploading(false)
    }
  }

  // 移除已上传的图片
  const removeUploadedImage = () => {
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview)
    }
    setUploadedImage(null)
    setImagePreview('')
  }

  // 保存模板编辑
  const handleSaveTemplate = async () => {
    if (!editingTemplate) return

    try {
      // 如果有新上传的图片，先上传到服务器
      const imageUrl = await uploadImageToServer()
      
      // 构建符合UpdateTemplateData接口的对象
      const updateData: UpdateTemplateData = {
        title: editForm.title,
        description: editForm.description,
        tags: editForm.tags.split(',').map(tag => tag.trim()).filter(tag => tag)
        // 注意：UpdateTemplateData接口中的image字段应该是File对象或null，但我们已经上传了图片
        // 所以这里不需要设置image字段，或者需要重新设计API以支持通过URL更新图片
      }

      await updateTemplate(editingTemplate.id, updateData)
      await fetchMyTemplates()
      setIsEditDialogOpen(false)
      
      // 清理资源
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview)
      }
      
      toast.success('模板已成功更新')
    } catch (error) {
      console.error('Failed to update template:', error)
      toast.error('更新模板时发生错误')
    }
  }

  // 打开删除确认对话框
  const handleDeleteConfirm = (templateId: number) => {
    setTemplateToDelete(templateId)
    setIsDeleteDialogOpen(true)
  }

  // 删除模板
  const handleDeleteTemplate = async () => {
    if (!templateToDelete) return

    try {
      await deleteTemplate(templateToDelete)
      await fetchMyTemplates()
      setIsDeleteDialogOpen(false)
      setTemplateToDelete(null)
      console.log('模板已成功删除')
    } catch (error) {
      console.error('Failed to delete template:', error)
      console.error('删除模板时发生错误')
    }
  }

  // 创建新模板
  const handleCreateTemplate = () => {
    router.navigate({ to: '/template/my/create' })
  }

  // 使用模板
  const handleUseTemplate = (templateId: number) => {
    router.navigate({ to: '/template-use/$templateId', params: { templateId: templateId.toString() } })
  }

  // 处理分页
  const handlePageChange = (page: number) => {
    if (page > 0 && page <= totalPages) {
      setCurrentPage(page)
    }
  }

  // 渲染模板卡片骨架屏
  const renderTemplateSkeleton = () => {
    return Array.from({ length: 8 }).map((_, index) => (
      <Card key={index} className="overflow-hidden transition-all hover:shadow-md h-full">
        <Skeleton className="h-48 w-full" />
        <CardContent className="p-4">
          <Skeleton className="h-6 w-3/4 mb-2" />
          <Skeleton className="h-4 w-full mb-1" />
          <Skeleton className="h-4 w-full mb-4" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-24" />
          </div>
        </CardContent>
      </Card>
    ))
  }

  return (
    <div className="flex flex-col h-screen">
      <TopMenu />

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-7xl mx-auto">
          {/* 页面标题和操作按钮 - 调整为在同一行右上角 */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-8 flex justify-end items-center gap-4"
          >
            <h1 className="text-3xl font-bold flex-grow text-right">模板管理</h1>
            <Button
              onClick={handleCreateTemplate}
              className="bg-primary hover:bg-primary/90 text-white"
            >
              新建模板
            </Button>
          </motion.div>

          {loading ? (
            // 加载状态显示骨架屏
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {renderTemplateSkeleton()}
            </div>
          ) : templates.length > 0 ? (
            // 已有模板时显示模板列表
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {templates.map((template, index) => (
                <motion.div
                  key={template.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  whileHover={{ y: -5, transition: { duration: 0.2 } }}
                >
                  <Card className="h-full flex flex-col overflow-hidden hover:shadow-md transition-shadow duration-300">
                    <div className="relative h-48 overflow-hidden bg-gray-100">
                      <img
                        src={
                          template.image.startsWith('http://') || template.image.startsWith('https://') ?
                            template.image :
                            template.image.includes('localhost:57988/api/file/') ?
                              template.image :
                              `/api/serve_file?file_path=${encodeURIComponent(template.image)}`
                        }
                        alt={template.title}
                        className="w-full h-full object-cover transition-transform hover:scale-105"
                      />
                    </div>
                    <CardContent className="flex-1 flex flex-col p-4">
                      <h3 className="font-semibold text-lg mb-1 line-clamp-1">{template.title}</h3>
                      <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{template.description}</p>

                      <div className="flex flex-wrap gap-1 mb-3">
                        {template.tags?.slice(0, 3).map((tag, index) => (
                          <Badge key={index} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                        {template.tags?.length && template.tags.length > 3 && (
                          <Badge variant="secondary" className="text-xs">
                            +{template.tags.length - 3}
                          </Badge>
                        )}
                      </div>

                      <div className="flex gap-2 mt-auto">
                        <Button
                          className="flex-1"
                          onClick={() => handleUseTemplate(template.id)}
                        >
                          使用
                        </Button>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="secondary"
                                onClick={() => handleEditTemplate(template)}
                                size="icon"
                                className="h-9 w-9"
                              >
                                <span className="sr-only">编辑</span>
                                ✏️
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>编辑模板</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="destructive"
                                onClick={() => handleDeleteConfirm(template.id)}
                                size="icon"
                                className="h-9 w-9"
                              >
                                <span className="sr-only">删除</span>
                                🗑️
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>删除模板</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          ) : (
            // 暂无模板时显示空状态
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-16 flex flex-col items-center justify-center"
            >
              <p className="text-xl font-medium mb-3">暂无模板</p>
              <p className="text-muted-foreground mb-6">创建您的第一个模板，开始AI创作之旅</p>
              <Button
                onClick={handleCreateTemplate}
                size="lg"
                className="bg-primary hover:bg-primary/90 text-white"
              >
                立即创建
              </Button>
            </motion.div>
          )}

          {/* 分页控件 */}
          {!loading && templates.length > 0 && totalPages > 1 && (
            <div className="flex justify-center mt-8">
              <div className="flex items-center space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={currentPage === 1}
                  onClick={() => handlePageChange(currentPage - 1)}
                  className="h-8 w-8 p-0"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                </Button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <Button
                    key={page}
                    type="button"
                    variant={currentPage === page ? "default" : "outline"}
                    onClick={() => handlePageChange(page)}
                    className="h-8 w-8 p-0"
                  >
                    {page}
                  </Button>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  disabled={currentPage === totalPages}
                  onClick={() => handlePageChange(currentPage + 1)}
                  className="h-8 w-8 p-0"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 编辑模板对话框 */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>编辑模板</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="title">模板标题</Label>
              <Input
                id="title"
                name="title"
                value={editForm.title}
                onChange={handleInputChange}
                placeholder="输入模板标题"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">模板描述</Label>
              <Textarea
                id="description"
                name="description"
                value={editForm.description}
                onChange={handleInputChange}
                placeholder="输入模板描述"
                rows={4}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tags">标签</Label>
              <Input
                id="tags"
                name="tags"
                value={editForm.tags}
                onChange={handleInputChange}
                placeholder="用逗号分隔的标签列表"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="image">图片</Label>
              <Input
                id="image"
                name="image"
                value={editForm.image}
                onChange={handleInputChange}
                placeholder="输入图片URL"
              />
              
              {/* 图片上传区域 */}
              <div className="mt-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => document.getElementById('image-upload')?.click()}
                  disabled={isUploading}
                >
                  {isUploading ? '上传中...' : '上传图片'}
                </Button>
                <input
                  id="image-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </div>
              
              {/* 图片预览 */}
              {(imagePreview || editForm.image) && (
                <div className="relative mt-2">
                  <div className="relative rounded-md overflow-hidden border border-gray-200 max-w-xs">
                    <img
                      src={imagePreview || editForm.image}
                      alt="Template preview"
                      className="w-full h-auto max-h-48 object-cover"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute top-1 right-1"
                      onClick={removeUploadedImage}
                      disabled={isUploading}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </Button>
                  </div>
                </div>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="category">分类</Label>
              <Input
                id="category"
                name="category"
                value={editForm.category}
                onChange={handleInputChange}
                placeholder="输入分类名称"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="prompt">提示词</Label>
              <Textarea
                id="prompt"
                name="prompt"
                value={editForm.prompt}
                onChange={handleInputChange}
                placeholder="输入模板提示词"
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setIsEditDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSaveTemplate} className="bg-primary hover:bg-primary/90 text-white">
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={(open: boolean) => {
        if (!open) {
          setTemplateToDelete(null)
        }
        setIsDeleteDialogOpen(open)
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确定要删除此模板吗？</DialogTitle>
            <DialogDescription>
              此操作无法撤销，删除后模板数据将无法恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setIsDeleteDialogOpen(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDeleteTemplate}>
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default TemplateManagePage