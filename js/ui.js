/* =============================================
 * 模块：UI 用户界面交互
 * 描述：负责绑定界面事件、加载素材清单并驱动素材面板与状态栏
 * 说明：第 4 轮新增 manifest 加载、素材筛选与画笔状态联动
 * ============================================= */

(function () {
  // 使用立即执行函数包裹模块，避免内部变量泄露到全局空间。
  const UI = {
    // 定义 UI 单例对象，集中管理界面元素与交互逻辑。
    elements: {}, // 存储常用 DOM 节点引用，减少重复查询。
    renderer: null, // 缓存渲染器实例引用，方便调用相机接口。
    editor: null, // 缓存编辑器实例引用，读取状态与数据层 API。
    assets: null, // 缓存 Assets 管理器引用，统一访问 manifest 与缩略图功能。
    status: { map: null, layer: null, brush: null, zoom: null, pos: null, hint: null }, // 存储状态栏各个文本节点引用。
    assetPanel: { select: null, search: null, grid: null, errorBanner: null, buttons: [], currentPack: null, ready: false }, // 管理素材面板内部节点与状态。
    panOrigin: { x: 0, y: 0 }, // 记录开始平移时的屏幕坐标，用于计算位移。
    brushRotation: 0, // 记录当前画笔预览的旋转角度，配合状态栏显示。
    editState: { painting: false, erasing: false, lastGX: null, lastGY: null }, // 记录当前鼠标绘制/擦除的拖拽状态。
    statusHintTimer: null, // 保存状态栏临时提示的定时器句柄，便于自动清理。

    async init({ canvas, toolbar, sidebar, statusbar }) {
      // 初始化方法，接收界面关键节点引用。
      if (!canvas || !toolbar || !sidebar || !statusbar) {
        // 若缺少任一必要节点则抛出错误提示调用方修正。
        throw new Error('UI.init 缺少必要 DOM 节点'); // 抛出错误保证初始化条件满足。
      }
      this.elements.canvas = canvas; // 缓存 Canvas 引用供后续事件处理。
      this.elements.toolbar = toolbar; // 缓存工具栏引用用于插入按钮。
      this.elements.sidebar = sidebar; // 缓存侧边栏引用以便扩展。
      this.elements.statusbar = statusbar; // 缓存状态栏引用便于批量查询节点。
      this.elements.layerSelect = document.getElementById('layerSelect'); // 获取图层选择下拉框引用方便后续绑定事件。
      this.renderer = window.RPG.Renderer; // 读取全局渲染器实例以便调用图形相关功能。
      this.editor = window.RPG.Editor; // 读取全局编辑器实例以访问数据层 API。
      this.assets = window.RPG.Assets; // 读取全局 Assets 管理器以加载 manifest 与缩略图。
      const rendererBrush = this.renderer.getBrushState ? this.renderer.getBrushState() : null; // 尝试读取渲染器提供的画笔快照。
      this.brushRotation = rendererBrush ? rendererBrush.rotation : 0; // 将初始旋转角同步到 UI 状态，默认 0 度。
      this.cacheStatusbarNodes(); // 查询并缓存状态栏节点。
      this.setupStatusbar(); // 设置状态栏默认文本。
      this.setupToolbar(); // 构建工具栏按钮并绑定事件。
      this.setupLayerSelect(); // 绑定图层下拉框事件并同步初始状态。
      this.setupSidebarStructure(); // 构建素材面板基础结构并绑定输入事件。
      this.bindCanvasEvents(); // 绑定 Canvas 鼠标事件实现相机控制。
      this.bindKeyboardEvents(); // 绑定键盘事件追踪空格状态。
      this.bindResizeObserver(); // 监听窗口尺寸变化以自适应 Canvas。
      this.bindMapEvents(); // 订阅地图与画笔变更事件以更新状态栏。
      // TODO(R8): 精确世界坐标命中 // 预留后续拾取逻辑扩展注释。
      const manifestReady = await this.prepareAssetPanel(); // 加载 manifest 并刷新素材面板。
      this.renderer.setMap(this.editor.getCurrentMap()); // 初始化阶段同步一次地图引用（可能为 null）。
      this.renderer.requestRender(); // 触发一次重绘以反映最新的地图与预览状态。
      return { manifestReady }; // 返回加载结果给入口脚本，用于控制日志输出。
    },

    cacheStatusbarNodes() {
      // 查询并缓存状态栏内的文本节点。
      this.status.map = document.getElementById('status-map'); // 获取显示地图信息的节点引用。
      this.status.layer = document.getElementById('status-layer'); // 获取显示当前图层的节点引用。
      this.status.brush = document.getElementById('status-brush'); // 获取显示画笔信息的节点引用。
      this.status.zoom = document.getElementById('status-zoom'); // 获取显示缩放信息的节点引用。
      this.status.pos = document.getElementById('status-pos'); // 获取显示鼠标坐标的节点引用。
      this.status.hint = document.getElementById('status-hint'); // 获取临时提示文本节点引用。
    },

    setupToolbar() {
      // 构建工具栏按钮并绑定交互事件。
      const menuGroup = this.elements.toolbar.querySelector('#menu-buttons'); // 查找按钮容器节点。
      if (menuGroup) {
        // 仅当容器存在时才插入按钮，确保布局安全。
        const gridButton = document.createElement('button'); // 创建 Grid 切换按钮节点。
        gridButton.type = 'button'; // 指定按钮类型为普通按钮避免表单行为。
        gridButton.className = 'btn btn-toggle'; // 设置按钮样式类名以复用现有样式。
        gridButton.textContent = 'Grid'; // 设置按钮文本描述功能。
        gridButton.setAttribute('aria-pressed', String(this.renderer.showGrid)); // 同步 aria 属性反映当前状态。
        gridButton.addEventListener('click', () => {
          // 绑定点击事件以切换网格显示。
          const nextState = !this.renderer.showGrid; // 计算切换后的显示状态。
          this.renderer.setGridVisible(nextState); // 调用渲染器接口更改网格可见性。
          gridButton.setAttribute('aria-pressed', String(nextState)); // 同步按钮的 aria 状态。
        });
        menuGroup.appendChild(gridButton); // 将 Grid 按钮插入工具栏。

        const newMapButton = document.createElement('button'); // 创建“新建 50×30 地图”调试按钮。
        newMapButton.type = 'button'; // 设置按钮类型为普通按钮。
        newMapButton.className = 'btn'; // 应用通用按钮样式。
        newMapButton.textContent = '新建 50×30 地图'; // 设置按钮文本描述用途。
        newMapButton.addEventListener('click', () => {
          // 绑定点击事件创建并加载示例地图。
          const map = this.editor.createNewMap('Map001', 50, 30); // 调用数据层 API 创建新地图对象。
          this.editor.setCurrentMap(map); // 将新建地图设置为当前地图以触发状态更新。
          console.log('[UI] demo map created', map); // 在控制台输出示例地图对象供调试。
        });
        menuGroup.appendChild(newMapButton); // 将新建地图按钮插入工具栏。

        const sampleTileButton = document.createElement('button'); // 创建写入样例图块的调试按钮。
        sampleTileButton.type = 'button'; // 设置按钮类型为普通按钮。
        sampleTileButton.className = 'btn'; // 应用通用按钮样式。
        sampleTileButton.textContent = '写入样例格 (ground,10,5)'; // 设置按钮文本说明功能。
        sampleTileButton.addEventListener('click', () => {
          // 绑定点击事件以写入示例图块。
          const currentMap = this.editor.getCurrentMap(); // 读取当前地图引用确认是否已加载。
          if (!currentMap) {
            // 若尚未加载地图则提示需要先新建。
            console.warn('[UI] 请先创建地图再写入样例格'); // 输出警告避免抛出异常。
            return; // 结束方法避免继续执行写入。
          }
          this.editor.setTile('ground', 10, 5, {
            tileId: 'dgn.floor_rock', // 指定示例素材 id。
            rotation: 0, // 默认不旋转。
            flipX: false, // 默认不水平翻转。
            flipY: false, // 默认不垂直翻转。
            animOffset: 0, // 默认动画偏移为 0。
          });
          console.log('sample getTile = ', this.editor.getTile('ground', 10, 5)); // 从数据层读取写入结果并打印。
        });
        menuGroup.appendChild(sampleTileButton); // 将写入样例按钮插入工具栏。
      }
      const fileButton = this.elements.toolbar.querySelector('button[data-action="file"]'); // 获取文件按钮引用。
      const mapButton = this.elements.toolbar.querySelector('button[data-action="map"]'); // 获取地图按钮引用。
      const packButton = this.elements.toolbar.querySelector('button[data-action="packs"]'); // 获取素材包按钮引用。
      if (fileButton) {
        // 若按钮存在则保留占位事件。
        fileButton.addEventListener('click', () => {
          // 点击后输出占位日志等待后续迭代实现。
          console.log('[UI] 文件菜单点击，占位事件'); // 输出日志提醒功能暂未实现。
        });
      }
      if (mapButton) {
        // 若按钮存在则保留占位事件。
        mapButton.addEventListener('click', () => {
          // 点击后输出占位日志等待后续迭代实现。
          console.log('[UI] 地图菜单点击，占位事件'); // 输出日志提醒功能暂未实现。
        });
      }
      if (packButton) {
        // 若按钮存在则保留占位事件。
        packButton.addEventListener('click', () => {
          // 点击后输出占位日志等待后续迭代实现。
          console.log('[UI] 素材包菜单点击，占位事件'); // 输出日志提醒功能暂未实现。
        });
      }
    },

    setupLayerSelect() {
      // 初始化工具栏中的图层选择下拉框并绑定事件。
      const select = this.elements.layerSelect; // 读取缓存的下拉框引用。
      if (!select) {
        // 若元素缺失则输出警告并跳过，等待后续结构修正。
        console.warn('[UI] 未找到 layerSelect 元素'); // 输出警告帮助定位模板问题。
        return; // 结束方法，避免绑定事件时报错。
      }
      const activeLayer = this.editor.getActiveLayer(); // 读取当前激活图层。
      select.value = activeLayer; // 将下拉框的选中项同步为当前图层。
      select.addEventListener('change', () => {
        // 监听图层切换事件。
        const nextLayer = select.value; // 读取用户选择的图层名称。
        try {
          this.editor.setActiveLayer(nextLayer); // 调用数据层接口切换激活图层。
          this.updateLayerStatus(nextLayer); // 更新状态栏显示新的图层名称。
          this.renderer.requestRender(); // 切换图层会影响预览高亮，需要重新渲染。
        } catch (error) {
          // 当切换过程中抛出异常时恢复旧值并给出提示。
          console.warn('[UI] 切换图层失败', error); // 在控制台输出错误详情便于调试。
          select.value = this.editor.getActiveLayer(); // 恢复下拉框为原先的合法图层。
          this.showHint('图层切换失败，请检查控制台日志'); // 在状态栏显示临时提示提醒用户。
        }
      });
    },

    setupSidebarStructure() {
      // 设置侧边栏结构，创建素材包选择器、搜索框与素材网格容器。
      const panelBody = this.elements.sidebar.querySelector('.panel-body'); // 获取素材面板主体容器。
      if (!panelBody) {
        // 若未找到容器则直接返回避免报错。
        return; // 结束方法等待后续结构修正。
      }
      panelBody.innerHTML = ''; // 清空旧的占位内容，为动态 UI 做准备。

      const packGroup = document.createElement('div'); // 创建素材包选择器的表单分组。
      packGroup.className = 'control-group'; // 应用统一的表单样式。
      const packLabel = document.createElement('label'); // 创建标签描述下拉框功能。
      packLabel.setAttribute('for', 'packSelect'); // 关联标签与下拉框。
      packLabel.textContent = '素材包'; // 设置可读文本。
      const packSelect = document.createElement('select'); // 创建素材包下拉框。
      packSelect.id = 'packSelect'; // 设置 id 方便样式与查询。
      packSelect.name = 'packSelect'; // 设置 name 属性保持语义。
      packSelect.disabled = true; // 初始化为禁用状态，待 manifest 加载成功后启用。
      packGroup.appendChild(packLabel); // 将标签插入表单分组。
      packGroup.appendChild(packSelect); // 将下拉框插入表单分组。

      const searchGroup = document.createElement('div'); // 创建搜索输入的表单分组。
      searchGroup.className = 'control-group'; // 应用统一样式。
      const searchLabel = document.createElement('label'); // 创建搜索框标签。
      searchLabel.setAttribute('for', 'assetSearch'); // 将标签指向搜索框。
      searchLabel.textContent = '搜索素材'; // 设置可读文本描述。
      const searchInput = document.createElement('input'); // 创建搜索输入框。
      searchInput.type = 'search'; // 使用 search 类型以提供清除按钮等体验。
      searchInput.id = 'assetSearch'; // 设置 id 便于获取引用。
      searchInput.placeholder = '按 id 过滤'; // 设置占位文本提示用户输入。
      searchInput.disabled = true; // 在 manifest 加载前禁用输入，避免误操作。
      searchGroup.appendChild(searchLabel); // 插入标签。
      searchGroup.appendChild(searchInput); // 插入输入框。

      const grid = document.createElement('div'); // 创建素材缩略图网格容器。
      grid.className = 'asset-grid'; // 应用定义好的网格样式。
      grid.setAttribute('aria-label', 'Asset Thumbnails'); // 添加辅助功能标签方便朗读器。

      panelBody.appendChild(packGroup); // 将下拉框表单分组插入面板。
      panelBody.appendChild(searchGroup); // 将搜索表单分组插入面板。
      panelBody.appendChild(grid); // 将素材网格插入面板底部。

      this.assetPanel.select = packSelect; // 缓存下拉框引用供后续使用。
      this.assetPanel.search = searchInput; // 缓存搜索输入框引用。
      this.assetPanel.grid = grid; // 缓存素材网格容器。
      this.assetPanel.buttons = []; // 重置按钮列表，等待渲染时填充。
      this.assetPanel.currentPack = null; // 当前选中的素材包名称初始化为空。
      this.assetPanel.animRafId = null; // 记录面板动画循环的 requestAnimationFrame 句柄。
      this.assetPanel.lastFrame = -1; // 记录上一帧用于检测是否需要重绘缩略图。

      packSelect.addEventListener('change', () => {
        // 监听素材包切换事件。
        this.handlePackChange(); // 调用内部方法刷新素材网格。
      });
      searchInput.addEventListener('input', () => {
        // 监听搜索输入变化。
        this.renderAssetGrid(); // 根据新的关键字重新渲染素材列表。
      });
    },

    async prepareAssetPanel() {
      // 加载 manifest 数据并初始化素材面板内容。
      try {
        await this.assets.loadManifest(); // 调用 Assets 管理器加载并校验 manifest。
      } catch (error) {
        // 当加载或校验失败时执行错误处理。
        this.showManifestError('无法加载素材清单，请检查 assets/manifest.json。'); // 在面板显示错误提示条。
        console.error('[UI] manifest load failed', error); // 在控制台打印错误详情。
        return false; // 返回 false 告知入口脚本加载失败。
      }
      this.clearManifestError(); // 清理可能存在的错误提示条。
      const packs = this.assets.getPacks(); // 获取规范化后的素材包列表。
      this.populatePackOptions(packs); // 根据 manifest 填充下拉选项。
      if (packs.length > 0) {
        // 当存在素材包时启用筛选控件并渲染网格。
        this.assetPanel.select.disabled = false; // 允许切换素材包。
        this.assetPanel.search.disabled = false; // 允许输入搜索关键词。
        this.assetPanel.currentPack = packs[0].name; // 默认选中第一个素材包。
        this.assetPanel.select.value = packs[0].name; // 同步下拉框选中项。
        this.renderAssetGrid(); // 渲染默认素材包的缩略图列表。
      } else {
        // 当 manifest 中没有素材包时显示空状态。
        this.renderEmptyState('manifest 中未定义任何素材包'); // 提示需要补充数据。
      }
      this.assetPanel.ready = true; // 标记素材面板已准备就绪。
      return true; // 返回 true 告知入口脚本加载成功。
    },

    populatePackOptions(packs) {
      // 根据提供的素材包列表更新下拉框选项。
      this.assetPanel.select.innerHTML = ''; // 清空现有选项以避免残留。
      packs.forEach((pack) => {
        // 遍历每个素材包创建 option 元素。
        const option = document.createElement('option'); // 创建新的 option 节点。
        option.value = pack.name; // 将包名称作为 option 值。
        option.textContent = pack.name; // 显示名称供用户选择。
        this.assetPanel.select.appendChild(option); // 将 option 插入下拉框。
      });
    },

    handlePackChange() {
      // 在用户切换素材包时更新当前状态并重新渲染网格。
      const selected = this.assetPanel.select.value; // 读取下拉框当前选中值。
      this.assetPanel.currentPack = selected; // 更新面板状态中的当前包名称。
      this.renderAssetGrid(); // 刷新素材缩略图列表。
    },

    renderAssetGrid() {
      // 根据当前素材包和搜索关键字渲染素材缩略图按钮。
      if (!this.assetPanel.grid) {
        // 若素材网格容器不存在则直接返回。
        return; // 等待结构修复后再渲染。
      }
      if (this.assetPanel.animRafId !== null) {
        // 当之前存在动画循环时先取消，避免重复帧请求。
        window.cancelAnimationFrame(this.assetPanel.animRafId); // 取消旧的 requestAnimationFrame。
        this.assetPanel.animRafId = null; // 重置句柄状态。
      }
      this.assetPanel.lastFrame = -1; // 重置上一帧记录，确保重新绘制缩略图。
      this.assetPanel.grid.innerHTML = ''; // 清空网格内容准备重新填充。
      this.assetPanel.buttons = []; // 清空按钮引用数组。
      const packs = this.assets.getPacks(); // 读取最新的素材包列表。
      const pack = packs.find((item) => item.name === this.assetPanel.currentPack); // 查找当前选择的素材包。
      if (!pack) {
        // 当当前选择不存在时显示提示信息。
        this.renderEmptyState('未找到对应的素材包'); // 提示用户检查 manifest。
        this.updateBrushStatus(this.editor.getSelectedTileId()); // 仍然同步状态栏画笔显示。
        return; // 结束渲染流程。
      }
      const keyword = this.assetPanel.search.value.trim().toLowerCase(); // 读取并规范化搜索关键字。
      const tiles = pack.tiles.filter((tile) => {
        // 根据关键字过滤素材列表。
        if (!keyword) {
          // 当关键字为空时不过滤任何素材。
          return true; // 直接保留全部素材。
        }
        return tile.id.toLowerCase().includes(keyword); // 仅保留 id 中包含关键字的素材。
      });
      if (tiles.length === 0) {
        // 当过滤结果为空时显示友好提示。
        this.renderEmptyState('没有匹配的素材'); // 告知用户调整关键字。
        this.updateBrushStatus(this.editor.getSelectedTileId()); // 同步画笔状态，显示当前或无选择。
        return; // 结束渲染流程。
      }
      tiles.forEach((tile) => {
        // 遍历过滤后的素材创建按钮。
        const button = this.createTileButton(tile); // 调用辅助方法生成按钮。
        this.assetPanel.grid.appendChild(button); // 将按钮插入网格容器。
        this.assetPanel.buttons.push(button); // 记录按钮引用用于状态同步。
      });
      this.syncGridSelection(this.editor.getSelectedTileId()); // 根据当前画笔状态刷新选中样式。
      this.paintAssetThumbnailsOnce(); // 初始渲染完成后立即绘制一次缩略图，确保显示最新帧。
      this.ensureAssetPanelAnimation(true); // 启动面板动画循环以驱动动态缩略图。
    },

    createTileButton(tileDef) {
      // 为指定素材定义创建带缩略图的按钮。
      const button = document.createElement('button'); // 创建按钮节点。
      button.type = 'button'; // 设置按钮类型为普通按钮。
      button.className = 'asset-tile-button'; // 应用素材按钮样式。
      button.title = tileDef.id; // 设置 title 属性悬浮显示素材 id。
      button.dataset.tileId = tileDef.id; // 将素材 id 写入 dataset 方便调试或测试。
      button._tileDef = tileDef; // 将素材定义挂载到按钮实例上供缩略图刷新使用。
      const thumb = this.assets.makeTileThumb(tileDef, 0); // 调用 Assets 生成 48×48 缩略图。
      thumb.width = 48; // 显式指定缩略图宽度，确保布局稳定。
      thumb.height = 48; // 显式指定缩略图高度。
      thumb.classList.add('asset-thumb'); // 为缩略图添加类名以便样式控制。
      thumb.dataset.tileId = tileDef.id; // 将素材 id 写入 canvas dataset 方便排查。
      button.appendChild(thumb); // 将缩略图 canvas 插入按钮。
      if (Array.isArray(tileDef.validationWarnings) && tileDef.validationWarnings.length > 0) {
        // 当素材在 manifest 校验阶段产生警告时，为按钮添加提示样式。
        button.classList.add('has-warning'); // 添加 has-warning 类以便在样式层展示提醒。
      }
      if (tileDef.animated !== undefined) {
        // 当素材定义包含动画帧时，额外渲染帧数徽标。
        const badge = document.createElement('span'); // 创建徽标元素。
        badge.className = 'asset-anim-badge'; // 应用徽标样式类。
        badge.textContent = `${tileDef.animated}f`; // 使用“帧数+f”形式展示动画帧数量。
        badge.setAttribute('aria-label', `${tileDef.animated} 帧动画`); // 提供辅助功能文本描述。
        button.appendChild(badge); // 将徽标插入按钮右上角。
      }
      button.addEventListener('click', () => {
        // 绑定点击事件以更新画笔选择。
        this.handleTileSelection(tileDef.id); // 调用内部方法设置当前画笔并刷新状态。
      });
      return button; // 返回构建完成的按钮元素。
    },

    paintAssetThumbnailsOnce() {
      // 遍历当前素材按钮并使用全局动画帧刷新缩略图。
      const assets = this.assets; // 缓存素材管理器引用。
      const renderer = this.renderer; // 缓存渲染器引用以读取动画帧。
      if (!assets || !renderer) {
        // 若关键模块尚未就绪则无需绘制。
        return; // 提前结束避免报错。
      }
      const frame = renderer.anim ? renderer.anim.frame : 0; // 读取当前全局动画帧索引。
      this.assetPanel.buttons.forEach((button) => {
        // 遍历每个素材按钮刷新对应缩略图。
        const tileDef = button._tileDef; // 从按钮上读取素材定义。
        if (!tileDef) {
          // 若缺失素材定义则跳过。
          return; // 继续下一个按钮。
        }
        const canvas = button.querySelector('canvas'); // 查询按钮中的缩略图画布。
        if (!(canvas instanceof HTMLCanvasElement)) {
          // 若未找到合法画布则跳过。
          return; // 继续下一个按钮。
        }
        const ctx = canvas.getContext('2d'); // 获取缩略图 2D 上下文。
        if (!ctx) {
          // 若上下文获取失败则跳过。
          return; // 继续下一个按钮。
        }
        const frameIndex = tileDef.animated !== undefined ? frame : 0; // 根据素材是否动画决定绘制帧。
        assets.drawToCanvas(ctx, tileDef, 0, 0, 48, 48, frameIndex); // 调用共享绘制函数更新缩略图。
      });
      this.assetPanel.lastFrame = frame; // 记录本次绘制使用的帧索引。
    },

    ensureAssetPanelAnimation(forceStart = false) {
      // 启动或维持素材面板缩略图动画循环。
      if (!this.renderer || !this.assets) {
        // 若核心模块尚未就绪则无需启动循环。
        return; // 直接返回等待初始化完成。
      }
      const tick = (forced) => {
        // 定义循环中每帧执行的回调。
        const renderer = this.renderer; // 缓存渲染器引用。
        const assets = this.assets; // 缓存素材管理器引用。
        const frame = renderer.anim ? renderer.anim.frame : 0; // 读取当前全局动画帧索引。
        let hasAnimated = false; // 标记当前面板是否包含动画素材。
        this.assetPanel.buttons.forEach((button) => {
          // 遍历每个素材按钮刷新缩略图。
          const tileDef = button._tileDef; // 读取挂载的素材定义。
          if (!tileDef) {
            // 若缺失素材定义则跳过。
            return; // 继续下一个按钮。
          }
          const canvas = button.querySelector('canvas'); // 获取缩略图画布。
          if (!(canvas instanceof HTMLCanvasElement)) {
            // 若找不到有效画布则跳过。
            return; // 继续下一个按钮。
          }
          const ctx = canvas.getContext('2d'); // 获取绘图上下文。
          if (!ctx) {
            // 若无法获取上下文则跳过。
            return; // 继续下一个按钮。
          }
          const frameIndex = tileDef.animated !== undefined ? frame : 0; // 确定要绘制的帧索引。
          if (tileDef.animated !== undefined) {
            // 当素材具有动画时标记需要持续循环。
            hasAnimated = true; // 记录存在动画素材。
          }
          assets.drawToCanvas(ctx, tileDef, 0, 0, 48, 48, frameIndex); // 绘制当前帧缩略图。
        });
        this.assetPanel.lastFrame = frame; // 记录已绘制的帧索引。
        if (hasAnimated) {
          // 当面板包含动画素材时继续下一帧循环。
          this.assetPanel.animRafId = window.requestAnimationFrame(() => tick(false)); // 请求下一帧继续动画。
        } else if (forced) {
          // 当强制刷新时额外再绘制一帧以确保资源加载完成。
          this.assetPanel.animRafId = window.requestAnimationFrame(() => tick(false)); // 再执行一次后停止。
        } else {
          // 当不存在动画素材时终止循环释放资源。
          this.assetPanel.animRafId = null; // 将句柄重置为 null 表示循环结束。
        }
      };
      if (forceStart) {
        // 当外部要求强制启动时，立即安排一次带强制标记的帧。
        this.assetPanel.animRafId = window.requestAnimationFrame(() => tick(true)); // 启动循环并强制刷新一次。
        return; // 结束方法避免重复安排。
      }
      if (this.assetPanel.animRafId === null) {
        // 当当前没有运行中的循环时启动常规帧。
        this.assetPanel.animRafId = window.requestAnimationFrame(() => tick(false)); // 启动动画循环。
      }
    },

    handleTileSelection(tileId) {
      // 处理素材按钮点击事件，更新编辑器画笔状态。
      this.editor.setSelectedTile(tileId); // 调用数据层接口写入当前画笔素材。
      this.syncGridSelection(tileId); // 更新素材按钮的选中样式。
      this.updateBrushStatus(tileId); // 同步状态栏中的画笔文本。
      this.renderer.setBrushTile(tileId); // 将选中的素材 id 同步给渲染器用于预览。
      if (tileId) {
        // 当选择具体素材时检查鼠标是否正位于画布内部。
        const hoveringCanvas = this.elements.canvas.matches(':hover'); // 使用 :hover 判断指针是否悬停在 Canvas 上。
        if (hoveringCanvas) {
          // 若鼠标已在画布上，则立即开启预览提供反馈。
          this.renderer.setBrushVisibility(true); // 显示画笔预览层。
        }
      } else {
        // 当 tileId 为空表示清空画笔，需要隐藏预览层。
        this.renderer.setBrushVisibility(false); // 关闭画笔预览，避免显示过期素材。
      }
    },

    syncGridSelection(tileId) {
      // 根据传入的 tileId 更新网格中按钮的选中状态。
      this.assetPanel.buttons.forEach((button) => {
        // 遍历当前渲染的所有按钮。
        if (button.title === tileId) {
          // 当按钮对应的素材 id 与目标相等时。
          button.classList.add('selected'); // 添加 selected 类高亮显示。
        } else {
          // 否则移除选中样式。
          button.classList.remove('selected'); // 确保未选按钮无高亮。
        }
      });
    },

    updateBrushStatus(tileId) {
      // 更新状态栏中画笔信息的显示文本。
      if (!this.status.brush) {
        // 若画笔节点不存在则无需更新。
        return; // 直接结束方法。
      }
      let display = tileId && typeof tileId === 'string' ? tileId : '-'; // 根据传入 id 决定显示文本。
      const tileDef = tileId ? this.assets.getTileById(tileId) : null; // 查询素材定义以判断是否动画。
      if (tileDef && tileDef.animated !== undefined) {
        // 当所选素材包含动画帧时追加动画信息。
        const fps = this.renderer && this.renderer.anim ? this.renderer.anim.fps : 0; // 读取当前全局动画时钟的 FPS。
        display += ` | 动画: ${tileDef.animated}帧@${fps}fps`; // 拼接动画帧数与播放速度提示。
      }
      this.status.brush.textContent = `画笔: ${display}`; // 更新画笔状态文本。
    },

    updateLayerStatus(layerName) {
      // 更新状态栏中图层文本显示。
      if (!this.status.layer) {
        // 若图层节点缺失则无需更新。
        return; // 直接结束方法。
      }
      const current = layerName || this.editor.getActiveLayer(); // 优先使用传入值，否则读取编辑器状态。
      this.status.layer.textContent = `图层: ${current || '-'}`; // 写入格式化后的图层名称。
      if (this.elements.layerSelect && current) {
        // 当存在下拉框时同步选中项，确保 UI 状态一致。
        this.elements.layerSelect.value = current; // 强制更新下拉框的 value 避免外部修改失配。
      }
    },

    updateMapStatus(detail) {
      // 更新状态栏中地图信息的显示文本。
      if (!this.status.map) {
        // 若节点不存在则无需处理。
        return; // 直接结束方法。
      }
      if (detail && detail.name) {
        // 当提供 map-changed 事件的 detail 时使用该数据刷新文本。
        const width = detail.width !== undefined ? detail.width : '-'; // 读取地图宽度，若缺失则使用占位符。
        const height = detail.height !== undefined ? detail.height : '-'; // 读取地图高度。
        this.status.map.textContent = `地图: ${detail.name} ${width}×${height}`; // 输出格式化的地图名称与尺寸。
        return; // 完成更新后提前返回。
      }
      const map = this.editor.getCurrentMap(); // 尝试读取当前地图引用以兜底。
      if (map) {
        // 当存在地图对象时根据其信息更新文本。
        this.status.map.textContent = `地图: ${map.name} ${map.width}×${map.height}`; // 使用地图对象刷新显示。
      } else {
        // 未加载地图时显示占位文本。
        this.status.map.textContent = '无地图'; // 表示当前没有地图数据。
      }
    },

    showHint(message, duration = 1500) {
      // 在状态栏的提示区域显示临时文本。
      if (!this.status.hint) {
        // 若提示节点不存在则仅在控制台输出信息。
        console.warn('[UI] hint placeholder missing', message); // 输出警告帮助调试布局。
        return; // 无法显示提示时直接返回。
      }
      if (this.statusHintTimer) {
        // 若已有定时器在运行则先清除，避免提示相互覆盖。
        window.clearTimeout(this.statusHintTimer); // 清除旧的定时任务。
        this.statusHintTimer = null; // 重置句柄以备下次使用。
      }
      this.status.hint.textContent = message || ''; // 写入新的提示文本，若 message 为空则清空显示。
      if (message) {
        // 当确实有提示文本时才安排定时清除。
        this.statusHintTimer = window.setTimeout(() => {
          this.status.hint.textContent = ''; // 到期后清空提示文本。
          this.statusHintTimer = null; // 清空定时器句柄。
        }, duration);
      }
    },

    renderEmptyState(message) {
      // 在素材网格中渲染空状态提示。
      if (!this.assetPanel.grid) {
        // 若网格不存在则直接返回。
        return; // 等待结构修复。
      }
      const placeholder = document.createElement('div'); // 创建提示文本容器。
      placeholder.className = 'asset-empty'; // 应用空状态样式。
      placeholder.textContent = message; // 写入提示文本说明当前状态。
      this.assetPanel.grid.appendChild(placeholder); // 将提示插入网格容器。
    },

    showManifestError(message) {
      // 在面板顶部显示 manifest 加载失败的错误提示。
      if (this.assetPanel.errorBanner) {
        // 若已存在错误提示条则直接更新文本。
        this.assetPanel.errorBanner.textContent = message; // 更新提示内容。
        return; // 结束方法避免重复创建节点。
      }
      const banner = document.createElement('div'); // 创建错误提示条元素。
      banner.className = 'asset-error'; // 应用红底样式突出显示。
      banner.textContent = message; // 写入错误说明文本。
      this.elements.sidebar.querySelector('.panel-body')?.prepend(banner); // 将提示条插入面板顶部。
      this.assetPanel.errorBanner = banner; // 缓存提示条引用以便后续移除或更新。
    },

    clearManifestError() {
      // 清除素材面板中的错误提示条。
      if (this.assetPanel.errorBanner) {
        // 当错误提示存在时执行移除。
        this.assetPanel.errorBanner.remove(); // 从 DOM 中删除提示元素。
        this.assetPanel.errorBanner = null; // 清空引用避免重复使用旧节点。
      }
    },

    setupStatusbar() {
      // 初始化状态栏文本显示。
      this.updateMapStatus(null); // 默认显示未加载地图的状态文本。
      this.updateLayerStatus(this.editor.getActiveLayer()); // 同步当前激活图层显示。
      this.updateBrushStatus(this.editor.getSelectedTileId()); // 初始化画笔状态显示。
      this.updateZoomStatus(); // 使用统一方法同步缩放与旋转显示，初始化为默认状态。
      this.updatePositionStatus(null, null); // 将坐标状态初始化为占位符。
      if (this.status.hint) {
        // 若存在临时提示节点则清空文本。
        this.status.hint.textContent = ''; // 启动时不显示提示文字。
      }
    },

    bindCanvasEvents() {
      // 绑定 Canvas 上的鼠标交互事件。
      const canvas = this.elements.canvas; // 读取缓存的 Canvas 引用。
      canvas.addEventListener('contextmenu', (event) => {
        // 禁用默认的右键菜单，避免干扰橡皮擦操作。
        event.preventDefault(); // 阻止浏览器弹出上下文菜单。
      });
      canvas.addEventListener('wheel', (event) => {
        // 监听滚轮事件用于调整缩放。
        event.preventDefault(); // 阻止默认滚动行为以保持画布聚焦。
        const delta = event.deltaY < 0 ? 0.1 : -0.1; // 根据滚轮方向确定缩放步进。
        const nextZoom = this.renderer.camera.zoom + delta; // 计算缩放后的倍率。
        const rect = canvas.getBoundingClientRect(); // 获取 Canvas 在视口中的位置。
        const anchorX = event.clientX - rect.left; // 计算鼠标相对 Canvas 的 X 坐标。
        const anchorY = event.clientY - rect.top; // 计算鼠标相对 Canvas 的 Y 坐标。
        this.renderer.setZoom(nextZoom, anchorX, anchorY); // 调用渲染器接口执行缩放。
        this.updateZoomStatus(); // 更新状态栏中的缩放百分比。
      });
      canvas.addEventListener('mouseenter', () => {
        // 当鼠标进入 Canvas 区域时决定是否显示画笔预览。
        const tileId = this.editor.getSelectedTileId(); // 读取当前画笔素材 id。
        if (tileId) {
          // 仅当存在画笔素材时才显示预览。
          this.renderer.setBrushVisibility(true); // 通知渲染器开启画笔预览层。
        }
      });
      canvas.addEventListener('mousedown', (event) => {
        // 监听鼠标按下事件以触发平移或绘制操作。
        const pointer = this.getPointerInfo(event); // 计算当前指针的屏幕与网格坐标。
        this.renderer.setBrushHoverGrid(pointer.gridX, pointer.gridY); // 同步画笔预览的吸附格坐标。
        this.updatePositionStatus(pointer.gridX, pointer.gridY); // 在状态栏显示当前网格位置。
        const isMiddle = event.button === 1; // 判断是否为鼠标中键。
        const isSpaceDrag = event.button === 0 && this.editor.state.isSpaceHold; // 判断是否为空格+左键组合。
        if (isMiddle || isSpaceDrag) {
          // 满足任一条件则进入相机平移模式。
          event.preventDefault(); // 阻止默认行为避免浏览器触发特殊操作。
          this.editor.state.isPanning = true; // 更新编辑器状态标记正在平移。
          this.panOrigin.x = event.clientX; // 记录当前屏幕 X 坐标作为起点。
          this.panOrigin.y = event.clientY; // 记录当前屏幕 Y 坐标作为起点。
          document.body.classList.add('grabbing'); // 添加 grabbing 类改变光标样式。
          return; // 平移模式下无需执行绘制逻辑。
        }
        if (event.button === 2) {
          // 鼠标右键触发橡皮擦行为。
          event.preventDefault(); // 阻止浏览器默认菜单。
          const result = this.tryEraseAt(pointer.gridX, pointer.gridY); // 调用数据层尝试删除格子。
          this.editState.erasing = result.continue; // 根据返回值决定是否进入拖拽删除状态。
          this.editState.painting = false; // 确保绘制状态被关闭。
          this.editState.lastGX = pointer.gridX; // 记录上一次操作的格坐标。
          this.editState.lastGY = pointer.gridY; // 同上记录 Y 坐标。
          if (result.changed) {
            // 当确实删除了图块时请求重绘。
            this.renderer.requestRender(); // 通知渲染器刷新画面。
          }
          return; // 右键处理完成后不再继续。
        }
        if (event.button === 0) {
          // 鼠标左键触发绘制行为。
          event.preventDefault(); // 阻止文本选中等默认行为。
          const result = this.tryPaintAt(pointer.gridX, pointer.gridY); // 调用数据层尝试落笔。
          this.editState.painting = result.continue; // 根据返回值决定是否进入拖拽绘制状态。
          this.editState.erasing = false; // 确保橡皮擦状态被关闭。
          this.editState.lastGX = pointer.gridX; // 记录上一次绘制的格坐标。
          this.editState.lastGY = pointer.gridY; // 同上记录 Y 坐标。
          if (result.changed) {
            // 当有实际写入时请求重绘。
            this.renderer.requestRender(); // 通知渲染器刷新画面。
          }
        }
      });
      canvas.addEventListener('mousemove', (event) => {
        // 监听鼠标移动事件以更新坐标、执行平移或连续绘制。
        const pointer = this.getPointerInfo(event); // 计算当前指针的屏幕与网格坐标。
        this.renderer.setBrushHoverGrid(pointer.gridX, pointer.gridY); // 同步画笔预览位置。
        this.updatePositionStatus(pointer.gridX, pointer.gridY); // 在状态栏更新网格坐标显示。
        if (this.editor.state.isPanning) {
          // 当处于平移状态时根据位移调整相机。
          const dx = event.clientX - this.panOrigin.x; // 计算相对于起点的水平位移。
          const dy = event.clientY - this.panOrigin.y; // 计算相对于起点的垂直位移。
          this.renderer.translateCamera(dx, dy); // 调用渲染器执行相机平移。
          this.panOrigin.x = event.clientX; // 更新起点 X 供下一次计算增量。
          this.panOrigin.y = event.clientY; // 更新起点 Y 供下一次计算增量。
          return; // 平移状态下无需继续执行绘制逻辑。
        }
        if ((this.editState.painting || this.editState.erasing) && (pointer.gridX !== this.editState.lastGX || pointer.gridY !== this.editState.lastGY)) {
          // 当处于绘制/擦除拖拽状态且指针移动到新的格子时执行相应操作。
          if (this.editState.painting) {
            const result = this.tryPaintAt(pointer.gridX, pointer.gridY); // 在新格子尝试落笔。
            this.editState.painting = result.continue; // 根据结果决定是否继续拖拽绘制。
            if (result.changed) {
              // 仅当有实际写入时请求重绘。
              this.renderer.requestRender(); // 通知渲染器刷新画面。
            }
            if (result.continue) {
              // 更新最近一次操作的格坐标，避免重复写入同一格。
              this.editState.lastGX = pointer.gridX;
              this.editState.lastGY = pointer.gridY;
            }
          } else if (this.editState.erasing) {
            const result = this.tryEraseAt(pointer.gridX, pointer.gridY); // 在新格子尝试删除。
            this.editState.erasing = result.continue; // 根据结果决定是否继续拖拽删除。
            if (result.changed) {
              // 仅当有实际删除时请求重绘。
              this.renderer.requestRender(); // 通知渲染器刷新画面。
            }
            if (result.continue) {
              // 更新最近一次操作的格坐标。
              this.editState.lastGX = pointer.gridX;
              this.editState.lastGY = pointer.gridY;
            }
          }
        }
      });
      canvas.addEventListener('mouseup', () => {
        // 当鼠标在 Canvas 上释放时退出平移或绘制状态。
        if (this.editor.state.isPanning) {
          // 仅在平移状态下才执行复位逻辑。
          this.editor.state.isPanning = false; // 重置平移标记。
          document.body.classList.remove('grabbing'); // 移除 grabbing 类恢复光标。
        }
        this.stopEditingStroke(); // 重置绘制与擦除的拖拽状态。
      });
      canvas.addEventListener('mouseleave', () => {
        // 当鼠标离开 Canvas 时清空状态信息。
        this.stopEditingStroke(); // 终止正在进行的绘制或擦除。
        this.renderer.setBrushVisibility(false); // 鼠标离开画布时关闭画笔预览层。
        this.updatePositionStatus(null, null); // 清空状态栏坐标显示。
        if (this.editor.state.isPanning) {
          // 若离开时仍处于平移状态需强制结束。
          this.editor.state.isPanning = false; // 重置平移标记。
          document.body.classList.remove('grabbing'); // 恢复默认光标。
        }
      });
      window.addEventListener('mouseup', () => {
        // 监听全局鼠标抬起事件，防止指针离开 Canvas 后状态卡住。
        if (this.editor.state.isPanning) {
          // 仅在平移状态时执行复位。
          this.editor.state.isPanning = false; // 重置平移标记。
          document.body.classList.remove('grabbing'); // 恢复默认光标。
        }
        this.stopEditingStroke(); // 重置绘制状态，避免拖拽状态残留。
      });
    },

    getPointerInfo(event) {
      // 根据鼠标事件计算屏幕坐标与吸附的网格坐标。
      const canvas = this.elements.canvas; // 读取 Canvas 引用以获取位置与尺寸。
      const rect = canvas.getBoundingClientRect(); // 计算 Canvas 在视口中的矩形区域。
      const screenX = Math.round(event.clientX - rect.left); // 计算相对于 Canvas 左上角的屏幕 X 坐标。
      const screenY = Math.round(event.clientY - rect.top); // 计算相对于 Canvas 左上角的屏幕 Y 坐标。
      const worldPos = this.renderer.screenToWorld(screenX, screenY); // 将屏幕坐标转换为世界坐标。
      const gridX = Math.floor(worldPos.x / this.renderer.tileSize); // 将世界 X 坐标换算为网格索引。
      const gridY = Math.floor(worldPos.y / this.renderer.tileSize); // 将世界 Y 坐标换算为网格索引。
      return { screenX, screenY, gridX, gridY }; // 返回指针信息对象，便于调用方使用。
    },

    tryPaintAt(gx, gy) {
      // 尝试在指定格坐标落笔，并处理各种失败场景。
      const map = this.editor.getCurrentMap(); // 读取当前地图引用。
      if (!map) {
        // 未加载地图时无法绘制。
        this.showHint('未加载地图，无法放置'); // 在状态栏显示友好提示。
        console.warn('[UI] paint ignored: no map'); // 输出警告便于调试。
        return { changed: false, continue: false }; // 返回阻止继续拖拽的结果。
      }
      if (gx < 0 || gx >= map.width || gy < 0 || gy >= map.height) {
        // 越界时阻止绘制。
        this.showHint('超出地图范围，无法放置'); // 提示用户越界。
        console.warn('[UI] paint blocked: out of bounds', gx, gy); // 输出警告便于定位。
        return { changed: false, continue: false }; // 返回阻止继续拖拽的结果。
      }
      const tileId = this.editor.getSelectedTileId(); // 读取当前画笔素材 id。
      if (!tileId) {
        // 未选择素材时阻止绘制。
        this.showHint('未选择素材，无法放置'); // 提示用户先选择素材。
        console.warn('[UI] paint ignored: no tile selected'); // 输出警告便于调试。
        return { changed: false, continue: false }; // 返回阻止继续拖拽的结果。
      }
      if (!this.assets || typeof this.assets.getTileById !== 'function') {
        // 素材管理器尚未就绪时无法执行落笔。
        this.showHint('素材管理器未就绪'); // 提醒用户等待 manifest 加载完成。
        console.warn('[UI] paint blocked: assets manager unavailable'); // 输出警告便于调试初始化顺序。
        return { changed: false, continue: false }; // 返回阻止继续拖拽的结果。
      }
      const tileDef = this.assets.getTileById(tileId); // 查询素材定义以获取层信息。
      if (!tileDef) {
        // 素材定义缺失时阻止绘制。
        this.showHint(`素材数据缺失: ${tileId}`); // 状态栏提示缺失的素材。
        console.warn('[UI] paint blocked: tile definition missing', tileId); // 输出警告帮助排查 manifest 问题。
        return { changed: false, continue: false }; // 返回阻止继续拖拽的结果。
      }
      const activeLayer = this.editor.getActiveLayer(); // 读取当前激活图层。
      if (tileDef.layer !== activeLayer) {
        // 当素材所属图层与当前激活图层不一致时阻止绘制。
        this.showHint(`图层不匹配，需要 ${tileDef.layer}`); // 提示用户切换到正确的图层。
        console.warn('[UI] paint blocked: layer mismatch', tileDef.layer, activeLayer); // 输出警告便于调试。
        return { changed: false, continue: false }; // 返回阻止继续拖拽的结果。
      }
      const brush = {
        tileId, // 写入素材 id。
        rotation: this.brushRotation, // 使用当前记录的画笔旋转角度。
        flipX: false, // R6 暂不支持翻转，统一写入 false。
        flipY: false, // 同上。
      }; // 组装传入数据层的画笔描述对象。
      try {
        const changed = this.editor.paintAt(gx, gy, brush); // 调用数据层执行落笔。
        return { changed, continue: true }; // 即便返回 false（重复写入）也允许继续拖拽。
      } catch (error) {
        // 捕获数据层抛出的异常，给出提示。
        console.warn('[UI] paintAt 抛出异常', error); // 输出详细错误信息。
        this.showHint('放置失败，请检查控制台日志'); // 引导用户查看控制台获取详情。
        return { changed: false, continue: false }; // 阻止继续拖拽，避免错误重复出现。
      }
    },

    tryEraseAt(gx, gy) {
      // 尝试在指定格坐标删除图块。
      const map = this.editor.getCurrentMap(); // 读取当前地图引用。
      if (!map) {
        // 未加载地图时无法删除。
        this.showHint('未加载地图，无法删除'); // 提示用户先创建或加载地图。
        console.warn('[UI] erase ignored: no map'); // 输出警告便于调试。
        return { changed: false, continue: false }; // 阻止继续拖拽。
      }
      if (gx < 0 || gx >= map.width || gy < 0 || gy >= map.height) {
        // 越界时阻止删除。
        this.showHint('超出地图范围，无法删除'); // 状态栏提示越界情况。
        console.warn('[UI] erase blocked: out of bounds', gx, gy); // 输出警告便于定位问题。
        return { changed: false, continue: false }; // 阻止继续拖拽。
      }
      try {
        const changed = this.editor.eraseAt(gx, gy); // 调用数据层执行删除。
        return { changed, continue: true }; // 无论是否删除成功都允许继续拖拽橡皮擦。
      } catch (error) {
        // 捕获数据层抛出的异常。
        console.warn('[UI] eraseAt 抛出异常', error); // 输出错误详情。
        this.showHint('删除失败，请检查控制台日志'); // 提示用户查看控制台。
        return { changed: false, continue: false }; // 阻止继续拖拽，避免错误重复出现。
      }
    },

    stopEditingStroke() {
      // 重置绘制与擦除相关的拖拽状态。
      this.editState.painting = false; // 关闭连续绘制状态。
      this.editState.erasing = false; // 关闭连续擦除状态。
      this.editState.lastGX = null; // 清空上一次操作的格坐标 X。
      this.editState.lastGY = null; // 清空上一次操作的格坐标 Y。
    },

    bindKeyboardEvents() {
      // 绑定键盘事件以追踪空格按压状态。
      window.addEventListener('keydown', (event) => {
        // 监听键盘按下事件。
        const targetTag = event.target && event.target.tagName ? event.target.tagName.toLowerCase() : ''; // 读取事件源标签名判断是否在输入框内。
        const isTyping = targetTag === 'input' || targetTag === 'textarea'; // 标记当前是否处于文本输入场景。
        if (event.code === 'Space') {
          // 当按下空格键时执行逻辑。
          if (!this.editor.state.isSpaceHold) {
            // 仅在之前未按住的情况下更新状态。
            this.editor.state.isSpaceHold = true; // 标记空格已按下。
          }
          event.preventDefault(); // 阻止浏览器默认滚动行为。
        }
        if (!isTyping && (event.key === 'r' || event.key === 'R')) {
          // 当焦点不在输入框且按下 R 键时旋转画笔预览。
          const nextRotation = (this.brushRotation + 90) % 360; // 以 90 度为步进循环计算下一个角度。
          this.brushRotation = nextRotation; // 更新 UI 记录的旋转角度值。
          this.renderer.setBrushRotation(nextRotation); // 通知渲染器应用新的预览旋转角。
          this.updateZoomStatus(); // 同步状态栏中旋转角度的显示文本。
        }
      });
      window.addEventListener('keyup', (event) => {
        // 监听键盘松开事件。
        if (event.code === 'Space') {
          // 当松开空格键时重置状态。
          this.editor.state.isSpaceHold = false; // 重置空格按压标记。
        }
      });
    },

    bindResizeObserver() {
      // 监听窗口尺寸变化以调整 Canvas 大小。
      window.addEventListener('resize', () => {
        // 当窗口尺寸变化时触发。
        this.renderer.resizeToContainer(); // 调用渲染器接口同步 Canvas 尺寸。
      });
    },

    bindMapEvents() {
      // 订阅地图相关自定义事件以更新状态栏。
      window.addEventListener('rpg:map-changed', (event) => {
        // 监听地图变更事件。
        const detail = event.detail || null; // 获取事件附带的数据对象，可能为空。
        this.updateMapStatus(detail); // 根据事件信息刷新地图状态文本。
        this.updateLayerStatus(this.editor.getActiveLayer()); // 同步当前激活图层显示。
        if (this.elements.layerSelect) {
          // 确保下拉框与编辑器状态保持一致。
          this.elements.layerSelect.value = this.editor.getActiveLayer(); // 强制同步 value 避免失配。
        }
        this.renderer.setMap(this.editor.getCurrentMap()); // 将最新地图引用交给渲染器。
        this.renderer.requestRender(); // 请求一次重绘以显示最新数据。
      });
      window.addEventListener('rpg:brush-changed', (event) => {
        // 监听画笔素材变更事件以同步状态栏与按钮高亮。
        const tileId = event.detail ? event.detail.tileId : null; // 读取事件附带的素材 id。
        this.updateBrushStatus(tileId); // 更新状态栏画笔文本。
        this.syncGridSelection(tileId); // 同步当前网格按钮的选中状态。
      });
    },

    updateZoomStatus() {
      // 将当前缩放倍率同步到状态栏。
      if (!this.status.zoom) {
        // 若未缓存缩放节点则无需更新。
        return; // 直接结束方法。
      }
      const percentage = Math.round(this.renderer.camera.zoom * 100); // 将缩放倍率转换为百分比并取整。
      this.status.zoom.textContent = `缩放: ${percentage}% | 旋转: ${this.brushRotation}°`; // 同步显示当前缩放与画笔旋转角度。
    },

    updatePositionStatus(gridX, gridY) {
      // 更新状态栏中的鼠标网格坐标显示。
      if (!this.status.pos) {
        // 若未缓存坐标节点则结束方法。
        return; // 直接返回。
      }
      if (Number.isInteger(gridX) && Number.isInteger(gridY)) {
        // 当提供有效的格坐标时显示具体数值。
        this.status.pos.textContent = `格: ${gridX}, ${gridY}`; // 更新状态栏文本为当前吸附的网格位置。
      } else {
        // 否则恢复为占位文本。
        this.status.pos.textContent = '格: -'; // 表示当前没有有效的网格信息。
      }
    },
  };

  window.RPG = window.RPG || {}; // 确保全局命名空间存在以挂载模块。
  window.RPG.UI = UI; // 将 UI 模块挂载到全局供入口脚本调用。
})();
