import json
from typing import Dict, Any, Optional
from services.config_service import config_service
from utils.http_client import HttpClient
from tools.utils.image_generation_core import IMAGE_PROVIDERS


class ImageAnalyser:
    """图片分析器 - 用于分析图片意图
    支持调用用户选择的提供商和模型来分析图片，解耦对OpenAI的隐式依赖
    """
    
    def __init__(self):
        """初始化图片分析器"""
        self.default_provider = "openai"
        self.default_model = "gpt-4o"
    
    def get_provider_and_model(self, provider: Optional[str] = None, model: Optional[str] = None) -> tuple[str, str]:
        """获取提供商和模型，如果未提供则使用默认值或用户配置的选项"""
        # 使用传入的提供商和模型，如果未提供则使用默认值
        selected_provider = provider or self.default_provider
        selected_model = model or self.default_model
        
        # 验证提供商是否存在于支持的列表中
        if selected_provider not in IMAGE_PROVIDERS:
            print(f"警告：提供商 {selected_provider} 不在支持的列表中，使用默认提供商 {self.default_provider}")
            selected_provider = self.default_provider
        
        return selected_provider, selected_model
    
    async def analyze_image(self, 
                           image_content: str, 
                           prompt: str = "请分析这张图片的内容和意图", 
                           provider: Optional[str] = None, 
                           model: Optional[str] = None) -> Dict[str, Any]:
        """
        分析图片内容和意图
        
        Args:
            image_content: 图片内容（base64 或 URL）
            prompt: 分析提示词
            provider: 提供商名称
            model: 模型名称
        
        Returns:
            Dict[str, Any]: 分析结果
        """
        try:
            # 获取提供商和模型
            selected_provider, selected_model = self.get_provider_and_model(provider, model)
            
            print(f"🔍 使用提供商 {selected_provider} 和模型 {selected_model} 分析图片")
            
            # 调用相应的提供商进行图片分析
            if selected_provider == "openai":
                return await self._analyze_with_openai(image_content, prompt, selected_model)
            elif selected_provider == "jaaz":
                return await self._analyze_with_jaaz(image_content, prompt)
            else:
                # 对于其他提供商，使用通用的图片分析方法
                return await self._analyze_with_generic_provider(image_content, prompt, selected_provider, selected_model)
                
        except Exception as e:
            error_msg = f"图片分析失败: {str(e)}"
            print(f"❌ {error_msg}")
            return {"error": error_msg}
    
    async def _analyze_with_openai(self, image_content: str, prompt: str, model: str) -> Dict[str, Any]:
        """使用OpenAI模型分析图片"""
        try:
            # 获取OpenAI配置
            openai_config = config_service.app_config.get('openai', {})
            api_key = openai_config.get('api_key', '')
            base_url = openai_config.get('base_url', 'https://api.openai.com/v1')
            
            if not api_key:
                return {"error": "OpenAI API key is not configured"}
            
            # 构建请求体
            payload = {
                "model": model,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": image_content if image_content.startswith('http') else image_content
                                }
                            }
                        ]
                    }
                ],
                "max_tokens": 1000
            }
            
            # 发送请求
            async with HttpClient.create_aiohttp() as session:
                headers = {"Authorization": f"Bearer {api_key}"}
                async with session.post(
                    f"{base_url}/chat/completions",
                    headers=headers,
                    json=payload,
                    timeout=60
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        analysis = data['choices'][0]['message']['content']
                        return {"analysis": analysis, "provider": "openai", "model": model}
                    else:
                        error_text = await response.text()
                        return {"error": f"OpenAI API error: {response.status} - {error_text}"}
        except Exception as e:
            return {"error": f"OpenAI analysis failed: {str(e)}"}
    
    async def _analyze_with_jaaz(self, image_content: str, prompt: str) -> Dict[str, Any]:
        """使用Jaaz服务分析图片"""
        try:
            # 获取Jaaz配置
            jaaz_config = config_service.app_config.get('jaaz', {})
            api_url = jaaz_config.get('url', 'https://jaaz.app/api/v1')
            api_key = jaaz_config.get('api_key', '')
            
            if not api_url or not api_key:
                return {"error": "Jaaz API is not configured"}
            
            # 确保API地址格式正确
            if not api_url.endswith('/api/v1'):
                api_url = f"{api_url}/api/v1"
            
            # 构建请求体
            payload = {
                "image": image_content,
                "prompt": prompt
            }
            
            # 发送请求
            async with HttpClient.create_aiohttp() as session:
                headers = {
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                }
                async with session.post(
                    f"{api_url}/image/analyze",
                    headers=headers,
                    json=payload,
                    timeout=60
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        return {"analysis": data.get('result', ''), "provider": "jaaz"}
                    else:
                        error_text = await response.text()
                        return {"error": f"Jaaz API error: {response.status} - {error_text}"}
        except Exception as e:
            return {"error": f"Jaaz analysis failed: {str(e)}"}
    
    async def _analyze_with_generic_provider(self, image_content: str, prompt: str, provider: str, model: str) -> Dict[str, Any]:
        """使用通用提供商分析图片"""
        try:
            # 检查提供商是否存在
            provider_instance = IMAGE_PROVIDERS.get(provider)
            if not provider_instance:
                return {"error": f"Unknown provider: {provider}"}
            
            # 调用提供商的图片分析方法（如果支持）
            # 注意：这部分需要根据实际的provider接口实现进行调整
            if hasattr(provider_instance, 'analyze_image'):
                result = await provider_instance.analyze_image(
                    image_content=image_content,
                    prompt=prompt,
                    model=model
                )
                return result
            else:
                # 如果提供商不支持直接的图片分析，则返回默认分析结果
                return {
                    "analysis": f"图片分析请求已发送到 {provider} 提供商，但该提供商可能不支持直接的图片分析功能。",
                    "provider": provider,
                    "model": model
                }
        except Exception as e:
            return {"error": f"Generic provider analysis failed: {str(e)}"}
    
    async def get_image_intent(self, image_content: str, provider: Optional[str] = None, model: Optional[str] = None) -> Dict[str, Any]:
        """
        获取图片意图
        
        Args:
            image_content: 图片内容
            provider: 提供商名称
            model: 模型名称
        
        Returns:
            Dict[str, Any]: 意图分析结果
        """
        intent_prompt = "请分析这张图片的主要内容、风格和潜在意图，以便为后续的图像生成任务提供参考。"
        return await self.analyze_image(image_content, intent_prompt, provider, model)
    
    async def generate_image_prompt(self, image_content: str, provider: Optional[str] = None, model: Optional[str] = None) -> Dict[str, Any]:
        """
        根据图片生成图像生成提示词
        
        Args:
            image_content: 图片内容
            provider: 提供商名称
            model: 模型名称
        
        Returns:
            Dict[str, Any]: 生成的提示词
        """
        prompt_prompt = "请根据这张图片的内容和风格，为图像生成模型创建一个详细的提示词，以便生成类似风格或内容的图像。"
        result = await self.analyze_image(image_content, prompt_prompt, provider, model)
        
        if "error" not in result:
            result["prompt"] = result.pop("analysis")
        
        return result