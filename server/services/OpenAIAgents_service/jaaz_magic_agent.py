# services/OpenAIAgents_service/jaaz_agent.py

from typing import Dict, Any, List
import asyncio
import os
from nanoid import generate
from tools.utils.image_canvas_utils import save_image_to_canvas
from tools.utils.image_utils import get_image_info_and_save
from services.config_service import FILES_DIR
from common import DEFAULT_PORT
from ..jaaz_service import JaazService
from utils.image_analyser import ImageAnalyser
from ..magic_task_interface import create_and_execute_magic_task
from utils.error_handler import clean_error_message


async def create_jaaz_response(messages: List[Dict[str, Any]], session_id: str = "", canvas_id: str = "", text_model: Dict[str, Any] = None, selected_tools: List[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    基于云端服务的图像生成响应函数
    实现和 magic_agent 相同的功能
    支持调用用户选择的提供商和模型
    """
    try:
        # 获取图片内容
        user_message: Dict[str, Any] = messages[-1]
        image_content: str = ""
        
        # 默认为jaaz提供商，保持向后兼容性
        provider = "jaaz"
        model = "default"

        # 首先尝试从text_model参数获取提供商和模型信息
        if text_model and isinstance(text_model, dict):
            provider = text_model.get('provider', provider)
            model = text_model.get('model', model)
            print(f"📋 从text_model获取的提供商: {provider}, 模型: {model}")
        else:
            # 退而求其次，从metadata获取提供商和模型信息
            if 'metadata' in user_message and isinstance(user_message['metadata'], dict):
                provider = user_message['metadata'].get('provider', provider)
                model = user_message['metadata'].get('model', model)
                print(f"📋 从metadata获取的提供商: {provider}, 模型: {model}")

        if isinstance(user_message.get('content'), list):
            for content_item in user_message['content']:
                if content_item.get('type') == 'image_url':
                    image_content = content_item.get(
                        'image_url', {}).get('url', "")
                    break

        if not image_content:
            return {
                'role': 'assistant',
                'content': [
                    {
                        'type': 'text',
                        'text': '✨ not found input image'
                    }
                ]
            }

        try:
            # 使用统一的MagicTask接口执行魔法生图任务
            result = await create_and_execute_magic_task(
                provider_name=provider,
                image_content=image_content,
                user_message=user_message,
                analyze_intent=True,  # 启用图片意图分析
                model=model
            )
            
            # 如果结果中没有provider字段，添加它
            if 'provider' not in result:
                result['provider'] = provider
                
            print(f"🎯 魔法生图任务执行结果 (提供商: {result['provider']}): {'成功' if 'error' not in result else '失败'}")

        except Exception as e:
            # 不再自动回退到JaazService，避免产生官方任务ID和扣费
            print(f"⚠️ MagicTask接口执行失败: {str(e)}")
            
            # 直接返回错误信息，不回退到官方服务，使用clean_error_message清理错误内容
            clean_error = clean_error_message(e)
            return {
                'role': 'assistant',
                'content': [
                    {
                        'type': 'text',
                        'text': f'✨ Magic Generation Error: {clean_error}'
                    }
                ]
            }

        # 检查是否有错误
        if result.get('error'):
            error_msg = result['error']
            print(f"❌ Magic generation error: {error_msg}")
            # 使用clean_error_message清理错误内容
            clean_error = clean_error_message(error_msg)
            return {
                'role': 'assistant',
                'content': [
                    {
                        'type': 'text',
                        'text': f'✨ Magic Generation Error: {clean_error}'
                    }
                ]
            }

        # 检查是否有结果 URL
        if not result.get('result_url'):
            return {
                'role': 'assistant',
                'content': [
                    {
                        'type': 'text',
                        'text': '✨ Magic generation failed: No result URL'
                    }
                ]
            }

        # 初始化变量
        filename = ""
        result_url = result['result_url']
        image_url = result_url
        
        # 处理不同提供商的特殊情况
        provider_type = result.get('provider', '')
        
        # 保存图片到画布
        if session_id and canvas_id:
            try:
                # 生成唯一文件名
                file_id = generate(size=10)
                file_path_without_extension = os.path.join(FILES_DIR, file_id)

                # 下载并保存图片，根据是否为base64数据设置is_b64参数
                # 现在所有提供商都返回实际URL或base64数据，不需要特殊处理
                is_b64_data = False
                if result_url.startswith('data:image/') or ';' in result_url and ':' in result_url:
                    # 检查是否是base64格式的数据URL
                    is_b64_data = True
                mime_type, width, height, extension = await get_image_info_and_save(
                    image_url, file_path_without_extension, is_b64=is_b64_data
                )

                width = max(1, int(width / 2))
                height = max(1, int(height / 2))

                # 生成文件名
                filename = f'{file_id}.{extension}'

                # 保存图片到画布
                image_url = await save_image_to_canvas(session_id, canvas_id, filename, mime_type, width, height)
                print(f"✨ 图片已保存到画布: {filename}")
            except Exception as e:
                print(f"❌ 保存图片到画布失败: {e}")

        # 添加提供商信息到返回消息中
        provider_info = f" (提供商: {result['provider']})"
        
        return {
            'role': 'assistant',
            'content': f'✨ Magic Success!!!{provider_info}\n\nResult url: {result_url}\n\n![image_id: {filename}](http://localhost:{DEFAULT_PORT}{image_url})'
        }

    except (asyncio.TimeoutError, Exception) as e:
        # 检查是否是超时相关的错误
        error_msg = str(e).lower()
        if 'timeout' in error_msg or 'timed out' in error_msg:
            return {
                'role': 'assistant',
                'content': [
                    {
                        'type': 'text',
                        'text': '✨ time out'
                    }
                ]
            }
        else:
            print(f"❌ 创建魔法回复时出错: {e}")
            # 使用clean_error_message清理错误内容
            clean_error = clean_error_message(e)
            return {
                'role': 'assistant',
                'content': [
                    {
                        'type': 'text',
                        'text': f'✨ Magic Generation Error: {clean_error}'
                    }
                ]
            }

if __name__ == "__main__":
    asyncio.run(create_jaaz_response([]))
