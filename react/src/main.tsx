import { SocketProvider } from '@/contexts/socket'
import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import '@/assets/style/index.css'

// 添加全局事件处理器来拦截unload事件并使用pagehide事件替代
// 解决Permissions policy violation: unload is not allowed in this document错误
document.addEventListener('DOMContentLoaded', () => {
  console.log('🛡️ Initializing global event handlers for Permissions Policy compliance')
  
  // 定义一个代理函数，用于拦截addEventListener调用
  const originalAddEventListener = EventTarget.prototype.addEventListener
  
  EventTarget.prototype.addEventListener = function(type, listener, options) {
    // 拦截unload事件，将其重定向到pagehide事件
    if (type === 'unload') {
      console.log('🔄 Redirecting unload event listener to pagehide event')
      // 使用捕获模式确保我们先于其他监听器处理事件
      originalAddEventListener.call(this, 'pagehide', listener, options);
    } else {
      // 其他事件保持不变
      originalAddEventListener.call(this, type, listener, options);
    }
  };
  
  // 同样拦截removeEventListener，确保事件清理正常工作
  const originalRemoveEventListener = EventTarget.prototype.removeEventListener
  
  EventTarget.prototype.removeEventListener = function(type, listener, options) {
    if (type === 'unload') {
      // 移除对应的pagehide事件监听器
      originalRemoveEventListener.call(this, 'pagehide', listener, options);
    } else {
      originalRemoveEventListener.call(this, type, listener, options);
    }
  };
});

const rootElement = document.getElementById('root')!
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(
    <StrictMode>
      <SocketProvider>
        <App />
      </SocketProvider>
    </StrictMode>
  )
}
