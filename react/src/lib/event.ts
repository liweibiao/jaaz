import * as ISocket from '@/types/socket'
import mitt from 'mitt'

export type TCanvasAddImagesToChatEvent = {
  fileId: string
  base64?: string
  width: number
  height: number
}[]

export type TCanvasMagicGenerateEvent = {
  fileId: string
  base64: string
  width: number
  height: number
  timestamp: string
}

export type TMaterialAddImagesToChatEvent = {
  filePath: string
  fileName: string
  fileType: string
  width?: number
  height?: number
}[]

// 模板相关事件类型
export type TTemplateSendToChatEvent = {
  prompt: string
  images: Array<{
    fileName: string
    base64: string
    apiUrl: string
  }>
}

export type TEvents = {
  // ********** Socket connection events - Start **********
  'Socket::Connection::Success': { socketId?: string }
  'Socket::Connection::Error': { error: string }
  'Socket::Connection::Disconnected': { reason: string }
  // ********** Socket connection events - End **********
  
  // ********** Socket session events - Start **********
  'Socket::Session::Error': ISocket.SessionErrorEvent
  'Socket::Session::Done': ISocket.SessionDoneEvent
  'Socket::Session::Info': ISocket.SessionInfoEvent
  'Socket::Session::ImageGenerated': ISocket.SessionImageGeneratedEvent
  'Socket::Session::VideoGenerated': ISocket.SessionVideoGeneratedEvent
  'Socket::Session::Delta': ISocket.SessionDeltaEvent
  'Socket::Session::ToolCall': ISocket.SessionToolCallEvent
  'Socket::Session::ToolCallArguments': ISocket.SessionToolCallArgumentsEvent
  'Socket::Session::ToolCallResult': ISocket.SessionToolCallResultEvent
  'Socket::Session::AllMessages': ISocket.SessionAllMessagesEvent
  'Socket::Session::ToolCallProgress': ISocket.SessionToolCallProgressEvent
  'Socket::Session::ToolCallPendingConfirmation': ISocket.SessionToolCallPendingConfirmationEvent
  'Socket::Session::ToolCallConfirmed': ISocket.SessionToolCallConfirmedEvent
  'Socket::Session::ToolCallCancelled': ISocket.SessionToolCallCancelledEvent
  // ********** Socket session events - End **********

  // ********** Canvas events - Start **********
  'Canvas::AddImagesToChat': TCanvasAddImagesToChatEvent
  'Canvas::MagicGenerate': TCanvasMagicGenerateEvent
  // ********** Canvas events - End **********

  // ********** Material events - Start **********
  'Material::AddImagesToChat': TMaterialAddImagesToChatEvent
  // ********** Material events - End **********
  
  // ********** Template events - Start **********
  'Template::SendToChat': TTemplateSendToChatEvent
  // ********** Template events - End **********
}

export const eventBus = mitt<TEvents>()
