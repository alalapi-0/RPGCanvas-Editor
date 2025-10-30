/* =============================================
 * 模块：Assets 素材清单管理器
 * 描述：负责加载 manifest.json、执行结构校验、建立索引并生成缩略图
 * 说明：第 7 轮扩展 A1 动画规则与共享绘制工具
 * ============================================= */

(function () {
  // 使用立即执行函数创建私有作用域，避免内部变量污染全局命名空间。
  const TILE_SIZE = 48; // 定义项目硬性约束的地图单元尺寸，便于统一引用。
  const ALLOWED_LAYERS = ['ground', 'structure', 'prop', 'overlay', 'decal']; // 定义允许使用的图层名称集合用于校验。
  const A1_BLOCK_WIDTH = 256; // 定义 A1 大区块的宽度 256 像素，用于对齐检查。
  const A1_STRIP_WIDTH = 64; // 定义 A1 单条帧带的宽度 64 像素，用于判断是否位于 f=0 帧带。
  const A1_CELL = 32; // 定义 A1 小片尺寸 32 像素，用于网格对齐校验。

  function drawFallback(ctx, dx, dy, dw, dh) {
    // 定义兜底绘制函数，在图像缺失或越界时渲染红底黑叉提示。
    ctx.save(); // 保存上下文状态，避免影响外部调用者的样式。
    ctx.imageSmoothingEnabled = false; // 禁用插值以保持像素风格。
    ctx.fillStyle = '#8b1a1a'; // 设置填充颜色为深红色突出警示效果。
    ctx.fillRect(dx, dy, dw, dh); // 绘制填充矩形覆盖整个目标区域。
    ctx.strokeStyle = '#111'; // 设置描边颜色为黑色形成对比。
    ctx.lineWidth = Math.max(2, Math.floor(Math.min(dw, dh) / 12)); // 根据目标尺寸动态调整线宽，确保叉线清晰。
    ctx.beginPath(); // 开始路径准备绘制叉线。
    ctx.moveTo(dx + 6, dy + 6); // 从左上角内缩 6 像素位置起笔第一条对角线。
    ctx.lineTo(dx + dw - 6, dy + dh - 6); // 绘制至右下角内缩位置形成第一条线。
    ctx.moveTo(dx + dw - 6, dy + 6); // 移动到右上角内缩位置准备第二条线。
    ctx.lineTo(dx + 6, dy + dh - 6); // 绘制到左下角内缩位置形成叉号。
    ctx.stroke(); // 渲染叉线显示警告。
    ctx.restore(); // 恢复上下文状态，避免影响后续绘制。
  }

  const Assets = {
    // 定义 Assets 单例对象，集中管理 manifest 数据、索引与图集缓存。
    manifest: null, // 保存原始 manifest JSON 数据，便于调试与导出。
    packs: [], // 存储规范化后的素材包数组，提供给 UI 遍历显示。
    tileIndex: new Map(), // 建立 tileId 到素材定义的映射，支持快速查询。
    images: new Map(), // 缓存已加载的 HTMLImageElement，避免重复请求。

    async loadManifest(url = 'assets/manifest.json') {
      // 异步加载 manifest 文件并执行结构校验的入口方法。
      this.manifest = null; // 重置 manifest 引用以防残留旧数据。
      this.packs = []; // 清空素材包数组确保重新加载时状态干净。
      this.tileIndex.clear(); // 清空索引映射防止旧条目干扰。
      if (typeof url !== 'string' || !url.trim()) {
        // 若传入的 URL 非法则直接抛出错误提示调用方。
        throw new Error('[Assets] loadManifest requires valid url'); // 抛出错误说明参数不正确。
      }
      const response = await fetch(url); // 通过 fetch 请求 manifest 文件内容。
      if (!response.ok) {
        // 当请求返回非 200 状态码时视为加载失败。
        throw new Error(`[Assets] failed to fetch manifest: ${response.status}`); // 抛出错误并包含状态码以便排查。
      }
      const data = await response.json(); // 解析响应体 JSON 数据。
      if (!data || typeof data !== 'object') {
        // 若解析结果不是对象则说明 manifest 结构异常。
        throw new Error('[Assets] manifest json invalid'); // 抛出错误提示文件内容无效。
      }
      if (data.tileSize !== TILE_SIZE) {
        // 验证 manifest 中的 tileSize 是否符合项目硬性约束。
        throw new Error('[Assets] manifest.tileSize must be 48'); // 抛出错误阻止继续解析。
      }
      if (!Array.isArray(data.packs)) {
        // packs 字段必须是数组，列出所有素材包。
        throw new Error('[Assets] manifest.packs must be array'); // 抛出错误提示结构不符。
      }
      const normalizedPacks = []; // 创建临时数组存放规范化后的素材包。
      data.packs.forEach((pack, packIndex) => {
        // 遍历每个素材包条目并逐一校验。
        if (!pack || typeof pack !== 'object') {
          // 若素材包不是对象则直接抛错。
          throw new Error(`[Assets] pack at index ${packIndex} invalid`); // 抛出错误指出位置。
        }
        if (typeof pack.name !== 'string' || !pack.name.trim()) {
          // 名称必须为非空字符串。
          throw new Error(`[Assets] pack.name invalid at index ${packIndex}`); // 抛出错误提示名称非法。
        }
        if (typeof pack.src !== 'string' || !pack.src.trim()) {
          // 图集路径同样必须为非空字符串。
          throw new Error(`[Assets] pack.src invalid at index ${packIndex}`); // 抛出错误提示路径非法。
        }
        if (!Array.isArray(pack.tiles)) {
          // tiles 字段必须是数组以存放素材定义。
          throw new Error(`[Assets] pack.tiles must be array at index ${packIndex}`); // 抛出错误提示结构异常。
        }
        const normalizedPack = {
          // 构造规范化后的素材包对象。
          name: pack.name.trim(), // 保存去除空格后的包名。
          src: pack.src.trim(), // 保存去除空格后的图集路径。
          tiles: [], // 准备存放规范化的素材定义数组。
        }; // 结束对象字面量定义。
        pack.tiles.forEach((tile, tileIndexInPack) => {
          // 遍历素材包内的每个素材条目执行校验。
          const normalizedTile = this._normalizeTile(tile, normalizedPack, packIndex, tileIndexInPack); // 调用内部方法返回规范化素材定义。
          if (this.tileIndex.has(normalizedTile.id)) {
            // 若索引表中已存在相同 id 则说明 manifest 存在重复条目。
            throw new Error(`[Assets] duplicated tile id: ${normalizedTile.id}`); // 抛出错误阻止加载继续。
          }
          this.tileIndex.set(normalizedTile.id, normalizedTile); // 将素材写入索引表便于快速检索。
          normalizedPack.tiles.push(normalizedTile); // 将素材加入当前包的列表供 UI 使用。
        });
        normalizedPacks.push(normalizedPack); // 将处理完成的素材包压入结果数组。
      });
      this.manifest = data; // 保存原始 manifest 数据供调试。
      this.packs = normalizedPacks; // 写入规范化素材包数组供外部访问。
      return true; // 返回 true 表示加载成功。
    },

    _normalizeTile(tile, normalizedPack, packIndex, tileIndexInPack) {
      // 内部辅助方法：校验并规范化单个素材条目。
      if (!tile || typeof tile !== 'object') {
        // 若素材条目不是对象则抛出错误指出所在包与索引。
        throw new Error(`[Assets] tile invalid at ${normalizedPack.name} index ${tileIndexInPack}`); // 抛出错误阻止继续处理。
      }
      if (typeof tile.id !== 'string' || !tile.id.trim()) {
        // 素材 id 必须为非空字符串。
        throw new Error(`[Assets] tile.id invalid at ${normalizedPack.name} index ${tileIndexInPack}`); // 抛出错误提示 id 非法。
      }
      const rect = tile.rect; // 读取 rect 字段用于校验。
      if (!Array.isArray(rect) || rect.length !== 4) {
        // rect 必须为长度为 4 的数组。
        throw new Error(`[Assets] tile.rect invalid at ${tile.id}`); // 抛出错误提示结构不正确。
      }
      const [rawX, rawY, rawW, rawH] = rect; // 解构出矩形的四个参数。
      if (!Number.isInteger(rawX) || !Number.isInteger(rawY) || !Number.isInteger(rawW) || !Number.isInteger(rawH)) {
        // 四个坐标值必须全为整数。
        throw new Error(`[Assets] tile.rect must contain integers at ${tile.id}`); // 抛出错误提示类型错误。
      }
      if (![TILE_SIZE, A1_CELL].includes(rawW) || ![TILE_SIZE, A1_CELL].includes(rawH)) {
        // A1 动画允许 32×32，小图块或常规规则块允许 48×48，其他尺寸视为非法。
        throw new Error(`[Assets] tile.rect size must be 32 or 48 for ${tile.id}`); // 抛出错误提示尺寸不符。
      }
      if (typeof tile.layer !== 'string' || !ALLOWED_LAYERS.includes(tile.layer)) {
        // 图层字段必须为允许列表中的字符串。
        throw new Error(`[Assets] tile.layer invalid at ${tile.id}`); // 抛出错误提示图层非法。
      }
      let affordances = undefined; // 预先处理 affordances 字段方便校验。
      if (tile.affordances !== undefined) {
        // 当提供 affordances 字段时需要确保为字符串数组。
        if (!Array.isArray(tile.affordances) || !tile.affordances.every((entry) => typeof entry === 'string')) {
          // 若结构或元素类型非法则抛出错误提醒开发者。
          throw new Error(`[Assets] tile.affordances invalid at ${tile.id}`); // 抛出错误阻止加载。
        }
        affordances = [...tile.affordances]; // 使用浅拷贝保留字符串数组。
      }
      const normalizedTile = {
        // 构造规范化后的素材定义对象。
        id: tile.id.trim(), // 记录去除空格后的唯一标识。
        rect: { x: rawX, y: rawY, width: rawW, height: rawH }, // 将矩形数据转换为具名属性形式。
        layer: tile.layer, // 保留合法的图层信息。
        animated: tile.animated === undefined ? undefined : tile.animated, // 保留动画帧数信息，静态素材则为 undefined。
        animStrideX: tile.animStrideX === undefined ? undefined : tile.animStrideX, // 保留横向帧偏移步长，用于 A1 动画。
        walkable: tile.walkable === undefined ? undefined : Boolean(tile.walkable), // 规范 walkable 字段为布尔或 undefined。
        blocks: tile.blocks === undefined ? undefined : Boolean(tile.blocks), // 规范 blocks 字段为布尔或 undefined。
        affordances, // 保留验证后的 affordances 字段或 undefined。
        occluderTopPx: tile.occluderTopPx === undefined ? undefined : tile.occluderTopPx, // 保留遮挡高度字段或 undefined。
        pack: normalizedPack.name, // 记录素材所属的素材包名称。
        src: normalizedPack.src, // 记录素材所属的图集文件名。
        validationWarnings: [], // 初始化警告列表以收集非致命问题。
      }; // 完成素材对象构建。
      if (normalizedTile.occluderTopPx !== undefined) {
        // 当提供遮挡高度时需要确保为非负整数。
        if (!Number.isInteger(normalizedTile.occluderTopPx) || normalizedTile.occluderTopPx < 0) {
          // 若值非法则抛出错误提示开发者。
          throw new Error(`[Assets] tile.occluderTopPx invalid at ${tile.id}`); // 抛出错误阻止加载。
        }
      }
      if (normalizedTile.animated !== undefined) {
        // 当素材声明 animated 字段时执行动画相关校验。
        if (!Number.isInteger(normalizedTile.animated) || normalizedTile.animated <= 0) {
          // animated 必须为正整数。
          throw new Error(`[Assets] tile.animated invalid at ${tile.id}`); // 抛出错误提示动画帧数非法。
        }
        if (!Number.isInteger(normalizedTile.animStrideX) || normalizedTile.animStrideX <= 0) {
          // animStrideX 必须同时存在且为正整数。
          throw new Error(`[Assets] tile.animStrideX invalid at ${tile.id}`); // 抛出错误提示帧偏移非法。
        }
        if (normalizedTile.rect.width === A1_CELL && normalizedTile.rect.height === A1_CELL) {
          // 针对 32×32 的 A1 动画素材执行附加对齐校验。
          if (normalizedTile.rect.y % A1_CELL !== 0) {
            // 若 Y 坐标未按 32 像素对齐则记录警告。
            normalizedTile.validationWarnings.push('rect Y 未按 32 对齐'); // 将警告信息写入列表。
          }
          if (normalizedTile.rect.x % A1_CELL !== 0) {
            // 若 X 坐标未按 32 像素对齐则记录警告。
            normalizedTile.validationWarnings.push('rect X 未按 32 对齐'); // 写入警告信息。
          }
          const blockStart = Math.floor(normalizedTile.rect.x / A1_BLOCK_WIDTH) * A1_BLOCK_WIDTH; // 计算当前所在大区块的起始 X。
          const offsetInBlock = normalizedTile.rect.x - blockStart; // 计算在大区块内的偏移量。
          if (offsetInBlock >= A1_STRIP_WIDTH) {
            // 若偏移量超出 0~63 范围则说明未位于 f=0 帧带。
            const message = `[Assets] animated tile rect not in f=0 strip: ${tile.id}`; // 构造警告信息便于输出。
            normalizedTile.validationWarnings.push('rect 不在 f=0 帧带'); // 将问题写入警告列表。
            console.warn(message); // 在控制台输出警告提醒开发者。
          }
        }
      } else if (normalizedTile.animStrideX !== undefined) {
        // 当素材未声明 animated 但提供 animStrideX 时给出提示。
        normalizedTile.validationWarnings.push('animStrideX 存在但 animated 缺失'); // 将提示写入警告列表。
        console.warn(`[Assets] animStrideX provided without animated on ${tile.id}`); // 输出警告帮助排查清单书写问题。
      }
      return normalizedTile; // 返回规范化后的素材定义对象。
    },

    getPacks() {
      // 返回规范化后的素材包数组给 UI 使用。
      return this.packs; // 直接返回内部数组引用，调用方需自行避免修改。
    },

    getTileById(id) {
      // 根据 tileId 从索引中查询素材定义。
      if (typeof id !== 'string' || !id.trim()) {
        // 若传入参数不是非空字符串则返回 undefined。
        return undefined; // 提前返回避免访问索引。
      }
      return this.tileIndex.get(id.trim()); // 从 Map 中读取素材定义对象。
    },

    async getImageFor(src) {
      // 根据图集文件名获取 HTMLImageElement，必要时加载并缓存。
      if (typeof src !== 'string' || !src.trim()) {
        // 若参数非法则抛出错误提示调用方修正。
        throw new Error('[Assets] getImageFor requires valid src'); // 抛出错误终止流程。
      }
      const key = src.trim(); // 去除两端空格形成缓存键。
      let image = this.images.get(key); // 从缓存中尝试读取图像对象。
      if (image instanceof HTMLImageElement) {
        // 若缓存中存在合法的 Image 实例。
        if (image.complete && image.naturalWidth > 0) {
          // 当图像已成功加载则直接返回实例。
          return image; // 返回缓存图片避免重复加载。
        }
        if (!image.complete) {
          // 若图像仍在加载过程中则等待其完成。
          await new Promise((resolve, reject) => {
            // 创建 Promise 监听 load 与 error 事件。
            const handleLoad = () => {
              // 定义加载成功回调。
              image.removeEventListener('error', handleError); // 移除错误事件监听避免内存泄漏。
              resolve(); // 解析 Promise 表示加载完成。
            };
            const handleError = () => {
              // 定义加载失败回调。
              image.removeEventListener('load', handleLoad); // 移除成功监听避免重复触发。
              reject(new Error(`[Assets] image failed while loading: ${key}`)); // 拒绝 Promise 并附带错误信息。
            };
            image.addEventListener('load', handleLoad, { once: true }); // 监听一次 load 事件等待图像完成。
            image.addEventListener('error', handleError, { once: true }); // 监听一次 error 事件捕获失败。
          });
          if (image.naturalWidth > 0) {
            // 再次确认图片是否成功加载。
            return image; // 返回成功加载的缓存图片。
          }
          this.images.delete(key); // 若 naturalWidth 仍为 0 则移除缓存条目以便重试。
        }
      }
      image = new Image(); // 创建新的 Image 对象准备加载图集。
      image.decoding = 'async'; // 指定异步解码避免阻塞渲染线程。
      this.images.set(key, image); // 将 Image 放入缓存避免并发重复创建。
      const loadPromise = new Promise((resolve, reject) => {
        // 创建 Promise 监听加载结果。
        image.addEventListener('load', () => {
          // 图像加载成功时触发的回调。
          if (image.naturalWidth === 0) {
            // 部分浏览器可能触发 load 但尺寸为 0，视为失败。
            this.images.delete(key); // 移除无效缓存条目。
            reject(new Error(`[Assets] image loaded with zero size: ${key}`)); // 拒绝 Promise 并提示错误。
            return; // 提前结束后续逻辑。
          }
          resolve(image); // 解析 Promise 返回成功加载的 Image。
        }, { once: true }); // 仅监听一次 load 事件避免重复触发。
        image.addEventListener('error', () => {
          // 图像加载失败时的回调。
          this.images.delete(key); // 移除失败的缓存条目以便重试。
          reject(new Error(`[Assets] failed to load image: ${key}`)); // 拒绝 Promise 并输出错误信息。
        }, { once: true }); // 仅监听一次 error 事件。
      });
      image.src = `assets/${key}`; // 设置图片源路径启动加载过程。
      return loadPromise; // 返回等待图像加载完成的 Promise。
    },

    drawToCanvas(ctx, tileDef, dx, dy, dw, dh, frameIndex = 0) {
      // 在指定上下文与矩形区域内绘制素材帧，返回是否成功绘制。
      if (!(ctx instanceof CanvasRenderingContext2D)) {
        // 若上下文不是 2D 上下文则直接返回 false。
        return false; // 提前结束避免抛错。
      }
      if (!tileDef || typeof tileDef !== 'object') {
        // 若素材定义缺失则绘制兜底图案提示错误。
        drawFallback(ctx, dx, dy, dw, dh); // 调用兜底函数绘制红底黑叉。
        return false; // 返回 false 表示未成功绘制真实素材。
      }
      const cacheKey = typeof tileDef.src === 'string' ? tileDef.src.trim() : ''; // 规范化图集路径字符串。
      const image = cacheKey ? this.images.get(cacheKey) : null; // 尝试从缓存读取图像实例。
      if (!(image instanceof HTMLImageElement) || !image.complete || image.naturalWidth === 0) {
        // 若图像尚未准备好则绘制兜底并触发加载。
        drawFallback(ctx, dx, dy, dw, dh); // 绘制红底黑叉提示素材未就绪。
        if (cacheKey) {
          // 当存在合法路径时尝试异步加载图像。
          this.getImageFor(cacheKey).then(() => {
            // 图像加载完成后尝试请求刷新面板与画布。
            if (ctx.canvas) {
              // 若当前上下文关联到某个画布则重新绘制以替换兜底。
              window.requestAnimationFrame(() => {
                // 使用 requestAnimationFrame 保证在绘制循环中执行。
                this.drawToCanvas(ctx, tileDef, dx, dy, dw, dh, frameIndex); // 再次尝试绘制真实素材。
              });
            }
            const renderer = window.RPG?.Renderer; // 读取全局渲染器引用。
            if (renderer && typeof renderer.requestRender === 'function') {
              // 若渲染器存在则请求一次重绘以刷新地图。
              renderer.requestRender(); // 通知渲染器有新资源可用。
            }
          }).catch((error) => {
            // 当加载失败时输出警告信息。
            console.warn('[Assets] drawToCanvas image load failed', tileDef.id, error); // 输出日志辅助排查。
          });
        }
        return false; // 返回 false 表示当前未绘制真实素材。
      }
      const rect = tileDef.rect || { x: 0, y: 0, width: TILE_SIZE, height: TILE_SIZE }; // 读取素材矩形定义。
      const totalFrames = tileDef.animated !== undefined ? Math.max(1, tileDef.animated) : 1; // 计算素材总帧数至少为 1。
      const strideX = tileDef.animated !== undefined ? tileDef.animStrideX || rect.width : rect.width; // 若为动画素材使用 animStrideX，否则等于帧宽。
      const safeIndexBase = Number.isInteger(frameIndex) ? frameIndex : 0; // 将传入帧索引规整为整数。
      const wrappedIndex = totalFrames > 0 ? ((safeIndexBase % totalFrames) + totalFrames) % totalFrames : 0; // 通过取模将帧索引限制在合法范围内。
      const sx = rect.x + wrappedIndex * strideX; // 计算源图像 X 坐标偏移。
      const sy = rect.y; // 源图像 Y 坐标即 rect.y。
      const sw = rect.width; // 源图像宽度为 rect.width（可能 32 或 48）。
      const sh = rect.height; // 源图像高度为 rect.height（可能 32 或 48）。
      if (sx + sw > image.naturalWidth || sy + sh > image.naturalHeight) {
        // 当源矩形越界时绘制兜底并输出警告。
        console.warn('[Assets] tile rect out of bounds', tileDef.id, sx, sy, sw, sh); // 输出警告说明 manifest 坐标不正确。
        drawFallback(ctx, dx, dy, dw, dh); // 绘制红底黑叉提示错误。
        return false; // 返回 false 表示未绘制真实素材。
      }
      ctx.save(); // 保存上下文状态以便设置局部样式。
      ctx.imageSmoothingEnabled = false; // 禁用插值保持像素风格清晰。
      ctx.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh); // 将源图像的指定区域绘制到目标矩形。
      if (Array.isArray(tileDef.validationWarnings) && tileDef.validationWarnings.length > 0) {
        // 若素材存在校验警告则在缩略图上叠加红色描边提醒。
        ctx.strokeStyle = 'rgba(231, 76, 60, 0.85)'; // 设置描边颜色为半透明红色。
        ctx.lineWidth = 3; // 设置描边线宽增强视觉提示。
        ctx.strokeRect(dx + 1.5, dy + 1.5, dw - 3, dh - 3); // 绘制红色描边框提示开发者检查 manifest。
      }
      ctx.restore(); // 恢复上下文状态避免影响外部绘制。
      return true; // 返回 true 表示成功绘制真实素材帧。
    },

    makeTileThumb(tileDef, frameIndex = 0) {
      // 根据素材定义生成 48×48 缩略图画布并返回。
      const canvas = document.createElement('canvas'); // 创建离屏 Canvas 元素用于绘制缩略图。
      canvas.width = TILE_SIZE; // 将画布宽度固定为 48 像素。
      canvas.height = TILE_SIZE; // 将画布高度固定为 48 像素。
      const ctx = canvas.getContext('2d'); // 获取 2D 绘图上下文执行绘制指令。
      if (!ctx) {
        // 若无法获取上下文则直接返回空白画布。
        return canvas; // 返回画布避免调用方崩溃。
      }
      this.drawToCanvas(ctx, tileDef, 0, 0, TILE_SIZE, TILE_SIZE, frameIndex); // 调用共享绘制函数生成缩略图或兜底提示。
      return canvas; // 返回生成的缩略图画布供 UI 使用。
    },
  };

  window.RPG = window.RPG || {}; // 确保全局命名空间存在以挂载模块。
  window.RPG.Assets = Assets; // 将 Assets 单例挂载到 RPG 命名空间供其他模块访问。
  window.Assets = Assets; // 同时暴露到全局作用域以便在控制台调试。
})();
