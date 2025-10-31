/* =============================================
 * 模块：SliceA1Dungeon 地牢 A1 图集切片器
 * 描述：在应用启动时读取 Dungeon_A1 资源，按照 4×4 组槽输出 96 个静态格
 * 说明：第 8 轮实现，暂不包含自动边角与动画渲染，仅登记元数据
 * ============================================= */

(function () {
  // 使用立即执行函数封装作用域，避免内部变量污染全局命名空间。
  const PACK_NAME = 'Dungeon_A1'; // 定义素材包名称常量，方便后续复用。
  const IMG_SRC = 'assets/tiles/Dungeon_A1.png'; // 定义图集图片的相对路径。
  const TXT_SRC = 'assets/tiles/Dungeon_A1.txt'; // 定义名称文件的相对路径。
  const MAP_SRC = 'assets/tiles/Dungeon_A1.map.json'; // 定义可选顺序映射文件的相对路径。

  const IMG_W = 512; // 规定整张图集的像素宽度 512，用于尺寸校验。
  const IMG_H = 384; // 规定整张图集的像素高度 384，用于尺寸校验。
  const SLOT_W = 128; // 规定单个组槽的像素宽度 128。
  const SLOT_H = 96; // 规定单个组槽的像素高度 96。
  const CELL = 32; // 规定基础子格尺寸 32 像素。
  const SLOTS_X = 4; // 横向共有 4 个组槽。
  const SLOTS_Y = 4; // 纵向共有 4 个组槽。
  const COLS = 4; // 每个组槽横向分为 4 列子格。
  const ROWS = 3; // 每个组槽纵向分为 3 行子格。
  const TOTAL_SLOTS = SLOTS_X * SLOTS_Y; // 计算组槽总数 16，便于循环使用。

  const ANIMATED = 3; // 固定动画帧数为 3，按照 A1 滑窗规则。
  const ANIM_WINDOW = [0, 1, 2]; // 固定滑窗的起始列索引列表。
  const ANIM_PAIR_W = 2; // 固定每帧占用两列子格宽度。

  let cachedMeta = null; // 缓存名称与顺序元数据，避免重复请求。
  let orderLogged = false; // 标记是否已经在控制台输出过顺序日志。

  function loadImage(url) {
    // 异步加载图集图片，返回 Promise< HTMLImageElement >。
    return new Promise((resolve, reject) => {
      const image = new Image(); // 创建图片对象。
      image.onload = () => resolve(image); // 加载成功时解析 Promise。
      image.onerror = () => reject(new Error(`[SliceA1Dungeon] 图片加载失败: ${url}`)); // 加载失败时拒绝 Promise。
      image.src = url; // 触发实际的网络请求。
    });
  }

  async function fetchText(url) {
    // 使用 fetch 读取纯文本文件，并去除可能存在的 BOM。
    const response = await fetch(url); // 发送网络请求。
    if (!response.ok) {
      throw new Error(`[SliceA1Dungeon] 文本加载失败: ${url}`); // 状态码异常时抛出错误。
    }
    const text = await response.text(); // 解析响应体为字符串。
    return text.replace(/^\uFEFF/, ''); // 去除 UTF-8 BOM 以免干扰解析。
  }

  async function fetchOptionalJSON(url) {
    // 读取可选的 JSON 文件，失败时返回 null。
    try {
      const response = await fetch(url); // 发起网络请求。
      if (!response.ok) {
        return null; // 当文件不存在或返回 404 时视为未提供映射。
      }
      return await response.json(); // 解析 JSON 并返回对象。
    } catch (error) {
      console.warn('[SliceA1Dungeon] 映射文件读取失败，使用默认顺序', error); // 输出警告提示。
      return null; // 发生异常时仍然返回 null。
    }
  }

  function defaultLabel(index) {
    // 构造默认的组名称对象，包含英文与日文占位文本。
    return { en: `Group ${index}`, ja: `グループ ${index}` }; // 返回带有双语字段的对象。
  }

  function parseNameLine(line, index) {
    // 将单行 `English|日本語` 解析成 {en, ja} 结构。
    const trimmed = line.trim(); // 去除行首尾空白字符。
    if (!trimmed) {
      return defaultLabel(index); // 空行时回退到默认名称。
    }
    const parts = trimmed.split('|'); // 根据竖线分割英文与日文。
    const en = (parts[0] || `Group ${index}`).trim(); // 读取英文名称或使用默认值。
    const ja = (parts[1] || en).trim(); // 若缺失日文则回退到英文文本。
    return { en, ja }; // 返回解析后的名称对象。
  }

  function parseNames(text) {
    // 将文本解析成长度为 16 的名称数组。
    const lines = text.split(/\r?\n/); // 按行拆分文本。
    const names = []; // 创建结果数组。
    for (let i = 0; i < TOTAL_SLOTS; i += 1) {
      const line = lines[i] !== undefined ? lines[i] : ''; // 读取对应行，超出范围时视为空字符串。
      names.push(parseNameLine(line, i + 1)); // 解析并写入名称数组。
    }
    return names; // 返回最终的名称列表。
  }

  function buildDefaultOrder() {
    // 生成顺序 1..16 的默认映射数组。
    return Array.from({ length: TOTAL_SLOTS }, (_, i) => i + 1); // 使用行优先顺序填充数组。
  }

  function normalizeOrder(rawOrder) {
    // 将 map.json 中的 order 规范化为 1..16 的整数数组。
    const fallback = buildDefaultOrder(); // 准备默认顺序备用。
    if (!Array.isArray(rawOrder)) {
      return fallback; // 非数组时直接返回默认顺序。
    }
    const normalized = fallback.slice(); // 先复制默认顺序以保证长度正确。
    rawOrder.forEach((value, index) => {
      if (!Number.isInteger(value)) {
        return; // 忽略非法条目，保留默认值。
      }
      if (value < 1 || value > TOTAL_SLOTS) {
        return; // 超出范围时忽略。
      }
      normalized[index] = value; // 写入合法的 slot 编号。
    });
    return normalized; // 返回规范化后的数组。
  }

  async function ensureMeta() {
    // 读取并缓存名称与顺序元数据。
    if (cachedMeta) {
      return cachedMeta; // 若已缓存则直接返回。
    }
    let names = []; // 准备名称数组变量。
    try {
      const text = await fetchText(TXT_SRC); // 读取名称文本文件。
      names = parseNames(text); // 解析成名称数组。
    } catch (error) {
      console.warn('[SliceA1Dungeon] 名称文件缺失，使用默认标签', error); // 输出警告提示回退到默认值。
      names = buildDefaultOrder().map((index) => defaultLabel(index)); // 生成默认名称数组。
    }
    const json = await fetchOptionalJSON(MAP_SRC); // 尝试读取顺序映射。
    const order = json ? normalizeOrder(json.order) : buildDefaultOrder(); // 根据 JSON 或默认规则生成顺序。
    const hasMap = Boolean(json); // 记录是否成功读取 map.json。
    cachedMeta = { names, order, hasMap }; // 缓存解析结果。
    return cachedMeta; // 返回缓存对象。
  }

  function buildSlices(order, names) {
    // 根据顺序与名称生成组结构与扁平化 tile 列表。
    const groupsByIndex = new Array(TOTAL_SLOTS).fill(null); // 创建按 slot 编号存放组的数组。
    const flatTiles = []; // 准备输出的 96 个静态格数组。
    for (let nameIndex = 0; nameIndex < TOTAL_SLOTS; nameIndex += 1) {
      const slotNumber = order[nameIndex]; // 读取当前名称映射到的 slot 编号（1 基）。
      const slotIndex = Number.isInteger(slotNumber) ? slotNumber - 1 : nameIndex; // 转换为 0 基索引，非法时退回到行号。
      const cx = slotIndex % SLOTS_X; // 计算该 slot 的列坐标。
      const cy = Math.floor(slotIndex / SLOTS_X); // 计算该 slot 的行坐标。
      const slotX = cx * SLOT_W; // 计算 slot 左上角的像素 X。
      const slotY = cy * SLOT_H; // 计算 slot 左上角的像素 Y。
      const label = names[nameIndex] || defaultLabel(slotIndex + 1); // 读取当前名称或默认值。
      const tiles = []; // 创建组内 tile 列表。
      for (let r = 0; r < ROWS; r += 1) {
        for (let c = 2; c < COLS; c += 1) {
          const sx = slotX + c * CELL; // 计算静态格源区域的 X。
          const sy = slotY + r * CELL; // 计算静态格源区域的 Y。
          const id = `a1.dungeon.g${slotIndex + 1}.r${r}.c${c}`; // 构造唯一的 tileId。
          const tile = {
            id, // 记录唯一 ID。
            pack: PACK_NAME, // 指定所属素材包。
            group: slotIndex + 1, // 记录组编号（1 基）。
            rect: [sx, sy, CELL, CELL], // 使用数组表示源矩形。
            layer: 'ground', // A1 素材默认归属地面层。
            animated: ANIMATED, // 固定写入三帧动画。
            animWindowCols: [...ANIM_WINDOW], // 写入滑窗起点数组副本。
            animPairW: ANIM_PAIR_W, // 写入每帧占用两列的信息。
          }; // 构造完成的 tile 定义对象。
          tiles.push(tile); // 将 tile 收录到当前组。
          flatTiles.push(tile); // 同时写入扁平化数组。
        }
      }
      const group = {
        index: slotIndex + 1, // 组编号（1 基）。
        label, // 组标签，包含 en/ja。
        slot: { x: slotX, y: slotY, w: SLOT_W, h: SLOT_H }, // 记录 slot 的像素矩形。
        tiles, // 组内的 6 个静态格。
      }; // 构造组对象。
      groupsByIndex[slotIndex] = group; // 按 slot 编号写入数组。
    }
    const groups = groupsByIndex.filter((group) => group !== null); // 过滤出有效的组对象并保持 1..16 顺序。
    return { groups, flatTiles }; // 返回切片结果。
  }

  async function slice(image) {
    // 对外暴露的切片函数，可选地接收已加载的 Image。
    let targetImage = image; // 默认复用传入的图片对象。
    if (!(targetImage instanceof HTMLImageElement)) {
      targetImage = await loadImage(IMG_SRC); // 当未传入图片时主动加载一次。
    }
    if (!targetImage.complete) {
      throw new Error('[SliceA1Dungeon] 图集尚未加载完成'); // 图片尚未加载成功时抛出错误。
    }
    if (targetImage.naturalWidth !== IMG_W || targetImage.naturalHeight !== IMG_H) {
      console.warn('[SliceA1Dungeon] 图集尺寸异常，仍按 512×384 规则切片'); // 尺寸不符时输出警告。
    }
    const meta = await ensureMeta(); // 读取名称与顺序元数据。
    const { groups, flatTiles } = buildSlices(meta.order, meta.names); // 按顺序生成 16 组静态格。
    if (meta.hasMap && !orderLogged) {
      console.log(`[RPGCanvas] Dungeon_A1 order: ${meta.order.join(',')}`); // 首次检测到 map.json 时输出顺序日志。
      orderLogged = true; // 更新标记避免重复输出。
    }
    return { groups, flatTiles, names: meta.names, order: meta.order, hasMap: meta.hasMap }; // 返回完整的切片结果。
  }

  window.RPG = window.RPG || {}; // 确保全局命名空间存在。
  window.RPG.SliceA1Dungeon = { slice }; // 将切片函数导出到全局供 Assets 模块调用。
})();
