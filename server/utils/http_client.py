import os
import ssl
import time
import logging
import httpx
import aiohttp
import certifi
from typing import Dict, Any, Optional, Union, Callable, Tuple
from urllib.parse import urlparse
from concurrent.futures import ThreadPoolExecutor

logger = logging.getLogger(__name__)

# 创建证书验证上下文
ssl_context = ssl.create_default_context(cafile=certifi.where())
ssl_context.check_hostname = True
ssl_context.verify_mode = ssl.CERT_REQUIRED

class HttpClient:
    """HTTP客户端管理类，提供同步和异步HTTP请求功能"""

    def __init__(self):
        # 连接池设置
        self.max_connections = 100
        self.max_keepalive_connections = 20
        self.keepalive_expiry = 30  # 秒
        
        # 线程池用于异步执行同步请求
        self.executor = ThreadPoolExecutor(max_workers=10)
        
        # 加载设置服务以获取提供商代理配置
        self.settings_service = None
        
        # 延迟加载settings_service以避免循环导入
        self._load_settings_service()

    def _load_settings_service(self):
        """延迟加载设置服务"""
        try:
            from services.settings_service import get_settings_service
            self.settings_service = get_settings_service()
        except Exception as e:
            logger.warning(f"Failed to load settings service: {e}")

    def get_provider_proxy_enabled(self, provider_key: str) -> bool:
        """检查特定提供商是否启用了代理"""
        if not self.settings_service:
            self._load_settings_service()
        
        if not self.settings_service:
            logger.warning(f"Settings service not available, using default proxy behavior")
            return True  # 默认情况下应用代理
        
        try:
            return self.settings_service.get_provider_proxy_enabled(provider_key)
        except Exception as e:
            logger.error(f"Error checking provider proxy setting: {e}")
            return True  # 出错时默认应用代理

    def get_client_kwargs(self, provider_key: Optional[str] = None, **kwargs) -> Dict[str, Any]:
        """构建客户端配置参数，支持根据提供商设置代理"""
        # 基础配置
        client_kwargs = {
            "timeout": kwargs.get("timeout", 30),
            "follow_redirects": kwargs.get("follow_redirects", True),
            "max_redirects": kwargs.get("max_redirects", 10),
        }
        
        # 代理配置
        use_proxy = True
        
        # 如果指定了提供商，检查是否启用了代理
        if provider_key:
            use_proxy = self.get_provider_proxy_enabled(provider_key)
        
        # 根据设置决定是否使用系统环境变量中的代理
        client_kwargs["trust_env"] = use_proxy
        
        # 如果明确指定了代理URL，覆盖环境变量
        if "proxy" in kwargs:
            proxy_url = kwargs["proxy"]
            client_kwargs["proxies"] = {
                "http://": proxy_url,
                "https://": proxy_url,
            }
            client_kwargs["trust_env"] = False  # 使用明确的代理URL时不读取环境变量
        
        # SSL配置
        client_kwargs["verify"] = kwargs.get("verify", ssl_context)
        
        # 自定义headers
        if "headers" in kwargs:
            client_kwargs["headers"] = kwargs["headers"]
        
        return client_kwargs

    def create_httpx_client(self, provider_key: Optional[str] = None, **kwargs) -> httpx.Client:
        """创建同步HTTP客户端"""
        client_kwargs = self.get_client_kwargs(provider_key=provider_key, **kwargs)
        
        # 连接池配置
        limits = httpx.Limits(
            max_connections=self.max_connections,
            max_keepalive_connections=self.max_keepalive_connections,
            keepalive_expiry=self.keepalive_expiry,
        )
        client_kwargs["limits"] = limits
        
        # 创建客户端
        client = httpx.Client(**client_kwargs)
        
        logger.debug(f"Created httpx client with provider_key={provider_key}, trust_env={client_kwargs['trust_env']}")
        
        return client

    def create_async_httpx_client(self, provider_key: Optional[str] = None, **kwargs) -> httpx.AsyncClient:
        """创建异步HTTP客户端"""
        client_kwargs = self.get_client_kwargs(provider_key=provider_key, **kwargs)
        
        # 连接池配置
        limits = httpx.Limits(
            max_connections=self.max_connections,
            max_keepalive_connections=self.max_keepalive_connections,
            keepalive_expiry=self.keepalive_expiry,
        )
        client_kwargs["limits"] = limits
        
        # 创建异步客户端
        client = httpx.AsyncClient(**client_kwargs)
        
        logger.debug(f"Created async httpx client with provider_key={provider_key}, trust_env={client_kwargs['trust_env']}")
        
        return client

    def create_aiohttp_client_session(self, provider_key: Optional[str] = None, **kwargs) -> aiohttp.ClientSession:
        """创建aiohttp客户端会话"""
        # 基础配置
        session_kwargs = {
            "timeout": aiohttp.ClientTimeout(total=kwargs.get("timeout", 30)),
            "trust_env": True,  # 默认使用系统环境变量中的代理
        }
        
        # 检查提供商是否启用了代理
        if provider_key:
            use_proxy = self.get_provider_proxy_enabled(provider_key)
            session_kwargs["trust_env"] = use_proxy
        
        # 如果明确指定了代理URL，覆盖环境变量
        if "proxy" in kwargs:
            proxy_url = kwargs["proxy"]
            session_kwargs["connector"] = aiohttp.TCPConnector(
                ssl=ssl_context,
                limit=self.max_connections,
                limit_per_host=self.max_keepalive_connections,
            )
            session_kwargs["trust_env"] = False  # 使用明确的代理URL时不读取环境变量
        
        # SSL配置
        if "verify" in kwargs and not kwargs["verify"]:
            session_kwargs["connector"] = aiohttp.TCPConnector(ssl=False)
        
        # 创建会话
        session = aiohttp.ClientSession(**session_kwargs)
        
        logger.debug(f"Created aiohttp client session with provider_key={provider_key}, trust_env={session_kwargs['trust_env']}")
        
        return session

    def request(self, method: str, url: str, provider_key: Optional[str] = None, **kwargs) -> httpx.Response:
        """发送同步HTTP请求"""
        with self.create_httpx_client(provider_key=provider_key, **kwargs) as client:
            try:
                response = client.request(method, url, **kwargs)
                response.raise_for_status()
                return response
            except httpx.HTTPError as e:
                logger.error(f"HTTP request failed: {e}")
                if hasattr(e, 'response') and e.response is not None:
                    logger.error(f"Response status: {e.response.status_code}, content: {e.response.text[:200]}...")
                raise
            except Exception as e:
                logger.error(f"Unexpected error during HTTP request: {e}")
                raise

    async def async_request(self, method: str, url: str, provider_key: Optional[str] = None, **kwargs) -> httpx.Response:
        """发送异步HTTP请求"""
        async with self.create_async_httpx_client(provider_key=provider_key, **kwargs) as client:
            try:
                response = await client.request(method, url, **kwargs)
                response.raise_for_status()
                return response
            except httpx.HTTPError as e:
                logger.error(f"Async HTTP request failed: {e}")
                if hasattr(e, 'response') and e.response is not None:
                    logger.error(f"Response status: {e.response.status_code}, content: {e.response.text[:200]}...")
                raise
            except Exception as e:
                logger.error(f"Unexpected error during async HTTP request: {e}")
                raise

    async def aiohttp_request(self, method: str, url: str, provider_key: Optional[str] = None, **kwargs) -> aiohttp.ClientResponse:
        """使用aiohttp发送异步HTTP请求"""
        async with self.create_aiohttp_client_session(provider_key=provider_key, **kwargs) as session:
            try:
                response = await session.request(method, url, **kwargs)
                response.raise_for_status()
                return response
            except aiohttp.ClientError as e:
                logger.error(f"Aiohttp request failed: {e}")
                raise
            except Exception as e:
                logger.error(f"Unexpected error during aiohttp request: {e}")
                raise

    def get(self, url: str, provider_key: Optional[str] = None, **kwargs) -> httpx.Response:
        """发送同步GET请求"""
        return self.request("GET", url, provider_key=provider_key, **kwargs)

    async def async_get(self, url: str, provider_key: Optional[str] = None, **kwargs) -> httpx.Response:
        """发送异步GET请求"""
        return await self.async_request("GET", url, provider_key=provider_key, **kwargs)

    def post(self, url: str, provider_key: Optional[str] = None, **kwargs) -> httpx.Response:
        """发送同步POST请求"""
        return self.request("POST", url, provider_key=provider_key, **kwargs)

    async def async_post(self, url: str, provider_key: Optional[str] = None, **kwargs) -> httpx.Response:
        """发送异步POST请求"""
        return await self.async_request("POST", url, provider_key=provider_key, **kwargs)

    def close(self):
        """关闭HTTP客户端资源"""
        if hasattr(self, 'executor') and self.executor:
            self.executor.shutdown(wait=True)

    def is_valid_url(self, url: str) -> bool:
        """验证URL是否有效"""
        try:
            result = urlparse(url)
            return all([result.scheme, result.netloc])
        except Exception:
            return False

    def get_base_url(self, url: str) -> str:
        """从URL中提取基础URL"""
        try:
            result = urlparse(url)
            return f"{result.scheme}://{result.netloc}"
        except Exception as e:
            logger.error(f"Failed to extract base URL: {e}")
            return url

# 创建全局HTTP客户端实例
http_client = HttpClient()

def get_http_client() -> HttpClient:
    """获取全局HTTP客户端实例"""
    return http_client

# 工具函数：将aiohttp响应转换为字典
async def aiohttp_response_to_dict(response: aiohttp.ClientResponse) -> Dict[str, Any]:
    """将aiohttp响应对象转换为字典"""
    try:
        content_type = response.headers.get('Content-Type', '')
        if 'application/json' in content_type:
            return await response.json()
        else:
            # 如果不是JSON，返回文本内容
            text = await response.text()
            return {'text': text}
    except Exception as e:
        logger.error(f"Failed to parse response: {e}")
        return {'error': str(e)}

# 工具函数：重试装饰器
def retry(max_retries: int = 3, delay: int = 1, exceptions: Tuple[Exception, ...] = (httpx.HTTPError,)):
    """HTTP请求重试装饰器"""
    def decorator(func: Callable) -> Callable:
        async def async_wrapper(*args, **kwargs):
            retries = 0
            while retries < max_retries:
                try:
                    return await func(*args, **kwargs)
                except exceptions as e:
                    retries += 1
                    if retries >= max_retries:
                        raise
                    wait_time = delay * (2 ** (retries - 1))  # 指数退避
                    logger.warning(f"Request failed (attempt {retries}/{max_retries}), retrying in {wait_time}s: {e}")
                    await asyncio.sleep(wait_time)
        
        def sync_wrapper(*args, **kwargs):
            retries = 0
            while retries < max_retries:
                try:
                    return func(*args, **kwargs)
                except exceptions as e:
                    retries += 1
                    if retries >= max_retries:
                        raise
                    wait_time = delay * (2 ** (retries - 1))  # 指数退避
                    logger.warning(f"Request failed (attempt {retries}/{max_retries}), retrying in {wait_time}s: {e}")
                    time.sleep(wait_time)
        
        # 根据函数是否为异步函数返回相应的包装器
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        else:
            return sync_wrapper
    
    return decorator

# 导入asyncio以支持异步操作
import asyncio
