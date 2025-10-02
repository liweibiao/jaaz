// 测试前端代理设置API
default export async function testProxySettings() {
  try {
    console.log('测试更新代理设置...');
    
    // 测试数据 - 使用自定义代理
    const testProxy = 'http://127.0.0.1:1080';
    
    // 调用updateProxySettings API
    console.log('调用updateProxySettings API...');
    const proxyResponse = await fetch('/api/settings/proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ proxy: testProxy })
    });
    
    const proxyResult = await proxyResponse.json();
    console.log('updateProxySettings 结果:', proxyResult);
    
    // 验证更新是否成功
    console.log('验证代理设置是否已更新...');
    const getProxyResponse = await fetch('/api/settings/proxy');
    const proxySettings = await getProxyResponse.json();
    console.log('获取到的代理设置:', proxySettings);
    
    // 调用updateSettings API测试全局设置更新
    console.log('调用updateSettings API测试全局设置更新...');
    const settingsResponse = await fetch('/api/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ providerProxies: { 'test': true } })
    });
    
    const settingsResult = await settingsResponse.json();
    console.log('updateSettings 结果:', settingsResult);
    
    // 验证全局设置更新是否成功
    console.log('验证全局设置是否已更新...');
    const getSettingsResponse = await fetch('/api/settings');
    const allSettings = await getSettingsResponse.json();
    console.log('获取到的全局设置中的providerProxies:', allSettings.providerProxies);
    
    return {
      success: true,
      message: '代理设置测试成功'
    };
  } catch (error) {
    console.error('测试过程中发生错误:', error);
    return {
      success: false,
      message: `测试失败: ${error.message}`
    };
  }
}

// 如果直接运行此脚本
if (typeof window !== 'undefined') {
  testProxySettings().then(result => {
    console.log(result);
  });
}