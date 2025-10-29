/* =============================================
 * 模块：Editor 编辑器骨架
 * 描述：集中维护编辑状态与图层信息，供交互模块读取
 * 说明：第 2 轮加入平移状态管理，后续继续扩展地图数据
 * ============================================= */

(function () {
  // 使用立即执行函数包装模块，保持私有作用域不污染全局变量。
  const Editor = {
    // 定义 Editor 对象，承载编辑状态数据与初始化方法。
    currentMap: null, // 当前正在操作的地图引用，默认仍为空。
    activeLayer: 'ground', // 默认激活地表图层，符合占位逻辑。
    layers: ['ground', 'structure', 'prop', 'overlay', 'decal'], // 预设图层列表，供校验使用。
    state: { isPanning: false, isSpaceHold: false }, // 新增输入状态对象，记录平移与空格按压状态。

    init() {
      // 初始化方法，重置编辑器的关键状态。
      this.currentMap = null; // 重置当前地图为未加载状态。
      this.activeLayer = 'ground'; // 将激活图层恢复为默认值，确保一致性。
      this.state = { isPanning: false, isSpaceHold: false }; // 初始化交互状态，供 UI 模块同步更新。
      console.log('[Editor] init state', { activeLayer: this.activeLayer, state: this.state }); // 输出初始化日志便于调试。
      // TODO(R3): 地图数据结构 // 预留后续轮次实现地图模型的占位注释。
    },

    createNewMap(name, width, height) {
      // 创建新地图的占位方法，继续保留基本参数校验。
      if (typeof name !== 'string' || !name.trim()) {
        // 地图名称必须为非空字符串。
        throw new Error('createNewMap 需要有效的名称字符串'); // 参数非法时抛出错误提示。
      }
      if (!Number.isInteger(width) || width <= 0) {
        // 宽度需要为正整数。
        throw new Error('createNewMap 宽度必须为正整数'); // 校验失败抛出错误。
      }
      if (!Number.isInteger(height) || height <= 0) {
        // 高度需要为正整数。
        throw new Error('createNewMap 高度必须为正整数'); // 校验失败抛出错误。
      }
      console.log('[Editor] create map placeholder', { name, width, height }); // 输出占位日志，后续替换为真实逻辑。
    },

    setActiveLayer(layerName) {
      // 切换当前激活图层的方法。
      if (!this.layers.includes(layerName)) {
        // 若图层名称不在预设列表中则视为非法输入。
        throw new Error(`setActiveLayer 无效图层：${layerName}`); // 抛出错误提示开发者。
      }
      this.activeLayer = layerName; // 更新激活图层为合法值。
      console.log('[Editor] active layer changed', this.activeLayer); // 输出状态变更日志便于追踪。
    },
  };

  window.RPG = window.RPG || {}; // 确保全局命名空间存在，避免覆盖其他模块。
  window.RPG.Editor = Editor; // 将 Editor 模块挂载到全局命名空间供其他脚本访问。
})();
