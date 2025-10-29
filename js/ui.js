/* =============================================
 * 模块：UI 用户界面交互
 * 描述：负责绑定界面事件、更新状态栏并提供调试按钮
 * 说明：第 3 轮新增地图信息状态栏与数据层调试按钮
 * ============================================= */

(function () {
  // 使用立即执行函数包裹模块，避免内部变量泄露到全局空间。
  const UI = {
    // 定义 UI 单例对象，集中管理界面元素与交互逻辑。
    elements: {}, // 存储常用 DOM 节点引用，减少重复查询。
    renderer: null, // 缓存渲染器实例引用，方便调用相机接口。
    editor: null, // 缓存编辑器实例引用，读取状态与数据层 API。
    status: { map: null, zoom: null, pos: null }, // 存储状态栏各个文本节点引用。
    panOrigin: { x: 0, y: 0 }, // 记录开始平移时的屏幕坐标，用于计算位移。

    init({ canvas, toolbar, sidebar, statusbar }) {
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
      this.cacheStatusbarNodes(); // 查询并缓存状态栏节点。
      this.setupToolbar(); // 构建工具栏按钮并绑定事件。
      this.setupSidebar(); // 初始化侧边栏占位内容保持结构完整。
      this.setupStatusbar(); // 设置状态栏默认文本。
      this.bindCanvasEvents(); // 绑定 Canvas 鼠标事件实现相机控制。
      this.bindKeyboardEvents(); // 绑定键盘事件追踪空格状态。
      this.bindResizeObserver(); // 监听窗口尺寸变化以自适应 Canvas。
      this.bindMapEvents(); // 订阅地图变更事件以更新状态栏。
      console.log('[UI] initialized with data model hooks'); // 输出初始化完成日志。
      // TODO(R8): 精确世界坐标命中 // 预留后续拾取逻辑扩展注释。
    },

    cacheStatusbarNodes() {
      // 查询并缓存状态栏内的文本节点。
      this.status.map = document.getElementById('status-map'); // 获取显示地图信息的节点引用。
      this.status.zoom = document.getElementById('status-zoom'); // 获取显示缩放信息的节点引用。
      this.status.pos = document.getElementById('status-pos'); // 获取显示鼠标坐标的节点引用。
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
          this.renderer.setGridVisible(nextState); // 调用渲染器接口更新网格可见性。
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

    setupSidebar() {
      // 设置侧边栏占位内容，保持上一轮结构稳定。
      const assetGrid = this.elements.sidebar.querySelector('.asset-grid'); // 查询素材网格容器。
      if (assetGrid) {
        // 当容器存在时填充占位提示。
        assetGrid.innerHTML = '<div class="asset-placeholder">素材缩略图区域</div>'; // 写入占位 HTML 等待后续替换。
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
