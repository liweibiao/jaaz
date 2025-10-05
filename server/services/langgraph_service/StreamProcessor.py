# type: ignore[import]
import traceback
from typing import Optional, List, Dict, Any, Callable, Awaitable
from langchain_core.messages import AIMessageChunk, ToolCall, convert_to_openai_messages, ToolMessage
from langgraph.graph import StateGraph
import json


class StreamProcessor:
    """流式处理器 - 负责处理智能体的流式输出"""

    def __init__(self, session_id: str, db_service: Any, websocket_service: Callable[[str, Dict[str, Any]], Awaitable[None]], canvas_id: Optional[str] = None):
        self.session_id = session_id
        self.canvas_id = canvas_id
        self.db_service = db_service
        self.websocket_service = websocket_service
        self.tool_calls: List[ToolCall] = []
        self.last_saved_message_index = 0
        self.last_streaming_tool_call_id: Optional[str] = None
        self.has_received_content = False  # 跟踪是否收到过内容
        self.google_response_buffer = ""  # 专门为Google Gemini模型设计的响应缓冲区
        self.is_google_model = False  # 标记当前是否使用Google模型

    async def process_stream(self, swarm: StateGraph, messages: List[Dict[str, Any]], context: Dict[str, Any]) -> None:
        """处理整个流式响应

        Args:
            swarm: 智能体群组
            messages: 消息列表
            context: 上下文信息
        """
        self.last_saved_message_index = len(messages) - 1
        self.has_received_content = False  # 重置内容接收标记
        self.google_response_buffer = ""  # 重置Google响应缓冲区
        
        # 从上下文中获取模型信息，设置Google模型标记
        self.is_google_model = False
        if context and isinstance(context, dict):
            # 尝试从不同可能的位置获取模型信息
            if 'model' in context and str(context['model']).lower().find('gemini') != -1:
                self.is_google_model = True
            elif 'tool_list' in context:
                for tool in context['tool_list']:
                    if tool and isinstance(tool, dict) and 'provider' in tool and tool['provider'] == 'google':
                        self.is_google_model = True
                        break
            
        print(f"🔄 开始流式处理，配置: stream_mode=[messages, custom, values], 消息数量: {len(messages)}")
        print(f"🤖 当前模型类型: {'Google Gemini' if self.is_google_model else '其他模型'}")
        
        compiled_swarm = swarm.compile()

        try:
            async for chunk in compiled_swarm.astream(
                {"messages": messages},
                config=context,
                stream_mode=["messages", "custom", 'values']
            ):
                # 打印完整的chunk结构，帮助调试
                print(f"📦 收到chunk: {type(chunk)}, 长度: {len(str(chunk))}字符")
                await self._handle_chunk(chunk)
        except Exception as e:
            print(f"❌ 流式处理过程中发生错误: {str(e)}")
            traceback.print_exc()
            # 发送错误通知
            await self.websocket_service(self.session_id, {
                'canvas_id': self.canvas_id,
                'session_id': self.session_id,
                'type': 'error',
                'error': f'流式处理错误: {str(e)}'
            })
        finally:
            # 检查是否收到过内容，如果没有，发送一个空响应通知
            if not self.has_received_content:
                print("⚠️ 流处理完成但未收到任何内容，发送空响应通知")
                await self.websocket_service(self.session_id, {
                    'canvas_id': self.canvas_id,
                    'session_id': self.session_id,
                    'type': 'delta',
                    'text': ''  # 发送空文本，触发前端更新
                })
            
            # 如果是Google模型且缓冲区还有内容，发送最后一部分内容
            if self.is_google_model and self.google_response_buffer:
                print(f"📤 发送Google模型剩余内容: '{self.google_response_buffer[:30]}'...")
                await self.websocket_service(self.session_id, {
                    'canvas_id': self.canvas_id,
                    'session_id': self.session_id,
                    'type': 'delta',
                    'text': self.google_response_buffer
                })
                self.google_response_buffer = ""
            
            # 发送完成事件
            await self.websocket_service(self.session_id, {
                'canvas_id': self.canvas_id,
                'session_id': self.session_id,
                'type': 'done'
            })

    async def _handle_chunk(self, chunk: Any) -> None:
        """处理单个chunk"""
        print(f"🔍 处理chunk: {chunk}")
        
        try:
            # Google Gemini模型特殊格式处理
            if self.is_google_model:
                # 检查是否为Google模型特有的响应格式
                if isinstance(chunk, dict):
                    # 检查是否包含text或content字段
                    if 'text' in chunk and chunk['text']:
                        print(f"🤖 Google模型直接文本响应: '{chunk['text'][:30]}'...")
                        text_content = chunk['text']
                        self.has_received_content = True
                        self.google_response_buffer += text_content
                        await self.websocket_service(self.session_id, {
                            'canvas_id': self.canvas_id,
                            'session_id': self.session_id,
                            'type': 'delta',
                            'text': text_content
                        })
                        return
                    elif 'content' in chunk and chunk['content']:
                        print(f"🤖 Google模型content响应: '{str(chunk['content'])[:30]}'...")
                        # 尝试处理content字段
                        if hasattr(chunk['content'], 'text'):
                            text_content = chunk['content'].text
                            self.has_received_content = True
                            self.google_response_buffer += text_content
                            await self.websocket_service(self.session_id, {
                                'canvas_id': self.canvas_id,
                                'session_id': self.session_id,
                                'type': 'delta',
                                'text': text_content
                            })
                            return
                        elif isinstance(chunk['content'], str):
                            text_content = chunk['content']
                            self.has_received_content = True
                            self.google_response_buffer += text_content
                            await self.websocket_service(self.session_id, {
                                'canvas_id': self.canvas_id,
                                'session_id': self.session_id,
                                'type': 'delta',
                                'text': text_content
                            })
                            return
                    # 添加对Google API标准响应格式的支持
                    elif 'candidates' in chunk and chunk['candidates']:
                        print(f"🤖 Google API标准响应格式: 检测到candidates字段")
                        for candidate in chunk['candidates']:
                            if 'content' in candidate and 'parts' in candidate['content']:
                                for part in candidate['content']['parts']:
                                    if 'text' in part and part['text']:
                                        text_content = part['text']
                                        self.has_received_content = True
                                        self.google_response_buffer += text_content
                                        await self.websocket_service(self.session_id, {
                                            'canvas_id': self.canvas_id,
                                            'session_id': self.session_id,
                                            'type': 'delta',
                                            'text': text_content
                                        })
                                        return
            
            # 处理不同格式的chunk
            if isinstance(chunk, tuple) and len(chunk) >= 2:
                chunk_type = chunk[0]
                
                if chunk_type == 'values':
                    await self._handle_values_chunk(chunk[1])
                elif chunk_type == 'messages' and len(chunk) >= 2 and isinstance(chunk[1], list) and chunk[1]:
                    # 标准消息格式: ('messages', [message_chunk])
                    await self._handle_message_chunk(chunk[1][0])
                elif chunk_type == 'custom':
                    # 处理自定义类型的chunk
                    print(f"🎯 处理自定义chunk: {chunk[1]}")
                else:
                    # 处理其他可能的chunk格式
                    print(f"📝 处理未知类型的chunk: {chunk_type}")
                    # 尝试作为消息chunk处理，以防格式不匹配
                    try:
                        if len(chunk) >= 2 and hasattr(chunk[1], 'content'):
                            await self._handle_message_chunk(chunk[1])
                        elif len(chunk) >= 2 and isinstance(chunk[1], list) and chunk[1] and hasattr(chunk[1][0], 'content'):
                            await self._handle_message_chunk(chunk[1][0])
                    except Exception as e:
                        print(f"❌ 尝试处理为消息chunk失败: {str(e)}")
            elif hasattr(chunk, 'content'):
                # 直接是消息chunk格式
                await self._handle_message_chunk(chunk)
            else:
                print(f"❓ 未知的chunk格式: {type(chunk)}")
        except Exception as e:
            print(f"❌ 处理chunk时发生错误: {str(e)}")
            traceback.print_exc()

    async def _handle_values_chunk(self, chunk_data: Dict[str, Any]) -> None:
        """处理 values 类型的 chunk"""
        all_messages = chunk_data.get('messages', [])
        print(f"📥 收到values chunk，消息数量: {len(all_messages)}")
        
        try:
            oai_messages = convert_to_openai_messages(all_messages)
            # 确保 oai_messages 是列表类型
            if not isinstance(oai_messages, list):
                oai_messages = [oai_messages] if oai_messages else []

            # 发送所有消息到前端
            if oai_messages:
                self.has_received_content = True  # 标记已收到内容
                print(f"📤 发送all_messages，消息数量: {len(oai_messages)}")
                await self.websocket_service(self.session_id, {
                    'canvas_id': self.canvas_id,
                    'session_id': self.session_id,
                    'type': 'all_messages',
                    'messages': oai_messages
                })

            # 保存新消息到数据库
            for message in oai_messages:
                self.last_saved_message_index = await self.db_service.save_message(
                    session_id=self.session_id,
                    message=message,
                    canvas_id=self.canvas_id
                )
        except Exception as e:
            print(f"❌ 处理values chunk时发生错误: {str(e)}")
            traceback.print_exc()

    async def _handle_message_chunk(self, ai_message_chunk: AIMessageChunk) -> None:
        """处理消息类型的 chunk"""
        print(f"🧩 处理消息chunk: {type(ai_message_chunk)}, id: {getattr(ai_message_chunk, 'id', '无ID')}")
        try:
            content = ai_message_chunk.content
            print(f"📝 消息内容长度: {len(content) if content else 0}字符")
            
            # 检查是否有内容属性
            if hasattr(ai_message_chunk, 'content'):
                content = ai_message_chunk.content
                # 处理文本内容
                if content:
                    self.has_received_content = True  # 标记已收到内容
                    
                    # Google Gemini模型特殊处理
                    if self.is_google_model:
                        print(f"🤖 Google模型处理内容: '{content[:30]}'...")
                        # 将内容添加到Google专用缓冲区
                        self.google_response_buffer += content
                        # 立即发送到前端
                        await self.websocket_service(self.session_id, {
                            'canvas_id': self.canvas_id,
                            'session_id': self.session_id,
                            'type': 'delta',
                            'text': content
                        })
                    else:
                        print(f"📤 发送delta消息: '{content[:50]}'...")  # 只打印前50个字符
                        await self.websocket_service(self.session_id, {
                            'canvas_id': self.canvas_id,
                            'session_id': self.session_id,
                            'type': 'delta',
                            'text': content
                        })
            
            # 处理工具调用
            if hasattr(ai_message_chunk, 'tool_calls') and ai_message_chunk.tool_calls:
                if isinstance(ai_message_chunk.tool_calls, list) and ai_message_chunk.tool_calls and hasattr(ai_message_chunk.tool_calls[0], 'get') and ai_message_chunk.tool_calls[0].get('name'):
                    self.has_received_content = True  # 标记已收到内容
                    print(f"🔧 处理工具调用: {ai_message_chunk.tool_calls[0].get('name')}")
                    await self._handle_tool_calls(ai_message_chunk.tool_calls)
            
            # 处理ToolMessage类型
            if isinstance(ai_message_chunk, ToolMessage):
                self.has_received_content = True  # 标记已收到内容
                # 工具调用结果之后会在 values 类型中发送到前端，这里会更快出现一些
                oai_message = convert_to_openai_messages([ai_message_chunk])[0]
                print(f"🛠️ 处理工具结果消息: {oai_message}")
                await self.websocket_service(self.session_id, {
                    'type': 'tool_call_result',
                    'id': ai_message_chunk.tool_call_id,
                    'message': oai_message
                })
            
            # 处理工具调用参数流
            if hasattr(ai_message_chunk, 'tool_call_chunks') and ai_message_chunk.tool_call_chunks:
                await self._handle_tool_call_chunks(ai_message_chunk.tool_call_chunks)
        except Exception as e:
            print(f"❌ 处理消息chunk时发生错误: {str(e)}")
            traceback.print_exc()

    async def _handle_tool_calls(self, tool_calls: List[ToolCall]) -> None:
        """处理工具调用"""
        self.tool_calls = [tc for tc in tool_calls if tc.get('name')]
        print('😘tool_call event', tool_calls)

        # 需要确认的工具列表
        TOOLS_REQUIRING_CONFIRMATION = {
            # 'generate_video_by_kling_v2_jaaz',
            # 'generate_video_by_seedance_v1_pro_volces',
            # 'generate_video_by_seedance_v1_lite_i2v',
            # 'generate_video_by_seedance_v1_lite_t2v',
            # 'generate_video_by_seedance_v1_jaaz',
            # 'generate_video_by_hailuo_02_jaaz',
            'generate_video_by_veo3_fast_jaaz',
        }

        for tool_call in self.tool_calls:
            tool_name = tool_call.get('name')

            # 检查是否需要确认
            if tool_name in TOOLS_REQUIRING_CONFIRMATION:
                # 对于需要确认的工具，不在这里发送事件，让工具函数自己处理
                print(
                    f'🔄 Tool {tool_name} requires confirmation, skipping StreamProcessor event')
                continue
            else:
                await self.websocket_service(self.session_id, {
                    'canvas_id': self.canvas_id,
                    'session_id': self.session_id,
                    'type': 'tool_call',
                    'id': tool_call.get('id'),
                    'name': tool_name,
                    'arguments': '{}'
                })

    async def _handle_tool_call_chunks(self, tool_call_chunks: List[Any]) -> None:
        """处理工具调用参数流"""
        for tool_call_chunk in tool_call_chunks:
            if tool_call_chunk.get('id'):
                # 标记新的流式工具调用参数开始
                self.last_streaming_tool_call_id = tool_call_chunk.get('id')
            else:
                    if self.last_streaming_tool_call_id:
                        await self.websocket_service(self.session_id, {
                            'canvas_id': self.canvas_id,
                            'session_id': self.session_id,
                            'type': 'tool_call_arguments',
                            'id': self.last_streaming_tool_call_id,
                            'text': tool_call_chunk.get('args')
                        })
                    else:
                        print('🟠no last_streaming_tool_call_id', tool_call_chunk)
