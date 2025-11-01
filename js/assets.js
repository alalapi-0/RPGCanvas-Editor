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
    gridSize: 48, // 记录网格目标尺寸，默认 48px。
    tileIndex: new Map(), // 建立 tileId 到 tile 定义的映射，支持快速查询。
    images: new Map(), // 缓存图集图片对象，键为 src，值为 HTMLImageElement。

    async loadManifest(url = 'assets/manifest.json') {
      // 异步加载并解析 manifest 文件，默认路径指向 assets/manifest.json。
      this.manifest = null; // 重置 manifest 引用，确保重新加载时不会残留旧数据。
      this.packs = []; // 清空已解析的包数组，为新数据做准备。
      this.gridSize = 48; // 重置全局网格尺寸到默认值。
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
      this.gridSize = data.tileSize; // 记录全局网格尺寸供缩略图与渲染器查询。
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
          name: pack.name.trim(),
          src: pack.src.trim(),
          tiles: [],
          tileSize: Number.isInteger(pack.tileSize) ? pack.tileSize : data.tileSize,
        };
        pack.tiles.forEach((tile, tileIndexInPack) => {
          try {
            const normalizedTile = this._normalizeTileDefinition(tile, normalizedPack, { strictSize: true });
            if (this.tileIndex.has(normalizedTile.id)) {
              throw new Error(`[Assets] duplicated tile id: ${normalizedTile.id}`);
            }
            this.tileIndex.set(normalizedTile.id, normalizedTile);
            normalizedPack.tiles.push(normalizedTile);
          } catch (error) {
            throw new Error(`[Assets] tile invalid at ${pack.name} index ${tileIndexInPack}: ${error.message}`);
          }
        });
        normalizedPacks.push(normalizedPack); // 将处理完成的包写入临时数组。
      });
      this.manifest = data; // 保存原始 manifest 数据供调试与导出使用。
      this.packs = normalizedPacks; // 将规范化素材包数组写入实例属性。
      await this.injectDungeonA1(); // 注入 Dungeon_A1 的运行期切片数据。
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

    getGridSize() {
      // 返回当前全局网格尺寸（默认为 48px，允许运行时覆盖）。
      return this.gridSize || 48;
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

    _cloneMeta(meta) {
      // 对 meta 字段执行浅拷贝，确保运行时修改不会污染原始数据。
      if (!meta || typeof meta !== 'object') {
        return undefined;
      }
      if (Array.isArray(meta)) {
        return meta.map((entry) => (typeof entry === 'object' ? this._cloneMeta(entry) : entry));
      }
      const clone = { ...meta };
      Object.keys(clone).forEach((key) => {
        const value = clone[key];
        if (Array.isArray(value)) {
          clone[key] = value.map((entry) => (typeof entry === 'object' ? this._cloneMeta(entry) : entry));
        } else if (value && typeof value === 'object') {
          clone[key] = this._cloneMeta(value);
        }
      });
      return clone;
    },

    _normalizeTileDefinition(tile, packContext, options = {}) {
      // 将原始 tile 定义转换成运行期结构，并应用尺寸与字段校验。
      if (!tile || typeof tile !== 'object') {
        throw new Error('tile definition must be object');
      }
      const context = packContext || {};
      const strictSize = options.strictSize !== undefined ? options.strictSize : true;
      const allowZeroAnimated = Boolean(options.allowZeroAnimated);
      const packTileSize = Number.isInteger(context.tileSize) ? context.tileSize : this.getGridSize();
      const id = typeof tile.id === 'string' ? tile.id.trim() : '';
      if (!id) {
        throw new Error('tile.id invalid');
      }
      const rectSource = tile.rect;
      let x;
      let y;
      let w;
      let h;
      if (Array.isArray(rectSource) && rectSource.length === 4) {
        [x, y, w, h] = rectSource;
      } else if (rectSource && typeof rectSource === 'object') {
        x = rectSource.x;
        y = rectSource.y;
        w = rectSource.width;
        h = rectSource.height;
      } else {
        throw new Error('tile.rect invalid');
      }
      if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(w) || !Number.isInteger(h)) {
        throw new Error('tile.rect must contain integers');
      }
      if (strictSize && (w !== packTileSize || h !== packTileSize)) {
        throw new Error(`tile.rect size must be ${packTileSize}`);
      }
      const layer = typeof tile.layer === 'string' ? tile.layer.trim() : '';
      if (!ALLOWED_LAYERS.includes(layer)) {
        throw new Error('tile.layer invalid');
      }
      let animated = tile.animated === undefined ? 1 : tile.animated;
      if (!Number.isInteger(animated) || animated < 0) {
        throw new Error('tile.animated invalid');
      }
      if (animated === 0 && !allowZeroAnimated) {
        animated = 1; // 当不允许 0 帧时回退到静态 1 帧。
      }
      let occluderTopPx = tile.occluderTopPx;
      if (occluderTopPx !== undefined) {
        if (!Number.isInteger(occluderTopPx) || occluderTopPx < 0) {
          throw new Error('tile.occluderTopPx invalid');
        }
      }
      let affordances = undefined;
      if (tile.affordances !== undefined) {
        if (!Array.isArray(tile.affordances) || !tile.affordances.every((entry) => typeof entry === 'string')) {
          throw new Error('tile.affordances invalid');
        }
        affordances = [...tile.affordances];
      }
      const normalizedTile = {
        id,
        rect: { x, y, width: w, height: h },
        layer,
        animated,
        pack: context.name || '',
        src: context.src || '',
        packTileSize,
      };
      if (tile.walkable !== undefined) {
        normalizedTile.walkable = Boolean(tile.walkable);
      }
      if (tile.blocks !== undefined) {
        normalizedTile.blocks = Boolean(tile.blocks);
      }
      if (affordances) {
        normalizedTile.affordances = affordances;
      }
      if (occluderTopPx !== undefined) {
        normalizedTile.occluderTopPx = occluderTopPx;
      }
      if (Array.isArray(tile.animWindowCols)) {
        normalizedTile.animWindowCols = [...tile.animWindowCols];
      }
      if (tile.animPairW !== undefined) {
        normalizedTile.animPairW = tile.animPairW;
      }
      const meta = this._cloneMeta(tile.meta);
      if (meta) {
        normalizedTile.meta = meta;
      }
      return normalizedTile;
    },

    async injectDungeonA1() {
      // 调用 Dungeon_A1 切片器，将 96 个静态格注入素材清单。
      const slicer = window.RPG?.SliceA1Dungeon;
      if (!slicer || typeof slicer.slice !== 'function') {
        return;
      }
      try {
        const result = await slicer.slice();
        if (!result || !Array.isArray(result.flatTiles) || result.flatTiles.length === 0) {
          return;
        }
        const packName = slicer.PACK_NAME || 'Dungeon_A1';
        let targetPack = this.packs.find((pack) => pack.name === packName);
        if (!targetPack) {
          targetPack = { name: packName, src: 'Dungeon_A1.png', tiles: [] };
          this.packs.push(targetPack);
        }
        targetPack.src = typeof targetPack.src === 'string' && targetPack.src.trim() ? targetPack.src.trim() : 'Dungeon_A1.png';
        targetPack.tileSize = 32;
        targetPack.runtimeMeta = {
          names: Array.isArray(result.names) ? [...result.names] : null,
          order: Array.isArray(result.order) ? [...result.order] : null,
        };
        targetPack.groups = Array.isArray(result.groups)
          ? result.groups.map((group) => {
              if (!group || typeof group !== 'object') {
                return group;
              }
              const cloned = { ...group };
              if (Array.isArray(group.slotRect)) {
                cloned.slotRect = [...group.slotRect];
              }
              if (Array.isArray(group.tiles)) {
                cloned.tiles = group.tiles.map((tile) => ({ ...tile }));
              }
              return cloned;
            })
          : undefined;
        if (!Array.isArray(targetPack.tiles)) {
          targetPack.tiles = [];
        }
        targetPack.tiles.forEach((tile) => {
          if (tile && tile.id) {
            this.tileIndex.delete(tile.id);
          }
        });
        targetPack.tiles = [];
        const context = { name: targetPack.name, src: targetPack.src, tileSize: targetPack.tileSize };
        result.flatTiles.forEach((tile) => {
          try {
            const normalized = this._normalizeTileDefinition(tile, context, {
              strictSize: true,
              allowZeroAnimated: true,
            });
            this.tileIndex.set(normalized.id, normalized);
            targetPack.tiles.push(normalized);
          } catch (error) {
            console.warn('[Assets] Dungeon_A1 tile skipped', tile?.id, error);
          }
        });
      } catch (error) {
        console.warn('[Assets] Dungeon_A1 注入失败', error);
      }
    },

    drawToCanvas(ctx, tileDef, dx, dy, targetWidth, targetHeight, frameIndex = 0) {
      // 将指定素材绘制到 Canvas 上，支持自定义目标尺寸与动画帧索引。
      if (!(ctx instanceof CanvasRenderingContext2D)) {
        return false;
      }
      if (!tileDef || typeof tileDef !== 'object') {
        return false;
      }
      const imageKey = typeof tileDef.src === 'string' ? tileDef.src : '';
      if (!imageKey) {
        return false;
      }
      const destWidth = Number.isFinite(targetWidth) ? targetWidth : this.getGridSize();
      const destHeight = Number.isFinite(targetHeight) ? targetHeight : this.getGridSize();
      const destX = Number.isFinite(dx) ? dx : 0;
      const destY = Number.isFinite(dy) ? dy : 0;
      const renderFrame = (image) => {
        if (!(image instanceof HTMLImageElement) || !image.complete || image.naturalWidth === 0) {
          return false;
        }
        const rect = tileDef.rect;
        if (!rect || typeof rect.x !== 'number' || typeof rect.y !== 'number' || typeof rect.width !== 'number' || typeof rect.height !== 'number') {
          return false;
        }
        const frameCount = Number.isInteger(tileDef.animated) && tileDef.animated > 1 ? tileDef.animated : 1;
        const safeFrame = frameCount > 0 ? ((frameIndex % frameCount) + frameCount) % frameCount : 0;
        const sx = rect.x + rect.width * safeFrame;
        const sy = rect.y;
        if (sx + rect.width > image.naturalWidth || sy + rect.height > image.naturalHeight) {
          console.warn('[Assets] tile rect out of bounds', tileDef.id);
          return false;
        }
        ctx.drawImage(image, sx, sy, rect.width, rect.height, destX, destY, destWidth, destHeight);
        return true;
      };
      const cachedImage = this.images.get(imageKey);
      if (cachedImage instanceof HTMLImageElement && cachedImage.complete && cachedImage.naturalWidth > 0) {
        return renderFrame(cachedImage);
      }
      this.getImageFor(imageKey)
        .then(() => {
          const renderer = window.RPG?.Renderer;
          if (renderer && typeof renderer.requestRender === 'function') {
            renderer.requestRender();
          }
        })
        .catch((error) => {
          console.warn('[Assets] drawToCanvas image load failed', imageKey, error);
        });
      return false;
    },

    makeTileThumb(tileDef) {
      // 根据 tile 定义生成 48×48 的缩略图 Canvas 并返回。
      const tileSize = this.getGridSize(); // 缩略图目标尺寸与网格一致，保证 32→48 缩放一致性。
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
          if (!(image instanceof HTMLImageElement) || image.naturalWidth === 0) {
            drawFallback();
            return;
          }
          ctx.clearRect(0, 0, tileSize, tileSize);
          const drawn = this.drawToCanvas(ctx, tileDef, 0, 0, tileSize, tileSize, 0);
          if (!drawn) {
            drawFallback();
          }
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
