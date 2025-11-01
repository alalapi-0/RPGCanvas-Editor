/* =============================================
 * 模块：SliceA1Dungeon 地牢 A1 图集切片器
 * 描述：读取 Dungeon_A1 名称与顺序映射，按照 4×4 槽位输出 96 个静态格元数据
 * 说明：第 8 轮重做，仅生成 32×32 静态切片信息并交由 Assets 模块注入
 * ============================================= */

(function () {
  // 使用立即执行函数封装作用域，避免内部变量泄露到全局。
  const PACK_NAME = 'Dungeon_A1';
  const TXT_SRC = 'assets/tiles/Dungeon_A1.txt';
  const MAP_SRC = 'assets/tiles/Dungeon_A1.map.json';

  const IMG_W = 512;
  const IMG_H = 384;
  const CELL = 32;
  const SLOT_W = 128;
  const SLOT_H = 96;
  const SLOTS_X = 4;
  const SLOTS_Y = 4;
  const COLS = 4;
  const ROWS = 3;
  const TOTAL_SLOTS = SLOTS_X * SLOTS_Y; // 16

  let cachedResult = null; // 缓存切片结果避免重复计算。
  let orderLogged = false; // 控制顺序日志仅输出一次。

  async function fetchText(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`[SliceA1Dungeon] 文本加载失败: ${url}`);
    }
    const text = await response.text();
    return text.replace(/^\uFEFF/, '');
  }

  async function fetchOptionalJSON(url) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        return null;
      }
      return await response.json();
    } catch (error) {
      console.warn('[SliceA1Dungeon] 映射文件读取失败，使用默认顺序', error);
      return null;
    }
  }

  function buildDefaultOrder() {
    return Array.from({ length: TOTAL_SLOTS }, (_, i) => i + 1);
  }

  function isCommentLine(line) {
    return line.startsWith('#') || line.startsWith('//');
  }

  function extractEnglishName(line, index) {
    if (!line) {
      return `Slot ${index}`;
    }
    const separatorIndex = line.indexOf('|');
    if (separatorIndex === -1) {
      return line.trim() || `Slot ${index}`;
    }
    const english = line.slice(0, separatorIndex).trim();
    return english || `Slot ${index}`;
  }

  function parseNames(text) {
    const lines = text.split(/\r?\n/);
    const filtered = [];
    for (let i = 0; i < lines.length; i += 1) {
      const trimmed = lines[i].trim();
      if (!trimmed || isCommentLine(trimmed)) {
        continue;
      }
      filtered.push(trimmed);
      if (filtered.length >= TOTAL_SLOTS) {
        break;
      }
    }
    const names = [];
    for (let index = 0; index < TOTAL_SLOTS; index += 1) {
      const label = filtered[index] || '';
      names.push(extractEnglishName(label, index + 1));
    }
    return names;
  }

  function normalizeOrder(rawOrder) {
    const fallback = buildDefaultOrder();
    if (!Array.isArray(rawOrder) || rawOrder.length !== TOTAL_SLOTS) {
      return fallback;
    }
    const seen = new Set();
    const normalized = [];
    for (let i = 0; i < rawOrder.length; i += 1) {
      const value = rawOrder[i];
      if (!Number.isInteger(value) || value < 1 || value > TOTAL_SLOTS || seen.has(value)) {
        return fallback;
      }
      seen.add(value);
      normalized.push(value);
    }
    return normalized;
  }

  async function loadNames() {
    try {
      const text = await fetchText(TXT_SRC);
      return parseNames(text);
    } catch (error) {
      console.warn('[SliceA1Dungeon] 名称文件缺失或解析失败，使用默认名称', error);
      return buildDefaultOrder().map((index) => `Slot ${index}`);
    }
  }

  async function loadOrder() {
    const json = await fetchOptionalJSON(MAP_SRC);
    if (!json || typeof json !== 'object') {
      return { order: buildDefaultOrder(), fromMap: false };
    }
    const normalized = normalizeOrder(json.order);
    return { order: normalized, fromMap: true };
  }

  function buildGroups(names, order) {
    const groups = new Array(TOTAL_SLOTS).fill(null);
    const flatTiles = [];
    for (let nameIndex = 0; nameIndex < TOTAL_SLOTS; nameIndex += 1) {
      const slotNumber = order[nameIndex];
      const slotIndex = Number.isInteger(slotNumber) ? slotNumber - 1 : nameIndex;
      const cx = slotIndex % SLOTS_X;
      const cy = Math.floor(slotIndex / SLOTS_X);
      const slotX = cx * SLOT_W;
      const slotY = cy * SLOT_H;
      const slotRect = [slotX, slotY, SLOT_W, SLOT_H];
      const groupId = slotIndex + 1;
      const label = names[nameIndex] || `Slot ${groupId}`;
      const tiles = [];
      for (let row = 0; row < ROWS; row += 1) {
        for (let col = 2; col < COLS; col += 1) {
          const sx = slotX + col * CELL;
          const sy = slotY + row * CELL;
          const id = `a1.dungeon.g${groupId}.r${row}.c${col}`;
          const rect = [sx, sy, CELL, CELL];
          const meta = { group: groupId, label, slotRect: [...slotRect] };
          const tile = {
            id,
            pack: PACK_NAME,
            rect,
            layer: 'ground',
            walkable: false,
            animated: 0,
            meta,
          };
          tiles.push(tile);
          flatTiles.push({ ...tile, meta: { ...meta } });
        }
      }
      groups[groupId - 1] = {
        index: groupId,
        label,
        slotRect,
        tiles,
      };
    }
    return { groups, flatTiles };
  }

  async function slice() {
    if (cachedResult) {
      return cachedResult;
    }
    const [names, orderInfo] = await Promise.all([loadNames(), loadOrder()]);
    const { groups, flatTiles } = buildGroups(names, orderInfo.order);
    if (orderInfo.fromMap && !orderLogged) {
      console.log(`[RPGCanvas] Dungeon_A1 order: ${orderInfo.order.join(',')}`);
      orderLogged = true;
    }
    cachedResult = {
      groups,
      flatTiles,
      names,
      order: orderInfo.order,
      sheetSize: { width: IMG_W, height: IMG_H },
    };
    return cachedResult;
  }

  window.RPG = window.RPG || {};
  window.RPG.SliceA1Dungeon = { slice, PACK_NAME, CELL, SLOT_W, SLOT_H, IMG_W, IMG_H };
})();
