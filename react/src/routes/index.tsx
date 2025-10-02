import { createCanvas } from '@/api/canvas'
import ChatTextarea from '@/components/chat/ChatTextarea'
import CanvasList from '@/components/home/CanvasList'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { useConfigs } from '@/contexts/configs'
import { DEFAULT_SYSTEM_PROMPT } from '@/constants'
import { useMutation } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { motion } from 'motion/react'
import { nanoid } from 'nanoid'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import TopMenu from '@/components/TopMenu'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { setInitCanvas } = useConfigs()

  const { mutate: createCanvasMutation, isPending } = useMutation({
    mutationFn: createCanvas,
    onSuccess: (data, variables) => {
      setInitCanvas(true)
      navigate({
        to: '/canvas/$id',
        params: { id: data.id },
        search: {
          sessionId: variables.session_id,
        },
      })
    },
    onError: (error) => {
      toast.error(t('common:messages.error'), {
        description: error.message,
      })
    },
  })

  return (
    <div className='flex flex-col h-screen'>
      <ScrollArea className='h-full'>
        <TopMenu />

        <div className='relative flex flex-col items-center justify-center h-fit min-h-[calc(100vh-460px)] pt-[60px] select-none'>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className='text-5xl font-bold mb-2 mt-8 text-center'>{t('home:title')}</h1>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <p className='text-xl text-gray-500 mb-8 text-center'>{t('home:subtitle')}</p>
          </motion.div>

          <ChatTextarea
            className='w-full max-w-xl'
            messages={[]}
            onSendMessages={(messages, configs) => {
              createCanvasMutation({
                name: t('home:newCanvas'),
                canvas_id: nanoid(),
                messages: messages,
                session_id: nanoid(),
                text_model: configs.textModel,
                tool_list: configs.toolList,
                system_prompt: localStorage.getItem('system_prompt') || DEFAULT_SYSTEM_PROMPT,
                original_canvas_id: undefined, // 明确设置为undefined，确保不会复制当前画布内容
              })
            }}
            pending={isPending}
          />

          <div className='mt-6 flex justify-center'>
            <Button
              variant="default"
              size="default"
              className="rounded-full"
              onClick={() => {
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
                  original_canvas_id: undefined, // 明确设置为undefined，确保不会复制当前画布内容
                  text_model: defaultTextModel,
                  tool_list: [],
                  system_prompt: localStorage.getItem('system_prompt') || DEFAULT_SYSTEM_PROMPT,
                })
              }}
              disabled={isPending}
            >
              {t('home:newProject')}
            </Button>
          </div>
        </div>

        <CanvasList />
      </ScrollArea>
    </div>
  )
}
