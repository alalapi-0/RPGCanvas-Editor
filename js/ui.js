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
    status: { map: null, zoom: null, pos: null, brush: null }, // 存储状态栏各个文本节点引用。
    assetPanel: { select: null, search: null, grid: null, errorBanner: null, buttons: [], currentPack: null, ready: false }, // 管理素材面板内部节点与状态。
    panOrigin: { x: 0, y: 0 }, // 记录开始平移时的屏幕坐标，用于计算位移。

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
      this.renderer = window.RPG.Renderer; // 读取全局渲染器实例以便调用图形相关功能。
      this.editor = window.RPG.Editor; // 读取全局编辑器实例以访问数据层 API。
      this.assets = window.RPG.Assets; // 读取全局 Assets 管理器以加载 manifest 与缩略图。
      this.cacheStatusbarNodes(); // 查询并缓存状态栏节点。
      this.setupStatusbar(); // 设置状态栏默认文本。
      this.setupToolbar(); // 构建工具栏按钮并绑定事件。
      this.setupSidebarStructure(); // 构建素材面板基础结构并绑定输入事件。
      this.bindCanvasEvents(); // 绑定 Canvas 鼠标事件实现相机控制。
      this.bindKeyboardEvents(); // 绑定键盘事件追踪空格状态。
      this.bindResizeObserver(); // 监听窗口尺寸变化以自适应 Canvas。
      this.bindMapEvents(); // 订阅地图与画笔变更事件以更新状态栏。
      // TODO(R8): 精确世界坐标命中 // 预留后续拾取逻辑扩展注释。
      const manifestReady = await this.prepareAssetPanel(); // 加载 manifest 并刷新素材面板。
      return { manifestReady }; // 返回加载结果给入口脚本，用于控制日志输出。
    },

    cacheStatusbarNodes() {
      // 查询并缓存状态栏内的文本节点。
      this.status.map = document.getElementById('status-map'); // 获取显示地图信息的节点引用。
      this.status.zoom = document.getElementById('status-zoom'); // 获取显示缩放信息的节点引用。
      this.status.pos = document.getElementById('status-pos'); // 获取显示鼠标坐标的节点引用。
      if (this.elements.statusbar && !document.getElementById('status-brush')) {
        // 若状态栏存在且尚未创建画笔显示节点，则动态插入。
        const separator = document.createTextNode(' | '); // 创建分隔符文本保持排版一致。
        const brushSpan = document.createElement('span'); // 创建用于显示画笔信息的 span。
        brushSpan.id = 'status-brush'; // 设置 id 便于后续查询与样式控制。
        brushSpan.textContent = '画笔: -'; // 初始化画笔显示文本。
        this.status.map?.after(separator); // 将分隔符插入在地图状态后方。
        this.elements.statusbar.insertBefore(brushSpan, this.status.zoom || null); // 将画笔节点插入到缩放节点之前。
        this.status.brush = brushSpan; // 缓存画笔状态节点引用。
      } else {
        // 当节点已存在时直接缓存引用。
        this.status.brush = document.getElementById('status-brush'); // 读取现有画笔状态节点。
      }
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
    },

    createTileButton(tileDef) {
      // 为指定素材定义创建带缩略图的按钮。
      const button = document.createElement('button'); // 创建按钮节点。
      button.type = 'button'; // 设置按钮类型为普通按钮。
      button.className = 'asset-tile-button'; // 应用素材按钮样式。
      button.title = tileDef.id; // 设置 title 属性悬浮显示素材 id。
      const thumb = this.assets.makeTileThumb(tileDef); // 调用 Assets 生成 48×48 缩略图。
      thumb.width = 48; // 显式指定缩略图宽度，确保布局稳定。
      thumb.height = 48; // 显式指定缩略图高度。
      button.appendChild(thumb); // 将缩略图 canvas 插入按钮。
      button.addEventListener('click', () => {
        // 绑定点击事件以更新画笔选择。
        this.handleTileSelection(tileDef.id); // 调用内部方法设置当前画笔并刷新状态。
      });
      return button; // 返回构建完成的按钮元素。
    },

    handleTileSelection(tileId) {
      // 处理素材按钮点击事件，更新编辑器画笔状态。
      this.editor.setSelectedTile(tileId); // 调用数据层接口写入当前画笔素材。
      this.syncGridSelection(tileId); // 更新素材按钮的选中样式。
      this.updateBrushStatus(tileId); // 同步状态栏中的画笔文本。
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
      const display = tileId && typeof tileId === 'string' ? tileId : '-'; // 根据传入 id 决定显示文本。
      this.status.brush.textContent = `画笔: ${display}`; // 更新画笔状态文本。
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
      if (this.status.map) {
        // 当地图信息节点存在时设置默认文本。
        this.status.map.textContent = '无地图'; // 显示未加载地图的占位文本。
      }
      if (this.status.zoom) {
        // 当缩放节点存在时初始化为 100%。
        this.status.zoom.textContent = '缩放：100%'; // 设置默认缩放显示。
      }
      if (this.status.pos) {
        // 当坐标节点存在时初始化为占位符。
        this.status.pos.textContent = '坐标：-'; // 表示当前无鼠标位置数据。
      }
      this.updateBrushStatus(this.editor.getSelectedTileId()); // 初始化画笔状态显示。
    },

    bindCanvasEvents() {
      // 绑定 Canvas 上的鼠标交互事件。
      const canvas = this.elements.canvas; // 读取缓存的 Canvas 引用。
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
      canvas.addEventListener('mousedown', (event) => {
        // 监听鼠标按下事件以触发平移模式。
        const isMiddle = event.button === 1; // 判断是否为鼠标中键。
        const isSpaceDrag = event.button === 0 && this.editor.state.isSpaceHold; // 判断是否为空格+左键组合。
        if (isMiddle || isSpaceDrag) {
          // 满足任一条件则进入平移状态。
          event.preventDefault(); // 阻止默认行为避免浏览器触发特殊操作。
          this.editor.state.isPanning = true; // 更新编辑器状态标记正在平移。
          this.panOrigin.x = event.clientX; // 记录当前屏幕 X 坐标作为起点。
          this.panOrigin.y = event.clientY; // 记录当前屏幕 Y 坐标作为起点。
          document.body.classList.add('grabbing'); // 添加 grabbing 类改变光标样式。
        }
      });
      canvas.addEventListener('mousemove', (event) => {
        // 监听鼠标移动事件以更新坐标与执行平移。
        const rect = canvas.getBoundingClientRect(); // 获取 Canvas 位置与尺寸。
        const screenX = Math.round(event.clientX - rect.left); // 计算鼠标在画布内的整数 X 坐标。
        const screenY = Math.round(event.clientY - rect.top); // 计算鼠标在画布内的整数 Y 坐标。
        this.updatePositionStatus(screenX, screenY); // 更新状态栏中的屏幕坐标显示。
        if (this.editor.state.isPanning) {
          // 当处于平移状态时根据位移调整相机。
          const dx = event.clientX - this.panOrigin.x; // 计算相对于起点的水平位移。
          const dy = event.clientY - this.panOrigin.y; // 计算相对于起点的垂直位移。
          this.renderer.translateCamera(dx, dy); // 调用渲染器执行相机平移。
          this.panOrigin.x = event.clientX; // 更新起点 X 供下一次计算增量。
          this.panOrigin.y = event.clientY; // 更新起点 Y 供下一次计算增量。
        }
      });
      canvas.addEventListener('mouseup', () => {
        // 当鼠标在 Canvas 上释放时退出平移模式。
        if (this.editor.state.isPanning) {
          // 仅在平移状态下才执行复位逻辑。
          this.editor.state.isPanning = false; // 重置平移标记。
          document.body.classList.remove('grabbing'); // 移除 grabbing 类恢复光标。
        }
      });
      canvas.addEventListener('mouseleave', () => {
        // 当鼠标离开 Canvas 时清空状态信息。
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
      });
    },

    bindKeyboardEvents() {
      // 绑定键盘事件以追踪空格按压状态。
      window.addEventListener('keydown', (event) => {
        // 监听键盘按下事件。
        if (event.code === 'Space') {
          // 当按下空格键时执行逻辑。
          if (!this.editor.state.isSpaceHold) {
            // 仅在之前未按住的情况下更新状态。
            this.editor.state.isSpaceHold = true; // 标记空格已按下。
          }
          event.preventDefault(); // 阻止浏览器默认滚动行为。
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
        const detail = event.detail || {}; // 获取事件附带的数据对象。
        if (this.status.map) {
          // 若状态栏地图节点存在则更新显示文本。
          this.status.map.textContent = `名称(${detail.name}) ${detail.width}×${detail.height}`; // 以名称与尺寸格式化显示信息。
        }
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
      this.status.zoom.textContent = `缩放：${percentage}%`; // 更新状态栏显示当前缩放值。
    },

    updatePositionStatus(screenX, screenY) {
      // 更新状态栏中的鼠标屏幕坐标显示。
      if (!this.status.pos) {
        // 若未缓存坐标节点则结束方法。
        return; // 直接返回。
      }
      if (typeof screenX === 'number' && typeof screenY === 'number') {
        // 当提供有效数值时显示具体坐标。
        this.status.pos.textContent = `坐标：${screenX}, ${screenY}`; // 更新状态栏文本为当前坐标。
      } else {
        // 否则恢复为占位文本。
        this.status.pos.textContent = '坐标：-'; // 表示无有效坐标信息。
      }
    },
  };

  window.RPG = window.RPG || {}; // 确保全局命名空间存在以挂载模块。
  window.RPG.UI = UI; // 将 UI 模块挂载到全局供入口脚本调用。
})();
