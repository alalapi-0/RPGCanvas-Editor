/* =============================================
 * 模块：Renderer 渲染器骨架
 * 描述：管理 Canvas 绘制循环、网格显示与相机平移缩放
 * 说明：第 2 轮实现网格绘制、相机平移缩放以及脏渲染策略
 * ============================================= */

(function () {
  // 使用立即执行函数创建私有作用域，避免变量泄露到全局空间。
  const Renderer = {
    // 定义 Renderer 对象，集中管理所有渲染相关属性与方法。
    canvas: null, // 保存 Canvas 元素引用，供绘制与尺寸调整使用。
    ctx: null, // 保存 2D 上下文引用，负责执行所有绘制指令。
    tileSize: 48, // 将单元格尺寸固定为 48 像素，符合硬性约束。
    camera: { x: 0, y: 0, zoom: 1 }, // 相机对象记录视口左上角世界坐标与缩放倍率。
    showGrid: true, // 控制网格是否显示的布尔标记，默认展示。
    needsRender: true, // 脏标记，指示当前帧是否需要重新绘制。
    backgroundPattern: null, // 缓存棋盘底纹的 Pattern 对象，避免每帧重复创建。
    rafId: null, // 记录 requestAnimationFrame 的句柄，便于后续扩展管理循环。
    brush: { tileId: null, rotation: 0, alpha: 0.65, visible: false, hoverGX: 0, hoverGY: 0 }, // 记录画笔预览相关状态，包含素材 id、旋转角、透明度、可见性与吸附的网格坐标。
    map: null, // 当前渲染目标的 MapData 引用，UI 在加载或切换地图时会赋值。
    layerOrder: ['ground', 'structure', 'prop', 'overlay', 'decal'], // 定义绘制图层的固定顺序，确保遮挡关系正确。
    view: { gx0: 0, gy0: 0, gx1: 0, gy1: 0 }, // 记录当前视口可见的网格范围，用于裁剪渲染循环。
    assetsWarned: false, // 标记素材管理器缺失的警告是否已经输出，避免在循环中反复打印。

    init(canvasElement) {
      // 初始化方法，接收 Canvas 元素并完成上下文、循环与背景配置。
      if (!(canvasElement instanceof HTMLCanvasElement)) {
        // 若传入节点不是 Canvas，则抛出错误提示开发者。
        throw new Error('Renderer.init 需要 HTMLCanvasElement'); // 提示初始化参数错误。
      }
      this.canvas = canvasElement; // 保存合法的 Canvas 引用以便后续使用。
      this.ctx = this.canvas.getContext('2d'); // 获取 2D 上下文用于绘制操作。
      if (!this.ctx) {
        // 如果上下文获取失败，说明运行环境异常。
        throw new Error('无法获取 CanvasRenderingContext2D'); // 抛出错误阻止后续流程继续。
      }
      this.createBackgroundPattern(); // 创建棋盘底纹 Pattern，为 clear 阶段准备。
      this.startLoop(); // 启动基于 requestAnimationFrame 的渲染循环。
      this.requestRender(); // 初始化完成后立刻请求一次绘制，确保画面同步。
    },

    setMap(mapData) {
      // 设置当前需要渲染的地图引用。
      this.map = mapData && typeof mapData === 'object' ? mapData : null; // 仅接受对象类型，其他情况视为清空地图引用。
      this.requestRender(); // 地图切换后需要重新绘制全部内容。
    },

    startLoop() {
      // 启动渲染循环的方法，只在初始化阶段调用一次。
      const step = () => {
        // 定义循环中每一帧执行的回调函数。
        if (this.needsRender) {
          // 当脏标记为真时才执行实际绘制，避免不必要的计算。
          this.render(); // 调用 render 方法绘制当前画面。
          this.needsRender = false; // 绘制完成后重置脏标记，等待下一次状态变化。
        }
        this.rafId = window.requestAnimationFrame(step); // 无论是否绘制都安排下一帧回调，保持循环运转。
      };
      this.rafId = window.requestAnimationFrame(step); // 立即提交第一次帧请求，正式进入循环。
    },

    requestRender() {
      // 对外暴露的脏渲染接口，统一设置 needsRender 标记。
      this.needsRender = true; // 将脏标记设为真，表示下一帧需要重绘。
    },

    resizeToContainer() {
      // 根据父容器尺寸调整 Canvas 宽高，保持铺满舞台区域。
      if (!this.canvas) {
        // 若 Canvas 尚未初始化，直接跳过避免报错。
        return; // 提前结束方法。
      }
      const parent = this.canvas.parentElement; // 获取父容器引用，用于读取可用尺寸。
      if (!parent) {
        // 若没有父容器则无法调整尺寸。
        return; // 直接返回等待外部修复结构。
      }
      const width = parent.clientWidth; // 读取容器的可视宽度。
      const height = parent.clientHeight; // 读取容器的可视高度。
      if (this.canvas.width !== width || this.canvas.height !== height) {
        // 仅当尺寸发生变化时才更新 Canvas，避免重复赋值。
        this.canvas.width = width; // 同步 Canvas 宽度到容器宽度。
        this.canvas.height = height; // 同步 Canvas 高度到容器高度。
        this.requestRender(); // 尺寸变化会影响显示区域，需重新绘制。
      }
    },

    clear() {
      // 清理画布并绘制棋盘底纹的方法。
      if (!this.ctx) {
        // 若上下文未准备好，则直接返回避免异常。
        return; // 结束方法。
      }
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); // 先清空画布内容确保干净背景。
      if (this.backgroundPattern) {
        // 当已经创建底纹 Pattern 时使用它填充背景。
        this.ctx.save(); // 保存上下文状态，防止 fillStyle 被外部继承。
        this.ctx.fillStyle = this.backgroundPattern; // 将填充样式设为预生成的棋盘图案。
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height); // 使用 Pattern 覆盖整个画布形成底纹。
        this.ctx.restore(); // 恢复上下文状态，避免影响后续绘制参数。
      } else {
        // 若 Pattern 尚未就绪，退化为纯色背景填充。
        this.ctx.fillStyle = '#2b2b2b'; // 设定备用背景颜色为深灰。
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height); // 填充整个画布避免透明背景。
      }
    },

    createBackgroundPattern() {
      // 创建棋盘底纹 Pattern 的辅助方法，仅在初始化时执行。
      const patternCanvas = document.createElement('canvas'); // 创建离屏 Canvas 承载底纹像素。
      patternCanvas.width = 4; // 设置小画布宽度为 4 像素，便于重复平铺。
      patternCanvas.height = 4; // 设置小画布高度为 4 像素。
      const patternCtx = patternCanvas.getContext('2d'); // 获取离屏上下文以绘制底纹内容。
      if (!patternCtx) {
        // 如果离屏上下文获取失败，直接返回保持背景为纯色。
        console.warn('[Renderer] 背景 Pattern 创建失败'); // 输出告警方便调试。
        return; // 结束方法。
      }
      patternCtx.fillStyle = '#252525'; // 设定底色为深灰色块。
      patternCtx.fillRect(0, 0, patternCanvas.width, patternCanvas.height); // 填充整个离屏画布。
      patternCtx.fillStyle = 'rgba(255, 255, 255, 0.04)'; // 设置浅色半透明方块颜色。
      patternCtx.fillRect(0, 0, 2, 2); // 在左上角绘制浅色块形成棋盘亮面。
      patternCtx.fillRect(2, 2, 2, 2); // 在右下角绘制另一浅色块形成交错效果。
      this.backgroundPattern = this.ctx.createPattern(patternCanvas, 'repeat'); // 利用主上下文创建可重复的 Pattern。
    },

    setZoom(nextZoom, anchorScreenX, anchorScreenY) {
      // 以鼠标锚点调整相机缩放的方法。
      if (!this.ctx) {
        // 若尚未初始化上下文则无法执行缩放。
        return; // 直接返回。
      }
      const clampedZoom = Math.min(2, Math.max(0.5, nextZoom)); // 将目标缩放限制在 0.5 到 2.0 范围内。
      if (clampedZoom === this.camera.zoom) {
        // 如果缩放值未发生变化则无需处理。
        return; // 直接结束方法。
      }
      const anchorWorld = this.screenToWorld(anchorScreenX, anchorScreenY); // 记录缩放前锚点对应的世界坐标。
      this.camera.zoom = clampedZoom; // 应用新的缩放倍率。
      this.camera.x = anchorWorld.x - anchorScreenX / this.camera.zoom; // 调整相机 X 以保持锚点屏幕位置不变。
      this.camera.y = anchorWorld.y - anchorScreenY / this.camera.zoom; // 调整相机 Y 以保持锚点屏幕位置不变。
      this.requestRender(); // 缩放导致画面变化，标记需重新绘制。
    },

    translateCamera(deltaScreenX, deltaScreenY) {
      // 根据屏幕位移量平移相机的方法。
      const worldDx = deltaScreenX / this.camera.zoom; // 将屏幕位移换算为世界坐标位移（X 轴）。
      const worldDy = deltaScreenY / this.camera.zoom; // 将屏幕位移换算为世界坐标位移（Y 轴）。
      this.camera.x -= worldDx; // 更新相机 X，确保拖动方向与画面移动一致。
      this.camera.y -= worldDy; // 更新相机 Y，保持平移方向一致。
      this.requestRender(); // 相机位置改变后需要重新绘制画面。
    },

    screenToWorld(screenX, screenY) {
      // 将屏幕像素坐标转换为世界坐标的辅助函数。
      const worldX = this.camera.x + screenX / this.camera.zoom; // 根据相机偏移与缩放计算世界 X。
      const worldY = this.camera.y + screenY / this.camera.zoom; // 根据相机偏移与缩放计算世界 Y。
      return { x: worldX, y: worldY }; // 返回包含世界坐标的对象供调用方使用。
    },

    worldToScreen(worldX, worldY) {
      // 将世界坐标转换为屏幕像素坐标的辅助函数。
      const screenX = (worldX - this.camera.x) * this.camera.zoom; // 根据相机偏移与缩放计算屏幕 X。
      const screenY = (worldY - this.camera.y) * this.camera.zoom; // 根据相机偏移与缩放计算屏幕 Y。
      return { x: screenX, y: screenY }; // 返回包含屏幕坐标的对象供调用方使用。
    },

    setGridVisible(visible) {
      // 显式设置网格显示状态的方法，方便 UI 模块调用。
      this.showGrid = Boolean(visible); // 将传入值转换为布尔值后保存。
      this.requestRender(); // 状态改变后需重新绘制以反映结果。
    },

    render() {
      // 主渲染函数，负责清屏并绘制所有可见图层。
      this.clear(); // 先清理画布并绘制底纹，确保背景正确。
      if (this.showGrid) {
        // 当网格开关开启时绘制网格线。
        this.drawGrid(); // 调用 drawGrid 函数渲染 48 像素间隔的网格。
      }
      const map = this.map; // 缓存当前地图引用，避免在循环中重复访问属性。
      if (map) {
        // 仅当存在地图数据时才尝试绘制图层内容。
        this._calcVisibleRange(); // 计算基于相机与缩放的可见网格范围，用于裁剪绘制区域。
        const assets = window.RPG?.Assets; // 读取全局素材管理器引用，获取 `getTileById` 方法。
        if (!assets || typeof assets.getTileById !== 'function') {
          // 若素材管理器尚未就绪，则无法正确绘制贴图，仅在首次检测到时输出告警。
          if (!this.assetsWarned) {
            console.warn('[Renderer] Assets 未初始化，跳过地图渲染'); // 输出警告帮助调试加载顺序问题。
            this.assetsWarned = true; // 标记已输出告警，避免在渲染循环中重复打印。
          }
        } else {
          this.assetsWarned = false; // 一旦素材管理器可用则重置告警标记，便于后续再次检测。
          // 当素材管理器已就绪时开始遍历图层并绘制切片。
          for (const layerName of this.layerOrder) {
            // 遍历固定的图层顺序，确保渲染顺序稳定。
            const layerGrid = map.layers && map.layers[layerName]; // 读取当前图层的二维数组。
            if (!Array.isArray(layerGrid)) {
              // 若图层不存在或结构异常，则跳过该图层避免抛错。
              continue; // 继续处理后续图层。
            }
            for (let gy = this.view.gy0; gy < this.view.gy1; gy += 1) {
              // 按可见范围逐行遍历当前图层。
              const row = layerGrid[gy]; // 读取当前行引用，避免重复索引。
              if (!Array.isArray(row)) {
                // 若行结构异常则跳过，防止访问未定义元素。
                continue; // 继续下一行。
              }
              for (let gx = this.view.gx0; gx < this.view.gx1; gx += 1) {
                // 在可见范围内逐列遍历单元格。
                const placement = row[gx]; // 读取该格的放置信息。
                if (!placement) {
                  // 当单元格为空时无需绘制。
                  continue; // 处理下一列。
                }
                const worldX = gx * this.tileSize; // 将格坐标转换为世界坐标 X。
                const worldY = gy * this.tileSize; // 将格坐标转换为世界坐标 Y。
                const tileDef = assets.getTileById(placement.tileId); // 根据 tileId 查询素材定义。
                if (!tileDef) {
                  // 当素材缺失时绘制红色叉线提示数据异常。
                  this._drawMissingTile(worldX, worldY); // 调用专用方法绘制缺失提示框。
                  continue; // 跳过后续贴图绘制逻辑。
                }
                this.drawTileImage(tileDef, worldX, worldY, {
                  // 调用通用贴图绘制方法，根据数据层记录应用旋转与翻转。
                  rotation: placement.rotation === undefined ? 0 : (placement.rotation | 0), // 使用位运算保证返回整数角度。
                  alpha: 1, // 地图静态绘制始终使用完全不透明的贴图。
                  frameIndex: 0, // 当前轮次仅绘制静态首帧，动画将在 R7 实现。
                  flipX: Boolean(placement.flipX), // 根据数据层记录应用水平翻转。
                  flipY: Boolean(placement.flipY), // 根据数据层记录应用垂直翻转。
                });
              }
            }
          }
        }
      }
      this.drawBrushPreview(); // 在所有基础元素之后绘制画笔预览，确保预览层位于地图之上。
      // TODO(R7): 动画帧循环 // 预留后续动画绘制扩展位置。
    },

    setBrushTile(tileId) {
      // 设置画笔使用的素材 id，并触发重绘。
      this.brush.tileId = typeof tileId === 'string' && tileId.trim() ? tileId.trim() : null; // 将传入的素材 id 规范化为字符串或 null。
      if (!this.brush.tileId) {
        // 当素材被清空时强制关闭画笔预览，避免显示过期贴图。
        this.setBrushVisibility(false); // 通过统一方法移除可见性与光标样式。
      }
      this.requestRender(); // 更新画笔素材后请求重新渲染以反映新预览。
    },

    setBrushRotation(rotation) {
      // 设置画笔预览的旋转角度，仅接受 0/90/180/270。
      const allowed = [0, 90, 180, 270]; // 定义允许的旋转角度集合。
      this.brush.rotation = allowed.includes(rotation) ? rotation : this.brush.rotation; // 若传入角度合法则更新，否则保持原值。
      this.requestRender(); // 旋转变化会影响预览方向，需要重新绘制。
    },

    setBrushVisibility(visible) {
      // 控制画笔预览是否显示，并同步光标样式。
      this.brush.visible = Boolean(visible) && Boolean(this.brush.tileId); // 只有存在素材时才允许显示预览。
      if (this.canvas) {
        // 当 Canvas 已初始化时同步 class 控制光标样式。
        this.canvas.classList.toggle('brush-visible', this.brush.visible); // 根据可见性切换 brush-visible 类。
      }
      this.requestRender(); // 状态变化后请求重绘以更新预览层。
    },

    setBrushHoverGrid(gx, gy) {
      // 更新画笔预览当前吸附的网格坐标。
      if (!Number.isInteger(gx) || !Number.isInteger(gy)) {
        // 若传入的坐标不是整数则忽略本次更新。
        return; // 直接返回避免写入非法值。
      }
      this.brush.hoverGX = gx; // 写入新的网格 X 坐标。
      this.brush.hoverGY = gy; // 写入新的网格 Y 坐标。
      this.requestRender(); // 位置变化需要重新绘制预览。
    },

    getBrushState() {
      // 返回当前画笔状态的只读快照供其他模块查询。
      return { ...this.brush }; // 使用浅拷贝返回画笔对象，避免外部直接修改内部状态。
    },

    drawTileImage(tileDef, worldX, worldY, opts = {}) {
      // 在指定世界坐标绘制一个素材切片，可应用旋转、透明度与翻转。
      if (!tileDef || typeof tileDef !== 'object') {
        // 若未提供合法的素材定义则直接返回。
        return; // 结束绘制以避免报错。
      }
      const assets = window.RPG?.Assets; // 读取全局 Assets 管理器引用。
      if (!assets) {
        // 若素材管理器尚未就绪则跳过绘制。
        return; // 结束方法等待初始化完成。
      }
      const cacheKey = typeof tileDef.src === 'string' ? tileDef.src.trim() : ''; // 规范化图像缓存键值。
      const image = cacheKey && assets.images ? assets.images.get(cacheKey) : null; // 从缓存中尝试获取已经加载的图像对象。
      if (!(image instanceof HTMLImageElement) || !image.complete || image.naturalWidth === 0) {
        // 若图像尚未加载完成则暂时不绘制。
        assets.getImageFor(tileDef.src).then(() => { // 调用素材管理器加载或复用图集图片，并在加载完成后执行回调。
          // 调用 Assets.getImageFor 触发图像加载，并在完成后请求重绘以确保最终显示。
          this.requestRender(); // 图像加载完成后安排一次重新渲染以展示结果。
        }).catch((error) => { // 若加载 Promise 进入拒绝态则在此捕获，避免异常冒泡中断渲染循环。
          // 当图片加载失败时捕获错误仅输出警告。
          console.warn('[Renderer] tile image load failed', tileDef.id, error); // 输出日志辅助排查问题。
        });
        return; // 等待下一帧重新渲染。
      }
      const options = {
        rotation: 0, // 预设默认旋转角度为 0 度。
        alpha: 1, // 默认完全不透明，便于覆盖时调节透明度。
        frameIndex: 0, // 默认选择第 0 帧，静态素材只显示首帧。
        flipX: false, // 默认不进行水平翻转。
        flipY: false, // 默认不进行垂直翻转。
        ...opts, // 合并调用方提供的选项覆盖默认值。
      }; // 合并调用方传入的选项与默认值。
      const rect = tileDef.rect || { x: 0, y: 0, width: this.tileSize, height: this.tileSize }; // 获取素材在图集中的矩形定义。
      const frameWidth = rect.width; // 读取单帧宽度。
      const frameHeight = rect.height; // 读取单帧高度。
      const totalFrames = tileDef.animated ? Math.max(1, tileDef.animated) : 1; // 读取素材的帧数，至少为 1。
      const frameIndex = Math.min(options.frameIndex, totalFrames - 1); // 将帧索引限制在合法范围内。
      const sx = rect.x + frameWidth * frameIndex; // 计算源图像区域的 X 坐标。
      const sy = rect.y; // 源图像区域的 Y 坐标为 rect.y。
      if (sx + frameWidth > image.naturalWidth || sy + frameHeight > image.naturalHeight) {
        // 若源区域越界则放弃绘制避免报错。
        console.warn('[Renderer] tile rect out of bounds', tileDef.id); // 输出警告帮助检查 manifest 配置。
        return; // 提前结束绘制流程。
      }
      const screenPos = this.worldToScreen(worldX, worldY); // 将世界坐标转换为屏幕坐标（左上角）。
      const zoom = this.camera.zoom; // 缓存当前缩放倍率减少重复访问。
      const destWidth = frameWidth * zoom; // 根据缩放计算目标宽度。
      const destHeight = frameHeight * zoom; // 根据缩放计算目标高度。
      const centerX = screenPos.x + destWidth / 2; // 计算绘制时的中心点 X。
      const centerY = screenPos.y + destHeight / 2; // 计算绘制时的中心点 Y。
      this.ctx.save(); // 保存当前绘图上下文状态以便应用变换。
      this.ctx.imageSmoothingEnabled = false; // 禁用插值保持像素风格清晰。
      this.ctx.globalAlpha = options.alpha; // 设置全局透明度控制预览或图层的可见度。
      this.ctx.translate(centerX, centerY); // 将坐标原点移动到素材中心以便旋转。
      const radians = (options.rotation * Math.PI) / 180; // 将角度转换为弧度供 canvas 旋转使用。
      if (options.rotation !== 0) {
        // 当需要旋转时应用旋转变换。
        this.ctx.rotate(radians); // 旋转上下文以改变绘制方向。
      }
      const scaleX = options.flipX ? -1 : 1; // 根据 flipX 计算水平缩放因子。
      const scaleY = options.flipY ? -1 : 1; // 根据 flipY 计算垂直缩放因子。
      if (scaleX !== 1 || scaleY !== 1) {
        // 当存在翻转需求时应用缩放变换。
        this.ctx.scale(scaleX, scaleY); // 通过 scale 实现翻转效果。
      }
      const drawX = -destWidth / 2; // 计算 drawImage 的起点 X，使素材围绕中心绘制。
      const drawY = -destHeight / 2; // 计算 drawImage 的起点 Y，使素材围绕中心绘制。
      this.ctx.drawImage(image, sx, sy, frameWidth, frameHeight, drawX, drawY, destWidth, destHeight); // 将图集中的指定区域绘制到目标位置。
      this.ctx.restore(); // 恢复上下文状态，避免影响后续绘制。
    },

    _drawMissingTile(worldX, worldY) {
      // 绘制素材缺失时的红色提示方框与叉线。
      const screenPos = this.worldToScreen(worldX, worldY); // 将世界坐标转换为屏幕坐标。
      const zoom = this.camera.zoom; // 缓存当前缩放倍率以计算像素尺寸。
      const width = this.tileSize * zoom; // 根据缩放换算绘制宽度。
      const height = this.tileSize * zoom; // 根据缩放换算绘制高度。
      const style = getComputedStyle(document.documentElement); // 读取全局 CSS 变量集合。
      const warnColor = (style.getPropertyValue('--warn') || '#e74c3c').trim(); // 获取警告颜色，缺省使用红色。
      const strokeX = Math.round(screenPos.x) + 0.5; // 对齐到像素中心，避免描边模糊。
      const strokeY = Math.round(screenPos.y) + 0.5; // 同理对齐 Y 坐标。
      this.ctx.save(); // 保存当前绘图状态。
      this.ctx.lineWidth = 2; // 设置描边线宽以突出提示。
      this.ctx.strokeStyle = warnColor; // 使用警告色绘制边框与叉线。
      this.ctx.globalAlpha = 0.95; // 略微降低透明度以与背景区分。
      this.ctx.strokeRect(strokeX, strokeY, width, height); // 绘制缺失图块的边框。
      this.ctx.beginPath(); // 开启新路径绘制叉线。
      this.ctx.moveTo(strokeX, strokeY); // 将起点移动到方框左上角。
      this.ctx.lineTo(strokeX + width, strokeY + height); // 绘制到右下角形成对角线。
      this.ctx.moveTo(strokeX + width, strokeY); // 将画笔移动到右上角。
      this.ctx.lineTo(strokeX, strokeY + height); // 绘制到左下角形成另一条对角线。
      this.ctx.stroke(); // 渲染叉线提示素材缺失。
      this.ctx.restore(); // 恢复上下文状态，防止影响后续绘制。
    },

    drawBrushPreview() {
      // 绘制画笔预览层，包括素材半透明叠加与网格高亮框。
      if (!this.brush.visible || !this.brush.tileId) {
        // 当预览不可见或未选择素材时跳过绘制。
        return; // 直接返回。
      }
      const assets = window.RPG?.Assets; // 获取全局素材管理器引用。
      if (!assets) {
        // 若素材管理器尚未初始化则无法绘制预览。
        return; // 等待下次渲染。
      }
      const tileDef = assets.getTileById(this.brush.tileId); // 根据当前画笔 id 查询素材定义。
      const worldX = this.brush.hoverGX * this.tileSize; // 根据网格 X 计算世界坐标 X。
      const worldY = this.brush.hoverGY * this.tileSize; // 根据网格 Y 计算世界坐标 Y。
      const map = this.map; // 缓存当前地图引用以检查越界情况。
      const editor = window.RPG?.Editor; // 获取编辑器实例，用于读取激活图层。
      let highlightColor = null; // 预留描边颜色变量，稍后根据状态决定使用哪种颜色。
      let shouldWarn = false; // 标记当前预览是否处于不可落笔状态。
      if (!map) {
        // 当尚未加载地图时无法真正落笔。
        highlightColor = (getComputedStyle(document.documentElement).getPropertyValue('--color-muted') || '#9e9e9e').trim(); // 选择灰色提示仅为占位。
      } else {
        // 当存在地图时检查越界与图层匹配。
        const inBounds = this.brush.hoverGX >= 0 && this.brush.hoverGX < map.width && this.brush.hoverGY >= 0 && this.brush.hoverGY < map.height; // 判断预览是否处于地图范围内。
        const activeLayer = editor && typeof editor.getActiveLayer === 'function' ? editor.getActiveLayer() : null; // 读取当前激活图层名称。
        const layerMatch = tileDef && tileDef.layer === activeLayer; // 判断素材定义的图层是否与当前图层一致。
        shouldWarn = !inBounds || !layerMatch || !tileDef; // 只要越界、图层不匹配或素材缺失就进入警告态。
        const style = getComputedStyle(document.documentElement); // 读取 CSS 变量集合以获取颜色。
        const warnColor = (style.getPropertyValue('--warn') || '#e74c3c').trim(); // 提取警告描边颜色。
        const okColor = (style.getPropertyValue('--color-brush') || 'rgba(77, 182, 172, 0.7)').trim(); // 提取正常描边颜色。
        highlightColor = shouldWarn ? warnColor : okColor; // 根据状态选择描边颜色。
        if (tileDef && !shouldWarn) {
          // 当素材存在且状态允许落笔时绘制半透明贴图。
          this.drawTileImage(tileDef, worldX, worldY, {
            rotation: this.brush.rotation, // 让预览沿用当前记录的旋转角度。
            alpha: this.brush.alpha, // 采用预设透明度呈现半透明效果。
            frameIndex: 0, // 预览始终展示静态首帧。
            flipX: false, // 预览阶段暂未提供水平翻转。
            flipY: false, // 预览阶段暂未提供垂直翻转。
          });
        }
        if (tileDef && shouldWarn) {
          // 当处于警告态但仍有素材定义时，继续绘制半透明贴图以便对位。
          this.drawTileImage(tileDef, worldX, worldY, {
            rotation: this.brush.rotation, // 使用当前旋转角度保持视觉一致。
            alpha: this.brush.alpha, // 维持半透明效果提示落笔位置。
            frameIndex: 0, // 仍仅绘制首帧。
            flipX: false, // 暂不处理水平翻转。
            flipY: false, // 暂不处理垂直翻转。
          });
        }
      }
      const screenPos = this.worldToScreen(worldX, worldY); // 将格子左上角转换为屏幕坐标，用于绘制高亮框。
      const zoom = this.camera.zoom; // 缓存当前缩放倍率。
      const width = this.tileSize * zoom; // 计算高亮框宽度，随缩放变化。
      const height = this.tileSize * zoom; // 计算高亮框高度。
      this.ctx.save(); // 保存上下文状态准备绘制描边框。
      this.ctx.lineWidth = 2; // 设置描边线宽使高亮框更加明显。
      this.ctx.strokeStyle = highlightColor || '#888888'; // 当未能读取 CSS 变量时使用灰色回退值。
      this.ctx.globalAlpha = shouldWarn ? 1 : 0.9; // 警告态使用不透明描边强调提示。
      this.ctx.strokeRect(Math.round(screenPos.x) + 0.5, Math.round(screenPos.y) + 0.5, width, height); // 绘制与网格对齐的矩形描边。
      this.ctx.restore(); // 恢复上下文状态，避免影响后续绘制。
    },

    _calcVisibleRange() {
      // 计算当前视口对应的可见网格范围。
      if (!this.canvas || !this.map) {
        // 当画布或地图未准备好时，将视口范围重置为零，避免无意义遍历。
        this.view.gx0 = 0; // 重置左边界。
        this.view.gy0 = 0; // 重置上边界。
        this.view.gx1 = 0; // 重置右边界。
        this.view.gy1 = 0; // 重置下边界。
        return; // 直接结束计算。
      }
      const map = this.map; // 缓存地图引用以便多次使用。
      const zoom = this.camera.zoom; // 缓存当前缩放倍率。
      const visibleWidth = this.canvas.width / zoom; // 将画布宽度换算为世界单位。
      const visibleHeight = this.canvas.height / zoom; // 将画布高度换算为世界单位。
      const left = this.camera.x; // 计算可视区域左侧世界坐标。
      const top = this.camera.y; // 计算可视区域顶部世界坐标。
      const right = left + visibleWidth; // 计算可视区域右侧世界坐标。
      const bottom = top + visibleHeight; // 计算可视区域底部世界坐标。
      const buffer = 1; // 为避免裁剪过近，额外扩展一格缓冲区。
      const rawGX0 = Math.floor(left / this.tileSize) - buffer; // 将左侧世界坐标转换为网格索引并减去缓冲。
      const rawGY0 = Math.floor(top / this.tileSize) - buffer; // 将顶部世界坐标转换为网格索引并减去缓冲。
      const rawGX1 = Math.ceil(right / this.tileSize) + buffer; // 将右侧世界坐标转换为网格索引并加上缓冲。
      const rawGY1 = Math.ceil(bottom / this.tileSize) + buffer; // 将底部世界坐标转换为网格索引并加上缓冲。
      this.view.gx0 = Math.min(map.width, Math.max(0, rawGX0)); // 将左边界裁剪到 0 与地图宽度之间。
      this.view.gy0 = Math.min(map.height, Math.max(0, rawGY0)); // 将上边界裁剪到 0 与地图高度之间。
      this.view.gx1 = Math.min(map.width, Math.max(0, rawGX1)); // 将右边界裁剪到合法范围，避免出现负值。
      this.view.gy1 = Math.min(map.height, Math.max(0, rawGY1)); // 将下边界裁剪到合法范围。
    },

    drawGrid() {
      // 绘制可视范围内网格线条的方法。
      const width = this.canvas.width; // 读取画布当前宽度，用于计算可视范围。
      const height = this.canvas.height; // 读取画布当前高度。
      const zoom = this.camera.zoom; // 缓存当前缩放倍率，减少重复访问。
      const left = this.camera.x; // 计算可视区域左侧世界坐标。
      const top = this.camera.y; // 计算可视区域顶部世界坐标。
      const right = left + width / zoom; // 计算可视区域右侧世界坐标。
      const bottom = top + height / zoom; // 计算可视区域底部世界坐标。
      const startX = Math.floor(left / this.tileSize) * this.tileSize; // 找到可视区域左侧最近的网格线世界 X。
      const startY = Math.floor(top / this.tileSize) * this.tileSize; // 找到可视区域顶部最近的网格线世界 Y。
      const endX = Math.ceil(right / this.tileSize) * this.tileSize; // 找到可视区域右侧边界后的网格线世界 X。
      const endY = Math.ceil(bottom / this.tileSize) * this.tileSize; // 找到可视区域底部边界后的网格线世界 Y。
      this.ctx.save(); // 保存上下文状态，为设置线条样式做准备。
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)'; // 设置网格线颜色为半透明白色，避免过于抢眼。
      this.ctx.lineWidth = 1; // 使用 1 像素线宽保持细腻效果。
      for (let worldX = startX; worldX <= endX; worldX += this.tileSize) {
        // 遍历可见范围内所有垂直网格线。
        const screenX = (worldX - this.camera.x) * zoom; // 将当前网格线世界 X 转换为屏幕坐标。
        this.ctx.beginPath(); // 开启新路径以绘制单条线段。
        this.ctx.moveTo(screenX, 0); // 将画笔移动到画布顶部对应的屏幕 X。
        this.ctx.lineTo(screenX, height); // 绘制到画布底部形成垂直线。
        this.ctx.stroke(); // 渲染当前垂直网格线。
      }
      for (let worldY = startY; worldY <= endY; worldY += this.tileSize) {
        // 遍历可见范围内所有水平网格线。
        const screenY = (worldY - this.camera.y) * zoom; // 将当前网格线世界 Y 转换为屏幕坐标。
        this.ctx.beginPath(); // 开启新路径准备绘制水平线。
        this.ctx.moveTo(0, screenY); // 将画笔移动到画布左侧对应的屏幕 Y。
        this.ctx.lineTo(width, screenY); // 绘制到画布右侧形成水平线。
        this.ctx.stroke(); // 渲染当前水平网格线。
      }
      this.ctx.restore(); // 恢复上下文状态，避免影响后续绘制参数。
    },
  };

  window.RPG = window.RPG || {}; // 确保全局命名空间存在，避免覆盖其他模块。
  window.RPG.Renderer = Renderer; // 将 Renderer 暴露到全局命名空间供外部模块调用。
})();
