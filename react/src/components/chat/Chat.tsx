import { sendMessages } from '@/api/chat'
import Blur from '@/components/common/Blur'
import { ScrollArea } from '@/components/ui/scroll-area'
import { eventBus, TEvents } from '@/lib/event'
import ChatMagicGenerator from './ChatMagicGenerator'
import {
  AssistantMessage,
  Message,
  Model,
  PendingType,
  Session,
} from '@/types/types'
import { useSearch } from '@tanstack/react-router'
import { produce } from 'immer'
import { motion } from 'motion/react'
import { nanoid } from 'nanoid'
import {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { PhotoProvider } from 'react-photo-view'
import { toast } from 'sonner'
import ShinyText from '../ui/shiny-text'
import ChatTextarea from './ChatTextarea'
import MessageRegular from './Message/Regular'
import { ToolCallContent } from './Message/ToolCallContent'
import ToolCallTag from './Message/ToolCallTag'
import SessionSelector from './SessionSelector'
import ChatSpinner from './Spinner'
import ToolcallProgressUpdate from './ToolcallProgressUpdate'
import ShareTemplateDialog from './ShareTemplateDialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Trash2 } from 'lucide-react'

import { useConfigs } from '@/contexts/configs'
import 'react-photo-view/dist/react-photo-view.css'
import { DEFAULT_SYSTEM_PROMPT } from '@/constants'
import { ModelInfo, ToolInfo } from '@/api/model'
import { cancelChat } from '@/api/chat'
import { Share2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useQueryClient } from '@tanstack/react-query'
import MixedContent, { MixedContentImages, MixedContentText } from './Message/MixedContent'


type ChatInterfaceProps = {
  canvasId: string
  sessionList: Session[]
  setSessionList: Dispatch<SetStateAction<Session[]>>
  sessionId: string
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({
  canvasId,
  sessionList,
  setSessionList,
  sessionId: searchSessionId,
}) => {
  const { t } = useTranslation()
  const [session, setSession] = useState<Session | null>(null)
  const { initCanvas, setInitCanvas } = useConfigs()
  const { authStatus } = useAuth()
  const [showShareDialog, setShowShareDialog] = useState(false)
  // 使用消息ID而不是索引来存储选中的消息
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([])
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isDeletingMode, setIsDeletingMode] = useState(false)
  const queryClient = useQueryClient()

  useEffect(() => {
    if (sessionList.length > 0) {
      let _session = null
      if (searchSessionId) {
        _session = sessionList.find((s) => s.id === searchSessionId) || null
      } else {
        _session = sessionList[0]
      }
      setSession(_session)
    } else {
      setSession(null)
    }
  }, [sessionList, searchSessionId])

  const [messages, setMessages] = useState<Message[]>([])
  const [pending, setPending] = useState<PendingType>(
    initCanvas ? 'text' : false
  )
  const mergedToolCallIds = useRef<string[]>([])

  const sessionId = session?.id ?? searchSessionId

  const sessionIdRef = useRef<string>(session?.id || nanoid())
  const [expandingToolCalls, setExpandingToolCalls] = useState<string[]>([])
  const [pendingToolConfirmations, setPendingToolConfirmations] = useState<
    string[]
  >([])

  const scrollRef = useRef<HTMLDivElement>(null)
  const isAtBottomRef = useRef(false)

  const scrollToBottom = useCallback(() => {
    if (!isAtBottomRef.current) {
      return
    }
    setTimeout(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current!.scrollHeight,
        behavior: 'smooth',
      })
    }, 200)
  }, [])

  const mergeToolCallResult = (messages: Message[]) => {
    const messagesWithToolCallResult = messages.map((message, index) => {
      if (message.role === 'assistant' && message.tool_calls) {
        for (const toolCall of message.tool_calls) {
          // From the next message, find the tool call result
          for (let i = index + 1; i < messages.length; i++) {
            const nextMessage = messages[i]
            if (
              nextMessage.role === 'tool' &&
              nextMessage.tool_call_id === toolCall.id
            ) {
              toolCall.result = nextMessage.content
              mergedToolCallIds.current.push(toolCall.id)
            }
          }
        }
      }
      return message
    })

    return messagesWithToolCallResult
  }

  const handleDelta = useCallback(
    (data: TEvents['Socket::Session::Delta']) => {
      if (data.session_id && data.session_id !== sessionId) {
        return
      }

      setPending('text')
      setMessages(
        produce((prev) => {
          const last = prev.at(-1)
          if (
            last?.role === 'assistant' &&
            last.content != null &&
            last.tool_calls == null
          ) {
            if (typeof last.content === 'string') {
              last.content += data.text
            } else if (
              last.content &&
              last.content.at(-1) &&
              last.content.at(-1)!.type === 'text'
            ) {
              ; (last.content.at(-1) as { text: string }).text += data.text
            }
          } else {
            prev.push({
              role: 'assistant',
              content: data.text,
            })
          }
        })
      )
      scrollToBottom()
    },
    [sessionId, scrollToBottom]
  )

  const handleToolCall = useCallback(
    (data: TEvents['Socket::Session::ToolCall']) => {
      if (data.session_id && data.session_id !== sessionId) {
        return
      }

      const existToolCall = messages.find(
        (m) =>
          m.role === 'assistant' &&
          m.tool_calls &&
          m.tool_calls.find((t) => t.id == data.id)
      )

      if (existToolCall) {
        return
      }

      setMessages(
        produce((prev) => {
          console.log('👇tool_call event get', data)
          setPending('tool')
          prev.push({
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                type: 'function',
                function: {
                  name: data.name,
                  arguments: '',
                },
                id: data.id,
              },
            ],
          })
        })
      )

      setExpandingToolCalls(
        produce((prev) => {
          prev.push(data.id)
        })
      )
    },
    [sessionId]
  )

  const handleToolCallPendingConfirmation = useCallback(
    (data: TEvents['Socket::Session::ToolCallPendingConfirmation']) => {
      if (data.session_id && data.session_id !== sessionId) {
        return
      }

      const existToolCall = messages.find(
        (m) =>
          m.role === 'assistant' &&
          m.tool_calls &&
          m.tool_calls.find((t) => t.id == data.id)
      )

      if (existToolCall) {
        return
      }

      setMessages(
        produce((prev) => {
          console.log('👇tool_call_pending_confirmation event get', data)
          setPending('tool')
          prev.push({
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                type: 'function',
                function: {
                  name: data.name,
                  arguments: data.arguments,
                },
                id: data.id,
              },
            ],
          })
        })
      )

      setPendingToolConfirmations(
        produce((prev) => {
          prev.push(data.id)
        })
      )

      // 自动展开需要确认的工具调用
      setExpandingToolCalls(
        produce((prev) => {
          if (!prev.includes(data.id)) {
            prev.push(data.id)
          }
        })
      )
    },
    [sessionId]
  )

  const handleToolCallConfirmed = useCallback(
    (data: TEvents['Socket::Session::ToolCallConfirmed']) => {
      if (data.session_id && data.session_id !== sessionId) {
        return
      }

      setPendingToolConfirmations(
        produce((prev) => {
          return prev.filter((id) => id !== data.id)
        })
      )

      setExpandingToolCalls(
        produce((prev) => {
          if (!prev.includes(data.id)) {
            prev.push(data.id)
          }
        })
      )
    },
    [sessionId]
  )

  const handleToolCallCancelled = useCallback(
    (data: TEvents['Socket::Session::ToolCallCancelled']) => {
      if (data.session_id && data.session_id !== sessionId) {
        return
      }

      setPendingToolConfirmations(
        produce((prev) => {
          return prev.filter((id) => id !== data.id)
        })
      )

      // 更新工具调用的状态
      setMessages(
        produce((prev) => {
          prev.forEach((msg) => {
            if (msg.role === 'assistant' && msg.tool_calls) {
              msg.tool_calls.forEach((tc) => {
                if (tc.id === data.id) {
                  // 添加取消状态标记
                  tc.result = '工具调用已取消'
                }
              })
            }
          })
        })
      )
    },
    [sessionId]
  )

  const handleToolCallArguments = useCallback(
    (data: TEvents['Socket::Session::ToolCallArguments']) => {
      if (data.session_id && data.session_id !== sessionId) {
        return
      }

      setMessages(
        produce((prev) => {
          setPending('tool')
          const lastMessage = prev.find(
            (m) =>
              m.role === 'assistant' &&
              m.tool_calls &&
              m.tool_calls.find((t) => t.id == data.id)
          ) as AssistantMessage

          if (lastMessage) {
            const toolCall = lastMessage.tool_calls!.find(
              (t) => t.id == data.id
            )
            if (toolCall) {
              // 检查是否是待确认的工具调用，如果是则跳过参数追加
              if (pendingToolConfirmations.includes(data.id)) {
                return
              }
              toolCall.function.arguments += data.text
            }
          }
        })
      )
      scrollToBottom()
    },
    [sessionId, scrollToBottom, pendingToolConfirmations]
  )

  const handleToolCallResult = useCallback(
    (data: TEvents['Socket::Session::ToolCallResult']) => {
      console.log('😘🖼️tool_call_result event get', data)
      if (data.session_id && data.session_id !== sessionId) {
        return
      }
      // TODO: support other non string types of returning content like image_url
      if (data.message.content) {
        setMessages(
          produce((prev) => {
            prev.forEach((m) => {
              if (m.role === 'assistant' && m.tool_calls) {
                m.tool_calls.forEach((t) => {
                  if (t.id === data.id) {
                    t.result = data.message.content
                  }
                })
              }
            })
          })
        )
      }
    },
    [canvasId, sessionId]
  )

  const handleImageGenerated = useCallback(
    (data: TEvents['Socket::Session::ImageGenerated']) => {
      if (
        data.canvas_id &&
        data.canvas_id !== canvasId &&
        data.session_id !== sessionId
      ) {
        return
      }

      console.log('⭐️dispatching image_generated', data)
      setPending('image')
    },
    [canvasId, sessionId]
  )

  const handleAllMessages = useCallback(
    (data: TEvents['Socket::Session::AllMessages']) => {
      if (data.session_id && data.session_id !== sessionId) {
        return
      }

      // 先合并工具调用结果，然后一次性设置消息状态
      const mergedMessages = mergeToolCallResult(data.messages)
      setMessages(mergedMessages)
      scrollToBottom()
    },
    [sessionId, scrollToBottom]
  )

  const handleDone = useCallback(
    (data: TEvents['Socket::Session::Done']) => {
      if (data.session_id && data.session_id !== sessionId) {
        return
      }

      setPending(false)
      scrollToBottom()

      // 聊天输出完毕后更新余额
      if (authStatus.is_logged_in) {
        queryClient.invalidateQueries({ queryKey: ['balance'] })
      }
    },
    [sessionId, scrollToBottom, authStatus.is_logged_in, queryClient]
  )

  const handleError = useCallback((data: TEvents['Socket::Session::Error']) => {
    setPending(false)
    toast.error('Error: ' + data.error, {
      closeButton: true,
      duration: 10 * 1000,
      style: { color: 'red' },
    })
  }, [])

  const handleInfo = useCallback((data: TEvents['Socket::Session::Info']) => {
    toast.info(data.info, {
      closeButton: true,
      duration: 10 * 1000,
    })
  }, [])

  useEffect(() => {
    const handleScroll = () => {
      if (scrollRef.current) {
        isAtBottomRef.current =
          scrollRef.current.scrollHeight - scrollRef.current.scrollTop <=
          scrollRef.current.clientHeight + 1
      }
    }
    const scrollEl = scrollRef.current
    scrollEl?.addEventListener('scroll', handleScroll)

    eventBus.on('Socket::Session::Delta', handleDelta)
    eventBus.on('Socket::Session::ToolCall', handleToolCall)
    eventBus.on(
      'Socket::Session::ToolCallPendingConfirmation',
      handleToolCallPendingConfirmation
    )
    eventBus.on('Socket::Session::ToolCallConfirmed', handleToolCallConfirmed)
    eventBus.on('Socket::Session::ToolCallCancelled', handleToolCallCancelled)
    eventBus.on('Socket::Session::ToolCallArguments', handleToolCallArguments)
    eventBus.on('Socket::Session::ToolCallResult', handleToolCallResult)
    eventBus.on('Socket::Session::ImageGenerated', handleImageGenerated)
    eventBus.on('Socket::Session::AllMessages', handleAllMessages)
    eventBus.on('Socket::Session::Done', handleDone)
    eventBus.on('Socket::Session::Error', handleError)
    eventBus.on('Socket::Session::Info', handleInfo)
    return () => {
      scrollEl?.removeEventListener('scroll', handleScroll)

      eventBus.off('Socket::Session::Delta', handleDelta)
      eventBus.off('Socket::Session::ToolCall', handleToolCall)
      eventBus.off(
        'Socket::Session::ToolCallPendingConfirmation',
        handleToolCallPendingConfirmation
      )
      eventBus.off(
        'Socket::Session::ToolCallConfirmed',
        handleToolCallConfirmed
      )
      eventBus.off(
        'Socket::Session::ToolCallCancelled',
        handleToolCallCancelled
      )
      eventBus.off(
        'Socket::Session::ToolCallArguments',
        handleToolCallArguments
      )
      eventBus.off('Socket::Session::ToolCallResult', handleToolCallResult)
      eventBus.off('Socket::Session::ImageGenerated', handleImageGenerated)
      eventBus.off('Socket::Session::AllMessages', handleAllMessages)
      eventBus.off('Socket::Session::Done', handleDone)
      eventBus.off('Socket::Session::Error', handleError)
      eventBus.off('Socket::Session::Info', handleInfo)
    }
  })

  const initChat = useCallback(async () => {
    if (!sessionId) {
      return
    }

    sessionIdRef.current = sessionId

    const resp = await fetch('/api/chat_session/' + sessionId)
    const data = await resp.json()
    const msgs = data?.length ? data : []

    setMessages(mergeToolCallResult(msgs))
    if (msgs.length > 0) {
      setInitCanvas(false)
    }

    // 检查localStorage中是否有模板数据
    setTimeout(() => {
      const storedData = localStorage.getItem('templateData')
      if (storedData) {
        try {
          const templateData = JSON.parse(storedData)
          // 通过eventBus发送模板数据到聊天输入框
          eventBus.emit('Template::SendToChat', templateData)
          // 清理localStorage
          localStorage.removeItem('templateData')
        } catch (error) {
          console.error('Failed to parse template data:', error)
          // 出错时也要清理localStorage，避免重复尝试
          localStorage.removeItem('templateData')
        }
      }
    }, 300)

    scrollToBottom()
    
    // 无论是否有消息，都将initCanvas设置为false，确保pending状态正确重置
    setInitCanvas(false)
  }, [sessionId, scrollToBottom, setInitCanvas, eventBus])

  useEffect(() => {
    initChat()
  }, [sessionId, initChat])

  const onSelectSession = (sessionId: string) => {
    setSession(sessionList.find((s) => s.id === sessionId) || null)
    window.history.pushState(
      {},
      '',
      `/canvas/${canvasId}?sessionId=${sessionId}`
    )
  }

  const onClickNewChat = () => {
    const newSession: Session = {
      id: nanoid(),
      title: t('chat:newChat'),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      model: session?.model || 'gpt-4o',
      provider: session?.provider || 'openai',
    }

    setSessionList((prev) => [...prev, newSession])
    onSelectSession(newSession.id)
  }

  // 轮询检查消息更新的函数
  const pollForMessageUpdates = useCallback(async (sessionId: string, startTime: number) => {
    const MAX_POLL_TIME = 60000; // 最大轮询时间60秒
    const POLL_INTERVAL = 5000; // 增加轮询间隔到5秒，减少请求频率

    // 检查是否超过最大轮询时间或已经收到Done事件
    if (Date.now() - startTime > MAX_POLL_TIME || doneRef.current) {
      console.log('Polling stopped after maximum duration or Done event received');
      return;
    }

    try {
      const response = await fetch(`/api/chat_session/${sessionId}`);
      const messages = await response.json();

      // 如果有新消息（消息数量增加或最后一条消息不是用户发送的）
      if (messages && messages.length > 0) {
        const latestMessage = messages[messages.length - 1];
        const currentMessages = messagesRef.current;

        // 检查是否有新的助手回复
        if (latestMessage.role === 'assistant' &&
          (!currentMessages ||
            !currentMessages.length ||
            currentMessages[currentMessages.length - 1].id !== latestMessage.id)) {

          // 更新消息列表
          const mergedMessages = mergeToolCallResult(messages);
          setMessages(mergedMessages);
          messagesRef.current = mergedMessages;
          setPending(false);
          scrollToBottom();
          return; // 收到新消息后停止轮询
        }
      }

      // 继续轮询，但使用递增的间隔时间，避免请求过于频繁
      const nextInterval = Math.min(POLL_INTERVAL + Math.floor((Date.now() - startTime) / 10000) * 1000, 10000); // 最大10秒
      setTimeout(() => pollForMessageUpdates(sessionId, startTime), nextInterval);
    } catch (error) {
      console.error('Polling for message updates failed:', error);
      // 发生错误时增加轮询间隔，避免在网络问题时频繁请求
      setTimeout(() => pollForMessageUpdates(sessionId, startTime), POLL_INTERVAL * 2);
    }
  }, [scrollToBottom]);

  // 用于存储当前消息状态的引用
  const messagesRef = useRef<Message[]>([]);

  // 用于标记会话是否已完成的引用
  const doneRef = useRef<boolean>(false);

  // 监听消息变化，更新引用
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const onSendMessages = useCallback(
    async (data: Message[], configs: { textModel: Model; toolList: ToolInfo[] }) => {
      setPending('text')
      setMessages(data)
      messagesRef.current = data; // 更新引用

      try {
        await sendMessages({
          sessionId: sessionId!,
          canvasId: canvasId,
          newMessages: data,
          textModel: configs.textModel,
          toolList: configs.toolList,
          systemPrompt:
            localStorage.getItem('system_prompt') || DEFAULT_SYSTEM_PROMPT,
        })

        if (searchSessionId !== sessionId) {
          window.history.pushState(
            {},
            '',
            `/canvas/${canvasId}?sessionId=${sessionId}`
          )
        }

        scrollToBottom()

        // 启动轮询作为WebSocket的备选方案
        const startTime = Date.now();
        pollForMessageUpdates(sessionId!, startTime);

        // 添加超时机制，防止pending状态一直保持
        const pendingTimeout = setTimeout(() => {
          setPending(false)
          console.log('Message timeout: Resetting pending state')
        }, 30000); // 30秒超时

        // 定义一次性事件处理函数
        const handleDoneEvent = () => {
          clearTimeout(pendingTimeout);
          eventBus.off('Socket::Session::Done', handleDoneEvent);
          // 标记为已完成，停止轮询
          doneRef.current = true;
        };

        // 添加事件监听器
        eventBus.on('Socket::Session::Done', handleDoneEvent);

        // 初始化done状态引用
        doneRef.current = false;
      } catch (error) {
        console.error('Failed to send messages:', error)
        // 在API调用失败时重置pending状态
        setPending(false)
        // 显示错误提示
        toast.error('发送消息失败，请重试', {
          description: error instanceof Error ? error.message : '未知错误'
        })
      }
    },
    [canvasId, sessionId, searchSessionId, scrollToBottom, pollForMessageUpdates]
  )

  const handleCancelChat = useCallback(async () => {
    try {
      // 调用API取消后端的聊天请求
      if (sessionId) {
        await cancelChat(sessionId)
      }
      // 重置前端的pending状态
      setPending(false)
    } catch (error) {
      console.error('Failed to cancel chat:', error)
      // 即使API调用失败，也要重置前端的pending状态
      setPending(false)
      // 显示错误提示
      toast.error('取消聊天失败', {
        description: error instanceof Error ? error.message : '未知错误'
      })
    }
  }, [sessionId])

  const handleMessageClick = useCallback((message: Message, index: number, e?: React.MouseEvent) => {
    // 防止事件冒泡影响其他交互
    e?.stopPropagation();

    // 确保消息有id，没有则生成临时id
    const messageId = message.id || `temp-${nanoid()}`;

    if (isDeletingMode) {
      setSelectedMessageIds(prev => {
        const newSelection = e?.ctrlKey || e?.metaKey
          ? prev.includes(messageId)
            ? prev.filter(id => id !== messageId)
            : [...prev, messageId]
          : [messageId];

        return newSelection;
      })
    }
  }, [isDeletingMode])

  const handleDeleteMessages = useCallback(async () => {
    console.log('删除按钮被点击，开始处理删除操作');

    // 先关闭对话框
    setShowDeleteDialog(false)

    // 检查是否有选中的消息
    if (selectedMessageIds.length === 0) {
      console.warn('没有选中的消息')
      toast.warning('没有选中的消息')
      return
    }

    console.log(`准备删除${selectedMessageIds.length}条消息，消息ID:`, selectedMessageIds)

    try {
      // 获取要删除的消息信息
      const messagesToDelete = selectedMessageIds.map(messageId => {
        const msg = messages.find(m => m.id === messageId);
        // 确保id存在，使用临时id的消息不会实际删除后端数据
        return {
          id: messageId,  // 数据库中的id
          session_id: sessionId || '',
          created_at: msg?.created_at || null
        };
      }).filter((msg): msg is { id: string; session_id: string; created_at: string | null } => msg !== undefined);

      console.log('要删除的消息信息:', messagesToDelete)

      // 如果有sessionId，先通知后端删除消息
      if (sessionId) {
        console.log(`向服务器发送删除请求，会话ID: ${sessionId}`)
        const response = await fetch(`/api/chat_session/${sessionId}/delete_messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ messages: messagesToDelete }),
        })

        if (!response.ok) {
          console.error(`服务器响应错误: ${response.status}`)
          const errorText = await response.text()
          console.error('错误详情:', errorText)
          throw new Error(`服务器响应错误: ${response.status}`)
        }

        const result = await response.json()
        console.log('服务器返回结果:', result)
        if (result.success) {
          console.log(`成功删除了${result.deleted_count}条消息`)

          // 后端删除成功后，再更新前端消息状态
          const newMessages = messages.filter(msg => !selectedMessageIds.includes(msg.id || ''))
          setMessages(newMessages)
          setSelectedMessageIds([])
          toast.success('消息已删除')
        } else {
          throw new Error('后端删除失败')
        }
      } else {
        // 本地模式下，直接更新前端状态
        const newMessages = messages.filter(msg => !selectedMessageIds.includes(msg.id || ''))
        setMessages(newMessages)
        setSelectedMessageIds([])
        toast.success('消息已删除')
      }
    } catch (error) {
      console.error('删除消息失败:', error)
      toast.error('删除消息失败，请重试')
      // 保持选中状态，以便用户可以再次尝试
    }
  }, [selectedMessageIds, sessionId, messages, setMessages, setShowDeleteDialog])

  const clearSelection = useCallback(() => {
    setSelectedMessageIds([])
  }, [])

  return (
    <PhotoProvider>
      <div className='flex flex-col h-screen relative'>
        {/* Chat messages */}

        <header className='flex items-center px-2 py-2 absolute top-0 z-1 w-full'>
          <div className='flex-1 min-w-0'>
            <SessionSelector
              session={session}
              sessionList={sessionList}
              onClickNewChat={onClickNewChat}
              onSelectSession={onSelectSession}
            />
          </div>

          {/* Share Template Button */}
          {/* {authStatus.is_logged_in && (
            <Button
              variant="outline"
              size="sm"
              className="ml-2 shrink-0"
              onClick={() => setShowShareDialog(true)}
            >
              <Share2 className="h-4 w-4 mr-1" />
            </Button>
          )} */}

          <Blur className='absolute top-0 left-0 right-0 h-full -z-1' />
        </header>

        <ScrollArea className='h-[calc(100vh-45px)]' viewportRef={scrollRef}>
          {messages.length > 0 ? (
            <div className='flex flex-col flex-1 px-4 pb-50 pt-15'>
              {/* Messages */}
              {messages.map((message, idx) => {
                // 确保消息有id，没有则生成临时id用于前端渲染
                const messageId = message.id || `temp-${nanoid()}`;
                return (
                  <div
                    key={messageId}
                    className={`flex gap-3 mb-2 ${selectedMessageIds.includes(messageId) ? 'bg-primary/10 rounded-lg p-2' : ''} relative`}
                    onClick={(e) => handleMessageClick(message, idx, e)}
                  >
                    {/* 圆形复选框 - 调整为并排显示 */}
                    {isDeletingMode && (
                      <div
                        className={`flex-shrink-0 mt-2 w-4 h-4 rounded-full cursor-pointer flex items-center justify-center border-2 z-10 ${selectedMessageIds.includes(messageId) ? 'border-primary bg-primary' : 'border-border bg-background'}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedMessageIds(prev =>
                            prev.includes(messageId)
                              ? prev.filter(id => id !== messageId)
                              : [...prev, messageId]
                          );
                        }}
                      >
                        {selectedMessageIds.includes(messageId) && (
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                          </svg>
                        )}
                      </div>
                    )}

                    <div className="flex-grow">
                      {/* Regular message content */}
                      {typeof message.content == 'string' &&
                        (message.role !== 'tool' ? (
                          <MessageRegular
                            message={message}
                            content={message.content || ''}
                          />
                        ) : message.tool_call_id &&
                          mergedToolCallIds.current.includes(
                            message.tool_call_id
                          ) ? (
                          <></>
                        ) : (
                          <ToolCallContent
                            expandingToolCalls={expandingToolCalls}
                            message={message}
                          />
                        ))}

                      {/* 混合内容消息的文本部分 - 显示在聊天框内 */}
                      {Array.isArray(message.content) && (
                        <>
                          <MixedContentImages
                            contents={message.content}
                          />
                          <MixedContentText
                            message={message}
                            contents={message.content}
                          />
                        </>
                      )}

                      {message.role === 'assistant' &&
                        message.tool_calls &&
                        message.tool_calls.at(-1)?.function.name != 'finish' &&
                        message.tool_calls.map((toolCall, i) => {
                          return (
                            <ToolCallTag
                              key={toolCall.id}
                              toolCall={toolCall}
                              isExpanded={expandingToolCalls.includes(toolCall.id)}
                              onToggleExpand={() => {
                                if (expandingToolCalls.includes(toolCall.id)) {
                                  setExpandingToolCalls((prev) =>
                                    prev.filter((id) => id !== toolCall.id)
                                  )
                                } else {
                                  setExpandingToolCalls((prev) => [
                                    ...prev,
                                    toolCall.id,
                                  ])
                                }
                              }}
                              requiresConfirmation={pendingToolConfirmations.includes(
                                toolCall.id
                              )}
                              onConfirm={() => {
                                // 发送确认事件到后端
                                fetch('/api/tool_confirmation', {
                                  method: 'POST',
                                  headers: {
                                    'Content-Type': 'application/json',
                                  },
                                  body: JSON.stringify({
                                    session_id: sessionId,
                                    tool_call_id: toolCall.id,
                                    confirmed: true,
                                  }),
                                });
                              }}
                              onCancel={() => {
                                // 发送取消事件到后端
                                fetch('/api/tool_confirmation', {
                                  method: 'POST',
                                  headers: {
                                    'Content-Type': 'application/json',
                                  },
                                  body: JSON.stringify({
                                    session_id: sessionId,
                                    tool_call_id: toolCall.id,
                                    confirmed: false,
                                  }),
                                });
                              }}
                            />
                          );
                        })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <motion.div className='flex flex-col h-full p-4 items-start justify-start pt-16 select-none'>
              <motion.span
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className='text-muted-foreground text-3xl'
              >
                <ShinyText text='Hello, Jaaz!' />
              </motion.span>
              <motion.span
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className='text-muted-foreground text-2xl'
              >
                <ShinyText text='How can I help you today?' />
              </motion.span>
            </motion.div>
          )}
        </ScrollArea>

        <div className='p-2 gap-2 sticky bottom-0'>
          {/* 删除状态操作栏 */}
          {isDeletingMode && (
            <div className='flex items-center justify-between px-4 py-2 bg-background border border-border rounded-md shadow-sm mb-2'>
              <div className='flex items-center gap-2'>
                <span className='text-sm font-medium text-foreground'>
                  已选择 {selectedMessageIds.length} 条消息
                </span>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); setShowDeleteDialog(true); }}
                  disabled={selectedMessageIds.length === 0}
                  className="flex items-center gap-1 px-3 hover:bg-destructive/90 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  删除所选
                </Button>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsDeletingMode(false);
                  setSelectedMessageIds([]);
                }}
              >
                退出删除模式
              </Button>
            </div>
          )}

          <div className='relative'>
            <ChatTextarea
              sessionId={sessionId || ''}
              pending={!!pending}
              messages={messages}
              onSendMessages={onSendMessages}
              onCancelChat={handleCancelChat}
            />
            {/* 删除模式切换按钮 */}
            <button
              className="absolute -top-10 right-4 p-1.5 text-muted-foreground hover:bg-muted rounded-full transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setIsDeletingMode(!isDeletingMode);
                if (isDeletingMode) {
                  setSelectedMessageIds([]);
                }
              }}
              title={isDeletingMode ? "退出删除模式" : "进入删除模式"}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {isDeletingMode ? (
                  <g>
                    <path d="M18 6 6 18"></path>
                    <path d="m6 6 12 12"></path>
                  </g>
                ) : (
                  <g>
                    <rect width="18" height="18" x="3" y="3" rx="2" ry="2"></rect>
                    <circle cx="8.5" cy="8.5" r="1.5"></circle>
                    <path d="m21 15-5-5L5 21"></path>
                  </g>
                )}
              </svg>
            </button>
          </div>

          {/* 魔法生成组件 */}
          <ChatMagicGenerator
            sessionId={sessionId || ''}
            canvasId={canvasId}
            messages={messages}
            setMessages={setMessages}
            setPending={setPending}
            scrollToBottom={scrollToBottom}
          />
        </div>
      </div>

      {/* Share Template Dialog */}
      <ShareTemplateDialog
        open={showShareDialog}
        onOpenChange={setShowShareDialog}
        canvasId={canvasId}
        sessionId={sessionId || ''}
        messages={messages}
      />

      {/* 删除消息确认对话框 */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除消息</DialogTitle>
            <DialogDescription>
              您确定要删除选中的 {selectedMessageIds.length} 条消息吗？此操作无法撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => { setShowDeleteDialog(false); console.log('删除操作已取消'); }}>取消</Button>
            <Button variant="destructive" onClick={() => { console.log('确认删除按钮被点击'); handleDeleteMessages(); }}>
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PhotoProvider>
  )
}

export default ChatInterface
