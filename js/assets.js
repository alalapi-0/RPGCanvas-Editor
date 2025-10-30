/* =============================================
 * 模块：Assets 素材清单管理器
 * 描述：负责加载 manifest.json、执行结构校验、建立索引并生成缩略图
 * 说明：第 4 轮新增，用于支撑素材面板的静态预览与检索
 * ============================================= */

(function () {
  // 使用立即执行函数创建私有作用域，避免内部变量污染全局命名空间。
  const ALLOWED_LAYERS = ['ground', 'structure', 'prop', 'overlay', 'decal']; // 定义允许的图层名称集合用于校验。

  const Assets = {
    // 定义 Assets 单例对象，集中管理 manifest 数据与图集缓存。
    manifest: null, // 保存原始 manifest JSON 数据，便于调试与后续功能引用。
    packs: [], // 存储规范化后的素材包数组，每个元素包含 name、src 与 tiles。
    tileIndex: new Map(), // 建立 tileId 到 tile 定义的映射，支持快速查询。
    images: new Map(), // 缓存图集图片对象，键为 src，值为 HTMLImageElement。

    async loadManifest(url = 'assets/manifest.json') {
      // 异步加载并解析 manifest 文件，默认路径指向 assets/manifest.json。
      this.manifest = null; // 重置 manifest 引用，确保重新加载时不会残留旧数据。
      this.packs = []; // 清空已解析的包数组，为新数据做准备。
      this.tileIndex.clear(); // 清空 tile 索引，避免旧条目污染新结果。
      if (typeof url !== 'string' || !url.trim()) {
        // 若传入的 URL 不是非空字符串，则直接抛出错误提示调用方。
        throw new Error('[Assets] loadManifest requires valid url'); // 抛出错误说明参数非法。
      }
      const response = await fetch(url); // 通过 fetch 读取 manifest 文件内容。
      if (!response.ok) {
        // 当 HTTP 请求返回非 200 状态时，视为加载失败。
        throw new Error(`[Assets] failed to fetch manifest: ${response.status}`); // 抛出错误并包含状态码以便排查。
      }
      const data = await response.json(); // 解析返回的 JSON 数据。
      if (!data || typeof data !== 'object') {
        // 若解析结果不是对象，则说明文件结构不合法。
        throw new Error('[Assets] manifest json invalid'); // 抛出错误提示 manifest 结构异常。
      }
      if (data.tileSize !== 48) {
        // 校验 tileSize 是否固定为 48，符合项目硬性约束。
        throw new Error('[Assets] manifest.tileSize must be 48'); // 不符合时抛出错误阻止继续解析。
      }
      if (!Array.isArray(data.packs)) {
        // packs 字段必须为数组，记录素材包列表。
        throw new Error('[Assets] manifest.packs must be array'); // 若不是数组则抛出错误。
      }
      const normalizedPacks = []; // 创建临时数组存放规范化后的包数据。
      data.packs.forEach((pack, packIndex) => {
        // 遍历每个素材包条目并进行校验。
        if (!pack || typeof pack !== 'object') {
          // pack 必须为对象。
          throw new Error(`[Assets] pack at index ${packIndex} invalid`); // 抛出错误指出具体位置。
        }
        if (typeof pack.name !== 'string' || !pack.name.trim()) {
          // name 需为非空字符串。
          throw new Error(`[Assets] pack.name invalid at index ${packIndex}`); // 抛出错误提示名称非法。
        }
        if (typeof pack.src !== 'string' || !pack.src.trim()) {
          // src 也必须为非空字符串，对应图集文件名。
          throw new Error(`[Assets] pack.src invalid at index ${packIndex}`); // 抛出错误提示路径非法。
        }
        if (!Array.isArray(pack.tiles)) {
          // tiles 字段必须为数组。
          throw new Error(`[Assets] pack.tiles must be array at index ${packIndex}`); // 抛出错误提示结构异常。
        }
        const normalizedPack = {
          name: pack.name.trim(), // 规范化包名称，去除首尾空格。
          src: pack.src.trim(), // 规范化图集路径字符串。
          tiles: [], // 预先创建 tiles 数组以填充规范化后的 tile 定义。
        }; // 构造规范化素材包对象。
        pack.tiles.forEach((tile, tileIndexInPack) => {
          // 遍历素材包中的每个 tile 进行校验与规范化。
          if (!tile || typeof tile !== 'object') {
            // 每个 tile 必须是对象。
            throw new Error(`[Assets] tile invalid at ${pack.name} index ${tileIndexInPack}`); // 抛出错误指出问题位置。
          }
          if (typeof tile.id !== 'string' || !tile.id.trim()) {
            // tile.id 需为非空字符串，用于唯一标识素材。
            throw new Error(`[Assets] tile.id invalid at ${pack.name} index ${tileIndexInPack}`); // 抛出错误提示 id 非法。
          }
          const rect = tile.rect; // 读取 rect 字段用于校验与规范化。
          if (!Array.isArray(rect) || rect.length !== 4) {
            // rect 必须是长度为 4 的数组 [x, y, w, h]。
            throw new Error(`[Assets] tile.rect invalid at ${tile.id}`); // 抛出错误说明 rect 结构错误。
          }
          const [x, y, w, h] = rect; // 解构四个坐标值。
          if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(w) || !Number.isInteger(h)) {
            // rect 中的每个值都必须是整数。
            throw new Error(`[Assets] tile.rect must contain integers at ${tile.id}`); // 抛出错误提示类型错误。
          }
          if (w !== 48 || h !== 48) {
            // 每个 tile 的宽高必须与 tileSize 一致。
            throw new Error(`[Assets] tile.rect size must be 48 for ${tile.id}`); // 抛出错误提示尺寸不匹配。
          }
          if (typeof tile.layer !== 'string' || !ALLOWED_LAYERS.includes(tile.layer)) {
            // layer 字段必须为允许列表中的字符串。
            throw new Error(`[Assets] tile.layer invalid at ${tile.id}`); // 抛出错误提示图层非法。
          }
          let animated = tile.animated === undefined ? 1 : tile.animated; // 若未提供 animated 则默认 1 帧。
          if (!Number.isInteger(animated) || animated < 1) {
            // animated 必须是大于等于 1 的整数。
            throw new Error(`[Assets] tile.animated invalid at ${tile.id}`); // 抛出错误提示动画帧数非法。
          }
          let occluderTopPx = tile.occluderTopPx; // 读取可选的遮挡高度字段。
          if (occluderTopPx !== undefined) {
            // 若提供该字段则进行类型校验。
            if (!Number.isInteger(occluderTopPx) || occluderTopPx < 0) {
              // 遮挡高度需为非负整数。
              throw new Error(`[Assets] tile.occluderTopPx invalid at ${tile.id}`); // 抛出错误提示参数非法。
            }
          }
          let affordances = undefined; // 准备处理可选的 affordances 字段。
          if (tile.affordances !== undefined) {
            // 若提供 affordances 列表则执行校验。
            if (!Array.isArray(tile.affordances) || !tile.affordances.every((entry) => typeof entry === 'string')) {
              // 列表必须全为字符串。
              throw new Error(`[Assets] tile.affordances invalid at ${tile.id}`); // 抛出错误提示结构非法。
            }
            affordances = [...tile.affordances]; // 使用浅拷贝保存字符串数组。
          }
          const normalizedTile = {
            id: tile.id.trim(), // 去除首尾空格后的素材唯一标识。
            rect: { x, y, width: w, height: h }, // 将 rect 转换为具名属性的对象形式，便于后续使用。
            layer: tile.layer, // 保留合法的图层名称。
            animated, // 保存动画帧数，静态素材为 1。
            walkable: tile.walkable === undefined ? undefined : Boolean(tile.walkable), // 规范 walkable 字段为布尔或 undefined。
            blocks: tile.blocks === undefined ? undefined : Boolean(tile.blocks), // 规范 blocks 字段为布尔或 undefined。
            affordances, // 存储可选的 affordances 列表或 undefined。
            occluderTopPx, // 存储可选的遮挡高度，未提供则为 undefined。
            pack: normalizedPack.name, // 记录所属素材包名称，便于 UI 反查。
            src: normalizedPack.src, // 记录素材所属图集路径。
          }; // 构建规范化后的 tile 定义对象。
          if (this.tileIndex.has(normalizedTile.id)) {
            // 若 tileIndex 中已存在同名条目则说明出现重复 id。
            throw new Error(`[Assets] duplicated tile id: ${normalizedTile.id}`); // 抛出错误阻止加载继续。
          }
          this.tileIndex.set(normalizedTile.id, normalizedTile); // 将规范化 tile 写入索引表。
          normalizedPack.tiles.push(normalizedTile); // 将 tile 添加到当前素材包的 tiles 列表。
        });
        normalizedPacks.push(normalizedPack); // 将处理完成的包写入临时数组。
      });
      this.manifest = data; // 保存原始 manifest 数据供调试与导出使用。
      this.packs = normalizedPacks; // 将规范化素材包数组写入实例属性。
      return true; // 返回 true 表示加载与校验顺利完成。
    },

    getPacks() {
      // 返回规范化的素材包数组引用，供 UI 渲染与其他模块访问。
      return this.packs; // 直接返回 packs 属性，调用方应避免就地修改。
    },

    getTileById(id) {
      // 根据 tileId 从索引中检索素材定义。
      if (typeof id !== 'string' || !id.trim()) {
        // 若参数不是非空字符串则返回 undefined。
        return undefined; // 直接返回 undefined 表示未找到或输入非法。
      }
      return this.tileIndex.get(id.trim()); // 从 Map 中获取对应的 tile 定义对象。
    },

    async getImageFor(src) {
      // 根据图集文件名获取 HTMLImageElement，必要时异步加载并缓存。
      if (typeof src !== 'string' || !src.trim()) {
        // 若输入非法则抛出错误以提示调用方。
        throw new Error('[Assets] getImageFor requires valid src'); // 抛出错误说明参数不合法。
      }
      const key = src.trim(); // 规范化键值避免出现多余空格。
      let image = this.images.get(key); // 从缓存中尝试读取图像对象。
      if (image instanceof HTMLImageElement) {
        // 若缓存命中且为 HTMLImageElement。
        if (image.complete && image.naturalWidth > 0) {
          // 当图像已成功加载完成则直接返回缓存对象。
          return image; // 返回缓存图片避免重复加载。
        }
        if (!image.complete) {
          // 若图像仍在加载，则等待其完成。
          await new Promise((resolve, reject) => {
            // 创建 Promise 监听加载与错误事件。
            const handleLoad = () => {
              image.removeEventListener('error', handleError); // 移除错误监听避免内存泄漏。
              resolve(); // 解析 Promise 表示加载完成。
            }; // 定义加载成功回调。
            const handleError = () => {
              image.removeEventListener('load', handleLoad); // 移除加载监听。
              reject(new Error(`[Assets] image failed while loading: ${key}`)); // 解析失败提示加载错误。
            }; // 定义加载失败回调。
            image.addEventListener('load', handleLoad, { once: true }); // 监听一次 load 事件。
            image.addEventListener('error', handleError, { once: true }); // 监听一次 error 事件。
          });
          if (image.naturalWidth > 0) {
            // 再次确认图像是否成功加载。
            return image; // 若成功则返回缓存图片。
          }
          this.images.delete(key); // 若 naturalWidth 仍为 0，说明加载失败，需要移除缓存条目。
        }
      }
      image = new Image(); // 创建新的 Image 实例准备加载图集。
      image.decoding = 'async'; // 设置解码模式为异步，有助于避免主线程阻塞。
      this.images.set(key, image); // 将 Image 放入缓存，避免并发重复创建。
      const loadPromise = new Promise((resolve, reject) => {
        // 创建 Promise 监听加载结果。
        image.addEventListener('load', () => {
          if (image.naturalWidth === 0) {
            // 部分浏览器可能触发 load 但尺寸为 0，仍视为失败。
            this.images.delete(key); // 移除失效缓存。
            reject(new Error(`[Assets] image loaded with zero size: ${key}`)); // 拒绝 Promise 提示错误。
            return; // 提前结束后续逻辑。
          }
          resolve(image); // 加载成功时解析 Promise 返回 Image 对象。
        }, { once: true }); // 仅监听一次 load 事件。
        image.addEventListener('error', () => {
          this.images.delete(key); // 出错时移除缓存，便于下次重试。
          reject(new Error(`[Assets] failed to load image: ${key}`)); // 拒绝 Promise 报告错误。
        }, { once: true }); // 仅监听一次 error 事件。
      });
      image.src = `assets/${key}`; // 设置图片来源路径，开始加载图集文件。
      return loadPromise; // 返回等待加载完成的 Promise。
    },

    makeTileThumb(tileDef) {
      // 根据 tile 定义生成 48×48 的缩略图 Canvas 并返回。
      const tileSize = this.manifest ? this.manifest.tileSize : 48; // 读取 manifest 中的 tileSize，默认退回 48。
      const canvas = document.createElement('canvas'); // 创建离屏 Canvas 元素用于绘制缩略图。
      canvas.width = tileSize; // 将画布宽度设为 tileSize，符合项目固定尺寸。
      canvas.height = tileSize; // 将画布高度设为 tileSize。
      const ctx = canvas.getContext('2d'); // 获取 2D 绘图上下文以执行绘制指令。
      if (!ctx) {
        // 若无法获取上下文则直接返回空 Canvas。
        return canvas; // 返回未绘制内容的画布，避免抛错导致 UI 中断。
      }
      ctx.imageSmoothingEnabled = false; // 禁用插值，确保像素风格清晰。

      const drawFallback = () => {
        // 定义兜底绘制逻辑，在图片加载失败或越界时显示红底黑叉。
        ctx.fillStyle = '#8b1a1a'; // 设置填充颜色为深红色以示警告。
        ctx.fillRect(0, 0, tileSize, tileSize); // 绘制实心背景填满画布。
        ctx.strokeStyle = '#111'; // 设置描边颜色为黑色。
        ctx.lineWidth = 6; // 设置描边线宽使叉号明显。
        ctx.beginPath(); // 开始第一条叉线。
        ctx.moveTo(8, 8); // 从左上角略内侧起笔。
        ctx.lineTo(tileSize - 8, tileSize - 8); // 绘制到右下角形成对角线。
        ctx.moveTo(tileSize - 8, 8); // 移动到右上角附近准备第二条线。
        ctx.lineTo(8, tileSize - 8); // 绘制到左下角形成叉号。
        ctx.stroke(); // 渲染描边路径。
      }; // 结束兜底绘制函数定义。

      if (!tileDef || typeof tileDef !== 'object') {
        // 若未提供合法的 tile 定义，则直接绘制兜底图案。
        drawFallback(); // 绘制红底黑叉提示错误。
        return canvas; // 返回生成的 Canvas。
      }

      this.getImageFor(tileDef.src)
        .then((image) => {
          // 图片加载成功后执行的回调。
          const rect = tileDef.rect || { x: 0, y: 0, width: tileSize, height: tileSize }; // 获取图块的矩形区域。
          const frameWidth = rect.width; // 读取帧宽度用于后续绘制。
          const frameHeight = rect.height; // 读取帧高度用于后续绘制。
          const frameIndex = 0; // 缩略图仅展示第 0 帧，后续迭代将扩展动画预览。
          const sx = rect.x + frameWidth * frameIndex; // 计算源图像 X 坐标。
          const sy = rect.y; // 源图像 Y 坐标即 rect.y。
          if (sx + frameWidth > image.naturalWidth || sy + frameHeight > image.naturalHeight) {
            // 当指定区域超出图集范围时执行兜底绘制。
            console.warn(`[Assets] tile rect out of bounds for ${tileDef.id}`); // 输出警告提示越界信息。
            drawFallback(); // 绘制兜底图案提示问题。
            return; // 结束回调避免继续绘制。
          }
          ctx.clearRect(0, 0, tileSize, tileSize); // 清空画布以防残留。
          ctx.drawImage(image, sx, sy, frameWidth, frameHeight, 0, 0, tileSize, tileSize); // 将首帧区域绘制到缩略图。
        })
        .catch((error) => {
          // 图片加载失败时执行的回调。
          console.warn('[Assets] image load failed for thumb', tileDef.id, error); // 输出警告方便调试。
          drawFallback(); // 绘制兜底图案维持 UI 完整。
        });

      return canvas; // 返回立即可用的 Canvas，图像将在加载完成后自动更新。
    },
  };

  window.RPG = window.RPG || {}; // 确保全局命名空间存在以挂载模块。
  window.RPG.Assets = Assets; // 将 Assets 对象挂载到 RPG 命名空间，供其他模块访问。
  window.Assets = Assets; // 同时暴露全局变量 Assets，方便控制台调试与旧代码调用。
})();
