from models.tool_model import ToolInfoJson
import os
from services.db_service import db_service
from .StreamProcessor import StreamProcessor
from .agent_manager import AgentManager
import traceback
from utils.http_client import HttpClient, get_http_client
from langgraph_swarm import create_swarm  # type: ignore
from langchain_openai import ChatOpenAI
from langchain_ollama import ChatOllama
from langchain_google_genai import ChatGoogleGenerativeAI  # 导入Google Gemini专用模型
from services.websocket_service import send_to_websocket  # type: ignore
from services.config_service import config_service
from typing import Optional, List, Dict, Any, cast, Set, TypedDict
from models.config_model import ModelInfo
from utils.error_handler import clean_error_message


class ContextInfo(TypedDict):
    """Context information passed to tools"""
    canvas_id: str
    session_id: str
    model_info: Dict[str, List[ModelInfo]]


def _fix_chat_history(messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """修复聊天历史中不完整的工具调用

    根据LangGraph文档建议，移除没有对应ToolMessage的tool_calls
    参考: https://langchain-ai.github.io/langgraph/troubleshooting/errors/INVALID_CHAT_HISTORY/
    """
    if not messages:
        return messages

    fixed_messages: List[Dict[str, Any]] = []
    tool_call_ids: Set[str] = set()

    # 第一遍：收集所有ToolMessage的tool_call_id
    for msg in messages:
        if msg.get('role') == 'tool' and msg.get('tool_call_id'):
            tool_call_id = msg.get('tool_call_id')
            if tool_call_id:
                tool_call_ids.add(tool_call_id)

    # 第二遍：修复AIMessage中的tool_calls
    for msg in messages:
        if msg.get('role') == 'assistant' and msg.get('tool_calls'):
            # 过滤掉没有对应ToolMessage的tool_calls
            valid_tool_calls: List[Dict[str, Any]] = []
            removed_calls: List[str] = []

            for tool_call in msg.get('tool_calls', []):
                tool_call_id = tool_call.get('id')
                if tool_call_id in tool_call_ids:
                    valid_tool_calls.append(tool_call)
                elif tool_call_id:
                    removed_calls.append(tool_call_id)

            # 记录修复信息
            if removed_calls:
                print(
                    f"🔧 修复消息历史：移除了 {len(removed_calls)} 个不完整的工具调用: {removed_calls}")

            # 更新消息
            if valid_tool_calls:
                msg_copy = msg.copy()
                msg_copy['tool_calls'] = valid_tool_calls
                fixed_messages.append(msg_copy)
            elif msg.get('content'):  # 如果没有有效的tool_calls但有content，保留消息
                msg_copy = msg.copy()
                msg_copy.pop('tool_calls', None)  # 移除空的tool_calls
                fixed_messages.append(msg_copy)
            # 如果既没有有效tool_calls也没有content，跳过这条消息
        else:
            # 非assistant消息或没有tool_calls的消息直接保留
            fixed_messages.append(msg)

    return fixed_messages


async def langgraph_multi_agent(
    messages: List[Dict[str, Any]],
    canvas_id: str,
    session_id: str,
    text_model: ModelInfo,
    tool_list: List[ToolInfoJson],
    system_prompt: Optional[str] = None
) -> None:
    """多智能体处理函数

    Args:
        messages: 消息历史
        canvas_id: 画布ID
        session_id: 会话ID
        text_model: 文本模型配置
        tool_list: 工具模型配置列表（图像或视频模型）
        system_prompt: 系统提示词
    """
    print(f"\n🚀 开始处理会话: {session_id}")
    print(f"📋 使用模型: {text_model.get('provider')} - {text_model.get('model')}")
    print(f"💬 消息数量: {len(messages)}")
    print(f"🎨 工具数量: {len(tool_list)}")
    
    try:
        # 0. 修复消息历史
        print("🔧 修复消息历史...")
        fixed_messages = _fix_chat_history(messages)
        print(f"✅ 消息历史修复完成，修复后消息数: {len(fixed_messages)}")

        # 1. 发送开始处理通知
        print("📤 发送开始处理通知到前端...")
        await send_to_websocket(session_id, cast(Dict[str, Any], {
            'type': 'info',
            'info': f'开始处理您的请求，使用模型: {text_model.get("model")}'
        }))

        # 2. 创建文本模型
        print("🧠 创建文本模型实例...")
        # 新增：检查是否是新画布或空消息场景
        is_new_session = len(fixed_messages) == 0
        text_model_instance = _create_text_model(text_model, is_new_session)
        print(f"✅ 文本模型创建成功: {text_model.get('provider')} - {text_model.get('model')}")
        
        # 新增：在新会话场景下，直接返回欢迎消息，避免完整的流处理
        if is_new_session:
            print("🚀 在新会话场景下，直接发送欢迎消息并结束处理")
            await send_to_websocket(session_id, cast(Dict[str, Any], {
                'session_id': session_id,
                'type': 'stream',
                'content': "欢迎使用Jaaz！\n\n看起来您还没有配置API密钥。请先在设置中配置您的API密钥，然后您就可以开始使用完整功能了。",
                'end': True
            }))
            print("✅ 欢迎消息发送完成，跳过完整流处理流程")
            return

        # 3. 创建智能体
        print("🤖 创建智能体...")
        agents = AgentManager.create_agents(
            text_model_instance,
            tool_list,  # 传入所有注册的工具
            system_prompt or ""
        )
        agent_names = [agent.name for agent in agents]
        print(f'✅ 创建的智能体列表: {agent_names}')
        
        # 4. 确定上一个活跃的智能体
        print("🔍 查找上一个活跃的智能体...")
        last_agent = AgentManager.get_last_active_agent(
            fixed_messages, agent_names)
        print(f'✅ 上一个活跃的智能体: {last_agent if last_agent else "默认智能体"}')

        # 5. 创建智能体群组
        print("👥 创建智能体群组...")
        swarm = create_swarm(
            agents=agents,  # type: ignore
            default_active_agent=last_agent if last_agent else agent_names[0]
        )
        print("✅ 智能体群组创建成功")

        # 6. 创建上下文
        print("📝 创建上下文...")
        context = {
            'canvas_id': canvas_id,
            'session_id': session_id,
            'tool_list': tool_list,
            'model': text_model.get('model'),  # 添加模型名称，便于StreamProcessor识别Google模型
            'provider': text_model.get('provider'),  # 添加提供商信息
        }
        print(f"✅ 上下文创建成功: {context}")

        # 7. 流处理
        print("💨 开始流处理...")
        processor = StreamProcessor(
            session_id, db_service, send_to_websocket, canvas_id)  # type: ignore
        print(f"✅ 流处理器创建成功，准备处理流式响应")
        await processor.process_stream(swarm, fixed_messages, context)
        print("✅ 流处理完成")

    except Exception as e:
        print(f"❌ 处理会话时发生错误: {str(e)}")
        await _handle_error(e, session_id)


def _create_text_model(text_model: ModelInfo, is_new_session: bool = False) -> Any:
    """创建语言模型实例"""
    model = text_model.get('model')
    provider = text_model.get('provider')
    url = text_model.get('url')
    api_key = config_service.app_config.get(  # type: ignore
        provider, {}).get("api_key", "")

    # TODO: Verify if max token is working
    # max_tokens = text_model.get('max_tokens', 8148)

    if provider == 'ollama':
        return ChatOllama(
            model=model,
            base_url=url,
        )
    else:
        # 检查API密钥是否为空
        if not api_key:
            # 新增：在新会话场景下不抛出错误，允许用户先体验界面
            if is_new_session:
                print("⚠️ 在新会话场景下绕过API密钥检测")
                # 返回一个模拟的模型实例，避免在空会话时抛出API密钥错误
                class MockModel:
                    async def invoke(self, messages, **kwargs):
                        from langchain_core.messages import AIMessage
                        return AIMessage(content="欢迎使用Jaaz！\n\n看起来您还没有配置API密钥。请先在设置中配置您的API密钥，然后您就可以开始使用完整功能了。")
                    
                    def bind_tools(self, tools, **kwargs):
                        # 模拟bind_tools方法，返回self以支持链式调用
                        return self
                return MockModel()
            
            # 如果不是新会话且API密钥为空，抛出明确的错误信息
            raise ValueError(f"API密钥未设置: 请在设置中配置{provider}的API密钥")
            
        # Create httpx client with SSL configuration for ChatOpenAI
        http_client = get_http_client().create_httpx_client(provider_key=provider)
        http_async_client = get_http_client().create_async_httpx_client(provider_key=provider)
        return ChatOpenAI(
            model=model,
            api_key=api_key,  # type: ignore
            timeout=300,
            base_url=url,
            temperature=0,
            # max_tokens=max_tokens, # TODO: 暂时注释掉有问题的参数
            http_client=http_client,
            http_async_client=http_async_client
        )


async def _handle_error(error: Exception, session_id: str) -> None:
    """处理错误"""
    print('Error in langgraph_agent', error)
    tb_str = traceback.format_exc()
    print(f"Full traceback:\n{tb_str}")
    traceback.print_exc()

    # 使用错误处理工具清理错误消息
    clean_error = clean_error_message(error)
    
    # 记录清理后的错误消息
    print(f"清理后的错误消息: {clean_error}")

    # 确保错误消息包含session_id字段，以便前端正确处理
    await send_to_websocket(session_id, cast(Dict[str, Any], {
        'session_id': session_id,
        'type': 'error',
        'error': clean_error
    }))
