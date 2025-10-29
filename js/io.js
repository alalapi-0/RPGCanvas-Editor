/* =============================================
 * 模块：IO 导入导出工具
 * 描述：提供地图数据序列化与反序列化，占位实现用于验收
 * 说明：第 3 轮实现 JSON 读写的基础校验
 * ============================================= */

(function () {
  // 使用立即执行函数创建局部作用域，避免内部变量污染全局。
  const IO = {
    // 定义 IO 单例对象，集中管理数据序列化相关方法。

    _validateMapShape(mapData) {
      // 内部辅助函数：校验 MapData 结构是否符合规范。
      if (!mapData || typeof mapData !== 'object') {
        // 仅接受对象作为地图数据。
        throw new Error('[IO] mapData must be object'); // 抛出错误提示类型不正确。
      }
      const requiredFields = ['name', 'width', 'height', 'tileSize', 'layers', 'meta']; // MapData 必备字段列表。
      for (const field of requiredFields) {
        // 遍历字段列表确认全部存在。
        if (!(field in mapData)) {
          // 若缺少字段则视为结构不完整。
          throw new Error(`[IO] mapData missing field: ${field}`); // 抛出错误提示缺少的字段名。
        }
      }
      if (typeof mapData.name !== 'string' || !mapData.name.trim()) {
        // 地图名称必须为非空字符串。
        throw new Error('[IO] mapData.name invalid'); // 抛出错误提示名称不合法。
      }
      if (!Number.isInteger(mapData.width) || mapData.width <= 0) {
        // 宽度必须为正整数。
        throw new Error('[IO] mapData.width invalid'); // 抛出错误提示宽度非法。
      }
      if (!Number.isInteger(mapData.height) || mapData.height <= 0) {
        // 高度必须为正整数。
        throw new Error('[IO] mapData.height invalid'); // 抛出错误提示高度非法。
      }
      if (mapData.tileSize !== 48) {
        // tileSize 本轮固定为 48。
        throw new Error('[IO] mapData.tileSize must be 48'); // 抛出错误提示尺寸不符约定。
      }
      if (!mapData.layers || typeof mapData.layers !== 'object') {
        // layers 字段必须为对象。
        throw new Error('[IO] mapData.layers invalid'); // 抛出错误提示图层结构非法。
      }
      const layerNames = ['ground', 'structure', 'prop', 'overlay', 'decal']; // 允许的图层名称集合。
      for (const layerName of layerNames) {
        // 遍历每个图层检查结构。
        const grid = mapData.layers[layerName]; // 获取当前图层的二维数组。
        if (!Array.isArray(grid) || grid.length !== mapData.height) {
          // 图层必须为高度数量的数组。
          throw new Error(`[IO] layer grid invalid: ${layerName}`); // 抛出错误提示图层维度不匹配。
        }
        for (const row of grid) {
          // 遍历图层内的每一行。
          if (!Array.isArray(row) || row.length !== mapData.width) {
            // 行必须为长度匹配宽度的数组。
            throw new Error(`[IO] layer row invalid: ${layerName}`); // 抛出错误提示行数据结构异常。
          }
          for (const cell of row) {
            // 遍历行内每个单元格。
            if (cell !== null && (typeof cell !== 'object' || Array.isArray(cell))) {
              // 单元格允许为 null 或普通对象，其他类型不合法。
              throw new Error('[IO] tile placement must be object or null'); // 抛出错误提示单元格类型错误。
            }
          }
        }
      }
      if (!mapData.meta || typeof mapData.meta !== 'object') {
        // meta 必须为对象。
        throw new Error('[IO] mapData.meta invalid'); // 抛出错误提示元数据缺失。
      }
      if (typeof mapData.meta.createdAt !== 'string' || !mapData.meta.createdAt) {
        // createdAt 必须存在且为字符串。
        throw new Error('[IO] mapData.meta.createdAt invalid'); // 抛出错误提示创建时间非法。
      }
      if (typeof mapData.meta.updatedAt !== 'string' || !mapData.meta.updatedAt) {
        // updatedAt 必须存在且为字符串。
        throw new Error('[IO] mapData.meta.updatedAt invalid'); // 抛出错误提示更新时间非法。
      }
      if (typeof mapData.meta.version !== 'string' || !mapData.meta.version) {
        // version 必须存在且为字符串。
        throw new Error('[IO] mapData.meta.version invalid'); // 抛出错误提示版本信息非法。
      }
    },

    serialize(mapData) {
      // 将 MapData 对象序列化为 JSON 字符串。
      this._validateMapShape(mapData); // 先执行结构校验确保数据合法。
      return JSON.stringify(mapData, null, 2); // 调用 JSON.stringify 并使用缩进格式化输出。
    },

    deserialize(jsonText) {
      // 将 JSON 字符串解析为 MapData 对象。
      if (typeof jsonText !== 'string') {
        // 仅接受字符串输入。
        throw new Error('[IO] deserialize requires string'); // 抛出错误提示输入类型错误。
      }
      let data = null; // 定义解析结果变量并初始化为空。
      try {
        // 使用 try-catch 捕获 JSON 解析过程中可能出现的异常。
        data = JSON.parse(jsonText); // 尝试解析 JSON 字符串。
      } catch (error) {
        // 当解析失败时抛出带前缀的错误，包含原始异常信息。
        throw new Error(`[IO] invalid JSON: ${error.message}`); // 将解析错误包装后抛出。
      }
      this._validateMapShape(data); // 对解析结果执行结构校验，确保数据合法。
      return data; // 返回解析并校验后的对象。
    },
  };

  window.RPG = window.RPG || {}; // 确保全局命名空间存在，避免覆盖其他模块。
  window.RPG.IO = IO; // 将 IO 模块挂载到全局命名空间供外部调用。
})();
