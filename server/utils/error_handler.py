from typing import Any, Dict, Optional
import re


def clean_error_message(error_msg: str) -> str:
    """
    清理错误消息，移除或替换HTML内容和过长的错误详情
    
    Args:
        error_msg: 原始错误消息
        
    Returns:
        str: 清理后的错误消息
    """
    if not error_msg:
        return "未知错误"
    
    # 转换为字符串
    error_str = str(error_msg)
    
    # 检查是否包含HTML标签
    if '<html' in error_str.lower() or '<!doctype' in error_str.lower():
        # 如果是HTML内容，返回通用错误消息
        return "网络请求失败，请稍后再试"
    
    # 检查是否包含JSON格式的错误消息（尝试提取更友好的错误信息）
    try:
        import json
        if '{' in error_str and '}' in error_str:
            # 尝试解析可能的JSON片段
            start_idx = error_str.find('{')
            end_idx = error_str.rfind('}') + 1
            json_str = error_str[start_idx:end_idx]
            error_data = json.loads(json_str)
            
            # 尝试提取常见的错误字段
            if isinstance(error_data, dict):
                if 'error' in error_data:
                    if isinstance(error_data['error'], dict):
                        if 'message' in error_data['error']:
                            return clean_error_message(error_data['error']['message'])
                    else:
                        return clean_error_message(error_data['error'])
                elif 'message' in error_data:
                    return clean_error_message(error_data['message'])
    except:
        # JSON解析失败，继续使用原始错误消息
        pass
    
    # 移除可能的堆栈跟踪信息
    if 'Traceback (most recent call last):' in error_str:
        return "操作执行失败，请检查日志获取详细信息"
    
    # 限制错误消息长度
    max_length = 300
    if len(error_str) > max_length:
        return error_str[:max_length] + '...'
    
    return error_str


def handle_api_error(response: Any, default_error: str = "API请求失败") -> str:
    """
    处理API响应错误，提取并清理错误消息
    
    Args:
        response: API响应对象
        default_error: 默认错误消息
        
    Returns:
        str: 清理后的错误消息
    """
    try:
        # 尝试获取错误状态码
        status_code = getattr(response, 'status', None) or getattr(response, 'status_code', None)
        
        # 尝试获取错误内容
        if hasattr(response, 'text'):
            error_text = response.text
            # 尝试从响应中提取错误消息
            return clean_error_message(f"HTTP {status_code}: {error_text}")
        elif hasattr(response, 'json'):
            try:
                error_data = response.json()
                return clean_error_message(str(error_data))
            except:
                pass
        
        # 返回默认错误消息
        if status_code:
            return f"HTTP {status_code}: {default_error}"
        return default_error
    except Exception as e:
        return f"处理错误时发生异常: {str(e)}"


async def handle_async_api_error(response: Any, default_error: str = "API请求失败") -> str:
    """
    异步处理API响应错误，提取并清理错误消息
    
    Args:
        response: API响应对象
        default_error: 默认错误消息
        
    Returns:
        str: 清理后的错误消息
    """
    try:
        # 尝试获取错误状态码
        status_code = getattr(response, 'status', None) or getattr(response, 'status_code', None)
        
        # 尝试获取错误内容（异步）
        if hasattr(response, 'text') and callable(response.text):
            error_text = await response.text()
            # 尝试从响应中提取错误消息
            return clean_error_message(f"HTTP {status_code}: {error_text}")
        elif hasattr(response, 'json') and callable(response.json):
            try:
                error_data = await response.json()
                return clean_error_message(str(error_data))
            except:
                pass
        
        # 返回默认错误消息
        if status_code:
            return f"HTTP {status_code}: {default_error}"
        return default_error
    except Exception as e:
        return f"处理错误时发生异常: {str(e)}"