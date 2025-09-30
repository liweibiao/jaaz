from typing import Dict, Any, Optional
from ..magic_task_interface import MagicTaskInterface
from server.utils.http_client import HttpClient
from ..config_service import config_service
import asyncio
import aiohttp
from typing import Dict, Any, Optional

class VolcesMagicTask(MagicTaskInterface):
    """Volces魔法任务实现 - 实现MagicTaskInterface接口的Volces服务封装"""
    
    # 支持的模型列表
    SUPPORTED_MODELS = [
        'volces-image-v1',
        'doubao-seed',
        'doubao-seed-1-6-250615',
        'doubao-seed-1-6-flash-250615'
    ]


    def __init__(self, **kwargs):
        """初始化Volces魔法任务，接受并忽略额外的关键字参数以确保API兼容性"""
        # 从配置服务获取Volces配置
        config = config_service.get_config()
        volces_config = config.get('volces', {})
        
        # 设置API参数
        self.api_base = volces_config.get('url', 'https://ark.cn-beijing.volces.com/api/v3/')
        self.api_key = volces_config.get('api_key', '')
        self.max_attempts = 120
        self.interval = 5.0
        
        # 从kwargs中获取或使用默认模型
        self.model = kwargs.get('model', 'volces-image-v1')
        
        # 验证模型是否受支持
        if self.model not in self.SUPPORTED_MODELS:
            print(f"⚠️ 警告: 模型 '{self.model}' 不在支持列表中，可能会出现兼容性问题")
        
        print(f"✅ VolcesMagicTask初始化完成: API URL={self.api_base}, 模型={self.model}")
        
        # 可以在这里处理额外的参数
        if kwargs:
            print(f"📝 VolcesMagicTask初始化时接收到额外参数: {kwargs}")
        
        # 验证配置有效性
        if not self.api_key:
            print("⚠️ 警告: Volces API密钥未配置")
        if not self.api_base:
            print("⚠️ 警告: Volces API URL未配置")
        
    def _build_headers(self) -> Dict[str, str]:
        """构建请求头"""
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
    async def create_magic_task(self, image_content: str, image_intent: Optional[str] = None) -> Dict[str, Any]:
        """创建Volces魔法生图任务"""
        try:
            # 构建请求参数
            prompt = 'Create a magical transformation of this image'
            if image_intent:
                prompt = f"{prompt}\n\n{image_intent}"
            
            payload = {
                "model": self.model,
                "prompt": prompt,
                "size": "1024x1024",
                "response_format": "url",
                "watermark": False
            }
            
            # 如果有输入图片，使用图像编辑API
            if image_content:
                # 处理base64图片内容，确保它是纯base64字符串，不包含data:image前缀
                processed_image_content = image_content
                if image_content.startswith('data:image/'):
                    # 去掉data:image前缀和base64标识
                    processed_image_content = image_content.split(';base64,')[-1]
                payload["image"] = processed_image_content
            
            print(f"📤 准备发送Volces API请求: 模型={self.model}")
            
            # 构建完整的API URL
            url = f"{self.api_base.rstrip('/')}/images/generations"
            print(f"🔗 Volces API URL: {url}")
            
            # 发送HTTP请求到Volces API，增加重试逻辑和超时控制
            max_retries = 3
            retry_count = 0
            last_error = None
            
            while retry_count <= max_retries:
                try:
                    async with HttpClient.create_aiohttp() as session:
                        async with session.post(
                            url,
                            headers=self._build_headers(),
                            json=payload,
                            timeout=aiohttp.ClientTimeout(total=120.0)
                        ) as response:
                            print(f"📥 收到Volces API响应，状态码: {response.status}")
                            if response.status == 200:
                                data = await response.json()
                                task_id = f"volces_{int(asyncio.get_event_loop().time())}"
                                print(f"✅ Volces API调用成功，任务ID: {task_id}")
                                return {
                                    "task_id": task_id,
                                    "status": "created",
                                    "result": data  # 保存完整响应以便后续处理
                                }
                            else:
                                error_text = await response.text()
                                error_msg = f"Failed with status {response.status}: {error_text}"
                                print(f"❌ Volces API调用失败: {error_msg}")
                                if retry_count < max_retries and response.status in [429, 500, 502, 503, 504]:
                                    retry_count += 1
                                    wait_time = 2 ** retry_count  # 指数退避
                                    print(f"🔄 第{retry_count}次重试，等待{wait_time}秒...")
                                    await asyncio.sleep(wait_time)
                                    continue
                                return {"error": error_msg, "status": "failed"}
                except (asyncio.TimeoutError, aiohttp.ClientConnectorError) as e:
                    # 处理连接错误和超时
                    last_error = str(e)
                    print(f"⚠️ Volces API连接错误: {last_error}")
                    if retry_count < max_retries:
                        retry_count += 1
                        wait_time = 2 ** retry_count  # 指数退避
                        print(f"🔄 第{retry_count}次重试，等待{wait_time}秒...")
                        await asyncio.sleep(wait_time)
                        continue
                    break
                except Exception as e:
                    # 网络请求失败时返回错误
                    last_error = str(e)
                    print(f"⚠️ Volces API调用失败: {last_error}")
                    break
            
            # 如果所有重试都失败，返回错误
            print(f"🛑 所有重试都失败: {last_error}")
            return {"error": last_error or "Unknown error", "status": "failed"}
        except Exception as e:
            error_msg = f"Failed to create Volces magic task: {str(e)}"
            print(f"❌ 任务创建失败: {error_msg}")
            return {"error": error_msg, "status": "failed"}
    
    async def get_task_status(self, task_id: str) -> Dict[str, Any]:
        """获取Volces魔法任务状态"""
        try:
            # 由于Volces图像生成API是同步的，我们假设任务创建后已经完成
            # 在实际应用中，如果API支持异步任务，这里应该调用任务状态API
            
            # 检查是否有保存的结果数据
            # 注意：在真实实现中，应该有一个机制来存储任务状态
            
            # 对于当前实现，我们假设任务已完成并返回成功状态
            print(f"📊 检查Volces任务状态: {task_id}")
            
            # 为了保持兼容性，我们模拟一个延迟
            await asyncio.sleep(0.5)
            
            # 由于我们已经在create_magic_task中获取了结果，这里直接返回成功状态
            # 在实际应用中，应该根据实际任务状态返回相应结果
            return {
                "task_id": task_id,
                "status": "succeeded",
                "progress": 100
                # 注意：在真实实现中，应该从实际的任务结果中提取图像URL
            }
        except Exception as e:
            error_msg = f"Failed to get Volces task status: {str(e)}"
            print(f"❌ 获取任务状态失败: {error_msg}")
            return {"task_id": task_id, "status": "error", "error": error_msg}
    
    async def wait_for_task_completion(self, task_id: str, 
                                     max_attempts: int = 120, 
                                     interval: float = 5.0) -> Dict[str, Any]:
        """等待Volces魔法任务完成"""
        attempts = 0
        
        while attempts < max_attempts:
            try:
                status = await self.get_task_status(task_id)
                
                if status['status'] == 'succeeded':
                    return {
                        "task_id": task_id,
                        "status": "succeeded",
                        "result_url": status['result']['image_url'],
                        "result": status['result']
                    }
                elif status['status'] in ['failed', 'error']:
                    return {
                        "task_id": task_id,
                        "status": status['status'],
                        "error": status.get('error', 'Unknown error')
                    }
                
                # 任务仍在处理中，继续等待
                await asyncio.sleep(interval)
                attempts += 1
                
            except Exception as e:
                return {"task_id": task_id, "status": "error", "error": str(e)}
        
        return {"task_id": task_id, "status": "error", "error": "Task timed out"}
    
    async def analyze_image(self, image_content: str, prompt: str = "请分析这张图片") -> Dict[str, Any]:
        """分析图片内容（使用Volces服务）"""
        try:
            # 构建请求参数
            payload = {
                "model": "doubao-seed-1-6-flash-250615",  # 使用文本模型进行图像分析
                "prompt": prompt,
                "image": image_content  # 传入Base64编码的图像内容
            }
            
            # 构建完整的API URL
            url = f"{self.api_base.rstrip('/')}/chat/completions"
            print(f"🔗 Volces图像分析API URL: {url}")
            
            # 发送HTTP请求到Volces API
            async with HttpClient.create_aiohttp() as session:
                async with session.post(
                    url,
                    headers=self._build_headers(),
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=60.0)
                ) as response:
                    print(f"📥 收到Volces图像分析响应，状态码: {response.status}")
                    if response.status == 200:
                        data = await response.json()
                        # 提取分析结果
                        analysis = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                        print(f"✅ Volces图像分析成功: {analysis}")
                        return {
                            "analysis": analysis,
                            "provider": "volces",
                            "model": self.model
                        }
                    else:
                        error_text = await response.text()
                        error_msg = f"Failed with status {response.status}: {error_text}"
                        print(f"❌ Volces图像分析失败: {error_msg}")
                        return {"error": error_msg, "provider": "volces"}
        except Exception as e:
            error_msg = f"Volces image analysis failed: {str(e)}"
            print(f"❌ 图像分析失败: {error_msg}")
            return {"error": error_msg}
    
    async def generate_magic_image(self, image_content: str, 
                                 image_intent: Optional[str] = None, 
                                 **kwargs: Any) -> Dict[str, Any]:
        """生成魔法图像的完整流程"""
        try:
            # 允许在调用时覆盖模型
            if 'model' in kwargs and kwargs['model'] in self.SUPPORTED_MODELS:
                self.model = kwargs['model']
                print(f"🔄 切换Volces模型为: {self.model}")
            
            # 创建任务
            task_info = await self.create_magic_task(image_content, image_intent)
            
            if task_info.get('error'):
                return {"error": task_info['error']}
            
            # 等待任务完成
            task_result = await self.wait_for_task_completion(
                task_info['task_id'],
                max_attempts=self.max_attempts,
                interval=self.interval
            )
            
            if task_result['status'] == 'succeeded':
                return {"result_url": task_result['result_url'], "model": self.model}
            else:
                return {"error": task_result.get('error', 'Magic generation failed'), "model": self.model}
        except Exception as e:
              return {"error": f"Volces magic generation failed: {str(e)}", "model": self.model}


# 注意：VolcesMagicTask的注册逻辑已移至magic_task_registry.py文件中
# 这样可以避免循环导入问题