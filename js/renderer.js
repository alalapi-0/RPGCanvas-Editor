/* =============================================
 * 模块：Renderer 渲染器骨架
 * 描述：管理 Canvas 绘制循环、网格显示、相机控制与动画时钟
 * 说明：第 7 轮引入 A1 动画帧驱动与 32→48 缩放绘制
 * ============================================= */

(function () {
  // 使用立即执行函数创建私有作用域，避免内部变量泄露。
  const Renderer = {
    // 定义 Renderer 单例对象，集中管理渲染状态。
    canvas: null, // 保存 Canvas 元素引用。
    ctx: null, // 保存 2D 上下文引用。
    tileSize: 48, // 固定地图单元像素尺寸为 48。
    camera: { x: 0, y: 0, zoom: 1 }, // 相机记录世界坐标与缩放倍率。
    showGrid: true, // 控制是否绘制网格线。
    needsRender: true, // 脏标记控制是否需要重绘。
    backgroundPattern: null, // 缓存棋盘底纹 Pattern 对象。
    rafId: null, // 记录 requestAnimationFrame 句柄。
    brush: { tileId: null, rotation: 0, alpha: 0.65, visible: false, hoverGX: 0, hoverGY: 0 }, // 记录画笔预览状态。
    map: null, // 当前渲染的地图引用。
    layerOrder: ['ground', 'structure', 'prop', 'overlay', 'decal'], // 定义绘制层顺序。
    view: { gx0: 0, gy0: 0, gx1: 0, gy1: 0 }, // 缓存当前可见网格范围。
    assetsWarned: false, // 标记素材管理器缺失警告是否已经输出。
    anim: { fps: 6, frame: 0, elapsed: 0, running: true, maxFrame: 3 }, // 定义全局动画时钟状态。
    lastTimestamp: null, // 记录上一帧的时间戳用于计算 dt。

    init(canvasElement) {
      // 初始化渲染器，建立上下文、底纹与循环。
      if (!(canvasElement instanceof HTMLCanvasElement)) {
        // 若传入节点不是 Canvas 则抛出错误。
        throw new Error('Renderer.init 需要 HTMLCanvasElement'); // 抛出错误提示初始化参数非法。
      }
      this.canvas = canvasElement; // 保存 Canvas 引用供后续使用。
      this.ctx = this.canvas.getContext('2d'); // 获取 2D 上下文。
      if (!this.ctx) {
        // 若无法获取上下文则抛出错误。
        throw new Error('无法获取 CanvasRenderingContext2D'); // 提示运行环境异常。
      }
      this.createBackgroundPattern(); // 创建棋盘底纹 Pattern。
      this.startLoop(); // 启动 requestAnimationFrame 循环。
      this.requestRender(); // 初始化完成后请求一次绘制。
    },

    setMap(mapData) {
      // 设置当前地图引用并请求重绘。
      this.map = mapData && typeof mapData === 'object' ? mapData : null; // 保存合法的地图对象或 null。
      this.requestRender(); // 地图切换后需要重新绘制。
    },

    startLoop() {
      // 启动渲染循环并驱动动画时钟。
      const step = (timestamp) => {
        // 定义每帧执行的回调函数。
        if (this.lastTimestamp === null) {
          // 若尚无历史时间戳则使用当前值初始化。
          this.lastTimestamp = timestamp; // 记录本帧时间戳作为起点。
        }
        const dt = timestamp - this.lastTimestamp; // 计算距离上一帧的时间差毫秒数。
        this.lastTimestamp = timestamp; // 更新上一帧时间戳供下次使用。
        if (this.anim.running && this.anim.fps > 0) {
          // 当动画时钟处于运行状态并且 FPS 合法时更新帧。
          const frameDuration = 1000 / this.anim.fps; // 计算单帧持续时间毫秒数。
          this.anim.elapsed += dt; // 累积经过时间。
          if (this.anim.elapsed >= frameDuration) {
            // 当累计时间超过一帧时执行帧递增。
            const steps = Math.floor(this.anim.elapsed / frameDuration); // 计算应当跳过的帧数。
            this.anim.frame = (this.anim.frame + steps) % this.anim.maxFrame; // 循环更新动画帧索引。
            this.anim.elapsed -= steps * frameDuration; // 减去已消费的时间确保稳定。
            this.requestRender(); // 帧发生变化时请求重新渲染。
          }
        }
        if (this.needsRender) {
          // 当脏标记为真时执行绘制。
          this.render(); // 调用 render 方法绘制当前场景。
          this.needsRender = false; // 绘制完成后重置脏标记。
        }
        this.rafId = window.requestAnimationFrame(step); // 安排下一帧回调维持循环。
      };
      this.rafId = window.requestAnimationFrame(step); // 提交第一次帧请求启动循环。
    },

    requestRender() {
      // 将脏标记设为真以在下一帧执行绘制。
      this.needsRender = true; // 设置脏标记。
    },

    resizeToContainer() {
      // 根据父容器尺寸调整 Canvas。
      if (!this.canvas) {
        // 若 Canvas 未初始化则直接返回。
        return; // 提前结束避免报错。
      }
      const parent = this.canvas.parentElement; // 获取父容器引用。
      if (!parent) {
        // 若无父容器则无法调整尺寸。
        return; // 结束方法等待结构修正。
      }
      const width = parent.clientWidth; // 读取可用宽度。
      const height = parent.clientHeight; // 读取可用高度。
      if (this.canvas.width !== width || this.canvas.height !== height) {
        // 仅当尺寸发生变化时更新 Canvas。
        this.canvas.width = width; // 同步画布宽度。
        this.canvas.height = height; // 同步画布高度。
        this.requestRender(); // 尺寸变化后需要重新绘制。
      }
    },

    clear() {
      // 清空画布并绘制底纹。
      if (!this.ctx) {
        // 若上下文未准备好则直接返回。
        return; // 结束方法。
      }
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); // 清空整张画布。
      if (this.backgroundPattern) {
        // 若已经生成底纹 Pattern 则使用它填充。
        this.ctx.save(); // 保存上下文状态。
        this.ctx.fillStyle = this.backgroundPattern; // 设置填充样式为棋盘 Pattern。
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height); // 绘制底纹覆盖整张画布。
        this.ctx.restore(); // 恢复上下文状态避免影响后续绘制。
      } else {
        // 若 Pattern 尚未准备好则使用纯色背景。
        this.ctx.fillStyle = '#2b2b2b'; // 设置备用背景色为深灰。
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height); // 绘制纯色背景。
      }
    },

    createBackgroundPattern() {
      // 创建棋盘底纹 Pattern。
      const patternCanvas = document.createElement('canvas'); // 创建离屏 Canvas。
      patternCanvas.width = 4; // 设置离屏宽度为 4 像素。
      patternCanvas.height = 4; // 设置离屏高度为 4 像素。
      const patternCtx = patternCanvas.getContext('2d'); // 获取离屏上下文。
      if (!patternCtx) {
        // 若获取失败则记录警告。
        console.warn('[Renderer] 背景 Pattern 创建失败'); // 输出警告提示。
        return; // 结束方法使用纯色背景。
      }
      patternCtx.fillStyle = '#252525'; // 设置深灰底色。
      patternCtx.fillRect(0, 0, patternCanvas.width, patternCanvas.height); // 填充整个离屏画布。
      patternCtx.fillStyle = 'rgba(255, 255, 255, 0.04)'; // 设置浅色方块填充色。
      patternCtx.fillRect(0, 0, 2, 2); // 绘制左上角浅色方块。
      patternCtx.fillRect(2, 2, 2, 2); // 绘制右下角浅色方块形成棋盘效果。
      this.backgroundPattern = this.ctx.createPattern(patternCanvas, 'repeat'); // 基于离屏画布创建 Pattern。
    },

    setZoom(nextZoom, anchorScreenX, anchorScreenY) {
      // 根据鼠标锚点设置缩放。
      if (!this.ctx) {
        // 若上下文尚未初始化则直接返回。
        return; // 结束方法。
      }
      const clampedZoom = Math.min(2, Math.max(0.5, nextZoom)); // 将缩放值限制在 0.5~2 之间。
      if (clampedZoom === this.camera.zoom) {
        // 缩放未变化则无需继续处理。
        return; // 直接返回。
      }
      const anchorWorld = this.screenToWorld(anchorScreenX, anchorScreenY); // 计算缩放前锚点对应的世界坐标。
      this.camera.zoom = clampedZoom; // 应用新的缩放值。
      this.camera.x = anchorWorld.x - anchorScreenX / this.camera.zoom; // 调整相机 X 以保持锚点位置。
      this.camera.y = anchorWorld.y - anchorScreenY / this.camera.zoom; // 调整相机 Y 以保持锚点位置。
      this.requestRender(); // 缩放变化后需要重新绘制。
    },

    translateCamera(deltaScreenX, deltaScreenY) {
      // 根据屏幕位移量平移相机。
      const worldDx = deltaScreenX / this.camera.zoom; // 将屏幕位移换算为世界坐标 X。
      const worldDy = deltaScreenY / this.camera.zoom; // 将屏幕位移换算为世界坐标 Y。
      this.camera.x -= worldDx; // 更新相机 X 坐标。
      this.camera.y -= worldDy; // 更新相机 Y 坐标。
      this.requestRender(); // 平移后请求重新绘制。
    },

    screenToWorld(screenX, screenY) {
      // 将屏幕坐标转换为世界坐标。
      const worldX = this.camera.x + screenX / this.camera.zoom; // 根据缩放与偏移计算世界 X。
      const worldY = this.camera.y + screenY / this.camera.zoom; // 根据缩放与偏移计算世界 Y。
      return { x: worldX, y: worldY }; // 返回世界坐标对象。
    },

    worldToScreen(worldX, worldY) {
      // 将世界坐标转换为屏幕坐标。
      const screenX = (worldX - this.camera.x) * this.camera.zoom; // 根据缩放与偏移计算屏幕 X。
      const screenY = (worldY - this.camera.y) * this.camera.zoom; // 根据缩放与偏移计算屏幕 Y。
      return { x: screenX, y: screenY }; // 返回屏幕坐标对象。
    },

    setGridVisible(visible) {
      // 控制网格显示开关。
      this.showGrid = Boolean(visible); // 将参数转换为布尔值后保存。
      this.requestRender(); // 状态变化后请求重新绘制。
    },

    render() {
      // 主渲染函数负责绘制背景、网格、地图与画笔预览。
      this.clear(); // 先清空画布并绘制底纹。
      if (this.showGrid) {
        // 当需要显示网格时绘制网格线。
        this.drawGrid(); // 调用 drawGrid 绘制 48 像素网格。
      }
      const map = this.map; // 缓存地图引用减少属性访问。
      if (map) {
        // 仅当存在地图数据时才尝试绘制图块。
        this._calcVisibleRange(); // 根据相机与缩放计算可见网格范围。
        const assets = window.RPG?.Assets; // 读取全局素材管理器引用。
        if (!assets || typeof assets.getTileById !== 'function') {
          // 若素材管理器尚未就绪则输出一次警告并跳过绘制。
          if (!this.assetsWarned) {
            // 确保只输出一次警告避免刷屏。
            console.warn('[Renderer] Assets 未初始化，跳过地图渲染'); // 输出警告提示加载顺序问题。
            this.assetsWarned = true; // 标记已经输出过警告。
          }
        } else {
          // 当素材管理器就绪时执行正常绘制。
          this.assetsWarned = false; // 重置警告标记以便后续检测。
          for (const layerName of this.layerOrder) {
            // 遍历固定的图层顺序。
            const layerGrid = map.layers && map.layers[layerName]; // 获取当前图层的二维数组。
            if (!Array.isArray(layerGrid)) {
              // 若图层不存在则跳过。
              continue; // 继续处理下一个图层。
            }
            for (let gy = this.view.gy0; gy < this.view.gy1; gy += 1) {
              // 遍历可见网格的行索引。
              const row = layerGrid[gy]; // 获取当前行数组。
              if (!Array.isArray(row)) {
                // 若行缺失则跳过。
                continue; // 继续下一行。
              }
              for (let gx = this.view.gx0; gx < this.view.gx1; gx += 1) {
                // 遍历可见网格的列索引。
                const placement = row[gx]; // 读取该格的素材放置信息。
                if (!placement) {
                  // 当单元格为空时不绘制任何内容。
                  continue; // 继续下一个单元格。
                }
                const worldX = gx * this.tileSize; // 计算格子左上角的世界坐标 X。
                const worldY = gy * this.tileSize; // 计算格子左上角的世界坐标 Y。
                const tileDef = assets.getTileById(placement.tileId); // 根据 tileId 查询素材定义。
                if (!tileDef) {
                  // 当素材未找到时绘制缺失提示。
                  this._drawMissingTile(worldX, worldY); // 绘制红色叉框提示数据异常。
                  continue; // 继续下一个单元格。
                }
                const baseFrame = tileDef.animated !== undefined ? this.anim.frame : 0; // 计算当前全局帧索引。
                const offset = Number.isInteger(placement.animOffset) ? placement.animOffset : 0; // 读取地图单元格的动画偏移。
                const frameIndex = tileDef.animated !== undefined ? (baseFrame + offset) % tileDef.animated : 0; // 合成最终帧索引。
                if (this.shouldUseAutoTile16(tileDef)) {
                  // 当素材属于 A1 自动拼接范围时使用 16 掩码渲染流程。
                  this.drawA1Auto16(tileDef, worldX, worldY, gx, gy, frameIndex, placement); // 调用自动拼接方法绘制象限组合。
                } else {
                  // 其余素材仍使用通用绘制方法。
                  this.drawTileImage(tileDef, worldX, worldY, {
                    rotation: placement.rotation === undefined ? 0 : (placement.rotation | 0), // 应用存储的旋转角度。
                    alpha: 1, // 地图绘制使用完全不透明。
                    frameIndex, // 将计算后的帧索引用于动画播放。
                    flipX: Boolean(placement.flipX), // 应用水平翻转。
                    flipY: Boolean(placement.flipY), // 应用垂直翻转。
                  }); // 执行图块绘制。
                }
              }
            }
          }
        }
      }
      this.drawBrushPreview(); // 在地图之后绘制画笔预览。
    },

    setBrushTile(tileId) {
      // 设置当前画笔使用的素材 id。
      this.brush.tileId = typeof tileId === 'string' && tileId.trim() ? tileId.trim() : null; // 规范化 id 或清空。
      if (!this.brush.tileId) {
        // 当素材被清空时关闭画笔预览。
        this.setBrushVisibility(false); // 调用统一方法更新可见性。
      }
      this.requestRender(); // 素材变化后请求重绘。
    },

    setBrushRotation(rotation) {
      // 设置画笔预览的旋转角度。
      const allowed = [0, 90, 180, 270]; // 定义允许的离散角度。
      this.brush.rotation = allowed.includes(rotation) ? rotation : this.brush.rotation; // 仅当角度合法时更新。
      this.requestRender(); // 旋转变化后请求重绘。
    },

    setBrushVisibility(visible) {
      // 控制画笔预览是否显示。
      this.brush.visible = Boolean(visible) && Boolean(this.brush.tileId); // 只有在选择素材时才允许显示。
      if (this.canvas) {
        // 当 Canvas 已初始化时更新样式类。
        this.canvas.classList.toggle('brush-visible', this.brush.visible); // 切换 brush-visible 类控制光标样式。
      }
      this.requestRender(); // 状态变更后请求重绘。
    },

    setBrushHoverGrid(gx, gy) {
      // 更新画笔预览吸附的网格坐标。
      if (!Number.isInteger(gx) || !Number.isInteger(gy)) {
        // 坐标必须为整数。
        return; // 输入非法时直接返回。
      }
      this.brush.hoverGX = gx; // 写入 X。
      this.brush.hoverGY = gy; // 写入 Y。
      this.requestRender(); // 位置变化后请求重绘。
    },

    getBrushState() {
      // 返回画笔状态的只读副本。
      return { ...this.brush }; // 使用浅拷贝返回对象。
    },

    shouldUseAutoTile16(tileDef) {
      // 判断指定素材是否应该使用 16 掩码自动拼角流程。
      if (!tileDef || typeof tileDef !== 'object') {
        // 若素材定义缺失则不启用自动拼角。
        return false; // 返回 false 表示保持常规绘制。
      }
      if (!tileDef.rect || tileDef.rect.width !== 32 || tileDef.rect.height !== 32) {
        // 仅对 32×32 的 A1 子片执行自动拼角。
        return false; // 非 A1 素材直接返回。
      }
      if (typeof tileDef.pack !== 'string') {
        // 缺少素材包名称时无法查找覆写映射。
        return false; // 返回 false，交由常规渲染处理。
      }
      const auto16 = window.RPG?.AutoTile16; // 读取自动拼角工具引用。
      if (!auto16 || typeof auto16.getGroupId !== 'function') {
        // 若工具尚未初始化则不启用自动拼角。
        return false; // 返回 false 避免报错。
      }
      return Boolean(auto16.getGroupId(tileDef)); // 仅当能计算出组标识时才启用自动拼角。
    },

    drawA1Auto16(tileDef, worldX, worldY, gx, gy, frameIndex, placement) {
      // 使用 16 掩码策略渲染 A1 自动地形图块。
      const assets = window.RPG?.Assets; // 读取素材管理器引用。
      const auto16 = window.RPG?.AutoTile16; // 读取自动拼角工具引用。
      const editor = window.RPG?.Editor; // 读取编辑器实例用于查询邻接。
      if (!assets || !auto16 || !editor || typeof editor.getNeighborMask !== 'function') {
        // 当关键模块缺失时退回通用绘制逻辑。
        this.drawTileImage(tileDef, worldX, worldY, {
          rotation: placement && placement.rotation !== undefined ? placement.rotation : 0, // 保留旋转角度。
          alpha: 1, // 使用完全不透明绘制。
          frameIndex, // 继续使用已计算的动画帧索引。
          flipX: Boolean(placement && placement.flipX), // 应用水平翻转。
          flipY: Boolean(placement && placement.flipY), // 应用垂直翻转。
        }); // 调用通用绘制以保持可见性。
        return; // 结束自动拼角流程。
      }
      const groupId = auto16.getGroupId(tileDef); // 计算当前素材所属的大组标识。
      if (!groupId) {
        // 若无法计算组标识则回退通用绘制。
        this.drawTileImage(tileDef, worldX, worldY, {
          rotation: placement && placement.rotation !== undefined ? placement.rotation : 0, // 传递旋转角度。
          alpha: 1, // 保持不透明。
          frameIndex, // 使用当前帧索引。
          flipX: Boolean(placement && placement.flipX), // 保留水平翻转。
          flipY: Boolean(placement && placement.flipY), // 保留垂直翻转。
        }); // 使用常规流程绘制。
        return; // 停止自动拼角。
      }
      const mask = editor.getNeighborMask(gx, gy, groupId); // 根据四向邻居计算掩码。
      const quadDef = auto16.resolveMask(mask); // 根据掩码查表获得象限角色。
      const baseRect = auto16.getBaseRect(tileDef); // 计算所在大组的基准子片坐标。
      if (!quadDef || !baseRect) {
        // 查表或基准矩形异常时回退通用绘制。
        this.drawTileImage(tileDef, worldX, worldY, {
          rotation: placement && placement.rotation !== undefined ? placement.rotation : 0, // 保留旋转设置。
          alpha: 1, // 使用不透明绘制。
          frameIndex, // 传递动画帧索引。
          flipX: Boolean(placement && placement.flipX), // 传递水平翻转标记。
          flipY: Boolean(placement && placement.flipY), // 传递垂直翻转标记。
        }); // 回退常规绘制。
        return; // 结束自动拼角逻辑。
      }
      const imageCache = assets.images instanceof Map ? assets.images : null; // 获取内部图像缓存 Map。
      const imageKey = typeof tileDef.src === 'string' ? tileDef.src : ''; // 规范化图集键。
      const image = imageCache ? imageCache.get(imageKey) : null; // 尝试读取缓存的图像。
      if (!(image instanceof HTMLImageElement) || !image.complete || image.naturalWidth === 0) {
        // 图像尚未加载完成时请求加载并绘制缺失提示。
        if (typeof assets.getImageFor === 'function' && imageKey) {
          // 调用异步加载并在完成后请求重绘。
          assets
            .getImageFor(imageKey)
            .then(() => {
              // 加载完成后请求一次重新渲染以刷新画面。
              this.requestRender(); // 请求重绘以显示真实素材。
            })
            .catch((error) => {
              // 加载失败时输出警告便于排查。
              console.warn('[Renderer] getImageFor failed for autotile', imageKey, error); // 输出警告日志。
            });
        }
        this._drawMissingTile(worldX, worldY); // 在画布上绘制红色缺失提示。
        return; // 等待下一帧尝试真实绘制。
      }
      const screenPos = this.worldToScreen(worldX, worldY); // 将左上角世界坐标转换为屏幕坐标。
      const zoom = this.camera.zoom; // 读取当前缩放倍率。
      const rotation = placement && placement.rotation !== undefined ? placement.rotation : 0; // 读取旋转角度。
      const radians = (rotation * Math.PI) / 180; // 将角度转换为弧度。
      const flipX = Boolean(placement && placement.flipX); // 读取水平翻转标记。
      const flipY = Boolean(placement && placement.flipY); // 读取垂直翻转标记。
      const animStrideX = tileDef.animStrideX !== undefined ? tileDef.animStrideX : baseRect[2]; // 计算动画帧步进。
      const centerOffset = this.tileSize / 2; // 计算图块中心偏移。
      this.ctx.save(); // 保存上下文状态。
      this.ctx.translate(screenPos.x, screenPos.y); // 将原点移动到图块左上角的屏幕坐标。
      this.ctx.scale(zoom, zoom); // 应用缩放，后续在图块本地坐标系中绘制。
      this.ctx.translate(centerOffset, centerOffset); // 将原点移动到图块中心以便旋转与翻转。
      if (rotation !== 0) {
        // 当存在旋转角度时应用旋转。
        this.ctx.rotate(radians); // 旋转上下文以复用后续绘制逻辑。
      }
      this.ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1); // 根据翻转标记镜像坐标系。
      this.ctx.translate(-centerOffset, -centerOffset); // 将原点恢复到图块左上角。
      this.ctx.globalAlpha = 1; // 确保完全不透明。
      const quadOrder = [
        { key: 'NW', dx: 0, dy: 0 }, // 左上象限偏移。
        { key: 'NE', dx: 32, dy: 0 }, // 右上象限偏移。
        { key: 'SE', dx: 32, dy: 32 }, // 右下象限偏移。
        { key: 'SW', dx: 0, dy: 32 }, // 左下象限偏移。
      ]; // 构造固定顺序的象限描述数组。
      quadOrder.forEach((info) => {
        // 遍历每个象限绘制对应角色。
        const data = quadDef[info.key]; // 读取当前象限配置。
        if (!data) {
          // 若查表结果缺失则跳过该象限。
          return; // 继续处理下一个象限。
        }
        auto16.composeTileQuad(
          this.ctx,
          image,
          baseRect,
          data.role,
          data.rot,
          frameIndex,
          animStrideX,
          info.dx,
          info.dy,
          tileDef.pack,
        ); // 调用工具绘制 32→16 子片。
      });
      this.ctx.restore(); // 恢复上下文状态避免影响后续绘制。
    },

    drawTileImage(tileDef, worldX, worldY, opts = {}) {
      // 在指定世界坐标绘制素材图块，可应用旋转、翻转与透明度。
      if (!tileDef || typeof tileDef !== 'object') {
        // 若素材定义缺失则直接返回。
        return; // 结束方法。
      }
      const assets = window.RPG?.Assets; // 读取全局素材管理器引用。
      if (!assets || typeof assets.drawToCanvas !== 'function') {
        // 若素材管理器尚未初始化则无法绘制。
        return; // 等待下次渲染。
      }
      const options = {
        // 合并默认选项与调用方参数。
        rotation: 0, // 默认不旋转。
        alpha: 1, // 默认完全不透明。
        frameIndex: tileDef.animated !== undefined ? this.anim.frame : 0, // 默认使用当前全局动画帧。
        flipX: false, // 默认不翻转。
        flipY: false, // 默认不翻转。
        ...opts, // 合并调用方提供的覆盖值。
      }; // 完成选项对象。
      const screenPos = this.worldToScreen(worldX, worldY); // 将世界坐标转换为屏幕坐标。
      const centerX = screenPos.x + (this.tileSize * this.camera.zoom) / 2; // 计算绘制中心 X。
      const centerY = screenPos.y + (this.tileSize * this.camera.zoom) / 2; // 计算绘制中心 Y。
      this.ctx.save(); // 保存上下文状态以应用变换。
      this.ctx.translate(centerX, centerY); // 将原点移动到图块中心。
      const radians = (options.rotation * Math.PI) / 180; // 将角度转换为弧度。
      if (options.rotation !== 0) {
        // 当需要旋转时应用旋转变换。
        this.ctx.rotate(radians); // 对上下文执行旋转。
      }
      const scaleX = (options.flipX ? -1 : 1) * this.camera.zoom; // 根据翻转与缩放计算水平缩放系数。
      const scaleY = (options.flipY ? -1 : 1) * this.camera.zoom; // 根据翻转与缩放计算垂直缩放系数。
      this.ctx.scale(scaleX, scaleY); // 应用缩放变换以同时处理翻转与缩放。
      this.ctx.globalAlpha = options.alpha; // 设置透明度用于预览或特殊绘制。
      this.ctx.imageSmoothingEnabled = false; // 禁用插值保持像素清晰。
      const drawX = -this.tileSize / 2; // 计算目标矩形左上角 X（以中心为原点）。
      const drawY = -this.tileSize / 2; // 计算目标矩形左上角 Y。
      assets.drawToCanvas(this.ctx, tileDef, drawX, drawY, this.tileSize, this.tileSize, options.frameIndex); // 调用共享绘制函数完成图块绘制。
      this.ctx.restore(); // 恢复上下文状态避免影响后续绘制。
    },

    _drawMissingTile(worldX, worldY) {
      // 绘制素材缺失时的红色叉框提示。
      const screenPos = this.worldToScreen(worldX, worldY); // 将世界坐标转换为屏幕坐标。
      const zoom = this.camera.zoom; // 缓存当前缩放倍率。
      const width = this.tileSize * zoom; // 计算提示框宽度。
      const height = this.tileSize * zoom; // 计算提示框高度。
      const style = getComputedStyle(document.documentElement); // 读取全局 CSS 变量。
      const warnColor = (style.getPropertyValue('--warn') || '#e74c3c').trim(); // 读取警告颜色。
      const strokeX = Math.round(screenPos.x) + 0.5; // 对齐 X 防止描边模糊。
      const strokeY = Math.round(screenPos.y) + 0.5; // 对齐 Y 防止描边模糊。
      this.ctx.save(); // 保存上下文状态。
      this.ctx.lineWidth = 2; // 设置描边线宽。
      this.ctx.strokeStyle = warnColor; // 设置描边颜色。
      this.ctx.globalAlpha = 0.95; // 设置轻微透明度。
      this.ctx.strokeRect(strokeX, strokeY, width, height); // 绘制矩形边框。
      this.ctx.beginPath(); // 开始绘制叉线。
      this.ctx.moveTo(strokeX, strokeY); // 移动到左上角。
      this.ctx.lineTo(strokeX + width, strokeY + height); // 绘制到右下角。
      this.ctx.moveTo(strokeX + width, strokeY); // 移动到右上角。
      this.ctx.lineTo(strokeX, strokeY + height); // 绘制到左下角。
      this.ctx.stroke(); // 渲染叉线。
      this.ctx.restore(); // 恢复上下文状态。
    },

    drawBrushPreview() {
      // 绘制画笔预览层，包括半透明贴图与高亮框。
      if (!this.brush.visible || !this.brush.tileId) {
        // 当画笔不可见或未选择素材时直接返回。
        return; // 不执行任何绘制。
      }
      const assets = window.RPG?.Assets; // 读取素材管理器引用。
      if (!assets) {
        // 若素材管理器未就绪则跳过。
        return; // 等待后续帧。
      }
      const tileDef = assets.getTileById(this.brush.tileId); // 查询当前画笔使用的素材定义。
      if (!tileDef) {
        // 若素材缺失则直接返回。
        return; // 等待用户重新选择。
      }
      const worldX = this.brush.hoverGX * this.tileSize; // 计算预览世界坐标 X。
      const worldY = this.brush.hoverGY * this.tileSize; // 计算预览世界坐标 Y。
      const map = this.map; // 缓存地图引用。
      const editor = window.RPG?.Editor; // 获取编辑器实例。
      let highlightColor = '#888888'; // 默认使用灰色描边。
      let shouldWarn = false; // 初始化警告标记为 false。
      if (!map) {
        // 当没有地图时无法落笔，仅显示灰色框。
        highlightColor = (getComputedStyle(document.documentElement).getPropertyValue('--color-muted') || '#9e9e9e').trim(); // 读取 muted 颜色。
      } else {
        // 当存在地图时根据越界与图层判断是否警告。
        const inBounds = this.brush.hoverGX >= 0 && this.brush.hoverGX < map.width && this.brush.hoverGY >= 0 && this.brush.hoverGY < map.height; // 判断坐标是否在地图范围内。
        const activeLayer = editor && typeof editor.getActiveLayer === 'function' ? editor.getActiveLayer() : null; // 读取当前激活图层。
        const layerMatch = tileDef.layer === activeLayer; // 判断素材图层是否匹配。
        shouldWarn = !inBounds || !layerMatch; // 任一条件不满足则视为警告态。
        const style = getComputedStyle(document.documentElement); // 读取 CSS 变量集合。
        const warnColor = (style.getPropertyValue('--warn') || '#e74c3c').trim(); // 提取警告颜色。
        const okColor = (style.getPropertyValue('--color-brush') || 'rgba(77, 182, 172, 0.7)').trim(); // 提取正常高亮颜色。
        highlightColor = shouldWarn ? warnColor : okColor; // 根据状态选择描边颜色。
        if (tileDef && !shouldWarn) {
          // 当可以落笔时绘制半透明预览贴图。
          const frameIndex = tileDef.animated !== undefined ? this.anim.frame : 0; // 使用当前动画帧进行预览。
          this.drawTileImage(tileDef, worldX, worldY, {
            rotation: this.brush.rotation, // 应用画笔记录的旋转角度。
            alpha: this.brush.alpha, // 使用半透明预览。
            frameIndex, // 使用全局动画帧保持同步。
            flipX: false, // 目前预览不支持水平翻转。
            flipY: false, // 目前预览不支持垂直翻转。
          }); // 绘制预览贴图。
        }
        if (tileDef && shouldWarn) {
          // 即使处于警告态也继续绘制半透明预览以便对齐。
          const frameIndex = tileDef.animated !== undefined ? this.anim.frame : 0; // 使用当前动画帧保持同步。
          this.drawTileImage(tileDef, worldX, worldY, {
            rotation: this.brush.rotation, // 应用画笔旋转。
            alpha: this.brush.alpha, // 保持半透明效果。
            frameIndex, // 使用全局动画帧。
            flipX: false, // 暂不支持翻转。
            flipY: false, // 暂不支持翻转。
          }); // 绘制预览贴图。
        }
      }
      const screenPos = this.worldToScreen(worldX, worldY); // 将预览左上角转换为屏幕坐标。
      const zoom = this.camera.zoom; // 缓存缩放倍率。
      const width = this.tileSize * zoom; // 计算高亮框宽度。
      const height = this.tileSize * zoom; // 计算高亮框高度。
      this.ctx.save(); // 保存上下文状态用于绘制描边。
      this.ctx.lineWidth = 2; // 设置描边线宽。
      this.ctx.strokeStyle = highlightColor; // 设置描边颜色。
      this.ctx.globalAlpha = shouldWarn ? 1 : 0.9; // 警告态使用不透明描边。
      this.ctx.strokeRect(Math.round(screenPos.x) + 0.5, Math.round(screenPos.y) + 0.5, width, height); // 绘制与像素对齐的描边框。
      this.ctx.restore(); // 恢复上下文状态。
    },

    _calcVisibleRange() {
      // 计算当前相机对应的可见网格范围。
      if (!this.canvas || !this.map) {
        // 若画布或地图未就绪则重置可见范围为零。
        this.view.gx0 = 0; // 重置左边界。
        this.view.gy0 = 0; // 重置上边界。
        this.view.gx1 = 0; // 重置右边界。
        this.view.gy1 = 0; // 重置下边界。
        return; // 结束方法。
      }
      const zoom = this.camera.zoom; // 缓存缩放倍率。
      const visibleWidth = this.canvas.width / zoom; // 将画布宽度转换为世界单位。
      const visibleHeight = this.canvas.height / zoom; // 将画布高度转换为世界单位。
      const left = this.camera.x; // 计算视口左侧世界坐标。
      const top = this.camera.y; // 计算视口顶部世界坐标。
      const right = left + visibleWidth; // 计算视口右侧世界坐标。
      const bottom = top + visibleHeight; // 计算视口底部世界坐标。
      const buffer = 1; // 添加一圈缓冲避免裁剪太紧。
      const rawGX0 = Math.floor(left / this.tileSize) - buffer; // 计算左侧网格索引并减去缓冲。
      const rawGY0 = Math.floor(top / this.tileSize) - buffer; // 计算顶部网格索引并减去缓冲。
      const rawGX1 = Math.ceil(right / this.tileSize) + buffer; // 计算右侧网格索引并加上缓冲。
      const rawGY1 = Math.ceil(bottom / this.tileSize) + buffer; // 计算底部网格索引并加上缓冲。
      this.view.gx0 = Math.min(this.map.width, Math.max(0, rawGX0)); // 将左边界裁剪到合法范围。
      this.view.gy0 = Math.min(this.map.height, Math.max(0, rawGY0)); // 将上边界裁剪到合法范围。
      this.view.gx1 = Math.min(this.map.width, Math.max(0, rawGX1)); // 将右边界裁剪到合法范围。
      this.view.gy1 = Math.min(this.map.height, Math.max(0, rawGY1)); // 将下边界裁剪到合法范围。
    },

    drawGrid() {
      // 绘制 48 像素间隔的网格线。
      const width = this.canvas.width; // 读取画布宽度。
      const height = this.canvas.height; // 读取画布高度。
      const zoom = this.camera.zoom; // 缓存缩放倍率。
      const left = this.camera.x; // 计算视口左侧世界坐标。
      const top = this.camera.y; // 计算视口顶部世界坐标。
      const right = left + width / zoom; // 计算视口右侧世界坐标。
      const bottom = top + height / zoom; // 计算视口底部世界坐标。
      const startX = Math.floor(left / this.tileSize) * this.tileSize; // 计算左侧起始网格线世界 X。
      const startY = Math.floor(top / this.tileSize) * this.tileSize; // 计算顶部起始网格线世界 Y。
      const endX = Math.ceil(right / this.tileSize) * this.tileSize; // 计算右侧结束网格线世界 X。
      const endY = Math.ceil(bottom / this.tileSize) * this.tileSize; // 计算底部结束网格线世界 Y。
      this.ctx.save(); // 保存上下文状态。
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)'; // 设置网格线颜色为半透明白。
      this.ctx.lineWidth = 1; // 使用 1 像素线宽。
      for (let worldX = startX; worldX <= endX; worldX += this.tileSize) {
        // 遍历垂直网格线。
        const screenX = (worldX - this.camera.x) * zoom; // 将世界坐标转换为屏幕坐标。
        this.ctx.beginPath(); // 开始绘制垂直线。
        this.ctx.moveTo(screenX, 0); // 移动到画布顶部。
        this.ctx.lineTo(screenX, height); // 绘制到画布底部。
        this.ctx.stroke(); // 渲染当前垂直线。
      }
      for (let worldY = startY; worldY <= endY; worldY += this.tileSize) {
        // 遍历水平网格线。
        const screenY = (worldY - this.camera.y) * zoom; // 将世界坐标转换为屏幕坐标。
        this.ctx.beginPath(); // 开始绘制水平线。
        this.ctx.moveTo(0, screenY); // 移动到画布左侧。
        this.ctx.lineTo(width, screenY); // 绘制到画布右侧。
        this.ctx.stroke(); // 渲染当前水平线。
      }
      this.ctx.restore(); // 恢复上下文状态。
    },
  };

  window.RPG = window.RPG || {}; // 确保全局命名空间存在。
  window.RPG.Renderer = Renderer; // 将 Renderer 挂载到全局命名空间供其他模块访问。
})();
