import { BASE_API_URL } from '../constants'

// 官方登录API地址
const OFFICIAL_API_URL = 'https://jaaz.app'
// Google登录API地址（使用本地服务器）
const GOOGLE_API_URL = BASE_API_URL
import i18n from '../i18n'
import { clearJaazApiKey } from './config'

// 辅助函数：获取指定cookie的值
function getCookieValue(name: string): string | null {
  const cookies = document.cookie.split(';')
  for (let cookie of cookies) {
    cookie = cookie.trim()
    if (cookie.startsWith(`${name}=`)) {
      return cookie.substring(name.length + 1)
    }
  }
  return null
}

// 辅助函数：设置cookie
function setCookie(name: string, value: string, days: number): void {
  const date = new Date()
  date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000))
  const expires = `expires=${date.toUTCString()}`
  document.cookie = `${name}=${value}; ${expires}; path=/; SameSite=Lax`
}

// 辅助函数：删除cookie
function deleteCookie(name: string): void {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax`
}

export interface AuthStatus {
  status: 'logged_out' | 'pending' | 'logged_in'
  is_logged_in: boolean
  user_info?: UserInfo
  tokenExpired?: boolean
}

export interface UserInfo {
  id: string
  username: string
  email: string
  image_url?: string
  provider?: string
  created_at?: string
  updated_at?: string
}

export interface DeviceAuthResponse {
  status: string
  code: string
  expires_at: string
  message: string
}

export interface DeviceAuthPollResponse {
  status: 'pending' | 'authorized' | 'expired' | 'error'
  message?: string
  token?: string
  user_info?: UserInfo
}

export interface ApiResponse {
  status: string
  message: string
}

// Google OAuth相关接口
export interface GoogleAuthResponse {
  status: string
  authUrl: string
  state: string
}

export interface GoogleAuthCallbackResponse {
  status: string
  token?: string
  user_info?: UserInfo
  message?: string
}

export async function startDeviceAuth(): Promise<DeviceAuthResponse> {
  const response = await fetch(`${OFFICIAL_API_URL}/api/device/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`)
  }

  const data = await response.json()

  // Open browser for user authentication using Electron API
  const authUrl = `${OFFICIAL_API_URL}/auth/device?code=${data.code}`

  // Check if we're in Electron environment
  if (window.electronAPI?.openBrowserUrl) {
    try {
      await window.electronAPI.openBrowserUrl(authUrl)
    } catch (error) {
      console.error('Failed to open browser via Electron:', error)
      // Fallback to window.open if Electron API fails
      window.open(authUrl, '_blank')
    }
  } else {
    // Fallback for web environment
    window.open(authUrl, '_blank')
  }

  return {
    status: data.status,
    code: data.code,
    expires_at: data.expires_at,
    message: i18n.t('common:auth.browserLoginMessage'),
  }
}

export async function pollDeviceAuth(
  deviceCode: string
): Promise<DeviceAuthPollResponse> {
  const response = await fetch(
    `${OFFICIAL_API_URL}/api/device/poll?code=${deviceCode}`
  )

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`)
  }

  return await response.json()
}

// 添加节流机制，限制check-status接口调用频率
let lastGetAuthStatusTime = 0;
const MIN_INTERVAL_MS = 2000; // 最小调用间隔2秒

export async function getAuthStatus(): Promise<AuthStatus> {
  // 实现节流逻辑
  const now = Date.now();
  const timeSinceLastCall = now - lastGetAuthStatusTime;

  if (timeSinceLastCall < MIN_INTERVAL_MS) {
    console.log(`⏸️ Throttling getAuthStatus call, too frequent (${timeSinceLastCall}ms since last call)`);
    // 返回缓存的认证状态
    const cachedStatus = localStorage.getItem('cached_auth_status');
    if (cachedStatus) {
      try {
        return JSON.parse(cachedStatus);
      } catch (e) {
        console.error('Failed to parse cached auth status:', e);
      }
    }
    // 如果没有缓存，返回基本的已登录状态
    const token = localStorage.getItem('jaaz_access_token');
    const userInfoStr = localStorage.getItem('jaaz_user_info');

    if (token && userInfoStr) {
      try {
        const userInfo = JSON.parse(userInfoStr);
        return {
          status: 'logged_in' as const,
          is_logged_in: true,
          user_info: userInfo,
        };
      } catch (e) {
        console.error('Failed to parse cached user info:', e);
      }
    }
    // 默认返回未登录状态
    return {
      status: 'logged_out' as const,
      is_logged_in: false,
    };
  }

  // 更新最后调用时间
  lastGetAuthStatusTime = now;

  // 🧹 步骤0：检查是否有logout标记，如果有则强制清理
  const logoutFlag = sessionStorage.getItem('force_logout')
  if (logoutFlag === 'true') {
    console.log('🚨 Logout flag detected, force clearing all auth data...')
    await clearAuthData()
    sessionStorage.removeItem('force_logout')
    return {
      status: 'logged_out' as const,
      is_logged_in: false,
    }
  }

  // 🚨 检查是否在退出登录过程中，如果是则直接返回登出状态
  const isLoggingOut = sessionStorage.getItem('is_logging_out')
  if (isLoggingOut === 'true') {
    return {
      status: 'logged_out' as const,
      is_logged_in: false,
    }
  }

  // 🔄 首先检查后端httpOnly cookie是否存在
  const hasBackendAuthCookie = document.cookie.includes('auth_token=') || document.cookie.includes('user_uuid=') || document.cookie.includes('jaaz_access_token=')
  console.log('🔍 Backend auth cookie check:', {
    auth_token: document.cookie.includes('auth_token='),
    user_uuid: document.cookie.includes('user_uuid='),
    user_email: document.cookie.includes('user_email='),
    jaaz_access_token: document.cookie.includes('jaaz_access_token='),
    hasBackendAuthCookie: hasBackendAuthCookie
  })

  // 尝试从多个来源获取用户信息
  try {
    // 尝试从后端API获取真实的用户信息
    try {
      // 使用Promise.race实现超时逻辑，因为fetch API不直接支持timeout选项
      const timeoutPromise = new Promise<Response>((_, reject) => {
        setTimeout(() => reject(new Error('API request timeout')), 5000);
      });

      const fetchPromise = fetch(`${BASE_API_URL}/api/auth/check-status`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await Promise.race([fetchPromise, timeoutPromise]);

      if (response.ok) {
        const authData = await response.json()

        if (authData.is_logged_in && authData.user_info && authData.token) {
          console.log('🔄 Got real user info from backend API:', authData.user_info)

          // 始终同步最新的用户信息
          console.log('🔄 Syncing latest backend auth state to frontend...')
          saveAuthData(authData.token, authData.user_info)

          return {
            status: 'logged_in' as const,
            is_logged_in: true,
            user_info: authData.user_info,
          }
        }
      } else {
        console.log('❌ Backend auth API returned error:', response.status)
      }
    } catch (error) {
      console.error('❌ Failed to get user info from backend API:', error)
    }

    // 从cookie获取基本信息作为fallback
    const userUuid = getCookieValue('user_uuid') || getCookieValue('jaaz_user_uuid')
    const userEmail = getCookieValue('user_email') || getCookieValue('jaaz_user_email')

    if (userUuid && userEmail) {
      console.log('🔄 Fallback: Creating user info from basic cookies...')
      const backendUserInfo: UserInfo = {
        id: userUuid,
        username: userEmail.split('@')[0],
        email: userEmail,
        provider: 'google',
        // 确保有头像URL
        image_url: `https://www.gravatar.com/avatar/67f0a718104d915bc15c8d8736df7724`
      }

      // 尝试从本地存储获取现有token
      const existingToken = localStorage.getItem('jaaz_access_token') || getCookieValue('jaaz_access_token')
      const token = existingToken || `temp_${userUuid}_${Date.now()}`

      // 从cookie恢复认证数据时不触发事件，避免循环调用
      saveAuthData(token, backendUserInfo, false)

      return {
        status: 'logged_in' as const,
        is_logged_in: true,
        user_info: backendUserInfo,
      }
    }
  } catch (cookieError) {
    console.error('❌ Error getting cookie data:', cookieError)
  }

  // 🍪 fallback：从前端存储读取认证信息
  let token = localStorage.getItem('jaaz_access_token')
  let userInfoStr = localStorage.getItem('jaaz_user_info')

  // 📦 向后兼容：如果localStorage中没有，尝试从cookie读取
  if (!token || !userInfoStr) {
    token = getCookieValue('jaaz_access_token')
    userInfoStr = getCookieValue('jaaz_user_info')
  }

  console.log('📋 Final auth data check:', {
    hasToken: !!token,
    hasUserInfo: !!userInfoStr,
    userInfo: userInfoStr ? JSON.parse(userInfoStr) : null,
  })

  if (!token || !userInfoStr) {
    const loggedOutStatus = {
      status: 'logged_out' as const,
      is_logged_in: false,
    }
    console.log('❌ No valid auth data found, returning logged out status')
    return loggedOutStatus
  }

  try {
    let userInfo: UserInfo

    try {
      userInfo = JSON.parse(userInfoStr)

      // 确保用户信息包含头像URL
      if (!userInfo.image_url && userInfo.username) {
        userInfo.image_url = `https://ui-avatars.com/api/?name=${encodeURIComponent(userInfo.username)}&background=random&color=fff&size=200`
      }
    } catch (parseError) {
      console.error('❌ Error parsing user info:', parseError)
      // 尝试创建基本用户信息
      userInfo = {
        id: 'temp_' + Date.now(),
        username: 'User',
        email: 'user@example.com',
        image_url: 'https://ui-avatars.com/api/?name=User&background=random&color=fff&size=200'
      }
    }

    // 尝试刷新token，但即使失败也保持登录状态
    try {
      const newToken = await refreshToken(token)

      // 保存新token到localStorage和cookie，但不触发事件以避免循环调用
      saveAuthData(newToken, userInfo, false)

      console.log('✅ Token refreshed successfully without event trigger')
    } catch (refreshError) {
      console.log('Token refresh failed:', refreshError)

      // 只有当token真正过期(401)时才清理认证数据，网络错误等情况不清理
      if (!(refreshError instanceof Error && refreshError.message === 'TOKEN_EXPIRED')) {
        // 网络错误或其他问题，保持用户登录状态
        console.log('🔌 Network error during token refresh, keeping user logged in with existing token')
      }
    }

    return {
      status: 'logged_in' as const,
      is_logged_in: true,
      user_info: userInfo,
    }
  } catch (error) {
    console.error('❌ Unexpected error in getAuthStatus:', error)

    // 最后的兜底方案：尝试返回基本的登录状态
    try {
      const basicUserInfo: UserInfo = {
        id: 'temp_' + Date.now(),
        username: 'User',
        email: 'user@example.com',
        image_url: 'https://ui-avatars.com/api/?name=User&background=random&color=fff&size=200'
      }

      return {
        status: 'logged_in' as const,
        is_logged_in: true,
        user_info: basicUserInfo,
      }
    } catch (finalError) {
      console.error('❌ Even fallback failed:', finalError)
      const loggedOutStatus = {
        status: 'logged_out' as const,
        is_logged_in: false,
      };
      // 缓存结果
      localStorage.setItem('cached_auth_status', JSON.stringify(loggedOutStatus));
      return loggedOutStatus;
    }
  }
}

export async function logout(): Promise<{ status: string; message: string }> {
  console.log('🚪 === STARTING LOGOUT PROCESS ===')
  console.log(`🔍 Cookie state before logout: ${document.cookie}`)

  try {
    // 🚨 步骤0：设置退出登录标记，阻止getAuthStatus重新设置cookie
    console.log('🚨 Setting logout flags...')
    sessionStorage.setItem('is_logging_out', 'true')
    sessionStorage.setItem('force_logout', 'true')

    // 🧹 步骤1：立即清理前端认证数据（不调用后端）
    console.log('🧹 Clearing client-side auth data immediately...')
    await clearAuthData()

    console.log(`🔍 Cookie state after clearAuthData: ${document.cookie}`)

    // 📢 步骤2：立即更新本标签页的UI状态
    console.log('🎯 Updating local auth state immediately...')
    window.dispatchEvent(new CustomEvent('auth-logout-detected', {
      detail: { source: 'local-logout' }
    }))

    // 🔄 步骤3：调用后端API删除httponly cookie
    console.log('🔗 Calling backend logout API to delete httponly cookies...')

    try {
      const response = await fetch(`${BASE_API_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include', // 重要：包含cookie以便后端清理
      })

      console.log(`✅ Backend logout API response status: ${response.status}`)

      if (response.ok) {
        const data = await response.json()
        console.log('✅ Backend logout successful:', data)
      } else {
        console.warn(`⚠️ Backend logout API returned status: ${response.status}`)
      }
    } catch (error) {
      console.error('❌ Backend logout API failed:', error)
      // 继续执行，不让API失败阻止logout流程
    }

    console.log(`🔍 Cookie state after backend logout: ${document.cookie}`)

    // 🔄 步骤4：清理logout标记，让UI自然更新
    console.log('🧹 Cleaning up logout flags...')

    // 给UI足够时间更新状态
    setTimeout(() => {
      console.log(`🔍 Final cookie state: ${document.cookie}`)
      // 清理is_logging_out标记，但保留force_logout标记一段时间防止恢复
      sessionStorage.removeItem('is_logging_out')

      // 延迟清理force_logout标记，确保不会意外恢复登录状态
      setTimeout(() => {
        sessionStorage.removeItem('force_logout')
        console.log('✅ Logout process completed, UI should be updated')
      }, 1000)
    }, 200) // 给AuthContext更多时间处理状态变化

    return {
      status: 'success',
      message: i18n.t('common:auth.logoutSuccessMessage'),
    }
  } catch (error) {
    console.error('❌ Logout process failed:', error)

    // 🛡️ 兜底方案：即使出错也要确保本地数据被清理
    try {
      console.log('🛡️ Executing fallback logout...')
      sessionStorage.setItem('is_logging_out', 'true')
      sessionStorage.setItem('force_logout', 'true')
      await clearAuthData()

      // 立即更新本地UI状态
      window.dispatchEvent(new CustomEvent('auth-logout-detected', {
        detail: { source: 'fallback-logout' }
      }))

      // 尝试调用后端API作为fallback
      try {
        console.log('🔗 Fallback: calling backend logout API...')
        await fetch(`${BASE_API_URL}/api/auth/logout`, {
          method: 'POST',
          credentials: 'include',
        })
        console.log('✅ Fallback backend logout completed')
      } catch (backendError) {
        console.warn('⚠️ Fallback backend logout failed:', backendError)
      }

      // 清理logout标记，让UI自然更新
      setTimeout(() => {
        sessionStorage.removeItem('is_logging_out')
        setTimeout(() => {
          sessionStorage.removeItem('force_logout')
          console.log('✅ Fallback logout completed')
        }, 1000)
      }, 200)

      return {
        status: 'success',
        message: i18n.t('common:auth.logoutSuccessMessage'),
      }
    } catch (fallbackError) {
      console.error('❌ Even fallback logout failed:', fallbackError)

      // 最后的最后：直接刷新页面
      window.location.reload()

      return {
        status: 'error',
        message: 'Logout failed, page will be refreshed',
      }
    }
  }
}

export function getUserProfile(): UserInfo | null {
  try {
    // 🔍 尝试从localStorage获取用户信息
    let userInfoStr = localStorage.getItem('jaaz_user_info')

    // 🍪 如果localStorage中没有，尝试从cookie读取
    if (!userInfoStr) {
      userInfoStr = getCookieValue('jaaz_user_info')
    }

    if (!userInfoStr) {
      console.log('❌ No user info found in localStorage or cookie')
      return null
    }

    try {
      let userInfo = JSON.parse(userInfoStr) as UserInfo

      // 🔧 确保userInfo有所有必需的字段
      if (userInfo && userInfo.id && userInfo.username && userInfo.email) {
        // 🌟 确保返回的用户信息包含完整的头像URL
        if (!userInfo.image_url) {
          console.log('🔍 User info found but missing image_url, setting default...')
          // 设置默认头像URL，不依赖CryptoJS
          userInfo.image_url = `https://ui-avatars.com/api/?name=${encodeURIComponent(userInfo.username)}&background=random&color=fff&size=200`
          console.log('✨ Set default image_url:', userInfo.image_url)
        }

        console.log('✅ User profile retrieved successfully:', {
          id: userInfo.id,
          username: userInfo.username,
          email: userInfo.email,
          hasImageUrl: !!userInfo.image_url
        })
        return userInfo
      }
    } catch (parseError) {
      console.error('❌ Error parsing user info:', parseError)
    }

    // 💪 最后的兜底：尝试从cookie的基本信息创建用户信息
    const userUuid = getCookieValue('user_uuid')
    const userEmail = getCookieValue('user_email')

    if (userUuid && userEmail) {
      console.log('🔄 Fallback: Creating user info from basic cookies...')
      const username = userEmail.split('@')[0]
      const basicUserInfo: UserInfo = {
        id: userUuid,
        username: username,
        email: userEmail,
        provider: 'google',

        // 设置默认头像URL
        image_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=random&color=fff&size=200`
      }
      console.log('✅ Basic user info created successfully')
      return basicUserInfo
    }

    console.log('❌ No valid user info found after all attempts')
    return null
  } catch (error) {
    console.error('❌ Failed to get user profile:', error)
    return null
  }
}

// 清理认证数据的辅助函数
export async function clearAuthData() {
  console.log('🧹 === CLEARING ALL AUTH DATA ===')

  try {
    // 清理localStorage中的认证数据
    console.log('🗑️ Clearing localStorage auth data...')
    localStorage.removeItem('jaaz_access_token')
    localStorage.removeItem('jaaz_user_info')

    // 清理cookie中的认证数据
    console.log('🍪 Clearing auth cookies...')
    deleteCookie('jaaz_access_token')
    deleteCookie('jaaz_user_info')
    deleteCookie('auth_token')
    deleteCookie('user_uuid')
    deleteCookie('user_email')
    deleteCookie('access_token')
    deleteCookie('user_info')
    deleteCookie('refresh_token')

    // Clear jaaz provider api_key
    console.log('🔑 Clearing Jaaz API key...')
    try {
      await clearJaazApiKey()
    } catch (clearError) {
      console.error('❌ Failed to clear jaaz api key:', clearError)
    }

    console.log('✅ Auth data cleared successfully')
  } catch (error) {
    console.error('❌ Error clearing auth data:', error)
  }
}

// Helper function to save auth data to local storage and cookies
export function saveAuthData(token: string, userInfo: UserInfo, triggerEvent: boolean = true) {
  console.log('💾 === ATTEMPTING TO SAVE AUTH DATA ===')
  console.log(`🔍 Current cookies before save: ${document.cookie}`)

  // 🚨 检查是否在退出登录过程中，如果是则阻止保存
  const isLoggingOut = sessionStorage.getItem('is_logging_out')
  const forceLogout = sessionStorage.getItem('force_logout')

  if (isLoggingOut === 'true' || forceLogout === 'true') {
    console.error('🚨 BLOCKED: Attempted to save auth data during logout process!')
    console.log('🚪 Logout flags detected, refusing to save auth data')
    return
  }

  // 确保用户信息包含头像URL
  if (!userInfo.image_url && userInfo.username) {
    console.log('✨ Adding missing image_url to user info...')
    userInfo.image_url = `https://ui-avatars.com/api/?name=${encodeURIComponent(userInfo.username)}&background=random&color=fff&size=200`
  }

  console.log('💾 Saving auth data...', {
    tokenLength: token ? token.length : 0,
    userEmail: userInfo?.email,
    userId: userInfo?.id,
    hasImageUrl: !!userInfo?.image_url,
    triggerEvent: triggerEvent
  })

  try {
    // 保存到localStorage
    localStorage.setItem('jaaz_access_token', token)
    localStorage.setItem('jaaz_user_info', JSON.stringify(userInfo))

    // 同时保存到cookie，确保页面刷新后状态保持
    setCookie('jaaz_access_token', token, 30)
    setCookie('jaaz_user_info', JSON.stringify(userInfo), 30)

    // 额外保存基础认证信息到单独的cookie，确保页面刷新后能恢复
    // 确保用户ID不是undefined字符串或空值
    const safeUserId = userInfo.id && userInfo.id !== 'undefined' ? userInfo.id : `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    setCookie('user_uuid', safeUserId, 30)
    setCookie('user_email', userInfo.email, 30)

    // 缓存当前的认证状态，避免后续请求立即再次调用后端API
    const authStatus = {
      status: 'logged_in' as const,
      is_logged_in: true,
      user_info: userInfo,
    };
    localStorage.setItem('cached_auth_status', JSON.stringify(authStatus));

    console.log(`🔍 Cookies after save attempt: ${document.cookie}`)
    console.log('✅ Auth data successfully saved and cached')

    // 仅在需要时通知应用认证状态已更新
    if (triggerEvent) {
      // 通知应用认证状态已更新，传递保存成功的信息
      window.dispatchEvent(new CustomEvent('auth-status-updated', {
        detail: {
          source: 'saveAuthData',
          authStatus: authStatus
        }
      }))
    } else {
      console.log('🔕 Auth status update event suppressed')
    }
  } catch (error) {
    console.error('❌ Error saving auth data:', error)
    // 仅在需要时尝试通知应用更新状态
    if (triggerEvent) {
      // 即使保存失败，也尝试通知应用更新状态
      window.dispatchEvent(new CustomEvent('auth-status-updated', {
        detail: {
          source: 'saveAuthData',
          error: error
        }
      }))
    }
  }
}

// Helper function to get access token
export function getAccessToken(): string | null {
  return localStorage.getItem('jaaz_access_token')
}

// Helper function to make authenticated API calls
export async function authenticatedFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = getAccessToken()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  return fetch(url, {
    ...options,
    headers,
  })
}

// 刷新token
export async function refreshToken(currentToken: string) {
  // 添加防抖逻辑，避免频繁刷新
  const lastRefreshTime = localStorage.getItem('last_refresh_time')
  const now = Date.now()

  // 如果距离上次刷新不到1分钟，则不再次刷新
  if (lastRefreshTime && now - parseInt(lastRefreshTime) < 60000) {
    console.log('⏸️ Skipping token refresh, too frequent')
    return currentToken
  }

  try {
    const response = await fetch(`${OFFICIAL_API_URL}/api/device/refresh-token`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${currentToken}`,
      },
    })

    localStorage.setItem('last_refresh_time', now.toString())

    if (response.status === 200) {
      const data = await response.json()
      return data.new_token
    } else if (response.status === 401) {
      // Token 真正过期，需要重新登录
      throw new Error('TOKEN_EXPIRED')
    } else {
      // 其他错误（网络错误、服务器错误等），不强制重新登录
      throw new Error(`NETWORK_ERROR: ${response.status}`)
    }
  } catch (error) {
    console.error('❌ Token refresh failed:', error)
    // 保存最后刷新失败的时间，避免立即重试
    localStorage.setItem('last_refresh_time', (now + 30000).toString()) // 30秒后再尝试
    throw error
  }
}

// 启动Google OAuth认证流程
export async function startGoogleAuth(): Promise<GoogleAuthResponse> {
  const response = await fetch(`${GOOGLE_API_URL}/api/auth/google/start`, {
    method: 'GET',
  })

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`)
  }

  const data = await response.json()

  // 打开浏览器进行Google登录
  if (window.electronAPI?.openBrowserUrl) {
    try {
      await window.electronAPI.openBrowserUrl(data.authUrl)
    } catch (error) {
      console.error('Failed to open browser via Electron:', error)
      // 如果Electron API失败，回退到window.open
      window.open(data.authUrl, '_blank')
    }
  } else {
    // Web环境回退
    window.open(data.authUrl, '_blank')
  }

  return {
    status: data.status,
    authUrl: data.authUrl,
    state: data.state
  }
}

// 检查Google认证回调结果
export async function checkGoogleAuthCallback(state: string): Promise<GoogleAuthCallbackResponse> {
  const response = await fetch(
    `${GOOGLE_API_URL}/api/auth/google/check?state=${state}`
  )

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`)
  }

  return await response.json()
}

// 直接登录：在当前窗口跳转到Google OAuth
export function directLogin(): void {
  // 强制使用本地URL进行登录，避免跳转到远程服务器
  const authUrl = 'http://localhost:5174/auth/login'
  window.location.href = authUrl
}

// 检查URL参数中的直接认证数据
export function checkDirectAuthParams(): {
  authSuccess: boolean
  authData?: { token: string; user_info: UserInfo }
  authError?: string
} {
  console.log('🔍 === CHECKING URL FOR DIRECT AUTH PARAMS ===')
  const urlParams = new URLSearchParams(window.location.search)
  const authSuccess = urlParams.get('auth_success') === 'true'
  const encodedAuthData = urlParams.get('auth_data')
  const authError = urlParams.get('auth_error') ?? undefined

  console.log('🔍 URL auth params detected:', {
    authSuccess,
    hasEncodedAuthData: !!encodedAuthData,
    hasAuthError: !!authError
  })

  let authData = undefined

  if (authSuccess && encodedAuthData) {
    try {
      // 解码认证数据
      const decodedData = atob(encodedAuthData)
      authData = JSON.parse(decodedData)

      // 自动保存认证数据到cookie和localStorage，确保登录状态被正确保存
      if (authData && authData.token && authData.user_info) {
        console.log('🔑 自动保存认证数据...')
        console.log('🔍 Auth data received:', {
          tokenLength: authData.token.length,
          userEmail: authData.user_info.email,
          hasImageUrl: !!authData.user_info.image_url
        })

        // 先清除可能阻止保存的logout标志位
        console.log('🔧 清除可能存在的logout标志位...')
        sessionStorage.removeItem('is_logging_out')
        sessionStorage.removeItem('force_logout')

        // 确保用户信息包含头像URL
        if (!authData.user_info.image_url && authData.user_info.email) {
          console.log('✨ Adding missing image_url to user info...')
          // 设置默认头像URL，不依赖CryptoJS
          authData.user_info.image_url = `https://ui-avatars.com/api/?name=${encodeURIComponent(authData.user_info.username)}&background=random&color=fff&size=200`
        }

        saveAuthData(authData.token, authData.user_info)
        console.log('✅ Auth data successfully saved to localStorage and cookies')

        // 通知应用认证状态已更新
        console.log('📢 Notifying app about auth status update...')
        window.dispatchEvent(new CustomEvent('auth-status-updated', {
          detail: { source: 'url-params' }
        }))
      }
    } catch (error) {
      console.error('❌ Failed to decode auth data:', error)
    }
  }

  // 清理URL参数，避免重复处理
  if (authSuccess || authError) {
    console.log('🧹 Cleaning up URL parameters...')
    const newUrl = window.location.pathname
    window.history.replaceState({}, document.title, newUrl)
  }

  console.log('✅ Direct auth params check completed')
  return { authSuccess, authData, authError }
}
