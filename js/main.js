/* =============================================
 * 模块：Main 入口脚本
 * 描述：组织模块初始化顺序并连接渲染器、编辑器与 UI
 * 说明：第 3 轮聚焦数据模型，入口仅负责初始化与日志输出
 * ============================================= */

(function () {
  // 使用立即执行函数建立私有作用域，避免局部变量污染全局命名空间。
  const VERSION = '0.3'; // 定义当前编辑器迭代版本号，便于在控制台追踪版本。
  window.RPG = window.RPG || {}; // 确保全局命名空间存在以挂载模块。
  window.RPG.VERSION = VERSION; // 将版本号暴露到全局对象，方便调试查询。
  console.log('[RPGCanvas] v0.3 boot OK'); // 在脚本加载阶段输出启动日志确认入口加载成功。

  document.addEventListener('DOMContentLoaded', () => {
    // 等待 DOM 构建完成后再执行初始化逻辑，确保节点可用。
    const canvas = document.getElementById('mapCanvas'); // 获取画布节点引用用于渲染器初始化。
    const toolbar = document.getElementById('toolbar'); // 获取顶部工具栏引用用于 UI 初始化。
    const sidebar = document.getElementById('sidebar'); // 获取侧边栏引用供 UI 管理。
    const statusbar = document.getElementById('statusbar'); // 获取状态栏引用以更新状态文本。

    window.RPG.Renderer.init(canvas); // 初始化渲染器，准备相机与渲染循环。
    window.RPG.Editor.init(); // 初始化编辑器状态，重置交互与地图引用。
    window.RPG.UI.init({ canvas, toolbar, sidebar, statusbar }); // 初始化 UI 模块，绑定交互事件。

    window.RPG.Renderer.resizeToContainer(); // 同步一次 Canvas 尺寸以适配当前布局。
    window.RPG.Renderer.requestRender(); // 请求首次绘制以展示网格背景。
    // TODO(R7): 动画帧循环 // 预留后续扩展动画驱动的注释。

    console.log('[RPGCanvas] R3 data model ready'); // 输出本轮验收所需的状态日志。
  });
})();
