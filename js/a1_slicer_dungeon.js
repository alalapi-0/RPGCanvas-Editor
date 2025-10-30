/* =============================================
 * 模块：A1DungeonSlicer 地牢 A1 图集切片器
 * 描述：将 Dungeon_A1.png 切成 4×4 组槽并生成 96 个静态格，同时提供名称映射
 * 说明：第 9 轮专用组件，支持滑窗三帧与名称重排
 * ============================================= */

(function () {
  // 使用立即执行函数封装模块作用域，避免内部变量泄露到全局命名空间。
  const IMG_W = 512; // 定义整张图集的宽度像素 512。
  const IMG_H = 384; // 定义整张图集的高度像素 384。
  const SLOTS_X = 4; // 横向共有 4 个 slot。
  const SLOTS_Y = 4; // 纵向共有 4 个 slot。
  const SLOT_W = IMG_W / SLOTS_X; // 单个 slot 的宽度 128 像素。
  const SLOT_H = IMG_H / SLOTS_Y; // 单个 slot 的高度 96 像素。
  const COLS = 4; // slot 内横向分成 4 列 32×32 子格。
  const ROWS = 3; // slot 内纵向分成 3 行 32×32 子格。
  const CELL = 32; // 基础单元格宽高 32 像素。
  const ANIM_WINDOW = [0, 1, 2]; // 滑窗动画的起始列列表。
  const ORDER_URL = 'assets/tiles/Dungeon_A1.map.json'; // 名称映射文件路径。
  const NAMES_URL = 'assets/tiles/Dungeon_A1.txt'; // 名称列表文件路径。

  async function loadText(url) {
    // 通用异步文本加载器，返回去除 BOM 的字符串。
    const response = await fetch(url); // 使用 fetch 读取资源。
    if (!response.ok) {
      // 若请求失败则抛出错误供调用方兜底。
      throw new Error(`[A1DungeonSlicer] failed to load ${url}: ${response.status}`);
    }
    const raw = await response.text(); // 解析为纯文本。
    return raw.replace(/^\uFEFF/, ''); // 去除可能存在的 BOM。
  }

  async function loadJSON(url) {
    // 通用异步 JSON 加载器，返回解析后的对象。
    const response = await fetch(url); // 请求 JSON 文件。
    if (!response.ok) {
      // 当文件不存在或读取失败时抛出错误。
      throw new Error(`[A1DungeonSlicer] failed to load ${url}: ${response.status}`);
    }
    return response.json(); // 返回解析后的 JSON。
  }

  function parseNames(text) {
    // 将文本中的 16 行“英文|日文”解析成名称数组。
    const lines = text
      .split(/\r?\n/) // 按行拆分文本。
      .map((line) => line.trim()) // 去除行首尾空白。
      .filter((line) => line.length > 0); // 丢弃空行。
    const names = lines.map((line, index) => {
      // 遍历每行生成名称对象。
      const parts = line.split('|'); // 以竖线分隔英文与日文。
      const en = (parts[0] || `Group ${index + 1}`).trim(); // 读取英文名称或使用默认值。
      const ja = (parts[1] || en).trim(); // 若缺失日文则回退到英文。
      return { en, ja }; // 返回包含双语标签的对象。
    });
    return names.slice(0, SLOTS_X * SLOTS_Y); // 限制为 16 项，多余部分忽略。
  }

  function ensureOrderArray(rawOrder) {
    // 校验并整理 order 数组，返回长度 16 的 1 基索引数组。
    const total = SLOTS_X * SLOTS_Y; // 计算 slot 总数 16。
    if (!Array.isArray(rawOrder)) {
      // 若结构非法则返回默认顺序。
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    const result = Array.from({ length: total }, (_, i) => {
      // 遍历生成校验后的数组。
      const value = rawOrder[i]; // 读取原始值。
      if (!Number.isInteger(value) || value < 1 || value > total) {
        // 当值不合法时回退到默认顺序。
        return i + 1;
      }
      return value; // 返回合法值。
    });
    return result;
  }

  function createTilePrototype(slotIndex, slotX, slotY, ix) {
    // 根据 slot 信息与索引生成基础 tile 定义（未归一化）。
    const colOffset = 2 + (ix % 2); // 静态预览取第 2、3 列。
    const rowOffset = Math.floor(ix / 2); // 三行顺序输出。
    const sx = slotX + colOffset * CELL; // 计算源矩形左上角 X。
    const sy = slotY + rowOffset * CELL; // 计算源矩形左上角 Y。
    const tileId = `a1.dungeon.g${slotIndex + 1}.c${ix}`; // 构造唯一 id。
    return {
      id: tileId, // 记录唯一标识。
      rect: [sx, sy, CELL, CELL], // 使用数组形式描述源矩形。
      layer: 'ground', // 地面层素材。
      animated: ANIM_WINDOW.length, // 固定三帧动画。
      animWindowCols: [...ANIM_WINDOW], // 滑窗帧起点列表。
      animPairW: 2, // 每帧使用 2 列。
      group: slotIndex + 1, // 记录组编号（1 基）。
      pack: 'Dungeon_A1', // 所属素材包名称。
      slotMeta: {
        index: slotIndex + 1, // slot 序号。
        cx: slotIndex % SLOTS_X, // slot 的列索引。
        cy: Math.floor(slotIndex / SLOTS_X), // slot 的行索引。
        x: slotX, // slot 左上角 X。
        y: slotY, // slot 左上角 Y。
        w: SLOT_W, // slot 宽度。
        h: SLOT_H, // slot 高度。
        colInPair: colOffset - 2, // 表示位于两列对中的左列或右列。
        baseCol: colOffset, // 保存静态取样使用的列索引（0~3）。
        row: rowOffset, // 位于 slot 内的行索引。
      },
    };
  }

  function buildGroups(names, order) {
    // 根据名称和顺序预先创建 16 个组对象。
    const groups = []; // 准备输出数组。
    for (let cy = 0; cy < SLOTS_Y; cy += 1) {
      // 按行遍历 slot。
      for (let cx = 0; cx < SLOTS_X; cx += 1) {
        const slotIndex = cy * SLOTS_X + cx; // 计算行优先索引。
        const slotX = cx * SLOT_W; // 计算 slot 左上角 X。
        const slotY = cy * SLOT_H; // 计算 slot 左上角 Y。
        const group = {
          index: slotIndex + 1, // 组编号 1..16。
          slot: { cx, cy, x: slotX, y: slotY, w: SLOT_W, h: SLOT_H }, // 保存 slot 元数据。
          label: { en: `Group ${slotIndex + 1}`, ja: `グループ ${slotIndex + 1}` }, // 默认标签，稍后覆盖。
          tiles: [], // 占位的 tile 列表。
        };
        let tileCounter = 0; // 初始化组内 tile 索引计数器。
        for (let row = 0; row < ROWS; row += 1) {
          // 遍历 slot 内的三行。
          for (let col = 0; col < 2; col += 1) {
            // 每行仅使用最右侧两列生成静态格。
            const tile = createTilePrototype(slotIndex, slotX, slotY, tileCounter); // 创建 tile 定义。
            group.tiles.push(tile); // 将 tile 收录到当前组。
            tileCounter += 1; // 递增计数器确保 id 与序号一致。
          }
        }
        groups.push(group); // 将组推入输出数组。
      }
    }
    // 按 order 数组将名称映射到指定 slot。
    order.forEach((slotNumber, lineIndex) => {
      const targetGroup = groups[slotNumber - 1]; // 读取目标组。
      const nameEntry = names[lineIndex]; // 对应的名称对象。
      if (targetGroup && nameEntry) {
        // 仅当组与名称都存在时才覆盖标签。
        targetGroup.label = { ...nameEntry }; // 使用浅拷贝写入双语标签。
      }
    });
    return groups;
  }

  function flattenTiles(groups) {
    // 将所有组内 tile 拉平成单一数组，便于注入素材索引。
    const result = []; // 准备输出数组。
    groups.forEach((group) => {
      group.tiles.forEach((tile) => {
        result.push(tile); // 顺序追加。
      });
    });
    return result;
  }

  async function loadNamesAndOrder() {
    // 并行加载名称文本与顺序映射，返回 {names, order}。
    let names = [];
    let order = [];
    try {
      const text = await loadText(NAMES_URL); // 尝试加载名称列表。
      names = parseNames(text); // 解析为名称数组。
    } catch (error) {
      console.warn('[A1DungeonSlicer] 名称列表加载失败，使用默认标签', error); // 输出警告。
      names = Array.from({ length: SLOTS_X * SLOTS_Y }, (_, i) => ({ en: `Group ${i + 1}`, ja: `グループ ${i + 1}` })); // 使用默认。
    }
    try {
      const json = await loadJSON(ORDER_URL); // 尝试加载映射文件。
      order = ensureOrderArray(json.order); // 校验并填充。
    } catch (error) {
      console.warn('[A1DungeonSlicer] 映射文件加载失败，使用顺序 1..16', error); // 输出警告。
      order = ensureOrderArray(null); // 使用默认顺序。
    }
    return { names, order };
  }

  const A1DungeonSlicer = {
    // 对外暴露的切片器对象。
    async slice(image) {
      // 主入口：根据图像与映射生成组与 tile 列表。
      if (!(image instanceof HTMLImageElement) || !image.complete) {
        // 若传入对象不是合法的 Image 则抛出错误。
        throw new Error('[A1DungeonSlicer] slice 需要已经加载完成的 Image');
      }
      if (image.naturalWidth !== IMG_W || image.naturalHeight !== IMG_H) {
        // 当图片尺寸异常时给出提示，仍尝试继续。
        console.warn('[A1DungeonSlicer] 图像尺寸与预期不符，将按照 512×384 规则切片');
      }
      const { names, order } = await loadNamesAndOrder(); // 加载名称与顺序。
      const groups = buildGroups(names, order); // 构建组结构并填充 tile。
      const flatTiles = flattenTiles(groups); // 拉平成 96 个 tile 列表。
      return { groups, flatTiles, names, order }; // 返回切片结果与元数据。
    },
  };

  window.RPG = window.RPG || {}; // 确保 RPG 命名空间存在。
  window.RPG.A1DungeonSlicer = A1DungeonSlicer; // 将切片器挂载到全局供其他模块调用。
})();
