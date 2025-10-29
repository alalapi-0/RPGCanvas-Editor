/* =============================================
 * 模块：Editor 编辑器骨架
 * 描述：维护地图状态与图层信息的占位实现
 * 说明：首轮仅提供基本状态与校验逻辑，后续扩展实际数据结构
 * ============================================= */

(function () {
  // 使用立即执行函数包裹，防止变量泄露到全局作用域。
  const Editor = {
    // 定义 Editor 对象，负责管理编辑状态。
    currentMap: null, // 当前正在编辑的地图引用，初始为空表示未加载。
    activeLayer: 'ground', // 默认激活图层设为地表层。
    layers: ['ground', 'structure', 'prop', 'overlay', 'decal'], // 预设的图层顺序，供校验使用。

    init() {
      // 初始化方法，用于记录初始状态。
      this.currentMap = null; // 明确当前没有地图被加载。
      this.activeLayer = 'ground'; // 重置激活图层到默认值。
      console.log('[Editor] init state', { activeLayer: this.activeLayer }); // 输出初始化状态，辅助调试。
    },

    createNewMap(name, width, height) {
      // 创建新地图占位方法，执行参数校验。
      if (typeof name !== 'string' || !name.trim()) {
        // 确保地图名称为非空字符串。
        throw new Error('createNewMap 需要有效的名称字符串'); // 如果不符合要求则抛出错误。
      }
      if (!Number.isInteger(width) || width <= 0) {
        // 验证宽度为正整数。
        throw new Error('createNewMap 宽度必须为正整数'); // 不符合条件时报错。
      }
      if (!Number.isInteger(height) || height <= 0) {
        // 验证高度为正整数。
        throw new Error('createNewMap 高度必须为正整数'); // 不符合条件时报错。
      }
      console.log('[Editor] create map placeholder', { name, width, height }); // 输出占位日志，后续替换为真实逻辑。
    },

    setActiveLayer(layerName) {
      // 切换当前激活图层的方法。
      if (!this.layers.includes(layerName)) {
        // 检查传入的图层名称是否在预设列表中。
        throw new Error(`setActiveLayer 无效图层：${layerName}`); // 若不存在则抛出错误提醒。
      }
      this.activeLayer = layerName; // 更新当前激活图层。
      console.log('[Editor] active layer changed', this.activeLayer); // 输出状态变更日志。
    },
  };

  window.RPG = window.RPG || {}; // 确保全局命名空间对象存在。
  window.RPG.Editor = Editor; // 将 Editor 对象挂载到全局命名空间供其他模块调用。
})();
