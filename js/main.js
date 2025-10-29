/* =============================================
 * 模块：Main 入口脚本
 * 描述：组织 RPGCanvas Editor 的初始化顺序与全局事件
 * 说明：首轮仅完成模块注册与基础日志
 * ============================================= */

(function () {
  // 使用立即执行函数建立私有作用域，防止变量泄露。
  const VERSION = '0.1'; // 定义当前脚手架版本号，供日志使用。
  window.RPG = window.RPG || {}; // 确保全局命名空间对象存在。
  window.RPG.VERSION = VERSION; // 将版本号暴露到全局命名空间，便于外部读取。
  console.log('[RPGCanvas] v0.1 boot OK'); // 在脚本加载时输出启动成功日志，满足验收要求。

  document.addEventListener('DOMContentLoaded', () => {
    // 监听 DOMContentLoaded 事件，确保 DOM 节点可用后再执行初始化。
    const canvas = document.getElementById('mapCanvas'); // 获取画布节点引用。
    const toolbar = document.getElementById('toolbar'); // 获取顶部工具栏节点。
    const sidebar = document.getElementById('sidebar'); // 获取左侧素材面板节点。
    const statusbar = document.getElementById('statusbar'); // 获取底部状态栏节点。

    window.RPG.UI.init({ canvas, toolbar, sidebar, statusbar }); // 初始化 UI 模块，搭建界面与事件占位。
    window.RPG.Renderer.init(canvas); // 初始化渲染器模块，准备 Canvas 上下文并绘制网格。
    window.RPG.Editor.init(); // 初始化编辑器模块，重置地图状态。

    window.addEventListener('resize', () => {
      // 监听窗口尺寸变化事件。
      const rect = canvas.getBoundingClientRect(); // 读取 Canvas 当前在页面中的尺寸。
      console.log('[RPGCanvas] resize noted', `${Math.round(rect.width)}x${Math.round(rect.height)}`); // 记录尺寸日志，后续用于适配逻辑。
    });

    console.log('[RPGCanvas] DOM ready, modules initialized'); // 输出 DOM 与模块初始化完成日志。
  });
})();
