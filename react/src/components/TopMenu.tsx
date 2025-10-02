import React, { useState } from 'react'
import { useConfigs } from '@/contexts/configs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ChevronLeft, ImageIcon, Trash2, Home, LayoutTemplate, PlusCircle, CopyIcon, SettingsIcon } from 'lucide-react'
import { motion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import ThemeButton from '@/components/theme/ThemeButton'
import { LOGO_URL, DEFAULT_SYSTEM_PROMPT } from '@/constants'
import LanguageSwitcher from './common/LanguageSwitcher'
import { cn } from '@/lib/utils'
import { UserMenu } from './auth/UserMenu'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useMutation } from '@tanstack/react-query'
import { createCanvas, deleteCanvas, getCanvas } from '@/api/canvas'
import { nanoid } from 'nanoid'
import { toast } from 'sonner'

export default function TopMenu({
  middle,
  right,
}: {
  middle?: React.ReactNode
  right?: React.ReactNode
}) {
  const { t } = useTranslation()

  const navigate = useNavigate()
  const { setShowSettingsDialog, textModel, selectedTools } = useConfigs()
  
  // 创建新项目
  const { mutate: createCanvasMutation, isPending: isCreating } = useMutation({
    mutationFn: createCanvas,
    onSuccess: (data) => {
      navigate({
        to: '/canvas/$id',
        params: { id: data.id },
      })
    },
    onError: (error) => {
      toast.error(t('common:messages.error'), {
        description: error.message,
      })
    },
  })
  
  // 删除项目
  const { mutate: deleteCanvasMutation, isPending: isDeleting } = useMutation({
    mutationFn: deleteCanvas,
    onSuccess: () => {
      // 先关闭对话框
      setShowDeleteDialog(false)
      // 再显示成功提示
      toast.success(t('canvas:messages.canvasDeleted'))
      // 最后导航到首页
      setTimeout(() => {
        navigate({ to: '/' })
      }, 500)
    },
    onError: (error) => {
      // 关闭对话框
      setShowDeleteDialog(false)
      // 显示错误提示
      toast.error(t('common:messages.error'), {
        description: error.message,
      })
    },
  })
  
  // 对话框状态
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isCloning, setIsCloning] = useState(false)
  
  // 获取当前画布ID
  const getCurrentCanvasId = () => {
    const path = window.location.pathname
    const match = path.match(/\/canvas\/(\w+)/)
    return match ? match[1] : null
  }
  
  // 处理新建项目
  const handleCreateNewProject = () => {
    // 确保text_model有有效的默认值，避免API密钥错误
    const defaultTextModel = {
      provider: 'jaaz',  // 使用jaaz作为默认提供商
      model: 'gpt-4o',   // 使用gpt-4o作为默认模型
      url: 'https://jaaz.app/api/v1/' // 默认API URL
    };
    
    createCanvasMutation({
      name: t('home:newProject'),
      canvas_id: nanoid(),
      messages: [],
      session_id: nanoid(),
      text_model: textModel && textModel.provider ? textModel : defaultTextModel,
      tool_list: selectedTools || [],
      system_prompt: localStorage.getItem('system_prompt') || DEFAULT_SYSTEM_PROMPT,
      original_canvas_id: undefined, // 明确设置为undefined，确保不会复制当前画布内容
    })
  }
  
  // 处理复制项目
  const handleCloneProject = async () => {
    const canvasId = getCurrentCanvasId()
    if (!canvasId) {
      toast.error(t('common:messages.error'), {
        description: t('canvas:messages.noCanvasSelected'),
      })
      return
    }
    
    setIsCloning(true)
    try {
      // 获取当前画布数据
      const canvasData = await getCanvas(canvasId)
      
      // 创建新项目，复制当前画布的所有内容
      createCanvasMutation({
        name: `${canvasData.name} (${t('home:copy', '副本')})`,
        canvas_id: nanoid(),
        messages: [], // 空消息数组，让后端创建新会话
        session_id: nanoid(),
        text_model: textModel || { provider: '', model: '', url: '' },
        tool_list: selectedTools || [],
        system_prompt: localStorage.getItem('system_prompt') || DEFAULT_SYSTEM_PROMPT,
        // 额外传递原始画布ID，让后端复制完整数据
        original_canvas_id: canvasId,
      })
    } catch (error) {
      toast.error(t('common:messages.error'), {
        description: error instanceof Error ? error.message : t('canvas:messages.cloneFailed'),
      })
    } finally {
      setIsCloning(false)
    }
  }
  
  // 处理删除项目
  const handleDeleteProject = () => {
    const canvasId = getCurrentCanvasId()
    if (canvasId) {
      setShowDeleteDialog(true)
    }
  }
  
  // 确认删除项目
  const confirmDeleteProject = () => {
    const canvasId = getCurrentCanvasId()
    if (canvasId) {
      // 调用删除API但不立即关闭对话框，
      // 让React Query的onSuccess回调来处理后续逻辑
      deleteCanvasMutation(canvasId)
    }
  }

  return (
    <motion.div
      className="sticky top-0 z-0 flex w-full h-8 bg-background px-4 justify-between items-center select-none border-b border-border"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-center gap-8">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <motion.div
              className="flex items-center gap-2 cursor-pointer group"
              onClick={(e) => e.preventDefault()}
            >
              {window.location.pathname !== '/' && (
                <ChevronLeft className="size-5 group-hover:-translate-x-0.5 transition-transform duration-300" />
              )}
              <img src={LOGO_URL} alt="logo" className="size-5" draggable={false} />
              <motion.div className="flex relative overflow-hidden items-start h-7 text-xl font-bold">
                <motion.span className="flex items-center" layout>
                  {window.location.pathname === '/' ? 'Jaaz' : t('canvas:back')}
                </motion.span>
              </motion.div>
            </motion.div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuItem onClick={() => navigate({ to: '/' })} className="cursor-pointer">
              <Home className="mr-2 h-4 w-4" />
              <span>{t('home:首页', '首页')}</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => window.location.href = '/templates'} className="cursor-pointer">
              <LayoutTemplate className="mr-2 h-4 w-4" />
              <span>{t('home:Templates', '模板')}</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleCreateNewProject} className="cursor-pointer" disabled={isCreating}>
              <PlusCircle className="mr-2 h-4 w-4" />
              <span>{t('home:newProject', '新建项目')}</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleCloneProject} className="cursor-pointer" disabled={isCloning || !getCurrentCanvasId()}>
              <CopyIcon className="mr-2 h-4 w-4" />
              <span>{t('home:copyProject', '复制项目')}</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleDeleteProject} className="cursor-pointer text-red-500" disabled={isDeleting || !getCurrentCanvasId()}>
              <Trash2 className="mr-2 h-4 w-4" />
              <span>{t('home:删除项目', '删除项目')}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        
        {/* 删除项目确认对话框 */}
        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('canvas:delete', '删除项目')}</DialogTitle>
              <DialogDescription>
                {t('canvas:deleteDialog:description', '您确定要删除此项目吗？此操作无法撤销。')}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setShowDeleteDialog(false)} disabled={isDeleting}>
                {t('common:cancel', '取消')}
              </Button>
              <Button variant="destructive" onClick={confirmDeleteProject} disabled={isDeleting}>
                {t('canvas:delete', '删除')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Button
          variant={window.location.pathname === '/assets' ? 'default' : 'ghost'}
          size="sm"
          className={cn('flex items-center font-bold rounded-none')}
          onClick={() => navigate({ to: '/assets' })}
        >
          <ImageIcon className="size-4" />
          {t('home:Library', '素材库')}
        </Button>
        <Button
          variant={window.location.pathname === '/template' ? 'default' : 'ghost'}
          size="sm"
          className={cn('flex items-center font-bold rounded-none')}
          onClick={() => window.location.href = '/templates'}
        >
          {t('home:Templates', '模板')}
        </Button>
      </div>

      <div className="flex items-center gap-2">{middle}</div>

      <div className="flex items-center gap-2">
        {right}
        {/* <AgentSettings /> */}
        <Button
          size={'sm'}
          variant="ghost"
          onClick={() => setShowSettingsDialog(true)}
        >
          <SettingsIcon size={30} />
        </Button>
        <LanguageSwitcher />
        <ThemeButton />
        <UserMenu />
      </div>
    </motion.div>
  )
}
