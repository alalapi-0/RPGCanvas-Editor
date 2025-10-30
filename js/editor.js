/* =============================================
 * 模块：Editor 地图数据模型与编辑状态
 * 描述：负责管理地图数据结构、图层内容以及编辑器交互状态
 * 说明：第 3 轮实现 MapData/Layers 结构与纯数据层 API
 * ============================================= */

(function () {
  // 使用立即执行函数创建私有作用域，避免内部变量泄漏到全局命名空间。
  const Editor = {
    // 定义 Editor 单例对象，集中管理地图数据与交互状态。
    state: {
      currentMap: null, // 当前加载的 MapData 对象引用，默认尚未加载地图。
      activeLayer: 'ground', // 当前激活的图层名称，默认为 ground 层。
      layers: ['ground', 'structure', 'prop', 'overlay', 'decal'], // 受支持的图层名称列表，用于校验输入。
      isPanning: false, // 是否处于画布平移状态，供 UI 模块读取。
      isSpaceHold: false, // 是否按住空格键，供 UI 模块决定平移模式。
      selectedTileId: null, // 当前画笔选中的素材 id，初始为空表示未选择。
      mapDirty: false, // 当前地图数据是否发生未保存的改动，初始为未脏状态。
    },

    init() {
      // 初始化编辑器状态的方法，供入口脚本在启动阶段调用。
      this.state.currentMap = null; // 重置当前地图引用，确保启动时无旧数据残留。
      this.state.activeLayer = 'ground'; // 恢复激活图层为默认的 ground 层。
      this.state.isPanning = false; // 清空平移状态标记，避免历史状态影响交互。
      this.state.isSpaceHold = false; // 清空空格按压标记，确保键盘状态正确。
      this.state.selectedTileId = null; // 重置画笔素材选择，等待 UI 在加载 manifest 后设置。
      this.state.mapDirty = false; // 初始化时将地图脏标记重置为 false。
      console.log('[Editor] init state', { activeLayer: this.state.activeLayer }); // 输出初始化日志便于调试。
    },

    _allocGrid(width, height) {
      // 内部辅助函数：根据宽高创建填充为 null 的二维数组。
      const rows = new Array(height); // 创建长度为地图高度的数组，代表行集合。
      for (let y = 0; y < height; y += 1) {
        // 逐行初始化二维数组内容。
        const row = new Array(width); // 为当前行创建指定宽度的数组。
        row.fill(null); // 将该行的每个单元填充为 null，表示空白图块。
        rows[y] = row; // 将行数组写回父级数组对应位置。
      }
      return rows; // 返回构建完成的二维数组供调用方使用。
    },

    _assertLayer(layerName) {
      // 内部辅助函数：校验图层名称是否有效。
      if (!this.state.layers.includes(layerName)) {
        // 若传入图层不在允许列表中则抛出错误。
        throw new Error(`[Editor] invalid layer: ${layerName}`); // 抛出带前缀的错误信息帮助定位问题。
      }
    },

    _assertMapLoaded() {
      // 内部辅助函数：确保当前已有地图被加载。
      if (!this.state.currentMap) {
        // 当未加载地图时直接抛错阻止后续操作。
        throw new Error('[Editor] no map loaded'); // 提示调用方先创建并加载地图。
      }
      return this.state.currentMap; // 返回当前地图对象，方便调用方继续使用。
    },

    _assertPlacement(placement) {
      // 内部辅助函数：验证并规范化 TilePlacement 对象。
      if (!placement || typeof placement !== 'object' || Array.isArray(placement)) {
        // 仅接受普通对象作为放置描述，其余类型一律视为非法。
        throw new Error('[Editor] placement must be object'); // 抛出错误提示 placement 类型无效。
      }
      if (typeof placement.tileId !== 'string' || !placement.tileId.trim()) {
        // tileId 必须为非空字符串，用于唯一标识素材。
        throw new Error('[Editor] placement.tileId invalid'); // 抛出错误提示 tileId 不符合要求。
      }
      const allowedRotations = [0, 90, 180, 270]; // 列出允许的旋转角度集合。
      const rotation = placement.rotation === undefined ? 0 : placement.rotation; // 若未提供旋转则默认取 0 度。
      if (!allowedRotations.includes(rotation)) {
        // 当旋转角度不在允许范围时抛出错误。
        throw new Error(`[Editor] placement.rotation invalid: ${rotation}`); // 提示旋转参数非法。
      }
      if (placement.flipX !== undefined && typeof placement.flipX !== 'boolean') {
        // flipX 若存在则必须为布尔值。
        throw new Error('[Editor] placement.flipX must be boolean'); // 提示 flipX 类型错误。
      }
      if (placement.flipY !== undefined && typeof placement.flipY !== 'boolean') {
        // flipY 若存在则必须为布尔值。
        throw new Error('[Editor] placement.flipY must be boolean'); // 提示 flipY 类型错误。
      }
      const animOffset = placement.animOffset === undefined ? 0 : placement.animOffset; // 若未提供动画偏移则默认 0。
      if (!Number.isInteger(animOffset) || animOffset < 0) {
        // 动画偏移需为非负整数以便后续帧动画计算。
        throw new Error('[Editor] placement.animOffset invalid'); // 抛出错误提示 animOffset 不合规范。
      }
      if (placement.walkable !== undefined && typeof placement.walkable !== 'boolean') {
        // walkable 若存在则必须为布尔值。
        throw new Error('[Editor] placement.walkable must be boolean'); // 提示 walkable 类型错误。
      }
      if (placement.blocks !== undefined && typeof placement.blocks !== 'boolean') {
        // blocks 若存在则必须为布尔值。
        throw new Error('[Editor] placement.blocks must be boolean'); // 提示 blocks 类型错误。
      }
      return {
        tileId: placement.tileId.trim(), // 规范化 tileId 为去除首尾空格的字符串。
        rotation, // 返回验证后的旋转角度。
        flipX: placement.flipX === undefined ? false : placement.flipX, // 若未提供 flipX 则默认为 false。
        flipY: placement.flipY === undefined ? false : placement.flipY, // 若未提供 flipY 则默认为 false。
        animOffset, // 返回规范化的动画偏移值。
        walkable: placement.walkable, // 保留 walkable 字段（可能为 undefined）。
        blocks: placement.blocks, // 保留 blocks 字段（可能为 undefined）。
      }; // 返回规范化后的放置对象供写入地图。
    },

    createNewMap(name, width, height) {
      // 根据参数创建新的 MapData 对象并返回。
      if (typeof name !== 'string' || !name.trim()) {
        // 地图名称必须为非空字符串。
        throw new Error('[Editor] createNewMap name invalid'); // 抛出带前缀的错误提示名称非法。
      }
      if (!Number.isInteger(width) || width <= 0 || width > 500) {
        // 地图宽度需为 1-500 范围内的正整数。
        throw new Error('[Editor] createNewMap width invalid'); // 抛出错误提示宽度参数非法。
      }
      if (!Number.isInteger(height) || height <= 0 || height > 500) {
        // 地图高度需为 1-500 范围内的正整数。
        throw new Error('[Editor] createNewMap height invalid'); // 抛出错误提示高度参数非法。
      }
      const now = new Date().toISOString(); // 生成当前时间的 ISO8601 字符串，用于元数据字段。
      const layers = {}; // 创建图层容器对象。
      for (const layerName of this.state.layers) {
        // 遍历允许的图层名称，为每个图层生成二维数组。
        layers[layerName] = this._allocGrid(width, height); // 调用辅助函数创建填充 null 的网格。
      }
      const mapData = {
        name: name.trim(), // 存储去除首尾空格后的地图名称。
        width, // 写入地图宽度（格数）。
        height, // 写入地图高度（格数）。
        tileSize: 48, // 固定单元格尺寸为 48，与项目约定一致。
        layers, // 写入创建好的图层数据结构。
        meta: {
          createdAt: now, // 记录地图创建时间。
          updatedAt: now, // 初始化更新时间为创建时间。
          version: '0.1.0', // 写入数据结构版本号，方便后续迁移。
        },
      }; // 组装完整的 MapData 对象。
      return mapData; // 将创建好的地图数据返回给调用方。
    },

    _sanitizeLoadedMap(mapData) {
      // 内部辅助函数：在 setCurrentMap 时对输入的地图数据做校验与规范化。
      if (!mapData || typeof mapData !== 'object') {
        // 仅接受对象作为地图数据。
        throw new Error('[Editor] setCurrentMap requires object'); // 抛出错误提示 mapData 类型非法。
      }
      const requiredFields = ['name', 'width', 'height', 'tileSize', 'layers', 'meta']; // 列出地图对象必备字段。
      for (const field of requiredFields) {
        // 遍历字段列表确保全部存在。
        if (!(field in mapData)) {
          // 若缺少任何字段则视为结构不完整。
          throw new Error(`[Editor] mapData missing field: ${field}`); // 抛出错误提示缺失字段名称。
        }
      }
      if (typeof mapData.name !== 'string' || !mapData.name.trim()) {
        // 名称必须为非空字符串。
        throw new Error('[Editor] mapData.name invalid'); // 抛出错误提示名称非法。
      }
      if (!Number.isInteger(mapData.width) || mapData.width <= 0) {
        // 宽度需为正整数。
        throw new Error('[Editor] mapData.width invalid'); // 抛出错误提示宽度非法。
      }
      if (!Number.isInteger(mapData.height) || mapData.height <= 0) {
        // 高度需为正整数。
        throw new Error('[Editor] mapData.height invalid'); // 抛出错误提示高度非法。
      }
      if (mapData.tileSize !== 48) {
        // 本轮强制 tileSize 固定为 48。
        throw new Error('[Editor] mapData.tileSize must be 48'); // 抛出错误提示 tileSize 不符约定。
      }
      if (!mapData.layers || typeof mapData.layers !== 'object') {
        // layers 字段必须为对象。
        throw new Error('[Editor] mapData.layers invalid'); // 抛出错误提示图层结构非法。
      }
      const sanitizedLayers = {}; // 创建新的图层容器以存放规范化结果。
      for (const layerName of this.state.layers) {
        // 遍历预设图层确保全部存在且结构正确。
        const grid = mapData.layers[layerName]; // 读取输入中的对应图层数据。
        if (!Array.isArray(grid) || grid.length !== mapData.height) {
          // 图层必须为高度数量的数组。
          throw new Error(`[Editor] layer grid invalid: ${layerName}`); // 抛出错误提示图层结构异常。
        }
        const sanitizedRows = new Array(mapData.height); // 准备承载规范化行数据的数组。
        for (let y = 0; y < mapData.height; y += 1) {
          // 遍历每一行执行校验。
          const row = grid[y]; // 读取当前行的数据。
          if (!Array.isArray(row) || row.length !== mapData.width) {
            // 行必须是长度与宽度一致的数组。
            throw new Error(`[Editor] layer row invalid: ${layerName}`); // 抛出错误提示当前行结构异常。
          }
          const sanitizedRow = new Array(mapData.width); // 创建新行数组以写入规范化后的单元。
          for (let x = 0; x < mapData.width; x += 1) {
            // 遍历当前行的每个单元格。
            const cell = row[x]; // 读取单元格内容。
            if (cell === null) {
              // 当单元格为空时直接保留 null。
              sanitizedRow[x] = null; // 将 null 写入规范化结果。
            } else {
              sanitizedRow[x] = this._assertPlacement(cell); // 对非空单元进行 placement 校验并写入规范化对象。
            }
          }
          sanitizedRows[y] = sanitizedRow; // 将规范化行写回新的网格数组。
        }
        sanitizedLayers[layerName] = sanitizedRows; // 将规范化网格存入对应图层名称。
      }
      const meta = mapData.meta && typeof mapData.meta === 'object' ? { ...mapData.meta } : {}; // 复制 meta 字段以免共享引用。
      if (!meta.createdAt || typeof meta.createdAt !== 'string') {
        // createdAt 必须存在且为字符串。
        throw new Error('[Editor] mapData.meta.createdAt invalid'); // 抛出错误提示元数据缺失创建时间。
      }
      if (!meta.updatedAt || typeof meta.updatedAt !== 'string') {
        // updatedAt 必须存在且为字符串。
        throw new Error('[Editor] mapData.meta.updatedAt invalid'); // 抛出错误提示元数据缺失更新时间。
      }
      if (!meta.version || typeof meta.version !== 'string') {
        // version 必须存在且为字符串。
        throw new Error('[Editor] mapData.meta.version invalid'); // 抛出错误提示版本信息非法。
      }
      return {
        name: mapData.name.trim(), // 返回规范化后的地图名称。
        width: mapData.width, // 返回地图宽度。
        height: mapData.height, // 返回地图高度。
        tileSize: 48, // 保持 tileSize 为固定值 48。
        layers: sanitizedLayers, // 使用新生成的规范化图层结构。
        meta, // 返回复制后的 meta 对象。
      }; // 返回完整的规范化地图对象供 setCurrentMap 使用。
    },

    setCurrentMap(mapData) {
      // 将提供的 MapData 设置为当前编辑地图。
      const sanitizedMap = this._sanitizeLoadedMap(mapData); // 调用内部函数校验并规范化地图数据。
      this.state.currentMap = sanitizedMap; // 将规范化结果保存为当前地图引用。
      this.state.activeLayer = this.state.activeLayer || 'ground'; // 保持激活图层有效，若为空则重置为 ground。
      this.state.mapDirty = false; // 切换地图后将脏标记重置，表示当前数据为最新状态。
      const event = new CustomEvent('rpg:map-changed', {
        // 创建自定义事件通知 UI 模块地图信息已变化。
        detail: {
          name: sanitizedMap.name, // 事件附带地图名称供订阅方显示。
          width: sanitizedMap.width, // 附带地图宽度信息。
          height: sanitizedMap.height, // 附带地图高度信息。
        },
      });
      window.dispatchEvent(event); // 派发事件到全局 window，便于其他模块监听。
    },

    getCurrentMap() {
      // 返回当前加载的 MapData 对象引用。
      return this.state.currentMap; // 直接返回 state 中保存的地图对象或 null。
    },

    inBounds(x, y) {
      // 判断指定格坐标是否位于当前地图范围内。
      const map = this._assertMapLoaded(); // 确认已有地图加载并获取引用。
      if (!Number.isInteger(x) || !Number.isInteger(y)) {
        // 坐标必须为整数，否则视为非法输入。
        throw new Error('[Editor] inBounds requires integer coordinates'); // 抛出错误提示坐标类型错误。
      }
      return x >= 0 && x < map.width && y >= 0 && y < map.height; // 返回坐标是否落在有效范围内。
    },

    getTile(layerName, x, y) {
      // 读取指定图层与格坐标上的 TilePlacement 数据。
      this._assertLayer(layerName); // 校验图层名称合法性。
      const map = this._assertMapLoaded(); // 确保已经加载地图。
      if (!this.inBounds(x, y)) {
        // 若坐标越界则抛出错误。
        throw new Error('[Editor] getTile out of bounds'); // 提示调用方坐标非法。
      }
      const placement = map.layers[layerName][y][x]; // 读取指定位置的放置信息。
      return placement ? { ...placement } : null; // 返回浅拷贝的对象避免外部直接修改内部引用。
    },

    getNeighborMask(x, y, groupId) {
      // 计算指定格子的四向邻接掩码，仅统计同组 A1 自动地形。
      const map = this.state.currentMap; // 读取当前地图引用，若尚未加载则直接返回 0。
      if (!map || !map.layers || !map.layers.ground) {
        // 当地图或 ground 层缺失时视为四向均无连接。
        return 0; // 返回 0 作为兜底掩码。
      }
      if (!Number.isInteger(x) || !Number.isInteger(y)) {
        // 坐标必须为整数才能对应网格索引。
        return 0; // 返回 0 避免抛出异常。
      }
      if (typeof groupId !== 'string' || !groupId) {
        // 缺少有效组标识时无法判断邻接关系。
        return 0; // 返回 0 表示无邻接。
      }
      const width = map.width; // 缓存地图宽度以进行越界检查。
      const height = map.height; // 缓存地图高度以进行越界检查。
      const grid = map.layers.ground; // 读取 ground 层二维数组。
      const assets = window.RPG?.Assets; // 获取素材管理器以查找 tile 定义。
      const auto16 = window.RPG?.AutoTile16; // 获取自动拼角工具以计算组标识。
      if (!assets || typeof assets.getTileById !== 'function' || !auto16 || typeof auto16.getGroupId !== 'function') {
        // 依赖模块未就绪时无法计算邻接。
        return 0; // 返回 0 等待后续重试。
      }
      let mask = 0; // 初始化掩码值。
      const directions = [
        { dx: 0, dy: -1, bit: 1 }, // 北方向的偏移与掩码位。
        { dx: 1, dy: 0, bit: 2 }, // 东方向的偏移与掩码位。
        { dx: 0, dy: 1, bit: 4 }, // 南方向的偏移与掩码位。
        { dx: -1, dy: 0, bit: 8 }, // 西方向的偏移与掩码位。
      ]; // 列出四个方向的检查定义。
      directions.forEach((dir) => {
        // 遍历每个方向判断是否存在同组地形。
        const nx = x + dir.dx; // 计算邻居格的 X 坐标。
        const ny = y + dir.dy; // 计算邻居格的 Y 坐标。
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
          // 越界时直接跳过该方向。
          return; // 继续处理其他方向。
        }
        const row = grid[ny]; // 读取邻居所在的行数组。
        if (!Array.isArray(row)) {
          // 行数据缺失时跳过。
          return; // 继续检查下一个方向。
        }
        const placement = row[nx]; // 读取邻居单元格的放置信息。
        if (!placement || typeof placement.tileId !== 'string') {
          // 空白格或无效数据不计入掩码。
          return; // 继续处理其他方向。
        }
        const tileDef = assets.getTileById(placement.tileId); // 查询邻居使用的素材定义。
        if (!tileDef) {
          // 素材缺失时无法判断是否同组。
          return; // 继续检查下一个方向。
        }
        const neighborGroup = auto16.getGroupId(tileDef); // 计算邻居的大组标识。
        if (neighborGroup && neighborGroup === groupId) {
          // 当标识一致时设置对应的掩码位。
          mask |= dir.bit; // 通过位或写入掩码。
        }
      });
      return mask & 0xF; // 返回最终掩码并确保落在 0-15 范围内。
    },

    setTile(layerName, x, y, placement) {
      // 在指定位置写入新的 TilePlacement 数据。
      this._assertLayer(layerName); // 校验图层名称是否合法。
      const map = this._assertMapLoaded(); // 确保当前已加载地图。
      if (!this.inBounds(x, y)) {
        // 坐标越界时禁止写入。
        throw new Error('[Editor] setTile out of bounds'); // 抛出错误提示坐标非法。
      }
      const normalized = this._assertPlacement(placement); // 验证 placement 并获取规范化结果。
      map.layers[layerName][y][x] = normalized; // 将规范化后的对象写入地图数据。
      map.meta.updatedAt = new Date().toISOString(); // 更新地图的更新时间戳。
    },

    removeTile(layerName, x, y) {
      // 将指定位置的图块清空为 null。
      this._assertLayer(layerName); // 校验图层名称是否合法。
      const map = this._assertMapLoaded(); // 确保当前已加载地图。
      if (!this.inBounds(x, y)) {
        // 若坐标越界则禁止操作。
        throw new Error('[Editor] removeTile out of bounds'); // 抛出错误提示坐标非法。
      }
      map.layers[layerName][y][x] = null; // 将目标单元格重置为 null。
      map.meta.updatedAt = new Date().toISOString(); // 更新更新时间戳记录变更。
    },

    paintAt(gx, gy, brush) {
      // 在当前激活图层的指定格坐标写入新的 TilePlacement。
      const map = this.state.currentMap; // 读取当前地图引用以便后续校验。
      if (!map) {
        // 若尚未加载地图则无法进行绘制操作。
        throw new Error('[Editor] paintAt requires loaded map'); // 抛出错误提示调用方先加载地图。
      }
      if (!Number.isInteger(gx) || !Number.isInteger(gy)) {
        // 仅接受整数格坐标，确保与网格对齐。
        throw new Error('[Editor] paintAt requires integer grid coordinates'); // 抛出错误提示坐标类型错误。
      }
      if (!brush || typeof brush !== 'object') {
        // 画笔参数必须为对象，包含 tileId 与旋转等信息。
        throw new Error('[Editor] paintAt requires brush object'); // 抛出错误提示 brush 无效。
      }
      if (typeof brush.tileId !== 'string' || !brush.tileId.trim()) {
        // tileId 必须为非空字符串以匹配素材索引。
        throw new Error('[Editor] paintAt requires brush.tileId string'); // 抛出错误提示 tileId 不合法。
      }
      if (gx < 0 || gx >= map.width || gy < 0 || gy >= map.height) {
        // 若坐标越界则直接终止并提示错误。
        throw new Error('[Editor] paintAt out of bounds'); // 抛出错误提示越界。
      }
      const assets = window.RPG?.Assets; // 读取全局素材管理器，获取 tile 定义。
      if (!assets || typeof assets.getTileById !== 'function') {
        // 当素材管理器尚未就绪时无法解析 tileId。
        throw new Error('[Editor] paintAt requires Assets manager'); // 抛出错误提示调用顺序不正确。
      }
      const tileDef = assets.getTileById(brush.tileId); // 查询对应素材定义。
      if (!tileDef) {
        // 未能找到素材定义说明 manifest 数据缺失。
        throw new Error(`[Editor] paintAt unknown tileId: ${brush.tileId}`); // 抛出错误提示 tileId 异常。
      }
      const activeLayer = this.getActiveLayer(); // 读取当前激活的图层名称。
      if (tileDef.layer !== activeLayer) {
        // 素材声明的图层必须与当前激活图层匹配。
        throw new Error(`[Editor] paintAt layer mismatch: ${tileDef.layer} !== ${activeLayer}`); // 抛出错误提示图层不匹配。
      }
      const allowedRotations = [0, 90, 180, 270]; // 定义允许的旋转角度集合。
      const rotation = allowedRotations.includes(brush.rotation) ? brush.rotation : 0; // 若传入角度非法则退化为 0 度。
      const placement = {
        tileId: brush.tileId.trim(), // 去除首尾空格后写入 tileId。
        rotation, // 写入规范化后的旋转角度。
        flipX: Boolean(brush.flipX), // 将 flipX 规范化为布尔值。
        flipY: Boolean(brush.flipY), // 将 flipY 规范化为布尔值。
        animOffset: 0, // 当前轮次始终写入 0，后续动画偏移在 R7 扩展。
      }; // 组装 TilePlacement 对象以写入数据层。
      const layerGrid = map.layers[activeLayer]; // 读取目标图层的二维数组。
      const row = Array.isArray(layerGrid) ? layerGrid[gy] : null; // 获取当前行引用以安全读取已有数据。
      const existing = row ? row[gx] : null; // 获取当前格已有的放置信息。
      const isSame = existing && existing.tileId === placement.tileId && existing.rotation === placement.rotation && Boolean(existing.flipX) === placement.flipX && Boolean(existing.flipY) === placement.flipY; // 判断是否与现有数据完全一致。
      if (isSame) {
        // 当目标格内容与新数据完全一致时无需写入。
        return false; // 返回 false 表示没有实际变更。
      }
      this.setTile(activeLayer, gx, gy, placement); // 调用通用接口写入图块数据并刷新更新时间。
      this.state.mapDirty = true; // 标记地图数据已发生变动，便于后续保存提示。
      return true; // 返回 true 表示有实际写入操作。
    },

    eraseAt(gx, gy) {
      // 删除当前激活图层指定格的 TilePlacement。
      const map = this.state.currentMap; // 读取当前地图引用。
      if (!map) {
        // 未加载地图时无法执行删除操作。
        throw new Error('[Editor] eraseAt requires loaded map'); // 抛出错误提示调用前需加载地图。
      }
      if (!Number.isInteger(gx) || !Number.isInteger(gy)) {
        // 删除操作同样要求整数坐标。
        throw new Error('[Editor] eraseAt requires integer grid coordinates'); // 抛出错误提示坐标类型错误。
      }
      if (gx < 0 || gx >= map.width || gy < 0 || gy >= map.height) {
        // 越界时直接返回错误以保持调用习惯与 paintAt 一致。
        throw new Error('[Editor] eraseAt out of bounds'); // 抛出错误提示坐标超出范围。
      }
      const layerName = this.getActiveLayer(); // 读取当前激活图层。
      const layerGrid = map.layers[layerName]; // 获取目标图层二维数组。
      const row = Array.isArray(layerGrid) ? layerGrid[gy] : null; // 获取当前行的引用。
      if (!row || !row[gx]) {
        // 当该格本身为空时无需执行删除，直接返回。
        return false; // 返回 false 表示数据未发生变化。
      }
      this.removeTile(layerName, gx, gy); // 调用通用接口将该格设置为 null 并更新时间。
      this.state.mapDirty = true; // 标记地图已被修改。
      return true; // 返回 true 表示删除操作生效。
    },

    setActiveLayer(layerName) {
      // 设置当前激活的图层名称。
      this._assertLayer(layerName); // 校验图层名称是否合法。
      this.state.activeLayer = layerName; // 更新 state 中的激活图层。
    },

    getActiveLayer() {
      // 获取当前激活的图层名称。
      return this.state.activeLayer; // 返回 state 中记录的图层名。
    },

    setSelectedTile(tileId) {
      // 设置当前画笔选中的素材 id，可传入字符串或 null。
      let normalized = null; // 预设规范化后的 id 默认为 null。
      if (tileId !== null && tileId !== undefined) {
        // 当提供了非空参数时执行字符串校验。
        if (typeof tileId !== 'string' || !tileId.trim()) {
          // 若传入的值不是非空字符串则抛出错误提示调用方。
          throw new Error('[Editor] setSelectedTile requires string id'); // 抛出错误防止写入非法 id。
        }
        normalized = tileId.trim(); // 去除首尾空格得到规范化 id。
      }
      if (this.state.selectedTileId === normalized) {
        // 若新旧值一致则无需更新，直接结束。
        return; // 避免重复派发事件与状态刷新。
      }
      this.state.selectedTileId = normalized; // 写入新的选中素材 id。
      const event = new CustomEvent('rpg:brush-changed', {
        // 创建自定义事件通知 UI 画笔素材发生变化。
        detail: { tileId: normalized }, // 附带当前选中素材 id，null 表示未选中。
      });
      window.dispatchEvent(event); // 将事件派发到全局 window，供 UI 监听更新状态栏。
    },

    getSelectedTileId() {
      // 读取当前画笔选中的素材 id。
      return this.state.selectedTileId; // 返回 state 中保存的字符串或 null。
    },

    getBrushState() {
      // 返回画笔相关状态的只读快照供外部调试使用。
      return { tileId: this.state.selectedTileId }; // 仅暴露当前选中的素材 id，避免直接修改内部状态。
    },
  };

  window.RPG = window.RPG || {}; // 确保全局命名空间存在，避免覆盖其他模块。
  window.RPG.Editor = Editor; // 将 Editor 模块挂载到全局供其他脚本访问。
})();
