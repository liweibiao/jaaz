import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { useRouter } from '@tanstack/react-router'
import { motion } from 'motion/react'
import TopMenu from '../TopMenu'
import { getMyTemplates } from '@/api/templates'
import { Template } from '@/api/templates'

const TemplatesPage: React.FC = () => {
  const { t } = useTranslation()
  const router = useRouter()
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
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
      const total = result.total || 0
      setTotalPages(Math.ceil(total / 8) || 1)
    } catch (error) {
      console.error('Failed to fetch my templates:', error)
      setTemplates([])
      setTotalPages(1)
    } finally {
      setLoading(false)
    }
  }
  
  // 初始化获取模板
  useEffect(() => {
    fetchMyTemplates()
  }, [currentPage])
  
  // 处理分页
  const handlePageChange = (page: number) => {
    if (page > 0 && page <= totalPages) {
      setCurrentPage(page)
    }
  }
  
  // 处理新建模板
  const handleCreateTemplate = () => {
    router.navigate({ to: '/template/my/create' })
  }
  
  // 处理模板管理
  const handleManageTemplates = () => {
    router.navigate({ to: '/template/manage' })
  }
  
  // 处理使用模板
  const handleUseTemplate = (templateId: number) => {
    router.navigate({ to: '/template-use/$templateId', params: { templateId: templateId.toString() } })
  }
  
  // 渲染模板卡片骨架屏
  const renderTemplateSkeleton = () => {
    return Array.from({ length: 8 }).map((_, index) => (
      <Card key={index} className="overflow-hidden transition-all hover:shadow-md h-full">
        <Skeleton className="h-48 w-full" />
        <CardContent className="p-4">
          <Skeleton className="h-6 w-3/4 mb-2" />
          <Skeleton className="h-4 w-full mb-1" />
          <Skeleton className="h-4 w-full" />
        </CardContent>
      </Card>
    ))
  }
  
  return (
    <div className="flex flex-col h-screen">
      <TopMenu />

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-7xl mx-auto">
          {/* 页面标题和操作按钮 */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-8 flex justify-between items-center gap-4"
          >
            <h1 className="text-3xl font-bold">我的模板</h1>
            <div className="flex gap-3">
              <Button 
                onClick={handleCreateTemplate} 
                className="bg-primary hover:bg-primary/90 text-white"
              >
                新建模板
              </Button>
              <Button 
                variant="secondary" 
                onClick={handleManageTemplates}
              >
                模板管理
              </Button>
            </div>
          </motion.div>
          
          {loading ? (
            // 加载状态显示骨架屏
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {renderTemplateSkeleton()}
            </div>
          ) : templates.length > 0 ? (
            // 已有模板时显示模板列表
            <div>
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

                        <Button
                          className="w-full mt-auto"
                          onClick={() => handleUseTemplate(template.id)}
                        >
                          使用模板
                        </Button>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </div>
          ) : (
            // 暂无模板时显示空状态
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-16 flex flex-col items-center justify-center"
            >
              <div className="max-w-md">
                <p className="text-xl font-medium mb-3">暂无我的模板</p>
                <p className="text-muted-foreground mb-6">创建您的第一个模板，开始AI创作之旅</p>
                <Button 
                  onClick={handleCreateTemplate} 
                  size="lg"
                  className="bg-primary hover:bg-primary/90 text-white"
                >
                  立即创建
                </Button>
              </div>
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
    </div>
  )
}

export default TemplatesPage