/* =============================================
 * 模块：Main 入口脚本
 * 描述：组织模块初始化顺序并连接渲染器、编辑器与 UI
 * 说明：第 2 轮完成相机功能初始化及启动日志
 * ============================================= */

(function () {
  // 使用立即执行函数建立私有作用域，防止局部变量泄露。
  const VERSION = '0.2'; // 定义当前编辑器版本号，记录迭代进度。
  window.RPG = window.RPG || {}; // 确保全局命名空间存在以承载各模块。
  window.RPG.VERSION = VERSION; // 将版本号暴露到全局，便于调试与文档引用。
  console.log('[RPGCanvas] v0.2 boot OK'); // 在脚本加载时输出启动日志，确认入口脚本运行。

  document.addEventListener('DOMContentLoaded', () => {
    // 等待 DOM 构建完成后再执行初始化，确保节点可用。
    const canvas = document.getElementById('mapCanvas'); // 获取画布节点引用。
    const toolbar = document.getElementById('toolbar'); // 获取顶部工具栏引用。
    const sidebar = document.getElementById('sidebar'); // 获取侧边栏引用。
    const statusbar = document.getElementById('statusbar'); // 获取底部状态栏引用。

    window.RPG.Renderer.init(canvas); // 初始化渲染器，准备相机与渲染循环。
    window.RPG.Editor.init(); // 初始化编辑器状态，写入平移与空格标记。
    window.RPG.UI.init({ canvas, toolbar, sidebar, statusbar }); // 初始化 UI 模块，绑定交互事件。

    window.RPG.Renderer.resizeToContainer(); // 启动阶段同步一次 Canvas 尺寸以适配容器。
    window.RPG.Renderer.requestRender(); // 主动请求初次绘制，确保画面与尺寸同步。
    // TODO(R7): 动画帧循环 // 预留后续在主入口统筹动画时机的注释。

    console.log('[RPGCanvas] R2 camera+grid ready'); // 输出本轮完成功能的验收日志。
  });
})();
