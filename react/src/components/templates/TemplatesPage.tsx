import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { getTemplates } from '@/api/templates'
import { Template } from '@/api/templates'
import { useRouter } from '@tanstack/react-router'
import { motion } from 'motion/react'
import TopMenu from '../TopMenu'

const TemplatesPage: React.FC = () => {
  const { t } = useTranslation()
  const router = useRouter()
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [category, setCategory] = useState('all')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  
  // 获取模板列表
  const fetchTemplates = async () => {
    setLoading(true)
    try {
      // 修改每页显示数量为8，这样17条记录可以分成3页，便于测试分页功能
      const pageSize = 8
      const result = await getTemplates({
        search: searchTerm,
        category: category === 'all' ? undefined : category,
        page: page,
        limit: pageSize,
        sort_by: 'downloads',
        sort_order: 'desc'
      })
      setTemplates(result.templates)
      setTotalPages(Math.ceil(result.total / pageSize))
    } catch (error) {
      console.error('Failed to fetch templates:', error)
    } finally {
      setLoading(false)
    }
  }
  
  // 初始化和搜索/筛选时获取模板
  useEffect(() => {
    fetchTemplates()
  }, [searchTerm, category, page])
  
  // 确保totalPages至少为1
  useEffect(() => {
    if (totalPages < 1) {
      setTotalPages(1)
    }
  }, [totalPages])
  
  // 获取所有可用的分类
  const categories = ['all', ...Array.from(new Set(templates.map(t => t.category)))]
  
  // 处理模板使用
  const handleUseTemplate = (templateId: number) => {
    router.navigate({ to: '/template-use/$templateId', params: { templateId: templateId.toString() } })
  }
  
  // 分页控制函数
  const goToPreviousPage = () => {
    if (page > 1) {
      setPage(page - 1)
    }
  }
  
  const goToNextPage = () => {
    if (page < totalPages) {
      setPage(page + 1)
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
          {/* 页面标题 */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-8 flex flex-col sm:flex-row justify-start items-start sm:items-center gap-4"
          >
            <div>
              <h1 className="text-3xl font-bold mb-2">{t('templates:title', '模板')}</h1>
              <p className="text-muted-foreground">{t('template:subtitle', '浏览和使用我们的模板集合')}</p>
            </div>
          </motion.div>

          {/* 搜索和筛选 */}
          <div className="flex flex-col md:flex-row gap-4 mb-8">
            <Input
              placeholder={t('templates:searchPlaceholder', '搜索模板')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full md:w-1/3"
            />
          
            <div className="flex flex-wrap gap-2">
              <Button
                variant={category === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setCategory('all')}
              >
                {t('templates:allCategories', '全部分类')}
              </Button>
              {categories.filter(cat => cat !== 'all').map(cat => (
                <Button
                  key={cat}
                  variant={category === cat ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setCategory(cat)}
                >
                  {cat}
                </Button>
              ))}
            </div>
          </div>
          
          {/* 模板网格 */}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {renderTemplateSkeleton()}
            </div>
          ) : templates.length > 0 ? (
            <>
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
                            // 检查是否是完整URL（http://或https://开头）
                            template.image.startsWith('http://') || template.image.startsWith('https://') ?
                              template.image :
                              // 检查是否已包含localhost:57988/api/file/
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
                          {template.tags.slice(0, 3).map((tag, index) => (
                            <Badge key={index} variant="secondary" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                          {template.tags.length > 3 && (
                            <Badge variant="secondary" className="text-xs">
                              +{template.tags.length - 3}
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center justify-between text-xs text-muted-foreground mb-4">
                          <span>{t('templates:downloads', '{{count}} 次下载', { count: template.downloads })}</span>
                          <span className="flex items-center">
                            {'★'.repeat(Math.floor(template.rating || 0))}
                            {'☆'.repeat(5 - Math.floor(template.rating || 0))}
                            <span className="ml-1">{template.rating || 0}</span>
                          </span>
                        </div>

                        <Button
                          className="w-full"
                          onClick={() => handleUseTemplate(template.id)}
                        >
                          {t('templates:useTemplate', '使用模板')}
                        </Button>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
              
              {/* 分页控件 - 总是显示以便用户了解当前位置 */}
              <div className="flex items-center justify-center gap-2 pt-8">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goToPreviousPage}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  {t('templates:previousPage', '上一页')}
                </Button>
                
                <span className="text-sm text-muted-foreground px-2">
                  {page} / {totalPages}
                </span>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goToNextPage}
                  disabled={page === totalPages}
                >
                  {t('templates:nextPage', '下一页')}
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-16"
            >
              <p className="text-muted-foreground">{t('template:noTemplates', '没有找到模板')}</p>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
}

export default TemplatesPage