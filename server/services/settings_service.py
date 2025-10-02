import json
import os
import logging
from typing import Dict, Any, Optional
from pathlib import Path
from datetime import datetime

logger = logging.getLogger(__name__)

# 定义默认设置
DEFAULT_SETTINGS = {
    "proxy": "system",  # no_proxy, system, or custom URL
    "providerProxies": {},  # 提供商特定代理设置
    "systemPrompt": "You are a helpful assistant.",
    "temperature": 0.7,
    "max_tokens": 2048,
    "historyEnabled": True,
    "theme": "auto",
    "locale": "auto",
    "timeout": 60,
    "showStatusMessages": True,
    "showWelcomeMessage": True,
    "typingIndicator": True,
    "darkMode": "auto",
    "autoComplete": True,
    "googleOAuth": {
        "clientId": "",
        "clientSecret": ""
    },
    "apiKeys": {
        # API keys storage
    },
    "customProviders": {},
    "recentChats": [],
    "lastUsed": {
        "model": "",
        "provider": ""
    },
    "cacheEnabled": True,
    "cacheTimeout": 3600,
    "notificationSettings": {
        "newMessage": True,
        "systemUpdates": True,
        "errorNotifications": True
    },
    "lastUpdated": datetime.now().isoformat()
}

class SettingsService:
    """服务类，用于管理应用程序设置"""

    def __init__(self, settings_path: str = None):
        # 初始化设置路径，如果没有提供则使用默认路径
        if settings_path is None:
            # 确定用户主目录
            if os.name == 'nt':  # Windows
                app_data = os.getenv('APPDATA')
                self.settings_path = os.path.join(app_data, 'Jaaz', 'settings.json')
            else:  # macOS/Linux
                home = os.path.expanduser('~')
                self.settings_path = os.path.join(home, '.jaaz', 'settings.json')
        else:
            self.settings_path = settings_path

        # 确保设置文件目录存在
        os.makedirs(os.path.dirname(self.settings_path), exist_ok=True)

        # 初始化设置缓存
        self._settings_cache = None
        self._last_loaded = None

    def get_settings(self) -> Dict[str, Any]:
        """获取所有设置，使用缓存机制"""
        # 检查是否需要重新加载设置
        if self._settings_cache is None or self._needs_reload():
            self._load_settings()
        return self._settings_cache.copy()

    def get_raw_settings(self) -> Dict[str, Any]:
        """直接从文件获取原始设置，不使用缓存"""
        try:
            if os.path.exists(self.settings_path):
                with open(self.settings_path, 'r', encoding='utf-8') as file:
                    settings = json.load(file)
                    # 确保所有默认字段都存在
                    return self._merge_with_defaults(settings)
            else:
                return DEFAULT_SETTINGS.copy()
        except Exception as e:
            logger.error(f"Failed to read settings file: {e}")
            return DEFAULT_SETTINGS.copy()

    def update_settings(self, updates: Dict[str, Any]) -> Dict[str, str]:
        """更新设置并保存到文件"""
        try:
            # 获取当前设置
            current_settings = self.get_raw_settings()
            
            # 更新设置
            for key, value in updates.items():
                # 特殊处理嵌套对象的更新
                if key in current_settings and isinstance(current_settings[key], dict) and isinstance(value, dict):
                    # 递归更新嵌套字典
                    current_settings[key].update(value)
                else:
                    current_settings[key] = value
            
            # 更新最后修改时间
            current_settings['lastUpdated'] = datetime.now().isoformat()
            
            # 保存到文件
            with open(self.settings_path, 'w', encoding='utf-8') as file:
                json.dump(current_settings, file, indent=2, ensure_ascii=False)
            
            # 清除缓存，下次获取时会重新加载
            self._settings_cache = None
            
            # 如果更新了代理设置，重新初始化代理环境
            if 'proxy' in updates or 'providerProxies' in updates:
                self.initialize_proxy_env(current_settings)
            
            logger.info(f"Settings updated successfully")
            return {"status": "success", "message": "Settings updated successfully"}
        except Exception as e:
            logger.error(f"Failed to update settings: {e}")
            return {"status": "error", "message": str(e)}

    def get_proxy_config(self) -> Dict[str, Any]:
        """获取代理配置"""
        settings = self.get_settings()
        return {
            "proxy": settings.get("proxy", "system"),
            "providerProxies": settings.get("providerProxies", {})
        }

    def initialize_proxy_env(self, settings: Optional[Dict[str, Any]] = None) -> None:
        """根据设置初始化代理环境变量"""
        try:
            if settings is None:
                settings = self.get_settings()
            
            # 获取代理设置
            proxy = settings.get("proxy", "system")
            provider_proxies = settings.get("providerProxies", {})
            
            # 清除现有的代理环境变量，避免冲突
            proxy_env_vars = ["HTTP_PROXY", "http_proxy", "HTTPS_PROXY", "https_proxy", "ALL_PROXY", "all_proxy"]
            for var in proxy_env_vars:
                if var in os.environ:
                    del os.environ[var]
            
            # 根据代理类型进行处理
            if proxy == "system":
                # 系统代理模式，保留系统代理设置
                logger.info("Using system proxy settings")
            elif proxy == "no_proxy":
                # 无代理模式
                logger.info("Proxy disabled")
            elif proxy.startswith(("http://", "https://", "socks4://", "socks5://")):
                # 自定义代理URL
                proxy_url = proxy
                # 设置代理环境变量
                for var in proxy_env_vars:
                    os.environ[var] = proxy_url
                
                logger.info(f"Custom proxy configured: {proxy_url}")
            
            # 记录提供商代理设置状态
            enabled_count = sum(1 for enabled in provider_proxies.values() if enabled)
            if enabled_count > 0:
                enabled_providers = [name for name, enabled in provider_proxies.items() if enabled]
                logger.info(f"Provider-specific proxy enabled for: {', '.join(enabled_providers)}")
            else:
                logger.info("No provider-specific proxy settings enabled")
        except Exception as e:
            logger.error(f"Failed to initialize proxy environment: {e}")

    def get_provider_proxy_enabled(self, provider_key: str) -> bool:
        """检查特定提供商是否启用了代理"""
        settings = self.get_settings()
        provider_proxies = settings.get("providerProxies", {})
        return provider_proxies.get(provider_key, False)

    def _load_settings(self) -> None:
        """从文件加载设置到缓存"""
        try:
            if os.path.exists(self.settings_path):
                with open(self.settings_path, 'r', encoding='utf-8') as file:
                    self._settings_cache = self._merge_with_defaults(json.load(file))
                self._last_loaded = os.path.getmtime(self.settings_path)
            else:
                # 如果文件不存在，使用默认设置并创建文件
                self._settings_cache = DEFAULT_SETTINGS.copy()
                self._save_default_settings()
                self._last_loaded = os.path.getmtime(self.settings_path) if os.path.exists(self.settings_path) else None
        except Exception as e:
            logger.error(f"Failed to load settings: {e}")
            self._settings_cache = DEFAULT_SETTINGS.copy()

    def _merge_with_defaults(self, settings: Dict[str, Any]) -> Dict[str, Any]:
        """将用户设置与默认设置合并，确保所有必需字段都存在"""
        result = DEFAULT_SETTINGS.copy()
        for key, value in settings.items():
            if key in result and isinstance(result[key], dict) and isinstance(value, dict):
                # 递归合并嵌套字典
                result[key] = {**result[key], **value}
            else:
                result[key] = value
        return result

    def _save_default_settings(self) -> None:
        """保存默认设置到文件"""
        try:
            os.makedirs(os.path.dirname(self.settings_path), exist_ok=True)
            with open(self.settings_path, 'w', encoding='utf-8') as file:
                json.dump(DEFAULT_SETTINGS, file, indent=2, ensure_ascii=False)
            logger.info(f"Default settings saved to {self.settings_path}")
        except Exception as e:
            logger.error(f"Failed to save default settings: {e}")

    def _needs_reload(self) -> bool:
        """检查是否需要重新加载设置"""
        if not os.path.exists(self.settings_path):
            return False
        try:
            current_mtime = os.path.getmtime(self.settings_path)
            return self._last_loaded is None or current_mtime > self._last_loaded
        except Exception as e:
            logger.error(f"Failed to check settings modification time: {e}")
            return True

    def settings_file_exists(self) -> bool:
        """检查设置文件是否存在"""
        return os.path.exists(self.settings_path)

    def reset_settings(self) -> Dict[str, str]:
        """重置设置为默认值"""
        try:
            if os.path.exists(self.settings_path):
                os.remove(self.settings_path)
            self._settings_cache = None
            self._load_settings()
            logger.info("Settings reset to default")
            return {"status": "success", "message": "Settings reset to default"}
        except Exception as e:
            logger.error(f"Failed to reset settings: {e}")
            return {"status": "error", "message": str(e)}

    def get_setting(self, key: str, default: Any = None) -> Any:
        """获取单个设置"""
        settings = self.get_settings()
        return settings.get(key, default)

    def update_setting(self, key: str, value: Any) -> Dict[str, str]:
        """更新单个设置"""
        return self.update_settings({key: value})

    def validate_settings(self, settings: Dict[str, Any]) -> Dict[str, str]:
        """验证设置的有效性"""
        # 基本验证逻辑
        if "proxy" in settings:
            proxy_value = settings["proxy"]
            if proxy_value not in ["no_proxy", "system"] and not proxy_value.startswith(("http://", "https://", "socks4://", "socks5://")):
                return {"status": "error", "message": "Invalid proxy format"}
        
        # 验证提供商代理设置
        if "providerProxies" in settings:
            provider_proxies = settings["providerProxies"]
            if not isinstance(provider_proxies, dict):
                return {"status": "error", "message": "providerProxies must be a dictionary"}
            
            for provider_key, enabled in provider_proxies.items():
                if not isinstance(provider_key, str) or not isinstance(enabled, bool):
                    return {"status": "error", "message": "Invalid provider proxy configuration"}
        
        return {"status": "success", "message": "Settings validated"}

# 创建全局实例供其他模块使用
global_settings_service = SettingsService()

def get_settings_service() -> SettingsService:
    """获取全局设置服务实例"""
    return global_settings_service

# 为了向后兼容，提供 settings_service 别名
settings_service = get_settings_service()
